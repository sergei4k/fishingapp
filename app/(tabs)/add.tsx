import { pb } from "@/lib/pocketbase";
import { theme } from '../../lib/theme';
import { useAuth } from "@/lib/auth";
import { parseBadges } from "@/lib/badges";
import { addCatch } from "@/lib/storage";
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import ExifParser from 'exif-parser';
import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_ACCESS_TOKEN, useMapboxReady } from "@/lib/mapbox";
import { matchWaterBody, type WaterBodyMatch } from "@/lib/waterBodyMatch";
import { fetchMapboxWaterBody, type MapboxWaterBody } from "@/lib/waterBodies";
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import Toast from "react-native-toast-message";
import { useLanguage } from "@/lib/language";
import { useNetwork } from "@/lib/network";
import { isProfane } from "@/lib/profanity";
import SignInPrompt from "@/components/SignInPrompt";
import { getSpeciesHabitat, getSpeciesLabel as getSpeciesLabelTranslated, getSpeciesOptions, type SpeciesHabitat } from "@/lib/species";
import { filterGearOptions, getGearOptions, getGearLabel, getGearPickerTab, GEAR_CATEGORY_COLOR, GEAR_CATEGORY_ICON, type GearPickerTab } from "@/lib/gear";
import { CATCH_FORM_STEP_COUNT, CATCH_FORM_TACKLE_STEP, getResetCatchFormStep } from "@/lib/catchFormFlow";
import { createTackleItem, loadTackleItems } from "@/lib/tackleStore";
import {
  MAX_TACKLE_TEXT_LENGTH,
  TACKLE_FIELDS,
  buildTackleDraft,
  emptyTackleDraft,
  getMissingTackleFields,
  getTackleCatchLabel,
  getTackleFieldLabel,
  getTackleItemsByKind,
  getTackleKindLabel,
  getTackleSectionLabel,
  type TackleDraft,
  type TackleItem,
  type TackleKind,
} from "@/lib/tackle";
import gearPhotos from "@/lib/gearPhotos";
import { ActivityIndicator, Alert, DeviceEventEmitter, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import speciesPhotoMap from "@/lib/speciesPhotos";

type PickedPhoto = {
  uri: string;
  assetId?: string | null;
  exif?: Record<string, any> | null;
};

type LocationSearchResult = {
  id: string;
  label: string;
  subtitle: string;
  center: [number, number];
};

type PhotoCatchDetails = {
  species: string | null;
  gear: string | null;
  length: string;
  weight: string;
};

const EMPTY_PHOTO_CATCH: PhotoCatchDetails = { species: null, gear: null, length: "", weight: "" };

// Lightly compress a photo before upload: cap the long edge at 1600px (no
// upscaling) and re-encode JPEG at 0.82 quality. Cuts multi-MB phone photos to
// ~1MB with no visible difference on a phone screen, so they load fast on a cold
// cache. Falls back to the original uri if manipulation fails.
const MAX_DIM = 1600;
const TRIP_PHOTO_FRAME_WIDTH = Dimensions.get("window").width - 52;
// Mobile uploads can take longer than 12 seconds on cellular connections. Do
// not cancel a successful public catch before PocketBase can receive its photo.
const PB_UPLOAD_TIMEOUT_MS = 45000;
const WATER_BODY_REQUEST_TIMEOUT_MS = 10000;
const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

async function compressPhoto(uri: string): Promise<string> {
  try {
    const probe = await ImageManipulator.manipulateAsync(uri, [], {});
    const longest = Math.max(probe.width, probe.height);
    const actions: ImageManipulator.Action[] =
      longest > MAX_DIM
        ? [{ resize: probe.width >= probe.height ? { width: MAX_DIM } : { height: MAX_DIM } }]
        : [];
    const out = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return out.uri;
  } catch (e) {
    console.warn("compressPhoto failed, using original:", e);
    return uri;
  }
}

async function withPbTimeout<T>(requestKey: string, task: () => Promise<T>, timeoutMs = PB_UPLOAD_TIMEOUT_MS): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          pb.cancelRequest(requestKey);
          reject(new Error("PB_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function withWaterBodyRequestTimeout<T>(requestKey: string, task: () => Promise<T>, timeoutMs = WATER_BODY_REQUEST_TIMEOUT_MS): Promise<T> {
  return withPbTimeout(requestKey, task, timeoutMs);
}

export default function Add() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const mapboxReady = useMapboxReady();
  const insets = useSafeAreaInsets();
  const safeTop = insets.top;

  const [image, setImage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoCatches, setPhotoCatches] = useState<PhotoCatchDetails[]>([]);
  const tripPhotoScrollRef = useRef<ScrollView>(null);
  const [description, setDescription] = useState("");
  const [length, setLength] = useState("");
  const [weight, setWeight] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [speciesTab, setSpeciesTab] = useState<SpeciesHabitat>("freshwater");
  const [moreModalVisible, setMoreModalVisible] = useState(false);
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [selectedGear, setSelectedGear] = useState<string | null>(null);
  const [gearModalVisible, setGearModalVisible] = useState(false);
  const [gearTab, setGearTab] = useState<GearPickerTab>("lure");
  const [gearSearch, setGearSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [imageCoords, setImageCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [waterBody, setWaterBody] = useState<WaterBodyMatch | null>(null);
  const [detectingWater, setDetectingWater] = useState(false);
  const [pendingWaterBody, setPendingWaterBody] = useState<{
    lat: number;
    lon: number;
    feature: MapboxWaterBody;
  } | null>(null);
  const [waterBodyNameModalVisible, setWaterBodyNameModalVisible] = useState(false);
  const [waterBodyNameInput, setWaterBodyNameInput] = useState("");
  const [savingWaterBodyName, setSavingWaterBodyName] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [pendingCoord, setPendingCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [pickerCenter, setPickerCenter] = useState<[number, number]>([37.618423, 55.751244]);
  const [locationMapLoaded, setLocationMapLoaded] = useState(false);
  const [locationPickerCatchMarkers, setLocationPickerCatchMarkers] = useState<GeoJSON.FeatureCollection>(EMPTY_FEATURE_COLLECTION);
  const [locationPickerWaterBodies, setLocationPickerWaterBodies] = useState<GeoJSON.FeatureCollection>(EMPTY_FEATURE_COLLECTION);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSearchResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [tackleItems, setTackleItems] = useState<TackleItem[]>([]);
  const [loadingTackle, setLoadingTackle] = useState(false);
  const [selectedRodId, setSelectedRodId] = useState<string | null>(null);
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [tackleDraftKind, setTackleDraftKind] = useState<TackleKind | null>(null);
  const [tackleDraft, setTackleDraft] = useState<TackleDraft>(emptyTackleDraft("rod"));
  const [savingTackle, setSavingTackle] = useState(false);
  const waterBodyDetectionRequestRef = useRef(0);

  useEffect(() => {
    if (currentStep !== CATCH_FORM_TACKLE_STEP) return;
    if (!user) return;
    let active = true;

    const loadLibrary = async () => {
      setLoadingTackle(true);
      try {
        const items = await loadTackleItems(user.id);
        if (!active) return;
        setTackleItems(items);
      } finally {
        if (active) setLoadingTackle(false);
      }
    };

    void loadLibrary();
    return () => { active = false; };
  }, [currentStep, user]);

  useEffect(() => {
    if (!locationPickerVisible) return;
    const q = locationSearchQuery.trim();
    if (q.length < 2) {
      setLocationSearchResults([]);
      setSearchingLocation(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?access_token=${MAPBOX_ACCESS_TOKEN}&types=poi,address,place,locality,neighborhood&autocomplete=true&limit=6&language=${language}`;
        const res = await fetch(url);
        const json = await res.json();
        const results: LocationSearchResult[] = (json.features ?? [])
          .filter((feature: any) => Array.isArray(feature.center) && feature.center.length >= 2)
          .map((feature: any) => ({
            id: feature.id,
            label: feature.text ?? feature.place_name ?? "",
            subtitle: feature.place_name ?? "",
            center: [Number(feature.center[0]), Number(feature.center[1])] as [number, number],
          }))
          .filter((item: LocationSearchResult, index: number, arr: LocationSearchResult[]) =>
            item.label && Number.isFinite(item.center[0]) && Number.isFinite(item.center[1]) &&
            arr.findIndex((other) => other.subtitle === item.subtitle) === index
          );
        setLocationSearchResults(results);
      } catch (e) {
        console.warn("Catch location search error:", e);
        setLocationSearchResults([]);
      } finally {
        setSearchingLocation(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [language, locationPickerVisible, locationSearchQuery]);

  useEffect(() => {
    if (!locationPickerVisible) return;
    let active = true;

    const loadMapContext = async () => {
      try {
        const catchFilter = user
          ? pb.filter("is_public = true || user_id = {:userId}", { userId: user.id })
          : "is_public = true";
        const catches = await pb.collection("catches").getFullList({
          filter: catchFilter,
          fields: "id,lat,lon,water_body_id",
          requestKey: null,
        });
        if (!active) return;

        const validCatches = catches.filter((catchItem: any) =>
          Number.isFinite(Number(catchItem.lat)) && Number.isFinite(Number(catchItem.lon)) &&
          Number(catchItem.lat) !== 0 && Number(catchItem.lon) !== 0,
        );
        setLocationPickerCatchMarkers({
          type: "FeatureCollection",
          features: validCatches.map((catchItem: any) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [Number(catchItem.lon), Number(catchItem.lat)] },
            properties: { id: catchItem.id },
          })),
        });

        const waterBodyIds = [...new Set(validCatches.map((catchItem: any) => catchItem.water_body_id).filter(Boolean))];
        if (!waterBodyIds.length) {
          setLocationPickerWaterBodies(EMPTY_FEATURE_COLLECTION);
          return;
        }
        const filter = waterBodyIds.map((_, index) => `id = {:id${index}}`).join(" || ");
        const params = Object.fromEntries(waterBodyIds.map((id, index) => [`id${index}`, id]));
        const waterBodies = await pb.collection("water_bodies").getFullList({
          filter: pb.filter(filter, params),
          fields: "id,geometry",
          requestKey: null,
        });
        if (!active) return;
        setLocationPickerWaterBodies({
          type: "FeatureCollection",
          features: waterBodies.flatMap((waterBody: any) => {
            try {
              const geometry = typeof waterBody.geometry === "string" ? JSON.parse(waterBody.geometry) : waterBody.geometry;
              return geometry?.type && geometry.coordinates ? [{
                type: "Feature" as const,
                geometry,
                properties: { id: waterBody.id },
              }] : [];
            } catch {
              return [];
            }
          }),
        });
      } catch {
        if (!active) return;
        setLocationPickerCatchMarkers(EMPTY_FEATURE_COLLECTION);
        setLocationPickerWaterBodies(EMPTY_FEATURE_COLLECTION);
      }
    };

    void loadMapContext();
    return () => { active = false; };
  }, [locationPickerVisible, user]);

  const openLocationPicker = async () => {
    setLocationSearchQuery("");
    setLocationSearchResults([]);
    setLocationMapLoaded(false);
    setPickerCenter([37.618423, 55.751244]);
    setLocationPickerVisible(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        const center: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setPickerCenter(center);
        setPendingCoord({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      }
    } catch { /* use default center */ }
  };
  const router = useRouter();

  const detectWaterBody = async (lat: number, lon: number) => {
    const requestId = ++waterBodyDetectionRequestRef.current;
    const requestKey = `water-body-detect-${requestId}`;
    setDetectingWater(true);
    setWaterBody(null);
    setPendingWaterBody(null);
    try {
      try {
        const resolved = await withWaterBodyRequestTimeout(requestKey, () => pb.send<{ id?: string; name?: string }>("/water-bodies/lookup", {
          method: "POST",
          body: { latitude: lat, longitude: lon },
          requestKey,
        }));
        if (requestId !== waterBodyDetectionRequestRef.current) return;
        if (resolved.id && resolved.name) {
          setWaterBody({ id: resolved.id, name: resolved.name, isShorelineMatch: false });
          return;
        }
      } catch (error) {
        if (requestId !== waterBodyDetectionRequestRef.current) return;
        console.warn("Stored water body lookup failed:", error);
      }

      const storedSearchDelta = 0.03;
      const records = await withWaterBodyRequestTimeout(requestKey, () => pb.collection("water_bodies").getFullList({
        filter: pb.filter(
          "lat >= {:nearMinLat} && lat <= {:nearMaxLat} && lon >= {:nearMinLon} && lon <= {:nearMaxLon}",
          {
            nearMinLat: lat - storedSearchDelta,
            nearMaxLat: lat + storedSearchDelta,
            nearMinLon: lon - storedSearchDelta,
            nearMaxLon: lon + storedSearchDelta,
          },
        ),
        fields: "id,mapbox_id,name,geometry",
        requestKey,
      }));
      if (requestId !== waterBodyDetectionRequestRef.current) return;
      const storedCandidates = records
        .filter((record: any) => record.name)
        .map((record: any) => {
          let geometry = record.geometry;
          try {
            if (typeof geometry === "string") geometry = JSON.parse(geometry);
          } catch {
            geometry = null;
          }
          return { id: record.id, name: record.name, geometry, mapboxId: record.mapbox_id || "" };
        });
      const fallbackStoredMatch = matchWaterBody(storedCandidates, lat, lon);
      if (fallbackStoredMatch) {
        setWaterBody(fallbackStoredMatch);
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WATER_BODY_REQUEST_TIMEOUT_MS);
      let feature: MapboxWaterBody | null = null;
      try {
        feature = await fetchMapboxWaterBody(lat, lon, MAPBOX_ACCESS_TOKEN, controller.signal);
      } catch (error) {
        if (fallbackStoredMatch) setWaterBody(fallbackStoredMatch);
        if (error instanceof Error && error.name !== "AbortError") {
          console.warn("Mapbox water detection failed:", error);
        }
        return;
      } finally {
        clearTimeout(timeout);
      }

      if (requestId !== waterBodyDetectionRequestRef.current) return;
      if (!feature) {
        if (fallbackStoredMatch) setWaterBody(fallbackStoredMatch);
        return;
      }

      let existing;
      try {
        existing = await withWaterBodyRequestTimeout(requestKey, () => pb.collection("water_bodies").getList(1, 1, {
            filter: pb.filter("mapbox_id = {:featureId}", { featureId: feature.featureId }),
            fields: "id,name",
            requestKey,
        }));
      } catch (error) {
        if (requestId !== waterBodyDetectionRequestRef.current) return;
        console.warn("Mapbox water body lookup failed:", error);
        setPendingWaterBody({ lat, lon, feature });
        setWaterBodyNameInput("");
        setWaterBodyNameModalVisible(true);
        return;
      }
      if (requestId !== waterBodyDetectionRequestRef.current) return;
      const existingWaterBody = existing.items[0];
      if (existingWaterBody?.name) {
        setWaterBody({ id: existingWaterBody.id, name: existingWaterBody.name, isShorelineMatch: false });
        return;
      }

      if (feature.name) {
        const registered = await withWaterBodyRequestTimeout(requestKey, () => pb.send<{ id?: string; name?: string }>("/water-bodies/mapbox", {
          method: "POST",
          body: {
            name: feature.name,
            featureId: feature.featureId,
            accessToken: MAPBOX_ACCESS_TOKEN,
            waterType: feature.type,
            latitude: lat,
            longitude: lon,
            resolveOfficialName: feature.isMarine,
          },
          requestKey,
        }), 30000);
        if (requestId !== waterBodyDetectionRequestRef.current) return;
        if (registered.id && registered.name) {
          setWaterBody({ id: registered.id, name: registered.name, isShorelineMatch: false });
        }
        return;
      }

      if (!feature.name) {
        setPendingWaterBody({ lat, lon, feature });
        setWaterBodyNameInput("");
        setWaterBodyNameModalVisible(true);
      }
    } catch (error) {
      console.warn("Water body detection failed:", error);
      // Waterbody attribution is optional and must not block saving a catch.
    } finally {
      if (requestId === waterBodyDetectionRequestRef.current) setDetectingWater(false);
    }
  };

  const saveWaterBodyName = async () => {
    const name = waterBodyNameInput.trim();
    if (!name || !pendingWaterBody) return;
    const requestId = waterBodyDetectionRequestRef.current;
    const requestKey = `water-body-name-${requestId}`;
    const pending = pendingWaterBody;

    setSavingWaterBodyName(true);
    try {
      const registered = await withWaterBodyRequestTimeout(requestKey, () => pb.send<{ id: string; name: string }>("/water-bodies/mapbox", {
        method: "POST",
        body: {
          name,
          featureId: pending.feature.featureId,
          accessToken: MAPBOX_ACCESS_TOKEN,
          waterType: pending.feature.type,
          latitude: pending.lat,
          longitude: pending.lon,
        },
        requestKey,
      }), 30000);
      if (requestId !== waterBodyDetectionRequestRef.current) return;
      setWaterBody({ id: registered.id, name: registered.name, isShorelineMatch: false });
      setPendingWaterBody(null);
      setWaterBodyNameModalVisible(false);
      setWaterBodyNameInput("");
    } catch (error) {
      if (requestId !== waterBodyDetectionRequestRef.current) return;
      console.warn("Manual water body registration failed:", error);
      Alert.alert(t("error"), language === "ru" ? "Не удалось сохранить водоём." : "Unable to save water body.");
    } finally {
      setSavingWaterBodyName(false);
    }
  };

  const decimalFromGps = (value: any): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value) && value.length >= 3) {
      const parts = value.slice(0, 3).map((part) => {
        if (typeof part === "number") return part;
        if (Array.isArray(part) && part.length >= 2) return Number(part[0]) / Number(part[1]);
        if (part && typeof part === "object" && "numerator" in part && "denominator" in part) {
          return Number(part.numerator) / Number(part.denominator);
        }
        return Number(part);
      });
      if (parts.every(Number.isFinite)) return Math.abs(parts[0]) + parts[1] / 60 + parts[2] / 3600;
    }
    return null;
  };

  const coordsFromExif = (exif?: Record<string, any> | null) => {
    if (!exif) return null;
    const gps = exif["{GPS}"] ?? exif.GPS ?? exif;
    const latRaw = gps.GPSLatitude ?? gps.Latitude ?? exif.GPSLatitude ?? exif.Latitude;
    const lonRaw = gps.GPSLongitude ?? gps.Longitude ?? exif.GPSLongitude ?? exif.Longitude;
    let lat = decimalFromGps(latRaw);
    let lon = decimalFromGps(lonRaw);
    if (lat == null || lon == null) return null;

    const latRef = String(gps.GPSLatitudeRef ?? gps.LatitudeRef ?? exif.GPSLatitudeRef ?? exif.LatitudeRef ?? "").toUpperCase();
    const lonRef = String(gps.GPSLongitudeRef ?? gps.LongitudeRef ?? exif.GPSLongitudeRef ?? exif.LongitudeRef ?? "").toUpperCase();
    if (latRef === "S") lat = -Math.abs(lat);
    if (lonRef === "W") lon = -Math.abs(lon);

    if ((lat !== 0 || lon !== 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
    return null;
  };

  const pickPhotos = async (selectionLimit: number): Promise<PickedPhoto[]> => {
    if (Platform.OS === "ios") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t("error"), t("photoError"));
        return [];
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit,
        quality: 1,
        exif: true,
      });
      if (result.canceled) return [];
      return (result.assets ?? []).map((asset) => ({ uri: asset.uri, assetId: asset.assetId, exif: asset.exif }));
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: selectionLimit > 1,
    });
    if (result.canceled) return [];
    return (result.assets ?? []).map((asset) => ({ uri: asset.uri }));
  };

  const coordsFromPhoto = async (photo: PickedPhoto) => {
    const fromPickerExif = coordsFromExif(photo.exif);
    if (fromPickerExif) return fromPickerExif;

    if (Platform.OS === "ios" && photo.assetId) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(photo.assetId);
        if (info.location?.latitude != null && info.location?.longitude != null) {
          const lat = Number(info.location.latitude);
          const lon = Number(info.location.longitude);
          if ((lat !== 0 || lon !== 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon };
          }
        }
        const fromMediaExif = coordsFromExif(info.exif as Record<string, any> | undefined);
        if (fromMediaExif) return fromMediaExif;
      } catch (e) {
        console.warn("MediaLibrary GPS lookup failed:", e);
      }
    }

    try {
      const bytes = await new File(photo.uri).arrayBuffer();
      const tags = ExifParser.create(bytes).parse().tags;
      return coordsFromExif(tags);
    } catch (e) {
      console.warn('EXIF parse failed:', e);
      return null;
    }
  };

  const pickImagesAndGetGps = async () => {
    try {
      const pickedPhotos = await pickPhotos(6);
      const [primary, ...additional] = pickedPhotos;
      if (!primary) return;

      setImage(primary.uri);
      setExtraPhotos(additional.map((photo) => photo.uri).slice(0, 5));
      setActivePhotoIndex(0);
      setPhotoCatches(pickedPhotos.map(() => ({ ...EMPTY_PHOTO_CATCH })));

      const coords = await coordsFromPhoto(primary);

      if (coords) {
        setImageCoords(coords);
        detectWaterBody(coords.lat, coords.lon);
      } else {
        setImageCoords(null);
        setIsPublic(false);
      }
    } catch (error: any) {
      console.error("Picker/EXIF error:", error);
      Alert.alert(t("error"), t("photoError"));
    }
  };

  const pickExtraPhotos = async () => {
    try {
      const pickedPhotos = await pickPhotos(5 - extraPhotos.length);
      const additions = pickedPhotos.map((photo) => photo.uri);
      setExtraPhotos((current) => [...current, ...additions].slice(0, 5));
      setPhotoCatches((current) => [...current, ...additions.map(() => ({ ...EMPTY_PHOTO_CATCH }))].slice(0, 6));
    } catch (e) {
      console.error('Extra photo error:', e);
    }
  };

  const removeTripPhoto = (index: number) => {
    const allPhotos = [image, ...extraPhotos].filter(Boolean) as string[];
    const nextPhotos = allPhotos.filter((_, photoIndex) => photoIndex !== index);
    const nextActiveIndex = Math.min(activePhotoIndex, Math.max(0, nextPhotos.length - 1));
    setPhotoCatches((current) => {
      const withActiveDetails = [...current];
      withActiveDetails[activePhotoIndex] = { species: selectedSpecies, gear: selectedGear, length, weight };
      const next = withActiveDetails.filter((_, photoIndex) => photoIndex !== index);
      const details = next[nextActiveIndex] ?? EMPTY_PHOTO_CATCH;
      setSelectedSpecies(details.species);
      setSelectedGear(details.gear);
      setLength(details.length);
      setWeight(details.weight);
      return next;
    });
    setImage(nextPhotos[0] ?? null);
    setExtraPhotos(nextPhotos.slice(1));
    setActivePhotoIndex(nextActiveIndex);
  };

  const selectPhoto = (index: number) => {
    setPhotoCatches((current) => {
      const next = [...current];
      next[activePhotoIndex] = { species: selectedSpecies, gear: selectedGear, length, weight };
      const details = next[index] ?? EMPTY_PHOTO_CATCH;
      setSelectedSpecies(details.species);
      setSelectedGear(details.gear);
      setLength(details.length);
      setWeight(details.weight);
      return next;
    });
    setActivePhotoIndex(index);
  };

  const fishSpecies = [
    { id: "pike", image: require("../../assets/fishicons/pike.png") },
    { id: "perch", image: require("../../assets/fishicons/perch.png") },
    { id: "carp", image: require("../../assets/fishicons/carp.png") },
    { id: "pikeperch", image: require("../../assets/fishicons/pikeperch.png") },
  ];

  const allSpeciesOptions = getSpeciesOptions(language);
  const moreSpecies = allSpeciesOptions;
  const filteredMoreSpecies = moreSpecies
    .filter(s => s.habitat === speciesTab)
    .filter(s => {
      if (!speciesSearch.trim()) return true;
        const q = speciesSearch.toLowerCase();
        return s.labelRu.toLowerCase().includes(q) ||
               s.labelEn.toLowerCase().includes(q) ||
               s.scientificName.toLowerCase().includes(q);
      });

  const openMore = () => {
    setSpeciesTab(getSpeciesHabitat(selectedSpecies));
    setMoreModalVisible(true);
  };

  const selectMoreSpecies = (id: string) => {
    setSelectedSpecies(id);
    setMoreModalVisible(false);
    setSpeciesSearch("");
  };

  const selectedSpeciesEntry = selectedSpecies ? fishSpecies.find(s => s.id === selectedSpecies) : null;
  const selectedSpeciesImage = selectedSpecies
    ? (selectedSpeciesEntry?.image ?? speciesPhotoMap[selectedSpecies] ?? null)
    : null;

  const allGearOptions = getGearOptions(language);
  const filteredGearOptions = filterGearOptions(language, gearTab, gearSearch);

  const openGearPicker = () => {
    setGearTab(getGearPickerTab(selectedGear));
    setGearModalVisible(true);
  };

  const featuredGear = ["vobler", "spoon", "vrashchalka", "silikon"].map(id =>
    allGearOptions.find(g => g.id === id)!
  ).filter(Boolean);

  const savedRods = getTackleItemsByKind(tackleItems, "rod");
  const savedReels = getTackleItemsByKind(tackleItems, "reel");
  const selectedRod = tackleItems.find(item => item.id === selectedRodId) ?? null;
  const selectedReel = tackleItems.find(item => item.id === selectedReelId) ?? null;
  const missingTackleFields = getMissingTackleFields(tackleDraft);

  const selectTackle = (kind: TackleKind, id: string | null) => {
    if (kind === "rod") setSelectedRodId(id);
    else setSelectedReelId(id);
  };

  const openTackleDraft = (kind: TackleKind) => {
    setTackleDraftKind(kind);
    setTackleDraft(emptyTackleDraft(kind));
  };

  const saveTackleDraft = async () => {
    if (!user || !tackleDraftKind) return;
    const draft = buildTackleDraft(tackleDraftKind, tackleDraft);
    if (!draft) return;

    if ([draft.name, draft.model, draft.manufacturer].some((value) => isProfane(value))) {
      Alert.alert(
        t("error"),
        language === "ru" ? "Название снасти содержит недопустимый текст." : "This tackle name contains objectionable text.",
      );
      return;
    }

    setSavingTackle(true);
    try {
      const saved = await createTackleItem(user.id, draft);
      setTackleItems((current) => (current.some(item => item.id === saved.id) ? current : [...current, saved]));
      selectTackle(saved.kind, saved.id);
      setTackleDraftKind(null);
      setTackleDraft(emptyTackleDraft(tackleDraftKind));
    } finally {
      setSavingTackle(false);
    }
  };

  const resetForm = () => {
    waterBodyDetectionRequestRef.current += 1;
    setCurrentStep(getResetCatchFormStep());
    setImage(null);
    setExtraPhotos([]);
    setDescription("");
    setLength("");
    setWeight("");
    setSelectedSpecies(null);
    setSpeciesTab("freshwater");
    setMoreModalVisible(false);
    setSpeciesSearch("");
    setSelectedGear(null);
    setGearTab("lure");
    setGearModalVisible(false);
    setGearSearch("");
    setImageCoords(null);
    setWaterBody(null);
    setDetectingWater(false);
    setPendingWaterBody(null);
    setWaterBodyNameModalVisible(false);
    setWaterBodyNameInput("");
    setSavingWaterBodyName(false);
    setIsPublic(true);
    setLocationPickerVisible(false);
    setPendingCoord(null);
    setPickerCenter([37.618423, 55.751244]);
    setLocationMapLoaded(false);
    setLocationSearchQuery("");
    setLocationSearchResults([]);
    setSearchingLocation(false);
    setSelectedRodId(null);
    setSelectedReelId(null);
    setTackleDraftKind(null);
    setTackleDraft(emptyTackleDraft("rod"));
    setSavingTackle(false);
  };

  const handleUpload = async () => {
    if (detectingWater || pendingWaterBody) {
      Alert.alert(
        t("error"),
        language === "ru" ? "Дождитесь определения водоёма и сохраните его название." : "Wait for water body detection and save its name.",
      );
      return;
    }

    if (description.trim() && isProfane(description)) {
      Alert.alert(
        t("error"),
        language === "ru" ? "Описание содержит недопустимый текст." : "The description contains objectionable text."
      );
      return;
    }

    setIsUploading(true);
    try {
      const lat = imageCoords?.lat ?? null;
      const lon = imageCoords?.lon ?? null;
      const shareLocation = isPublic && lat != null && lon != null;
      const savedLat = shareLocation ? lat : null;
      const savedLon = shareLocation ? lon : null;

      const photoUris = [image, ...extraPhotos].filter(Boolean) as string[];
      const rodLabel = getTackleCatchLabel(selectedRod);
      const reelLabel = getTackleCatchLabel(selectedReel);
      const savedPhotoCatches = photoUris.map((_, index) => index === activePhotoIndex
        ? { species: selectedSpecies, gear: selectedGear, length, weight }
        : photoCatches[index] ?? EMPTY_PHOTO_CATCH);
      const primaryPhotoCatch = savedPhotoCatches[0] ?? EMPTY_PHOTO_CATCH;
      const lengthNum = primaryPhotoCatch.length ? Number(primaryPhotoCatch.length) : null;
      const weightNum = primaryPhotoCatch.weight ? Number(primaryPhotoCatch.weight) : null;
      const createdAt = Date.now();

      // Compress once; reuse the result for both the upload and the local copy.
      const uploadImage = image ? await compressPhoto(image) : null;
      const uploadExtras = await Promise.all(extraPhotos.map(compressPhoto));

      let pbImageUrl: string | undefined;
      let pbRecordId: string | undefined;
      let savedOffline = false;

      // Offline: skip the network round-trip entirely and queue it locally.
      // pushPendingCatches (on reconnect / next launch) will upload it.
      if (user && !isOnline) {
        savedOffline = true;
      }

      // Always upload to PocketBase for backup (public or private)
      if (user && isOnline) {
        try {
          const formData = new FormData();
          formData.append('user_id', user.id);
          formData.append('species', primaryPhotoCatch.species ?? '');
          if (savedLat != null) formData.append('lat', String(savedLat));
          if (savedLon != null) formData.append('lon', String(savedLon));
          if (shareLocation && waterBody?.id) {
            formData.append('water_body_id', waterBody.id);
          }
          if (shareLocation && waterBody) {
            formData.append('water_body_name', waterBody.name);
          }
          formData.append('description', description || '');
          formData.append('gear', primaryPhotoCatch.gear ?? '');
          if (rodLabel) formData.append('rod', rodLabel);
          if (reelLabel) formData.append('reel', reelLabel);
          formData.append('photo_catches', JSON.stringify(savedPhotoCatches));
          if (lengthNum != null) formData.append('length_cm', String(lengthNum));
          if (weightNum != null) formData.append('weight_kg', String(weightNum));
          formData.append('created_at', String(createdAt));
          formData.append('is_public', 'true');

          if (uploadImage) {
            formData.append('image', new File(uploadImage));
          }

          uploadExtras.forEach((uri, i) => {
            formData.append('images', new File(uri));
          });

          const uploadRequestKey = `create-catch-${createdAt}`;
          const record = await withPbTimeout(
            uploadRequestKey,
            () => pb.collection('catches').create(formData, { requestKey: uploadRequestKey })
          );
          pbRecordId = record.id;

          if (record.image) {
            pbImageUrl = pb.files.getURL(record, record.image);
          }

          if (lengthNum != null && lengthNum > 0) {
            DeviceEventEmitter.emit("catchWithLengthAdded");
          }

          // Grant "rybolov" badge on first catch
          const existingBadges = parseBadges(user.badges);
          if (!existingBadges.includes("rybolov")) {
            const countRequestKey = `first-catch-count-${createdAt}`;
            const catchCount = await withPbTimeout(countRequestKey, () => pb.collection("catches").getList(1, 1, {
              filter: `user_id = "${user.id}"`,
              requestKey: countRequestKey,
            }), 5000);
            if (catchCount.totalItems === 1) {
              const newBadges = [...existingBadges, "rybolov"];
              const badgeRequestKey = `grant-rybolov-${createdAt}`;
              await withPbTimeout(
                badgeRequestKey,
                () => pb.collection("users").update(user.id, { badges: newBadges }, { requestKey: badgeRequestKey }),
                5000
              );
              pb.authStore.save(pb.authStore.token, { ...pb.authStore.record!, badges: newBadges });
            }
          }
        } catch (e) {
          savedOffline = true;
          console.warn('PocketBase sync failed:', e);
        }
      }

      // Always copy to permanent local storage so image loads offline
      let localImageUri = uploadImage;
      if (uploadImage) {
        try {
          const dest = new File(Paths.document, `catch_${createdAt}.jpg`);
          new File(uploadImage).copy(dest);
          localImageUri = dest.uri;
        } catch (e) {
          console.warn('Failed to copy image to permanent storage:', e);
        }
      }

      const persistedExtraPhotos: string[] = [];
      for (let i = 0; i < uploadExtras.length; i++) {
        try {
          const dest = new File(Paths.document, `catch_${createdAt}_extra_${i}.jpg`);
          new File(uploadExtras[i]).copy(dest);
          persistedExtraPhotos.push(dest.uri);
        } catch (e) {
          persistedExtraPhotos.push(uploadExtras[i]);
        }
      }

      await addCatch({
        id: pbRecordId ?? String(createdAt),
        image: localImageUri ?? undefined,
        pbImageUrl: pbImageUrl,
        extraPhotos: persistedExtraPhotos,
        photoCatches: savedPhotoCatches,
        description: description || '',
        length: lengthNum != null ? String(lengthNum) : '',
        weight: weightNum != null ? String(weightNum) : '',
        species: primaryPhotoCatch.species ?? undefined,
        gear: primaryPhotoCatch.gear ?? undefined,
        rod: rodLabel || undefined,
        reel: reelLabel || undefined,
        date: new Date(createdAt).toISOString(),
        lat: savedLat,
        lon: savedLon,
        waterBodyId: shareLocation ? waterBody?.id : undefined,
        waterBodyName: shareLocation ? waterBody?.name : undefined,
        isPublic: true,
        pendingSync: savedOffline,
      });

      Toast.show({ type: "catchSaved", text1: savedOffline ? t("catchSavedOffline") : t("catchSaved"), position: "top", visibilityTime: 3000 });
      resetForm();
      router.push("/profile");

    } catch (e: any) {
      console.error("handleUpload error", e);
      Alert.alert(t("error"), t("uploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  if (!user) {
    return (
      <SignInPrompt
        icon="add-circle-outline"
        title={language === "ru" ? "Добавляйте свои уловы" : "Log your catches"}
        subtitle={language === "ru" ? "Войдите, чтобы добавлять уловы и делиться ими." : "Sign in to add and share your catches."}
      />
    );
  }

  const goToNextStep = () => {
    setCurrentStep((step) => Math.min(step + 1, CATCH_FORM_STEP_COUNT - 1));
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.addScreenHeader}>
            <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityLabel={language === "ru" ? "Ход добавления улова" : "Catch creation progress"}
            accessibilityValue={{ min: 0, max: CATCH_FORM_STEP_COUNT, now: currentStep + 1 }}
            style={styles.progressPill}
          >
            <View style={[styles.progressPillFill, { width: `${((currentStep + 1) / CATCH_FORM_STEP_COUNT) * 100}%` }]} />
          </View>

          {currentStep === 0 && (<>
          <Text style={styles.stepHeading}>{language === "ru" ? "Добавьте фото" : "Add photos"}</Text>
          <Text style={styles.stepHint}>{language === "ru" ? "Можно выбрать несколько фото или продолжить без них." : "Choose multiple photos, or continue without any."}</Text>
          <View style={styles.imageRow}>
            {image ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoSelectionGrid}>
                {[image, ...extraPhotos].filter(Boolean).map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.photoSelectionItem}>
                    <ExpoImage source={{ uri }} style={styles.photoSelectionImage} contentFit="cover" />
                    <TouchableOpacity
                      style={styles.removeThumbBtn}
                      onPress={() => removeTripPhoto(index)}
                      accessibilityLabel={language === "ru" ? "Удалить фото" : "Remove photo"}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {extraPhotos.length < 5 && (
                  <TouchableOpacity
                    onPress={pickExtraPhotos}
                    style={styles.addPhotoSelectionButton}
                    accessibilityLabel={language === "ru" ? "Добавить фото" : "Add photos"}
                  >
                    <Ionicons name="add" size={28} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </ScrollView>
            ) : (
              <TouchableOpacity onPress={pickImagesAndGetGps} style={styles.photoBox}>
                <Text style={styles.placeholderText}>{t("addPhoto")}</Text>
              </TouchableOpacity>
            )}
          </View>
          </>)}

          <Modal visible={locationPickerVisible} animationType="slide" onRequestClose={() => { setLocationPickerVisible(false); setLocationMapLoaded(false); }}>
            <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
              <View style={{ paddingTop: safeTop + 12, paddingBottom: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{t("locationPickerTitle")}</Text>
                <TouchableOpacity onPress={() => { setLocationPickerVisible(false); setLocationMapLoaded(false); setPendingCoord(null); setLocationSearchQuery(""); setLocationSearchResults([]); }} style={styles.closeBtn} hitSlop={8}>
                  <Ionicons name="close" size={22} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              <View style={styles.locationSearchBox}>
                <Ionicons name="search-outline" size={15} color="#64748b" />
                <TextInput
                  style={styles.locationSearchInput}
                  placeholder={language === "ru" ? "Найти место..." : "Search location..."}
                  placeholderTextColor="#475569"
                  value={locationSearchQuery}
                  onChangeText={setLocationSearchQuery}
                  autoCapitalize="words"
                  autoCorrect={false}
                  keyboardAppearance="dark"
                  returnKeyType="search"
                />
                {searchingLocation ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              </View>
              {locationSearchResults.length > 0 && (
                <View style={styles.locationSearchResults}>
                  <FlatList
                    data={locationSearchResults}
                    keyExtractor={(result) => result.id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item: result }) => (
                      <TouchableOpacity
                        style={styles.locationSearchResultRow}
                        activeOpacity={0.75}
                        onPress={() => {
                          setPickerCenter(result.center);
                          setPendingCoord({ lon: result.center[0], lat: result.center[1] });
                          setLocationSearchQuery(result.label);
                          setLocationSearchResults([]);
                        }}
                      >
                        <Ionicons name="location-outline" size={17} color="#38bdf8" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.locationSearchResultTitle}>{result.label}</Text>
                          <Text style={styles.locationSearchResultSub} numberOfLines={1}>{result.subtitle}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                {mapboxReady ? (
                  <>
                        <MapboxGL.MapView
                          style={{ flex: 1 }}
                          styleURL="mapbox://styles/mapbox/streets-v12"
                          localizeLabels={{ locale: language }}
                          scaleBarEnabled={false}
                      onDidFinishLoadingMap={() => setLocationMapLoaded(true)}
                      onMapIdle={(state) => {
                        const [lon, lat] = state.properties.center;
                        setPendingCoord({ lat, lon });
                      }}
                    >
                      <MapboxGL.Camera zoomLevel={12} centerCoordinate={pickerCenter} animationMode="none" animationDuration={0} />
                      <MapboxGL.ShapeSource id="location-picker-water-bodies" shape={locationPickerWaterBodies}>
                        <MapboxGL.FillLayer id="location-picker-water-fills" style={{ fillColor: "#0369a1", fillOpacity: 0.2 }} />
                        <MapboxGL.LineLayer id="location-picker-water-outlines" style={{ lineColor: "#7dd3fc", lineWidth: 2, lineOpacity: 0.9 }} />
                      </MapboxGL.ShapeSource>
                      <MapboxGL.ShapeSource id="location-picker-catches" shape={locationPickerCatchMarkers}>
                        <MapboxGL.CircleLayer
                          id="location-picker-catch-points"
                          style={{ circleRadius: 4, circleColor: "#38bdf8", circleOpacity: 0.9, circleStrokeColor: "#ffffff", circleStrokeWidth: 1 }}
                        />
                      </MapboxGL.ShapeSource>
                    </MapboxGL.MapView>
                    {!locationMapLoaded ? (
                      <View pointerEvents="none" style={styles.locationMapLoading}>
                        <ActivityIndicator size="small" color="#ffffff" />
                        <Text style={styles.locationMapLoadingText}>{language === "ru" ? "Загружаем карту..." : "Loading map..."}</Text>
                      </View>
                    ) : null}
                    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="location-sharp" size={36} color="#ef4444" style={{ marginBottom: 18 }} />
                    </View>
                  </>
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator size="small" color="#94a3b8" />
                  </View>
                )}
              </View>
              <View style={{ padding: 16, paddingBottom: 40 }}>
                <TouchableOpacity
                  style={styles.confirmLocationBtn}
                  disabled={!pendingCoord}
                  onPress={() => {
                    if (!pendingCoord) return;
                    setImageCoords(pendingCoord);
                    detectWaterBody(pendingCoord.lat, pendingCoord.lon);
                    setLocationPickerVisible(false);
                    setLocationSearchQuery("");
                    setLocationSearchResults([]);
                    setPendingCoord(null);
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("locationPickerConfirm")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          {currentStep === 1 && (<>
          <Text style={styles.stepHeading}>{language === "ru" ? "Детали улова" : "Catch details"}</Text>
          <Text style={styles.stepHint}>{language === "ru" ? "Все поля необязательны — добавьте столько, сколько знаете." : "Everything here is optional—add what you know."}</Text>
          <View style={styles.photoReviewRow}>
            {image ? <View style={styles.tripPhotoCarouselWrap}><ScrollView ref={tripPhotoScrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.tripPhotoCarousel} onMomentumScrollEnd={(event) => selectPhoto(Math.round(event.nativeEvent.contentOffset.x / TRIP_PHOTO_FRAME_WIDTH))}>
              {[image, ...extraPhotos].map((uri, index) => <View key={uri} style={styles.tripPhotoPage}>
                <ExpoImage source={{ uri }} style={styles.photoReview} contentFit="cover" />
                <TouchableOpacity style={styles.removeThumbBtn} onPress={() => removeTripPhoto(index)} accessibilityLabel={language === "ru" ? "Удалить фото" : "Remove photo"}><Ionicons name="close" size={14} color="#fff" /></TouchableOpacity>
              </View>)}
            </ScrollView>{activePhotoIndex > 0 && <TouchableOpacity style={[styles.carouselArrow, styles.carouselArrowLeft]} onPress={() => tripPhotoScrollRef.current?.scrollTo({ x: (activePhotoIndex - 1) * TRIP_PHOTO_FRAME_WIDTH, animated: true })} accessibilityLabel={language === "ru" ? "Предыдущее фото" : "Previous photo"}><Ionicons name="chevron-back" size={16} color="#fff" /></TouchableOpacity>}{activePhotoIndex < extraPhotos.length && <TouchableOpacity style={[styles.carouselArrow, styles.carouselArrowRight]} onPress={() => tripPhotoScrollRef.current?.scrollTo({ x: (activePhotoIndex + 1) * TRIP_PHOTO_FRAME_WIDTH, animated: true })} accessibilityLabel={language === "ru" ? "Следующее фото" : "Next photo"}><Ionicons name="chevron-forward" size={16} color="#fff" /></TouchableOpacity>}</View> : <TouchableOpacity onPress={pickImagesAndGetGps} style={styles.photoReviewButton}><Ionicons name="images-outline" size={30} color="#94a3b8" /></TouchableOpacity>}
            <View style={styles.photoReviewCopy}>
              <Text style={styles.photoReviewTitle}>{image ? `${activePhotoIndex + 1} / ${1 + extraPhotos.length}` : (language === "ru" ? "Фото не добавлены" : "No photos added")}</Text>
              <Text style={styles.photoReviewHint}>{language === "ru" ? "Листайте, чтобы указать улов на фото" : "Swipe to set the catch for each photo"}</Text>
              {extraPhotos.length < 5 && <TouchableOpacity onPress={pickExtraPhotos}><Text style={styles.addPhotoText}>{language === "ru" ? "Добавить фото" : "Add photos"}</Text></TouchableOpacity>}
            </View>
          </View>
          <View style={styles.inputs}>
            <TextInput
              style={styles.descriptionInput}
              placeholder={t("descriptionPlaceholder")}
              placeholderTextColor="#94a3b8"
              value={description}
              onChangeText={setDescription}
              returnKeyType='done'
              multiline
              keyboardAppearance="dark"
            />
            <TextInput
              style={styles.input}
              placeholder={t("lengthPlaceholder")}
              placeholderTextColor="#94a3b8"
              keyboardType="decimal-pad"
              returnKeyType='done'
              value={length}
              onChangeText={(text) => setLength(text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
              keyboardAppearance="dark"
            />
            <TextInput
              style={styles.input}
              placeholder={t("weightPlaceholder")}
              placeholderTextColor="#94a3b8"
              returnKeyType="done"
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={(text) => setWeight(text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
              keyboardAppearance="dark"
            />
          </View>
          <Text style={styles.sectionHeading}>{language === "ru" ? "Рыба и снасти" : "Species & gear"}</Text>
          <View style={styles.speciesWrapper}>
            <Text style={styles.speciesTitle}>{t("species")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {selectedSpeciesImage && (
                <View style={styles.selectedPreviewBox}>
                  <ExpoImage source={selectedSpeciesImage} style={styles.selectedPreviewImg} contentFit="contain" />
                </View>
              )}
              <View style={styles.previewDivider} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speciesContainer} style={{ flex: 1 }}>
                {fishSpecies.map((s) => {
                  const speciesOption = allSpeciesOptions.find(opt => opt.id === s.id);
                  return (
                    <TouchableOpacity key={s.id} style={styles.speciesItem} onPress={() => setSelectedSpecies(s.id)}>
                      <Image source={s.image} style={styles.speciesImage} />
                      <Text style={styles.speciesLabel}>{speciesOption?.label || s.id}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={styles.moreButton} onPress={openMore}><Text style={styles.moreText}>{t("more")}</Text></TouchableOpacity>
              </ScrollView>
            </View>
            <Text style={styles.selectedSpeciesText}>{selectedSpecies ? `${t("selectedSpecies")}: ${getSpeciesLabelTranslated(selectedSpecies, language)}` : t("speciesNotSelected")}</Text>
          </View>

          {/* Gear selector */}
          <View style={styles.speciesWrapper}>
            <Text style={styles.speciesTitle}>{t("gear")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {selectedGear && (() => {
                const gData = allGearOptions.find(x => x.id === selectedGear);
                return (
                  <View style={[styles.selectedPreviewBox, gData && { borderColor: GEAR_CATEGORY_COLOR[gData.category] }]}>
                    {gearPhotos[selectedGear] ? (
                      <ExpoImage source={gearPhotos[selectedGear]} style={styles.selectedPreviewImg} contentFit="contain" />
                    ) : gData ? (
                      <Ionicons name={GEAR_CATEGORY_ICON[gData.category] as any} size={38} color={GEAR_CATEGORY_COLOR[gData.category]} />
                    ) : null}
                  </View>
                );
              })()}
              <View style={styles.previewDivider} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speciesContainer} style={{ flex: 1 }}>
                {featuredGear.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={styles.speciesItem}
                    onPress={() => setSelectedGear(g.id)}
                  >
                    {gearPhotos[g.id] ? (
                      <ExpoImage source={gearPhotos[g.id]} style={styles.speciesImage} contentFit="contain" />
                    ) : (
                      <View style={[styles.gearIconBox, { borderColor: GEAR_CATEGORY_COLOR[g.category] }]}>
                        <Ionicons name={GEAR_CATEGORY_ICON[g.category] as any} size={28} color={GEAR_CATEGORY_COLOR[g.category]} />
                      </View>
                    )}
                    <Text style={styles.speciesLabel}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.moreButton} onPress={openGearPicker}>
                  <Text style={styles.moreText}>{t("more")}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
            <Text style={styles.selectedSpeciesText}>
              {selectedGear ? `${t("selectedGear")}: ${getGearLabel(selectedGear, language)}` : t("gearNotSelected")}
            </Text>
          </View>
          <Text style={styles.sectionHeading}>{language === "ru" ? "Место и видимость" : "Location & visibility"}</Text>
          {imageCoords ? (
            <>
              <View style={styles.locationRow}>
                <View style={styles.locationCoords}>
                  <Ionicons name="location-sharp" size={13} color="#ffffff" />
                  <Text style={styles.coordsText}>
                    {imageCoords.lat.toFixed(4)}, {imageCoords.lon.toFixed(4)}
                  </Text>
                </View>
                <TouchableOpacity onPress={openLocationPicker} style={[styles.addLocationBtn, styles.changeLocationBtn]}>
                  <Text style={[styles.addLocationBtnText, styles.changeLocationBtnText]}>{t("changeLocation")}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.waterBodyStatus}>
                <View style={styles.waterBodyStatusContent}>
                  <Text style={styles.waterBodyStatusLabel}>{language === "ru" ? "ВОДОЁМ" : "WATER BODY"}</Text>
                  <Text style={[styles.waterBodyStatusText, waterBody && styles.waterBodyStatusTextMatched]}>
                    {detectingWater
                      ? t("detectingWater")
                      : waterBody
                        ? waterBody.name
                        : pendingWaterBody
                          ? (language === "ru" ? "Название не найдено" : "Name not found")
                          : (language === "ru" ? "Не найден рядом с точкой улова" : "Not found near this catch location")}
                  </Text>
                  {waterBody ? (
                    <Text style={styles.waterBodyStatusHint}>
                      {language === "ru" ? "Улов будет добавлен сюда" : "This catch will be added here"}
                    </Text>
                  ) : null}
                </View>
                {pendingWaterBody && !detectingWater ? (
                  <TouchableOpacity onPress={() => setWaterBodyNameModalVisible(true)} style={styles.nameWaterBodyBtn}>
                    <Text style={styles.nameWaterBodyBtnText}>{language === "ru" ? "Указать" : "Add name"}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.noCoordsRow}>
              <Ionicons name="location-outline" size={16} color="#ef4444" style={{ marginRight: 8 }} />
              <Text style={styles.noCoordsText}>{t("noCoordsLabel")}</Text>
              <TouchableOpacity onPress={openLocationPicker} style={styles.addLocationBtn}>
                <Text style={styles.addLocationBtnText}>{t("addLocationManually")}</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.publicRow, !imageCoords && styles.publicRowDisabled]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.publicLabel}>{language === "ru" ? "Показывать место на карте" : "Show location on map"}</Text>
              <Text style={styles.publicSub}>
                {!imageCoords ? t("noCoordsPrivateNote") : (language === "ru" ? "Отчёт всегда виден в ленте" : "Your report always appears in feeds")}
              </Text>
            </View>
            <Switch
              value={!!imageCoords && isPublic}
              onValueChange={setIsPublic}
              disabled={!imageCoords}
              trackColor={{ false: theme.colors.surfaceRaised, true: theme.colors.primaryMuted }}
              thumbColor="#ffffff"
            />
          </View>
          </>)}

          {currentStep === CATCH_FORM_TACKLE_STEP && (<>
          <Text style={styles.stepHeading}>{getTackleSectionLabel(language)}</Text>
          <Text style={styles.stepHint}>
            {language === "ru"
              ? "Необязательно. Сохранённые удилища и катушки будут доступны для следующих уловов."
              : "Optional. Saved rods and reels stay available for your next catch."}
          </Text>
          {(["rod", "reel"] as TackleKind[]).map((kind) => {
            const kindItems = kind === "rod" ? savedRods : savedReels;
            const kindSelectedId = kind === "rod" ? selectedRodId : selectedReelId;
            const kindSelected = kind === "rod" ? selectedRod : selectedReel;
            const kindLabel = getTackleKindLabel(kind, language);
            return (
              <View key={kind} style={styles.speciesWrapper}>
                <Text style={styles.speciesTitle}>{kindLabel}</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speciesContainer} style={{ flex: 1 }}>
                    {loadingTackle && kindItems.length === 0 ? (
                      <View style={styles.moreButton}>
                        <ActivityIndicator size="small" color="#ffffff" />
                      </View>
                    ) : kindItems.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.speciesItem, kindSelectedId === item.id && styles.speciesItemSelected]}
                        onPress={() => selectTackle(kind, item.id)}
                        accessibilityState={{ selected: kindSelectedId === item.id }}
                      >
                        <Text style={styles.speciesLabel} numberOfLines={1}>{item.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={() => openTackleDraft(kind)}
                      accessibilityLabel={language === "ru" ? `Добавить: ${kindLabel.toLowerCase()}` : `Add ${kindLabel.toLowerCase()}`}
                    >
                      <Ionicons name="add" size={26} color="#ffffff" />
                    </TouchableOpacity>
                  </ScrollView>
                </View>
                <Text style={styles.selectedSpeciesText}>
                  {kindSelected
                    ? `${kindLabel}: ${kindSelected.name}`
                    : (language === "ru" ? "Не выбрано" : "Not selected")}
                </Text>
                {kindSelected && (
                  <TouchableOpacity onPress={() => selectTackle(kind, null)}>
                    <Text style={styles.tackleClearText}>
                      {language === "ru" ? "Очистить выбор" : "Clear selection"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          </>)}

          <Modal
            visible={waterBodyNameModalVisible}
            animationType="fade"
            transparent
            onRequestClose={() => setWaterBodyNameModalVisible(false)}
          >
            <View style={styles.nameWaterBodyOverlay}>
              <View style={styles.nameWaterBodyCard}>
                <Ionicons name="water" size={28} color="#38bdf8" />
                <Text style={styles.nameWaterBodyTitle}>{language === "ru" ? "Как называется этот водоём?" : "What is this water body called?"}</Text>
                <Text style={styles.nameWaterBodyHint}>{language === "ru" ? "Название будет доступно для будущих уловов рядом." : "This name will be reused for future catches nearby."}</Text>
                <TextInput
                  style={styles.nameWaterBodyInput}
                  placeholder={language === "ru" ? "Название водоёма" : "Water body name"}
                  placeholderTextColor="#64748b"
                  value={waterBodyNameInput}
                  onChangeText={setWaterBodyNameInput}
                  autoCapitalize="words"
                  autoFocus
                  maxLength={200}
                  returnKeyType="done"
                  onSubmitEditing={saveWaterBodyName}
                />
                <View style={styles.nameWaterBodyActions}>
                  <TouchableOpacity onPress={() => setWaterBodyNameModalVisible(false)} disabled={savingWaterBodyName} style={styles.nameWaterBodyCancel}>
                    <Text style={styles.nameWaterBodyCancelText}>{t("cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveWaterBodyName} disabled={!waterBodyNameInput.trim() || savingWaterBodyName} style={[styles.nameWaterBodySave, (!waterBodyNameInput.trim() || savingWaterBodyName) && styles.nameWaterBodySaveDisabled]}>
                    {savingWaterBodyName ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.nameWaterBodySaveText}>{language === "ru" ? "Сохранить" : "Save"}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={moreModalVisible}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={() => { setMoreModalVisible(false); setSpeciesSearch(""); }}
          >
            <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.modalOverlay, { paddingTop: safeTop }]}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.speciesTitle}>{t("selectSpecies")}</Text>
                  <TouchableOpacity onPress={() => { setMoreModalVisible(false); setSpeciesSearch(""); }} style={styles.closeBtn} hitSlop={8}>
                    <Ionicons name="close" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <View style={styles.searchRow}>
                  <Ionicons name="search-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={language === "ru" ? "Поиск..." : "Search..."}
                    placeholderTextColor="#475569"
                    value={speciesSearch}
                    onChangeText={setSpeciesSearch}
                    autoCorrect={false}
                    keyboardAppearance="dark"
                    clearButtonMode="while-editing"
                  />
                </View>
                <View style={styles.speciesTabRow}>
                  {(["freshwater", "saltwater"] as SpeciesHabitat[]).map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      style={[styles.speciesTabBtn, speciesTab === tab && styles.speciesTabBtnActive]}
                      onPress={() => setSpeciesTab(tab)}
                    >
                      <Text style={[styles.speciesTabText, speciesTab === tab && styles.speciesTabTextActive]}>
                        {t(tab)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <FlatList
                  data={filteredMoreSpecies}
                  keyExtractor={(s) => s.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: s }) => (
                    <Pressable
                      key={s.id}
                      onPress={() => selectMoreSpecies(s.id)}
                      style={({ pressed }) => pressed ? { backgroundColor: "#061420" } : undefined}
                    >
                      <View style={styles.modalItem}>
                        {speciesPhotoMap[s.id] ? (
                          <ExpoImage source={speciesPhotoMap[s.id]} style={styles.modalItemImage} contentFit="contain" />
                        ) : (
                          <View style={styles.modalItemImagePlaceholder}>
                            <Ionicons name="help-circle-outline" size={20} color="#334155" />
                          </View>
                        )}
                        <View style={styles.modalItemLeft}>
                          <Text style={styles.modalItemText}>{s.label}</Text>
                          <Text style={styles.modalItemScientific}>{s.scientificName}</Text>
                        </View>
                      </View>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <Text style={{ color: "#94a3b8", textAlign: "center", paddingVertical: 24 }}>
                      {language === "ru" ? "Ничего не найдено" : "No results"}
                    </Text>
                  }
                />
              </View>
            </SafeAreaView>
          </Modal>

          {/* Gear modal */}
          <Modal
            visible={gearModalVisible}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={() => { setGearModalVisible(false); setGearSearch(""); }}
          >
            <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.modalOverlay, { paddingTop: safeTop }]}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.speciesTitle}>{t("selectGear")}</Text>
                  <TouchableOpacity onPress={() => { setGearModalVisible(false); setGearSearch(""); }} style={styles.closeBtn} hitSlop={8}>
                    <Ionicons name="close" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <View style={styles.searchRow}>
                  <Ionicons name="search-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={language === "ru" ? "Поиск..." : "Search..."}
                    placeholderTextColor="#475569"
                    value={gearSearch}
                    onChangeText={setGearSearch}
                    autoCorrect={false}
                    keyboardAppearance="dark"
                    clearButtonMode="while-editing"
                  />
                </View>
                <View style={styles.speciesTabRow} accessibilityRole="tablist">
                  {(["lure", "bait"] as GearPickerTab[]).map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: gearTab === tab }}
                      style={[styles.speciesTabBtn, gearTab === tab && styles.speciesTabBtnActive]}
                      onPress={() => setGearTab(tab)}
                    >
                      <Text style={[styles.speciesTabText, gearTab === tab && styles.speciesTabTextActive]}>
                        {t(tab === "lure" ? "gearCategoryLure" : "gearCategoryBait")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <FlatList
                  data={filteredGearOptions}
                  keyExtractor={(g) => g.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: g }) => (
                    <Pressable
                      onPress={() => { setSelectedGear(g.id); setGearModalVisible(false); setGearSearch(""); }}
                      style={({ pressed }) => pressed ? { backgroundColor: "#061420" } : undefined}
                    >
                      <View style={styles.modalItem}>
                        {gearPhotos[g.id] ? (
                          <ExpoImage source={gearPhotos[g.id]} style={styles.modalItemImage} contentFit="contain" />
                        ) : (
                          <View style={[styles.modalItemImagePlaceholder, { backgroundColor: "#0f2236", borderWidth: 1.5, borderColor: GEAR_CATEGORY_COLOR[g.category] }]}>
                            <Ionicons name={GEAR_CATEGORY_ICON[g.category] as any} size={22} color={GEAR_CATEGORY_COLOR[g.category]} />
                          </View>
                        )}
                        <View style={styles.modalItemLeft}>
                          <Text style={styles.modalItemText}>{g.label}</Text>
                        </View>
                      </View>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <Text style={{ color: "#94a3b8", textAlign: "center", paddingVertical: 24 }}>
                      {language === "ru" ? "Ничего не найдено" : "No results"}
                    </Text>
                  }
                />
              </View>
            </SafeAreaView>
          </Modal>

          {/* Rod / reel editor */}
          <Modal
            visible={tackleDraftKind !== null}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={() => setTackleDraftKind(null)}
          >
            <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.modalOverlay, { paddingTop: safeTop }]}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.speciesTitle}>
                    {tackleDraftKind
                      ? `${language === "ru" ? "Добавить" : "Add"} ${getTackleKindLabel(tackleDraftKind, language).toLowerCase()}`
                      : ""}
                  </Text>
                  <TouchableOpacity onPress={() => setTackleDraftKind(null)} style={styles.closeBtn} hitSlop={8}>
                    <Ionicons name="close" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <View style={styles.tackleForm}>
                  {TACKLE_FIELDS.map((field) => (
                    <View key={field} style={styles.tackleFormRow}>
                      <Text style={styles.tackleFormLabel}>{getTackleFieldLabel(field, language)}</Text>
                      <TextInput
                        style={styles.input}
                        value={tackleDraft[field]}
                        onChangeText={(text) => setTackleDraft((current) => ({ ...current, [field]: text }))}
                        autoCapitalize="words"
                        autoCorrect={false}
                        maxLength={MAX_TACKLE_TEXT_LENGTH}
                        returnKeyType="done"
                        keyboardAppearance="dark"
                      />
                    </View>
                  ))}
                  <Text style={styles.tackleFormHint}>
                    {language === "ru"
                      ? "Сохранится в вашей снасти и будет доступно для будущих уловов."
                      : "Saved to your tackle and available for future catches."}
                  </Text>
                  <TouchableOpacity
                    style={[styles.confirmLocationBtn, (missingTackleFields.length > 0 || savingTackle) && styles.tackleSaveDisabled]}
                    onPress={saveTackleDraft}
                    disabled={missingTackleFields.length > 0 || savingTackle}
                  >
                    {savingTackle
                      ? <ActivityIndicator size="small" color="#ffffff" />
                      : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{language === "ru" ? "Сохранить" : "Save"}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>
          </Modal>
        </ScrollView>
        <View style={styles.flowActions}>
          {currentStep > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentStep((step) => step - 1)}>
              <Text style={styles.backBtnText}>{language === "ru" ? "Назад" : "Back"}</Text>
            </TouchableOpacity>
          ) : <View style={styles.actionSpacer} />}
          {currentStep < CATCH_FORM_STEP_COUNT - 1 ? (
            <TouchableOpacity style={styles.nextBtn} onPress={goToNextStep}>
              <Text style={styles.nextBtnText}>{language === "ru" ? "Далее" : "Continue"}</Text>
                  <Ionicons name="arrow-forward" size={17} color="#000000" />
            </TouchableOpacity>
          ) : (
                <TouchableOpacity style={[styles.uploadBtn, styles.actionPrimary, (isUploading || detectingWater || !!pendingWaterBody) && { opacity: 0.55 }]} onPress={handleUpload} disabled={isUploading || detectingWater || !!pendingWaterBody}>
              <Text style={styles.uploadBtnText}>{isUploading ? t("uploading") : t("upload")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: theme.colors.background, padding: 16, paddingBottom: 108, alignItems: "center" },
  progressPill: { width: "100%", height: 6, overflow: "hidden", borderRadius: 999, marginTop: 12, marginBottom: 28, backgroundColor: theme.colors.surfaceRaised },
  progressPillFill: { height: "100%", borderRadius: 999, backgroundColor: theme.colors.primary },
  stepHeading: { width: "100%", color: theme.colors.text.primary, fontSize: 20, fontFamily: theme.fonts.displaySemibold, marginBottom: 4 },
  stepHint: { width: "100%", color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19, marginBottom: 18 },
  sectionHeading: { width: "100%", color: theme.colors.text.primary, fontSize: 17, fontFamily: theme.fonts.displaySemibold, marginTop: 10, marginBottom: 10 },
  imageRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  photoBox: { width: 200, height: 160, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center", borderRadius: 8, overflow: "hidden" },
  placeholderText: { color: "#94a3b8", fontSize: 16, textAlign: "center" },
  photo: { width: 160, height: 160 },
  photoSelectionGrid: { gap: 10, paddingRight: 4 },
  photoSelectionItem: { width: 144, height: 144, borderRadius: theme.radius.control, overflow: "hidden", position: "relative" },
  photoSelectionImage: { width: "100%", height: "100%" },
  addPhotoSelectionButton: { width: 144, height: 144, borderRadius: theme.radius.control, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  photoReviewRow: { width: "100%", alignItems: "center", gap: 10, marginBottom: 18, padding: 10, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  photoReviewButton: { width: 88, height: 88, borderRadius: theme.radius.control, overflow: "hidden", position: "relative" },
  tripPhotoCarousel: { width: TRIP_PHOTO_FRAME_WIDTH, height: 220, borderRadius: theme.radius.control, overflow: "hidden" },
  tripPhotoCarouselWrap: { width: TRIP_PHOTO_FRAME_WIDTH, height: 220, position: "relative" },
  tripPhotoPage: { width: TRIP_PHOTO_FRAME_WIDTH, height: 220, position: "relative" },
  carouselArrow: { position: "absolute", top: "50%", marginTop: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.42)", alignItems: "center", justifyContent: "center" },
  carouselArrowLeft: { left: 8 },
  carouselArrowRight: { right: 8 },
  addPhotoText: { color: "#ffffff", fontSize: 13, fontWeight: "700", marginTop: 6 },
  photoReview: { width: "100%", height: "100%" },
  photoEditBadge: { position: "absolute", right: 5, bottom: 5, width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: theme.colors.primaryDark },
  photoReviewCopy: { width: "100%", alignItems: "center" },
  photoReviewTitle: { color: theme.colors.text.primary, fontFamily: theme.fonts.bodySemibold, fontSize: 14 },
  photoReviewHint: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 3, textAlign: "center" },
  rightColumn: { marginLeft: 10, flexDirection: "column", gap: 6 },
  extraThumbWrapper: { position: "relative" },
  extraThumb: { width: 56, height: 56, borderRadius: 6 },
  removeThumbBtn: { position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
  addExtraBtn: { width: 56, height: 56, borderRadius: 6, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#1f2937" },
  coordsText: { color: "#94a3b8", fontSize: 13 },
  inputs: { width: "100%", marginBottom: 12 },
  descriptionInput: { backgroundColor: theme.colors.surface, color: "#ffffff", borderColor: "#1f2937", borderWidth: 1, borderRadius: theme.radius.control, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, minHeight: 70, textAlignVertical: "top" },
  input: { backgroundColor: theme.colors.surface, color: "#ffffff", borderColor: "#1f2937", borderWidth: 1, borderRadius: theme.radius.control, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  speciesWrapper: { width: "100%", marginBottom: 16 },
  speciesTitle: { color: "#ffffff", marginBottom: 8, marginLeft: 4 },
  speciesContainer: { paddingHorizontal: 4, alignItems: "center" },
  speciesItem: { width: 96, marginRight: 12, alignItems: "center", padding: 6, borderRadius: 8, backgroundColor: theme.colors.surface },
  speciesItemSelected: { borderWidth: 2, borderColor: "#ffffff", backgroundColor: "#092032" },
  speciesImage: { width: 76, height: 56, marginBottom: 6, resizeMode: "contain" },
  gearIconBox: { width: 64, height: 64, marginBottom: 6, borderRadius: 12, backgroundColor: "#0f2236", alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  speciesLabel: { color: "#e6eef8", fontSize: 12, textAlign: "center" },
  moreButton: { width: 64, height: 64, marginRight: 12, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#06202b" },
  moreText: { color: "#ffffff", fontWeight: "700" },
  selectedSpeciesText: { color: "#ffffff", marginTop: 8, marginLeft: 6 },
  tackleClearText: { color: "#94a3b8", fontSize: 13, marginTop: 8, marginLeft: 6 },
  tackleForm: { width: "100%", paddingHorizontal: 16, gap: 12, marginTop: 8 },
  tackleFormRow: { width: "100%" },
  tackleFormLabel: { color: "#94a3b8", fontSize: 12, marginLeft: 4, marginBottom: 6 },
  tackleFormHint: { color: "#64748b", fontSize: 12, lineHeight: 17, marginLeft: 4 },
  tackleSaveDisabled: { opacity: 0.5 },
  publicRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  publicLabel: { color: "#e6eef8", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  publicSub: { color: "#94a3b8", fontSize: 13 },
  uploadBtn: { backgroundColor: theme.colors.offwhite, paddingHorizontal: 20, paddingVertical: 10, borderRadius: theme.radius.control },
  uploadBtnText: { color: "#000000", fontWeight: "700", textAlign: "center" },
  flowActions: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border },
  actionSpacer: { flex: 1 },
  backBtn: { minHeight: 46, minWidth: 92, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control },
  backBtnText: { color: theme.colors.text.primary, fontFamily: theme.fonts.bodySemibold },
  nextBtn: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginLeft: "auto", paddingHorizontal: 18, backgroundColor: theme.colors.offwhite, borderRadius: theme.radius.control },
  nextBtnText: { color: theme.colors.text.black , fontFamily: theme.fonts.bodyBold },
  actionPrimary: { marginLeft: "auto" },
  saveCard: { width: "100%", backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.card, padding: 16, gap: 10 },
  readinessRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  readinessText: { flex: 1, color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
  summaryLabel: { color: theme.colors.text.secondary, fontSize: 13 },
  summaryValue: { flex: 1, color: theme.colors.text.primary, fontSize: 13, fontFamily: theme.fonts.bodySemibold, textAlign: "right" },
  modalOverlay: { flex: 1, backgroundColor: theme.colors.background },
  modalContent: { flex: 1, paddingTop: 8, paddingBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f2236", borderRadius: 10, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, color: "#e6eef8", fontSize: 15, padding: 0 },
  speciesTabRow: {
    flexDirection: "row",
    backgroundColor: "#0f2236",
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 3,
  },
  speciesTabBtn: { flex: 1, alignItems: "center", borderRadius: 8, paddingVertical: 9 },
  speciesTabBtnActive: { backgroundColor: theme.colors.primaryDark },
  speciesTabText: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  speciesTabTextActive: { color: theme.colors.offwhite },
  modalItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, borderBottomColor: theme.colors.border, borderBottomWidth: 1, gap: 12 },
  modalItemLeft: { flex: 1 },
  modalItemText: { color: theme.colors.offwhite, fontSize: 16 },
  modalItemScientific: { color: "#94a3b8", fontSize: 13, fontStyle: "italic", marginTop: 3 },
  modalItemImage: { width: 76, height: 56, resizeMode: "contain", flexShrink: 0 },
  modalItemImagePlaceholder: { width: 76, height: 56, borderRadius: 8, backgroundColor: "#0f2236", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalClose: { marginTop: 8, alignSelf: "flex-end", padding: 8 },
  locationRow: { alignItems: "center", width: "100%", marginBottom: 14, gap: 8 },
  locationCoords: { flexDirection: "row", alignItems: "center", gap: 6 },
  waterBodyStatus: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", marginTop: -8, marginBottom: 14, paddingHorizontal: 4, paddingVertical: 6 },
  waterBodyStatusContent: { flex: 1, minWidth: 0 },
  waterBodyStatusLabel: { color: "#94a3b8", fontSize: 10, lineHeight: 13, fontWeight: "700", letterSpacing: 0.8 },
  waterBodyStatusText: { color: "#cbd5e1", fontSize: 14, lineHeight: 19, fontWeight: "600" },
  waterBodyStatusTextMatched: { color: "#ffffff" },
  waterBodyStatusHint: { color: "#94a3b8", fontSize: 12, lineHeight: 17, marginTop: 1 },
  nameWaterBodyBtn: { backgroundColor: theme.colors.offwhite, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7 },
  nameWaterBodyBtnText: { color: theme.colors.background, fontSize: 12, fontWeight: "700" },
  nameWaterBodyOverlay: { flex: 1, backgroundColor: "rgba(2, 10, 18, 0.78)", alignItems: "center", justifyContent: "center", padding: 24 },
  nameWaterBodyCard: { width: "100%", maxWidth: 420, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 20, alignItems: "center" },
  nameWaterBodyTitle: { color: "#ffffff", fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 10 },
  nameWaterBodyHint: { color: "#94a3b8", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  nameWaterBodyInput: { alignSelf: "stretch", backgroundColor: "#0f2236", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, color: "#ffffff", fontSize: 16, marginTop: 18, paddingHorizontal: 12, paddingVertical: 11 },
  nameWaterBodyActions: { alignSelf: "stretch", flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  nameWaterBodyCancel: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  nameWaterBodyCancelText: { color: "#94a3b8", fontSize: 14, fontWeight: "700" },
  nameWaterBodySave: { minWidth: 92, minHeight: 40, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primaryDark, borderRadius: 9, paddingHorizontal: 14 },
  nameWaterBodySaveDisabled: { opacity: 0.5 },
  nameWaterBodySaveText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  noCoordsRow: { flexDirection: "row", alignItems: "center", width: "100%", marginBottom: 14, paddingHorizontal: 4 },
  noCoordsText: { color: "#ef4444", fontSize: 15, fontWeight: "600", flex: 1 },
  addLocationBtn: { backgroundColor: theme.colors.offwhite, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.control, marginLeft: 8 },
  addLocationBtnText: { color: theme.colors.background, fontSize: 13, fontWeight: "700" },
  changeLocationBtn: { marginLeft: 0, marginTop: 4, minHeight: 40, justifyContent: "center", paddingHorizontal: 18, paddingVertical: 8 },
  changeLocationBtnText: { fontSize: 14 },
  confirmLocationBtn: { backgroundColor: theme.colors.primaryDark, borderRadius: theme.radius.control, paddingVertical: 15, alignItems: "center" },
  locationSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f2236",
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  locationSearchInput: { flex: 1, color: "#e6eef8", fontSize: 15, padding: 0 },
  locationSearchResults: {
    maxHeight: 190,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  locationSearchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  locationSearchResultTitle: { color: "#e6eef8", fontSize: 14, fontWeight: "600" },
  locationSearchResultSub: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  locationMapLoading: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(7, 28, 48, 0.7)" },
  locationMapLoadingText: { color: "#ffffff", fontSize: 13 },
  publicRowDisabled: { opacity: 0.5 },
  selectedPreviewBox: {
    width: 96, height: 90,
    backgroundColor: "#071c30", borderRadius: 12,
    borderWidth: 2, borderColor: "#ffffff",
    alignItems: "center", justifyContent: "center",
    marginRight: 10,
  },
  selectedPreviewImg: { width: 84, height: 64 },
  previewDivider: { width: 1.5, height: 72, backgroundColor: "#2d6a99", marginRight: 10 },
  addScreenHeader: { width: "100%", alignItems: "flex-end", marginBottom: 4 },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
