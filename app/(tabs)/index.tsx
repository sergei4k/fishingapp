// MUST be the first import
import "react-native-gesture-handler";
import { theme } from '../../lib/theme';

import { Text, TextInput } from "@/components/AppText";
import CatchDetailModal from "@/components/CatchDetailModal";
import ImageWithLoader from "@/components/ImageWithLoader";
import SpotDetailModal, { type Spot } from "@/components/SpotDetailModal";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { getGearLabel } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import { pocketbaseThumbUrl } from "@/lib/imageUrls";
import { useLanguage } from "@/lib/language";
import { MAPBOX_ACCESS_TOKEN, useMapboxReady } from "@/lib/mapbox";
import { isNetworkError, pb } from "@/lib/pocketbase";
import { WATER_TYPE_LABELS } from "@/lib/waterBodies";
import { getSpeciesLabel } from "@/lib/species";
import { getCatches } from "@/lib/storage";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapboxGL from "@rnmapbox/maps";
import { Image as ExpoImage } from "expo-image";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, DeviceEventEmitter, Image, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Oswald_500Medium } from "@expo-google-fonts/oswald";

const PIN_URI = Image.resolveAssetSource(require("../../assets/images/pin.png")).uri;
const PREVIEW_THUMB_SIZE = "300x300";
const CATCH_VIEW_FADE = { duration: 240, delay: 0 };
const VIEW_TOGGLE_THUMB_WIDTH = 104;
const WELCOME_CARD_STORAGE_PREFIX = "@welcome_add_catch_pending:";
const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function parseWaterBodyGeometry(value: unknown): GeoJSON.Geometry | null {
  try {
    const geometry = typeof value === "string" ? JSON.parse(value) : value;
    if (geometry && typeof geometry === "object" && (geometry as any).type && (geometry as any).coordinates) {
      return geometry as GeoJSON.Geometry;
    }
  } catch {}
  return null;
}

const MAP_STYLES = [
  { key: "standard", label: "Normal", labelRu: "Обычная", url: "mapbox://styles/mapbox/standard" },
  { key: "satellite", label: "Satellite", labelRu: "Спутник", url: "mapbox://styles/mapbox/satellite-v9" },
  { key: "hybrid", label: "Hybrid", labelRu: "Гибрид", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { key: "outdoors", label: "Outdoors", labelRu: "Природа", url: "mapbox://styles/mapbox/outdoors-v12" },
  { key: "dark", label: "Dark", labelRu: "Темная", url: "mapbox://styles/mapbox/dark-v11" },
] as const;
type MapStyleKey = (typeof MAP_STYLES)[number]["key"];

type CatchMarker = {
  id: string;
  lat: number;
  lon: number;
  image_uri: string | null;
  species: string | null;
  gear: string | null;
  description: string | null;
  length_cm: number | null;
  weight_kg: number | null;
  created_at: number;
  is_public: boolean;
  water_body_id?: string | null;
  water_body_name?: string | null;
};

type WaterBodyPreview = {
  id: string;
  ids: string[];
  name: string;
  typeLabel: string;
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  isResolvingLocation: boolean;
};

const WATERWAY_TYPES = new Set(["river", "stream", "canal"]);

function waterBodyIds(value: unknown, fallback?: string): string[] {
  if (typeof value === "string") {
    try {
      const ids = JSON.parse(value);
      if (Array.isArray(ids)) return ids.filter((id): id is string => typeof id === "string");
    } catch {}
  }
  return fallback ? [fallback] : [];
}

function getWaterBodyLabel(type: string, language: string): string {
  const locale = language === "ru" ? "ru" : "en";
  return WATER_TYPE_LABELS[type as keyof typeof WATER_TYPE_LABELS]?.[locale]
    ?? (locale === "ru" ? "Водоём" : "Water body");
}

function distanceInKilometers(from: [number, number], to: [number, number]): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.asin(Math.sqrt(haversine));
}



export default function Map() {
  const { focusLat, focusLon, catchId, waterBodyId } = useLocalSearchParams<{
    focusLat?: string;
    focusLon?: string;
    catchId?: string;
    waterBodyId?: string;
  }>();

  const { language, t } = useLanguage();
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const mapboxReady = useMapboxReady();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const liquidGlassAvailable = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const safeTop = insets.top;
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const mapReadyRef = useRef(false);
  const pendingLocationRef = useRef<[number, number] | null>(null);

  const [markers, setMarkers] = useState<CatchMarker[]>([]);
  const [catchesLoaded, setCatchesLoaded] = useState(false);
  const [publicMarkers, setPublicMarkers] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [centerCoord] = useState<[number, number]>([37.618423, 55.751244]);
  const zoomLevelRef = useRef(10);
  const [waterBodyZoom, setWaterBodyZoom] = useState(10);

  const [previewCatch, setPreviewCatch] = useState<any>(null);
  const [renderedPreviewCatch, setRenderedPreviewCatch] = useState<any>(null);
  const previewCardOpacity = useRef(new Animated.Value(0)).current;
  const [detailCatch, setDetailCatch] = useState<any>(null);

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>("hybrid");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const styleSheetOffset = useRef(new Animated.Value(320)).current;
  // "public" = all public catches (own public + everyone's); "mine" = all of the user's own catches
  const [mapView, setMapView] = useState<"public" | "mine">("public");
  const [selectedMapView, setSelectedMapView] = useState<"public" | "mine">("public");
  const [markersVisible, setMarkersVisible] = useState(true);
  const mapViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapViewSlider = useRef(new Animated.Value(0)).current;
  const welcomeGuideOffset = useRef(new Animated.Value(0)).current;
  const [showWelcomeCard, setShowWelcomeCard] = useState(false);

  const [spots, setSpots] = useState<Spot[]>([]);
  const [publicSpots, setPublicSpots] = useState<Spot[]>([]);
  const [spotPreview, setSpotPreview] = useState<Spot | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [newSpotCoord, setNewSpotCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [waterBodyPreview, setWaterBodyPreview] = useState<WaterBodyPreview | null>(null);
  const waterBodyPreviewRequestRef = useRef(0);
  const waterBodyRequestRef = useRef(0);
  const waterBodySheetOffset = useRef(new Animated.Value(0)).current;
  const waterBodySheetPanResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => waterBodySheetOffset.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 80) {
        Animated.timing(waterBodySheetOffset, { toValue: 320, duration: 180, useNativeDriver: true }).start(() => {
          waterBodyPreviewRequestRef.current += 1;
          setWaterBodyPreview(null);
        });
        return;
      }
      Animated.spring(waterBodySheetOffset, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  const [waterBodiesGeoJSON, setWaterBodiesGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_FEATURE_COLLECTION);
  const [waterBodyAreasGeoJSON, setWaterBodyAreasGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_FEATURE_COLLECTION);
  const [waterBodyLinesGeoJSON, setWaterBodyLinesGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_FEATURE_COLLECTION);
  const [newSpotName, setNewSpotName] = useState("");
  const [newSpotDesc, setNewSpotDesc] = useState("");
  const [newSpotPublic, setNewSpotPublic] = useState(false);
  const [savingSpot, setSavingSpot] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; coords: [number, number] }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const switchMapView = (nextView: "public" | "mine") => {
    if (nextView === selectedMapView) return;
    if (mapViewTimer.current) clearTimeout(mapViewTimer.current);
    setSelectedMapView(nextView);
    Animated.timing(mapViewSlider, {
      toValue: nextView === "mine" ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    setMarkersVisible(false);
    mapViewTimer.current = setTimeout(() => {
      setMapView(nextView);
      setMarkersVisible(true);
    }, CATCH_VIEW_FADE.duration / 2);
  };

  useEffect(() => {
    if (!showStyleMenu) return;
    styleSheetOffset.setValue(320);
    requestAnimationFrame(() => {
      Animated.timing(styleSheetOffset, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }).start();
    });
  }, [showStyleMenu, styleSheetOffset]);

  useEffect(() => {
    if (previewCatch) {
      setRenderedPreviewCatch(previewCatch);
      previewCardOpacity.stopAnimation();
      previewCardOpacity.setValue(0);
      Animated.timing(previewCardOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!renderedPreviewCatch) return;
    previewCardOpacity.stopAnimation();
    Animated.timing(previewCardOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRenderedPreviewCatch(null);
    });
  }, [previewCatch, renderedPreviewCatch, previewCardOpacity]);

  useEffect(() => () => {
    if (mapViewTimer.current) clearTimeout(mapViewTimer.current);
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!user) {
      setShowWelcomeCard(false);
      return () => { isActive = false; };
    }

    void (async () => {
      const pending = await AsyncStorage.getItem(`${WELCOME_CARD_STORAGE_PREFIX}${user.id}`);
      if (pending !== "true") return;

      const [catches, remoteCatches] = await Promise.all([
        getCatches(),
        pb.collection("catches").getList(1, 1, {
          filter: pb.filter("user_id = {:userId}", { userId: user.id }),
          requestKey: null,
        }),
      ]);
      const hasCatches = catches.length > 0 || remoteCatches.totalItems > 0;
      if (hasCatches) {
        await AsyncStorage.removeItem(`${WELCOME_CARD_STORAGE_PREFIX}${user.id}`);
      }

      if (isActive) setShowWelcomeCard(!hasCatches);
    })().catch(() => {
      if (isActive) setShowWelcomeCard(false);
    });

    return () => { isActive = false; };
  }, [user]);

  const dismissWelcomeCard = useCallback(() => {
    setShowWelcomeCard(false);
    if (user) void AsyncStorage.removeItem(`${WELCOME_CARD_STORAGE_PREFIX}${user.id}`);
  }, [user]);

  useEffect(() => {
    if (!showWelcomeCard) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(welcomeGuideOffset, { toValue: 10, duration: 560, useNativeDriver: true }),
        Animated.timing(welcomeGuideOffset, { toValue: 0, duration: 560, useNativeDriver: true }),
      ])
    );
    animation.start();

    return () => {
      animation.stop();
      welcomeGuideOffset.setValue(0);
    };
  }, [showWelcomeCard, welcomeGuideOffset]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("firstCatchOnboardingAddPressed", dismissWelcomeCard);
    return () => subscription.remove();
  }, [dismissWelcomeCard]);

  // ─── Location ────────────────────────────────────────────────────────────────

  useEffect(() => {
    requestLocation();
  }, []);

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("locationPermission"), t("locationPermissionMessage"));
        return;
      }
      // Try last-known first for instant map center
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last?.coords) {
        const coord: [number, number] = [last.coords.longitude, last.coords.latitude];
        setUserLocation(coord);
        if (mapReadyRef.current) {
          cameraRef.current?.setCamera({ centerCoordinate: coord, zoomLevel: 12, animationDuration: 0 });
        } else {
          pendingLocationRef.current = coord;
        }
        return;
      }
      const fresh = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coord: [number, number] = [fresh.coords.longitude, fresh.coords.latitude];
      setUserLocation(coord);
      if (mapReadyRef.current) {
        cameraRef.current?.setCamera({ centerCoordinate: coord, zoomLevel: 12, animationDuration: 0 });
      } else {
        pendingLocationRef.current = coord;
      }
    } catch (e) {
      console.error("Location error:", e);
    }
  };

  const centerOnUser = () => {
    if (userLocation) {
      mapReadyRef.current && cameraRef.current?.setCamera({
        centerCoordinate: userLocation,
        zoomLevel: 14,
        animationDuration: 800,
        animationMode: "flyTo",
      });
    } else {
      requestLocation();
    }
  };

  // ─── Markers ─────────────────────────────────────────────────────────────────

  const refreshMarkers = useCallback(async () => {
    try {
      const items = await getCatches();
      const parsed: CatchMarker[] = items
        .filter((r) => r.lat != null && r.lon != null)
        .map((r) => ({
          id: r.id,
          lat: Number(r.lat),
          lon: Number(r.lon),
          image_uri: pocketbaseThumbUrl(r.imageUrl ?? r.image ?? null, PREVIEW_THUMB_SIZE),
          species: r.species ?? null,
          gear: r.gear ?? null,
          description: r.description ?? null,
          length_cm: r.length ? Number(r.length) : null,
          weight_kg: r.weight ? Number(r.weight) : null,
          created_at: r.date ? new Date(r.date).getTime() : Date.now(),
          is_public: !!((r as any).isPublic ?? (r as any).is_public),
          water_body_id: r.waterBodyId ?? null,
          water_body_name: r.waterBodyName ?? null,
        }));
      setMarkers(parsed);
    } catch (err) {
      console.error("refreshMarkers error:", err);
      setMarkers([]);
    } finally {
      setCatchesLoaded(true);
    }
  }, []);

  const refreshSpots = useCallback(async () => {
    if (!user) return;
    try {
      const [own, pub] = await Promise.all([
        pb.collection("spots").getFullList({ filter: `user_id = "${user.id}"`, requestKey: null }),
        pb.collection("spots").getFullList({ filter: `is_public = true && user_id != "${user.id}"`, requestKey: null }),
      ]);
      setSpots(own as unknown as Spot[]);
      setPublicSpots(pub as unknown as Spot[]);
    } catch (e) {
      if (!isNetworkError(e)) console.warn("spots error:", e);
    }
  }, [user]);

  const handleSaveSpot = async () => {
    if (!newSpotName.trim() || !newSpotCoord || !user) return;
    setSavingSpot(true);
    try {
      const record = await pb.collection("spots").create({
        name: newSpotName.trim(),
        description: newSpotDesc.trim(),
        lat: newSpotCoord.lat,
        lon: newSpotCoord.lon,
        is_public: newSpotPublic,
        user_id: user.id,
      });
      setSpots((prev) => [...prev, record as unknown as Spot]);
      setNewSpotCoord(null);
      setNewSpotName("");
      setNewSpotDesc("");
      setNewSpotPublic(false);
    } catch (e) {
      console.warn("save spot error:", e);
    } finally {
      setSavingSpot(false);
    }
  };

  const visibleWaterBodyIds = useMemo(() => {
    const ids = new Set<string>();
    const add = (catchItem: any) => {
      if (!catchItem.water_body_id || !Number.isFinite(Number(catchItem.lat)) || !Number.isFinite(Number(catchItem.lon))) return;
      ids.add(String(catchItem.water_body_id));
    };

    if (mapView === "mine") {
      markers.forEach(add);
    } else {
      markers.filter((marker) => marker.is_public).forEach(add);
      publicMarkers.forEach(add);
    }
    return [...ids];
  }, [mapView, markers, publicMarkers]);

  const refreshWaterBodies = useCallback(async () => {
    const requestId = waterBodyRequestRef.current + 1;
    waterBodyRequestRef.current = requestId;
    if (waterBodyZoom < 8 || !visibleWaterBodyIds.length) {
      setWaterBodiesGeoJSON(EMPTY_FEATURE_COLLECTION);
      setWaterBodyAreasGeoJSON(EMPTY_FEATURE_COLLECTION);
      setWaterBodyLinesGeoJSON(EMPTY_FEATURE_COLLECTION);
      return;
    }
    try {
      const filter = visibleWaterBodyIds.map((_, index) => `id = {:id${index}}`).join(" || ");
      const params = Object.fromEntries(visibleWaterBodyIds.map((id, index) => [`id${index}`, id]));
      const records = await pb.collection("water_bodies").getFullList({
        filter: pb.filter(filter, params),
        requestKey: null,
      });
      if (waterBodyRequestRef.current !== requestId) return;
      type WaterwayGroup = {
        id: string;
        ids: string[];
        name: string;
        waterType: string;
        lat: number;
        lon: number;
        lines: GeoJSON.Position[][];
      };
      const waterwayGroups = new globalThis.Map<string, WaterwayGroup>();
      for (const record of records as any[]) {
        const waterType = record.water_type ?? "other";
        const geometry = parseWaterBodyGeometry(record.geometry);
        if (!record.name || !WATERWAY_TYPES.has(waterType) || !geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) continue;
        const key = `${waterType}:${record.name.trim().toLocaleLowerCase()}`;
        const group: WaterwayGroup = waterwayGroups.get(key) ?? {
          id: `waterway:${key}`,
          ids: [],
          name: record.name,
          waterType,
          lat: Number(record.lat),
          lon: Number(record.lon),
          lines: [],
        };
        group.ids.push(record.id);
        group.lines.push(...(geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates));
        waterwayGroups.set(key, group);
      }
      const groupedWaterwayIds = new Set([...waterwayGroups.values()].flatMap((group) => group.ids));
      const groupedWaterwayMarkers = [...waterwayGroups.values()]
        .filter((group) => Number.isFinite(group.lat) && Number.isFinite(group.lon))
        .map((group) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [group.lon, group.lat] },
          properties: {
            id: group.id,
            water_body_ids: JSON.stringify(group.ids),
            name: group.name,
            water_type: group.waterType,
            center_lat: group.lat,
            center_lon: group.lon,
            is_public: true,
            user_id: "",
          },
        }));
      setWaterBodiesGeoJSON({
        type: "FeatureCollection",
        features: [
          ...records.flatMap((record: any) => {
          if (groupedWaterwayIds.has(record.id)) return [];
          const lat = Number(record.lat);
          const lon = Number(record.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
          return [{
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [lon, lat] },
            properties: {
              id: record.id,
              osm_id: record.osm_id,
              name: record.name || null,
              water_type: record.water_type || "other",
              center_lat: lat,
              center_lon: lon,
              is_public: true,
              user_id: "",
            },
          }];
          }),
          ...groupedWaterwayMarkers,
        ],
      });
      setWaterBodyAreasGeoJSON({
        type: "FeatureCollection",
        features: records.flatMap((record: any) => {
          const geometry = parseWaterBodyGeometry(record.geometry);
          if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return [];
          return [{
            type: "Feature" as const,
            geometry,
            properties: {
              id: record.id,
              osm_id: record.osm_id,
              name: record.name || null,
              water_type: record.water_type || "other",
              center_lat: record.lat,
              center_lon: record.lon,
            },
          }];
        }),
      });
      setWaterBodyLinesGeoJSON({
        type: "FeatureCollection",
        features: [
          ...records.flatMap((record: any) => {
          if (groupedWaterwayIds.has(record.id)) return [];
          const geometry = parseWaterBodyGeometry(record.geometry);
          if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) return [];
          return [{
            type: "Feature" as const,
            geometry,
            properties: {
              id: record.id,
              osm_id: record.osm_id,
              name: record.name || null,
              water_type: record.water_type || "other",
              center_lat: record.lat,
              center_lon: record.lon,
            },
          }];
          }),
          ...[...waterwayGroups.values()].map((group) => ({
            type: "Feature" as const,
            geometry: { type: "MultiLineString" as const, coordinates: group.lines },
            properties: {
              id: group.id,
              water_body_ids: JSON.stringify(group.ids),
              name: group.name,
              water_type: group.waterType,
              center_lat: group.lat,
              center_lon: group.lon,
            },
          })),
        ],
      });
    } catch (e) {
      if (!isNetworkError(e)) console.warn("water bodies error:", e);
    }
  }, [visibleWaterBodyIds, waterBodyZoom]);

  const refreshPublicMarkers = useCallback(async () => {
    try {
      const records = await pb.collection('catches').getFullList({
        filter: 'is_public = true',
        expand: 'user_id',
        requestKey: null,
      });
      setPublicMarkers(
        records
          .filter((r: any) => r.user_id !== user?.id && r.lat != null && r.lon != null)
          .map((r: any) => ({
            ...r,
            image_uri: r.image
              ? `${pb.baseURL}/api/files/${r.collectionId}/${r.id}/${r.image}?thumb=${PREVIEW_THUMB_SIZE}`
              : (r.image_uri || null),
            author_username: r.expand?.user_id?.username ?? null,
            author_name: r.expand?.user_id?.name ?? null,
            author_avatar: r.expand?.user_id?.avatar
              ? `${pb.baseURL}/api/files/_pb_users_auth_/${r.user_id}/${r.expand.user_id.avatar}?thumb=200x200`
              : null,
          }))
      );
    } catch (e) {
      if (!isNetworkError(e)) console.warn('Failed to fetch public markers:', e);
    }
  }, [user]);

  useFocusEffect(
      useCallback(() => {
      refreshMarkers();
      refreshPublicMarkers();
      refreshSpots();
      refreshWaterBodies();
    }, [refreshMarkers, refreshPublicMarkers, refreshSpots, refreshWaterBodies])
  );

  useFocusEffect(
    useCallback(() => {
      if (!waterBodyId) return;
      let active = true;
      void pb.collection("water_bodies").getOne(waterBodyId, { requestKey: null })
        .then((record: any) => {
          if (!active) return;
          const lat = Number(record.lat);
          const lon = Number(record.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          const target = [lon, lat] as [number, number];
          waterBodySheetOffset.setValue(0);
          setWaterBodyPreview({
            id: record.id,
            ids: [record.id],
            name: record.name || getWaterBodyLabel(record.water_type ?? "other", language),
            typeLabel: getWaterBodyLabel(record.water_type ?? "other", language),
            lat,
            lon,
            city: null,
            country: null,
            isResolvingLocation: false,
          });
          if (mapReadyRef.current) {
            cameraRef.current?.setCamera({ centerCoordinate: target, zoomLevel: 14, animationDuration: 800, animationMode: "flyTo" });
          } else {
            pendingLocationRef.current = target;
          }
        })
        .catch(() => {});
      return () => { active = false; };
    }, [language, waterBodyId, waterBodySheetOffset]),
  );

  useEffect(() => {
    refreshMarkers();
    refreshPublicMarkers();
    refreshSpots();
    refreshWaterBodies();
  }, [refreshMarkers, refreshPublicMarkers, refreshSpots, refreshWaterBodies]);

  const syncCommentCountInMap = useCallback((targetCatchId: string, count: number) => {
    const patchCatch = (current: any) => {
      if (!current || String(current.id) !== targetCatchId) return current;
      if (current._commentCount === count) return current;
      return { ...current, _commentCount: count };
    };

    setPreviewCatch(patchCatch);
    setDetailCatch(patchCatch);
    setPublicMarkers((prev) => {
      let changed = false;
      const next = prev.map((item: any) => {
        if (String(item.id) !== targetCatchId || item._commentCount === count) return item;
        changed = true;
        return { ...item, _commentCount: count };
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    const subCount = DeviceEventEmitter.addListener("commentCountSynced", ({ catchId: targetCatchId, count }: { catchId: string; count: number }) => {
      syncCommentCountInMap(targetCatchId, count);
    });
    return () => { subCount.remove(); };
  }, [syncCommentCountInMap]);

  // ─── Focus on navigated-to catch ─────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      if (!focusLat || !focusLon) return;
      const lat = parseFloat(focusLat);
      const lon = parseFloat(focusLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const target = [lon, lat] as [number, number];
      const ownCatch = catchId ? markers.find((marker) => String(marker.id) === String(catchId)) : null;
      if (ownCatch && !ownCatch.is_public) {
        setMapView("mine");
        setSelectedMapView("mine");
      }
      pendingLocationRef.current = target;

      // Keep the target until the map is ready after a tab transition.
      const timer = setTimeout(() => {
        if (!mapReadyRef.current) return;
        cameraRef.current?.setCamera({
          centerCoordinate: target,
          zoomLevel: 14,
          animationDuration: 800,
          animationMode: "flyTo",
        });
        pendingLocationRef.current = null;
        router.setParams({ focusLat: undefined, focusLon: undefined, catchId: undefined });
      }, 150);
      return () => clearTimeout(timer);
    }, [catchId, focusLat, focusLon, markers, router])
  );


  // ─── GeoJSON ──────────────────────────────────────────────────────────────────

  const catchesGeoJSON: GeoJSON.FeatureCollection = useMemo(
    () => {
      const ownValid = markers.filter(
        (m) => Number.isFinite(m.lat) && Number.isFinite(m.lon) && m.lat !== 0 && m.lon !== 0
      );
      const ownFeature = (m: CatchMarker) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [m.lon, m.lat] },
        properties: {
          id: m.id, species: m.species, gear: m.gear,
          image_uri: m.image_uri, description: m.description,
          length_cm: m.length_cm, weight_kg: m.weight_kg, created_at: m.created_at,
          water_body_id: m.water_body_id ?? null, water_body_name: m.water_body_name ?? null,
          is_own: true,
        },
      });

      // "Mine" view: all of the user's own catches (public and private).
      if (mapView === "mine") {
        return {
          type: "FeatureCollection" as const,
          features: ownValid.filter((m) => !m.water_body_id).map(ownFeature),
        };
      }

      // Public view: own public catches + everyone else's public catches.
      return {
        type: "FeatureCollection" as const,
        features: [
          ...ownValid.filter((m) => m.is_public && !m.water_body_id).map(ownFeature),
          ...publicMarkers
            .filter((m) => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)) && m.lat !== 0 && m.lon !== 0 && !m.water_body_id)
            .map((m) => ({
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: [Number(m.lon), Number(m.lat)] },
              properties: {
                id: m.id, species: m.species, gear: m.gear ?? null,
                image_uri: m.image_uri, description: m.description,
                length_cm: m.length_cm, weight_kg: m.weight_kg, created_at: m.created_at,
                water_body_id: m.water_body_id ?? null, water_body_name: m.water_body_name ?? null,
                is_own: false,
                author_username: m.author_username ?? null,
                author_name: m.author_name ?? null,
                author_avatar: m.author_avatar ?? null,
              },
            })),
        ],
      };
    },
    [markers, publicMarkers, mapView]
  );

  const waterBodyCatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const add = (waterBodyId?: string | null) => {
      if (waterBodyId) counts[waterBodyId] = (counts[waterBodyId] ?? 0) + 1;
    };
    const ownValid = markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon) && m.lat !== 0 && m.lon !== 0);

    if (mapView === "mine") {
      ownValid.forEach((m) => add(m.water_body_id));
    } else {
      ownValid.filter((m) => m.is_public).forEach((m) => add(m.water_body_id));
      publicMarkers
        .filter((m) => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)) && m.lat !== 0 && m.lon !== 0)
        .forEach((m) => add(m.water_body_id));
    }
    return counts;
  }, [mapView, markers, publicMarkers]);

  const waterBodySheetCatches = useMemo(() => {
    if (!waterBodyPreview) return [];
    const matchesWaterBody = (catchItem: any) => waterBodyPreview.ids.includes(catchItem.water_body_id);
    const toDetailCatch = (catchItem: any, isOwn: boolean) => ({
      id: catchItem.id,
      imageUrl: catchItem.image_uri,
      species: catchItem.species,
      gear: catchItem.gear ?? null,
      description: catchItem.description,
      length: catchItem.length_cm != null ? String(catchItem.length_cm) : "",
      weight: catchItem.weight_kg != null ? String(catchItem.weight_kg) : "",
      date: String(catchItem.created_at),
      lat: Number(catchItem.lat),
      lon: Number(catchItem.lon),
      isPublic: isOwn ? catchItem.is_public : true,
      waterBodyId: catchItem.water_body_id,
      waterBodyName: catchItem.water_body_name,
    });
    const ownCatches = markers
      .filter((catchItem) => matchesWaterBody(catchItem) && (mapView === "mine" || catchItem.is_public))
      .map((catchItem) => toDetailCatch(catchItem, true));
    const otherCatches = mapView === "public"
      ? publicMarkers.filter(matchesWaterBody).map((catchItem) => toDetailCatch(catchItem, false))
      : [];
    return [...ownCatches, ...otherCatches].sort((a, b) => Number(b.date) - Number(a.date));
  }, [mapView, markers, publicMarkers, waterBodyPreview]);

  const waterBodyDistanceText = useMemo(() => {
    if (!userLocation || !waterBodyPreview) {
      return null;
    }
    const kilometers = distanceInKilometers(userLocation, [waterBodyPreview.lon, waterBodyPreview.lat]);
    if (!Number.isFinite(kilometers)) return null;
    if (kilometers < 1) {
      const meters = Math.round(kilometers * 1_000);
      return language === "ru" ? `${meters} м` : `${meters} m away`;
    }
    const distance = kilometers.toFixed(kilometers < 10 ? 1 : 0);
    return language === "ru" ? `${distance} км` : `${distance} km away`;
  }, [language, userLocation, waterBodyPreview]);

  useEffect(() => {
    const previewUrls = [...markers, ...publicMarkers]
      .map((m: any) => pocketbaseThumbUrl(m.image_uri, PREVIEW_THUMB_SIZE))
      .filter(Boolean)
      .slice(0, 40) as string[];
    if (previewUrls.length) {
      void (ExpoImage as any).prefetch?.(previewUrls, "disk");
    }
  }, [markers, publicMarkers]);

  const spotsGeoJSON: GeoJSON.FeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: [
        ...spots.map((s) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [Number(s.lon), Number(s.lat)] },
          properties: { id: s.id, name: s.name, description: s.description, is_public: s.is_public, user_id: s.user_id, source: "own" },
        })),
        ...publicSpots.map((s) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [Number(s.lon), Number(s.lat)] },
          properties: { id: s.id, name: s.name, description: s.description, is_public: true, user_id: s.user_id, source: "public" },
        })),
      ],
    }),
    [spots, publicSpots]
  );

  const waterBodyMarkersGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: waterBodiesGeoJSON.features.flatMap((feature: any) => {
      const type = feature.properties?.water_type ?? "other";
      return [{
        type: "Feature" as const,
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          water_label: getWaterBodyLabel(type, language),
          catch_count: waterBodyIds(feature.properties?.water_body_ids, feature.properties?.id)
            .reduce((count, id) => count + (waterBodyCatchCounts[id] ?? 0), 0),
        },
      }];
    }),
  }), [waterBodiesGeoJSON, language, waterBodyCatchCounts]);

  const handleSpotPress = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const p = feature.properties;
    const lon = Number(p.center_lon);
    const lat = Number(p.center_lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    setSpotPreview({ id: p.id, name: p.name, description: p.description, is_public: !!p.is_public, user_id: p.user_id, lat, lon });
    setPreviewCatch(null);
  }, []);

  const handleMarkerPress = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const p = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
    if (p.cluster) {
      mapReadyRef.current && cameraRef.current?.setCamera({
        centerCoordinate: feature.geometry.coordinates,
        zoomLevel: zoomLevelRef.current + 2,
        animationDuration: 400,
        animationMode: "flyTo",
      });
      return;
    }
    setSpotPreview(null);
    setSelectedSpot(null);
    setWaterBodyPreview(null);
    waterBodySheetOffset.setValue(0);
    setPreviewCatch({
      id: p.id,
      imageUrl: p.image_uri,
      species: p.species,
      gear: p.gear,
      description: p.description,
      length: p.length_cm,
      weight: p.weight_kg,
      createdAt: p.created_at,
      lat,
      lon,
      isOwn: p.is_own === true || p.is_own === "true",
      authorUsername: p.author_username ?? null,
      authorName: p.author_name ?? null,
      authorAvatar: p.author_avatar ?? null,
      waterBodyId: p.water_body_id ?? null,
      waterBodyName: p.water_body_name ?? null,
    });
  }, [waterBodySheetOffset]);

  const handleWaterBodyPress = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const p = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
    const typeLabel = getWaterBodyLabel(p.water_type ?? "other", language);
    const name = p.name || typeLabel;
    const id = String(p.id ?? p.osm_id ?? `${lon},${lat}`);
    const ids = waterBodyIds(p.water_body_ids, id);
    const requestId = waterBodyPreviewRequestRef.current + 1;
    waterBodyPreviewRequestRef.current = requestId;
    waterBodySheetOffset.setValue(320);
    setWaterBodyPreview({
      id,
      ids,
      name,
      typeLabel,
      lat,
      lon,
      city: null,
      country: null,
      isResolvingLocation: true,
    });
    Animated.timing(waterBodySheetOffset, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
    void fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json` +
      `?access_token=${MAPBOX_ACCESS_TOKEN}&language=${language}&types=place,locality,district,country`,
    )
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data || waterBodyPreviewRequestRef.current !== requestId) return;
        const features = data.features ?? [];
        const city = features.find((feature: any) =>
          feature.place_type?.some((type: string) => ["place", "locality", "district"].includes(type)),
        )?.text ?? null;
        const country = features.find((feature: any) => feature.place_type?.includes("country"))?.text ?? null;
        setWaterBodyPreview((current) => current?.id === id
          ? { ...current, city, country, isResolvingLocation: false }
          : current);
      })
      .catch(() => {
        if (waterBodyPreviewRequestRef.current !== requestId) return;
        setWaterBodyPreview((current) => current?.id === id
          ? { ...current, isResolvingLocation: false }
          : current);
      });
    setSpotPreview(null);
    setPreviewCatch(null);
  }, [language, waterBodySheetOffset]);

  // ─── Search ──────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${MAPBOX_ACCESS_TOKEN}&language=${language}&limit=5`
      );
      const data = await res.json();
      setSearchResults(
        (data.features ?? []).map((f: any) => ({
          id: f.id,
          name: f.place_name,
          coords: f.center as [number, number],
        }))
      );
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [language]);

  const handleSelectResult = useCallback((coords: [number, number]) => {
    if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
    setSearchResults([]);
    setSearchQuery("");
    mapReadyRef.current && cameraRef.current?.setCamera({
      centerCoordinate: coords,
      zoomLevel: 12,
      animationDuration: 800,
      animationMode: "flyTo",
    });
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (!mapboxReady) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="small" color="#94a3b8" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapboxGL.MapView
        style={{ flex: 1 }}
        styleURL={MAP_STYLES.find((style) => style.key === mapStyleKey)?.url}
        localizeLabels={{ locale: language }}
        logoEnabled={true}
        logoPosition={{ bottom: 8, left: 8 }}
        attributionEnabled={false}
        scaleBarEnabled={false}
         onDidFinishLoadingMap={() => {
           mapReadyRef.current = true;
           if (pendingLocationRef.current) {
             cameraRef.current?.setCamera({ centerCoordinate: pendingLocationRef.current, zoomLevel: 12, animationDuration: 0 });
             pendingLocationRef.current = null;
           }
        }}
        onCameraChanged={(state) => { zoomLevelRef.current = state.properties.zoom; }}
        onMapIdle={(state) => setWaterBodyZoom(state.properties.zoom)}
        onPress={() => Keyboard.dismiss()}
        onLongPress={(e: any) => {
          if (!requireAuth()) return;
          const [lon, lat] = e.geometry.coordinates;
          setNewSpotCoord({ lat, lon });
          setPreviewCatch(null);
          setSpotPreview(null);
        }}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: centerCoord, zoomLevel: 10 }}
        />

        <MapboxGL.UserLocation visible androidRenderMode="compass" />

        <MapboxGL.Images
          images={{ "catch-pin": { uri: PIN_URI, sdf: true } as any }}
        />

        {/* Heatmap source — always mounted, visibility toggled */}
        <MapboxGL.ShapeSource id="heatmap-source" shape={catchesGeoJSON}>
          <MapboxGL.HeatmapLayer
            id="heatmapLayer"
            style={{
              visibility: showHeatmap ? "visible" : "none",
              heatmapRadius: 60,
              heatmapIntensity: 1.5,
              heatmapOpacity: 0.85,
              heatmapColor: [
                "interpolate", ["linear"], ["heatmap-density"],
                0,   "rgba(0,0,255,0)",
                0.2, "#0ea5e9",
                0.5, "#22c55e",
                0.8, "#f97316",
                1,   "#ef4444",
              ],
            }}
          />
        </MapboxGL.ShapeSource>

        {/* Cluster/marker source — always mounted, visibility toggled */}
        <MapboxGL.ShapeSource
          id="spots"
          shape={spotsGeoJSON}
          onPress={handleSpotPress}
        >
          <MapboxGL.CircleLayer
            id="spot-points"
            style={{
              circleRadius: 8,
              circleColor: ["match", ["get", "source"], "own", "#f59e0b", "#8b5cf6"],
              circleStrokeWidth: 2.5,
              circleStrokeColor: "#ffffff",
              circleOpacity: 0.95,
            }}
          />
        </MapboxGL.ShapeSource>

        {/* One clickable marker per water body */}
        <MapboxGL.ShapeSource
          id="water-body-areas"
          shape={waterBodyAreasGeoJSON}
          onPress={handleWaterBodyPress}
        >
          <MapboxGL.FillLayer
            id="water-body-fills"
            style={{ fillColor: "#0369a1", fillOpacity: 0.32 }}
          />
          <MapboxGL.LineLayer
            id="water-body-outlines"
            style={{ lineColor: "#bae6fd", lineWidth: 2, lineOpacity: 1 }}
          />
        </MapboxGL.ShapeSource>

        <MapboxGL.ShapeSource
          id="water-body-lines"
          shape={waterBodyLinesGeoJSON}
          onPress={handleWaterBodyPress}
        >
          <MapboxGL.LineLayer
            id="water-body-rivers"
            style={{ lineColor: "#38bdf8", lineWidth: 3, lineOpacity: 0.9 }}
          />
        </MapboxGL.ShapeSource>

        {/* One clickable marker per water body */}
        <MapboxGL.ShapeSource
          id="water-body-markers"
          shape={waterBodyMarkersGeoJSON}
          onPress={handleWaterBodyPress}
        >
          <MapboxGL.CircleLayer
            id="water-body-marker-circles"
            style={{
              circleRadius: ["interpolate", ["linear"], ["get", "catch_count"], 0, 3, 1, 12, 10, 16],
              circleColor: "#0369a1",
              circleOpacity: 0.95,
              circleStrokeColor: "#ffffff",
              circleStrokeWidth: ["interpolate", ["linear"], ["zoom"], 3, 0, 10, 0, 11, 2.5],
            }}
          />
          <MapboxGL.SymbolLayer
            id="water-body-catch-counts"
            style={{
              textField: ["case", [">", ["get", "catch_count"], 0], ["to-string", ["get", "catch_count"]], ""],
              textColor: "#ffffff",
              textSize: 12,
              textAllowOverlap: true,
            }}
          />
          <MapboxGL.SymbolLayer
            id="water-body-marker-labels"
            minZoomLevel={11}
            style={{
              textField: ["coalesce", ["get", "name"], ["get", "water_label"]],
              textColor: "#ffffff",
              textSize: ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 13],
              textHaloColor: "#075985",
              textHaloWidth: 2,
              textOffset: [0, 1.5],
              textAllowOverlap: false,
            }}
          />
        </MapboxGL.ShapeSource>

        <MapboxGL.ShapeSource
          id="catches"
          shape={catchesGeoJSON}
          cluster
          clusterRadius={30}
          clusterMaxZoomLevel={5}
          onPress={handleMarkerPress}
        >
          <MapboxGL.CircleLayer
            id="clusters"
            filter={["has", "point_count"]}
            style={{
              visibility: showHeatmap ? "none" : "visible",
              circleRadius: ["step", ["get", "point_count"], 20, 10, 28, 30, 36],
              circleColor: "#0284c7",
              circleOpacity: markersVisible ? 0.9 : 0,
              circleOpacityTransition: CATCH_VIEW_FADE,
              circleStrokeWidth: 2,
              circleStrokeColor: "#ffffff",
            }}
          />
          <MapboxGL.SymbolLayer
            id="cluster-count"
            filter={["has", "point_count"]}
            style={{
              visibility: showHeatmap ? "none" : "visible",
              textField: ["get", "point_count_abbreviated"],
              textColor: "#ffffff",
              textOpacity: markersVisible ? 1 : 0,
              textOpacityTransition: CATCH_VIEW_FADE,
              textSize: 14,
              textFont: ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            }}
          />
          <MapboxGL.SymbolLayer
            id="catch-points"
            filter={["!", ["has", "point_count"]]}
            style={{
              visibility: showHeatmap ? "none" : "visible",
              iconImage: "catch-pin",
              iconSize: 0.7,
              iconOpacity: markersVisible ? 1 : 0,
              iconOpacityTransition: CATCH_VIEW_FADE,
              iconColor: ["case", ["==", ["get", "is_own"], true], "#f59e0b", "#38bdf8"],
              iconAllowOverlap: true,
              iconAnchor: "bottom",
            }}
          />
        </MapboxGL.ShapeSource>
      </MapboxGL.MapView>

      {/* Search bar */}
      <View style={[styles.searchContainer, { top: safeTop + 8 }]}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={15} color="#64748b" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearch}
            onFocus={() => {
              if (searchBlurTimer.current) clearTimeout(searchBlurTimer.current);
            }}
            onBlur={() => {
              searchBlurTimer.current = setTimeout(() => setSearchResults([]), 300);
            }}
            placeholder={language === "ru" ? "Поиск места..." : "Search location..."}
            placeholderTextColor="#475569"
            returnKeyType="search"
          />
          {searchLoading && <ActivityIndicator size="small" color="#ffffff" style={{ marginLeft: 6 }} />}
          {searchQuery.length > 0 && !searchLoading && (
            <TouchableOpacity onPress={() => { setSearchQuery(""); setSearchResults([]); }} hitSlop={8}>
              <Ionicons name="close" size={14} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>
        {searchResults.length > 0 && (
          <View style={styles.searchDropdown}>
            {searchResults.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.searchResultItem}
                onPress={() => handleSelectResult(r.coords)}
              >
                <Ionicons name="location-sharp" size={13} color="#ffffff" style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={styles.searchResultText} numberOfLines={2}>{r.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Public / private view toggle */}
        <View style={[styles.viewToggleWrap, { top: safeTop + 64 }]} pointerEvents="box-none">
          <View style={styles.viewToggle}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.viewToggleThumb,
                {
                  transform: [{ translateX: mapViewSlider.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, VIEW_TOGGLE_THUMB_WIDTH],
                  }) }],
                },
              ]}
            />
            <TouchableOpacity
              style={styles.viewToggleBtn}
              onPress={() => switchMapView("public")}
            >
              <Text style={[styles.viewToggleText, selectedMapView === "public" && styles.viewToggleTextActive]}>
                {language === "ru" ? "Все" : "Public"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.viewToggleBtn}
              onPress={() => { if (requireAuth()) switchMapView("mine"); }}
            >
              <Text style={[styles.viewToggleText, selectedMapView === "mine" && styles.viewToggleTextActive]}>
                {language === "ru" ? "Мои уловы" : "My catches"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom-left controls: heatmap + location */}
      <View style={[styles.controls, showWelcomeCard && styles.controlsWithWelcome, newSpotCoord ? { bottom: 380 } : null]}>
        <Pressable
          style={[styles.controlBtn, showHeatmap && { borderWidth: 4, borderColor: "#0ea5e9" }]}
          onPress={() => setShowHeatmap(v => !v)}
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Ionicons name="flame-outline" size={18} color="#333" />
        </Pressable>
        <Pressable
          style={[styles.controlBtn, { marginBottom: 0 }]}
          onPress={centerOnUser}
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Ionicons name="navigate-outline" size={18} color="#333" />
        </Pressable>
      </View>

      {/* Bottom-right map style control */}
      <View style={styles.styleControlWrap}>
        <Pressable
          style={[styles.controlBtn, showStyleMenu && styles.controlBtnActive]}
          onPress={() => setShowStyleMenu(true)}
          accessibilityRole="button"
          accessibilityLabel={language === "ru" ? "Стиль карты" : "Map style"}
          accessibilityState={{ expanded: showStyleMenu }}
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Ionicons name="layers-outline" size={18} color="#333" />
        </Pressable>
      </View>

      <Modal
        visible={showStyleMenu}
        transparent
        animationType="none"
        onRequestClose={() => setShowStyleMenu(false)}
      >
        <View style={styles.styleSheetRoot}>
          <Pressable style={styles.styleSheetBackdrop} onPress={() => setShowStyleMenu(false)} />
          <Animated.View
            style={[styles.styleSheetAnimation, { transform: [{ translateY: styleSheetOffset }] }]}
          >
            <GlassView
              style={[styles.styleSheet, !liquidGlassAvailable && styles.styleSheetFallback, { paddingBottom: Math.max(insets.bottom, 16) }]}
              glassEffectStyle="regular"
              tintColor={theme.colors.background}
              isInteractive
            >
              <View style={styles.styleSheetHandle} />
              <View style={styles.styleSheetHeader}>
                <Text style={styles.styleSheetTitle}>{language === "ru" ? "Стиль карты" : "Map style"}</Text>
                <Pressable
                  style={styles.styleSheetClose}
                  onPress={() => setShowStyleMenu(false)}
                  accessibilityRole="button"
                  accessibilityLabel={language === "ru" ? "Закрыть" : "Close"}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color="#94a3b8" />
                </Pressable>
              </View>
              {MAP_STYLES.map((style) => (
                <Pressable
                  key={style.key}
                  style={[styles.mapStyleOption, style.key === mapStyleKey && styles.mapStyleOptionActive]}
                  onPress={() => {
                    setMapStyleKey(style.key);
                    setShowStyleMenu(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: style.key === mapStyleKey }}
                >
                  <Text style={[styles.mapStyleOptionText, style.key === mapStyleKey && styles.mapStyleOptionTextActive]}>
                    {language === "ru" ? style.labelRu : style.label}
                  </Text>
                  {style.key === mapStyleKey && <Ionicons name="checkmark" size={18} color="#ffffff" />}
                </Pressable>
              ))}
            </GlassView>
          </Animated.View>
        </View>
      </Modal>


      {/* Empty state — shown only after catches are confirmed to be empty */}
      {catchesLoaded && catchesGeoJSON.features.length === 0 && !showWelcomeCard && !previewCatch && !newSpotCoord && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>{t("noCatchesYet")}</Text>
          <Text style={styles.emptyCardSub}>{t("noCatchesMapSub")}</Text>
          <TouchableOpacity style={styles.emptyCardBtn} onPress={() => router.push("/(tabs)/add")}>
            <Text style={styles.emptyCardBtnText}>{t("addFirstCatch")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {showWelcomeCard && (
        <>
          <View style={styles.welcomeBackdrop} pointerEvents="auto" />
          <View style={[styles.welcomeCard, { top: 0, bottom: 0 }]} accessibilityLiveRegion="polite">
            <ExpoImage source={require("../../assets/images/default-water-banner.png")} style={styles.welcomeBackgroundImage} contentFit="cover" />
            <View style={styles.welcomeBackgroundScrim} />
            <TouchableOpacity
              style={[styles.welcomeCardClose, { top: safeTop + 12 }]}
              onPress={dismissWelcomeCard}
              accessibilityRole="button"
              accessibilityLabel={language === "ru" ? "Закрыть приветствие" : "Dismiss welcome message"}
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.welcomeCardContent}>
              <Text style={styles.welcomeCardTitle}>{language === "ru" ? "Добро пожаловать" : "Welcome"}</Text>
              <Text style={styles.welcomeCardMessage}>
                {language === "ru"
                  ? "Добавь свой первый улов"
                  : "Add your first catch"}
              </Text>
            </View>
            <Animated.View
              pointerEvents="none"
              style={[styles.welcomeAddCatchGuide, { transform: [{ translateY: welcomeGuideOffset }] }]}
            >
              <Text style={styles.welcomeAddCatchGuideText}>
                {language === "ru" ? "Нажми «Добавить»" : "Click Add Catch"}
              </Text>
              <Ionicons name="arrow-down" size={56} color="#ffffff" />
            </Animated.View>
          </View>
        </>
      )}

      {/* Preview card */}
      {renderedPreviewCatch && (
        <TouchableOpacity
          style={styles.previewCard}
          activeOpacity={0.97}
          onPress={() => { setDetailCatch(renderedPreviewCatch); setPreviewCatch(null); }}
        >
          <Animated.View style={[styles.previewCardContent, { opacity: previewCardOpacity }] }>
            <ImageWithLoader
              source={renderedPreviewCatch.imageUrl ? { uri: renderedPreviewCatch.imageUrl } : require("../../assets/placeholder.png")}
              placeholder={require("../../assets/placeholder.png")}
              cachePolicy="memory-disk"
              transition={120}
              contentFit="cover"
              style={styles.previewCardImage}
            />
            <View style={styles.previewCardBody}>
              <Text style={styles.previewCardSpecies} numberOfLines={1}>
                {getSpeciesLabel(renderedPreviewCatch.species, language)}
              </Text>
              {renderedPreviewCatch.gear ? (
                <View style={styles.previewCardGearRow}>
                  {gearPhotos[renderedPreviewCatch.gear] && <ExpoImage source={gearPhotos[renderedPreviewCatch.gear]} style={styles.previewCardGearThumb} contentFit="contain" />}
                  <Text style={styles.previewCardGear} numberOfLines={1}>{getGearLabel(renderedPreviewCatch.gear, language)}</Text>
                </View>
              ) : null}
              <Text style={styles.previewCardDate}>
              {(() => {
                if (!renderedPreviewCatch.createdAt) return t("recently");
                const timestamp = Number(renderedPreviewCatch.createdAt);
                const d = Number.isFinite(timestamp) && timestamp > 0
                  ? new Date(timestamp)
                  : new Date(renderedPreviewCatch.createdAt);
                return isNaN(d.getTime()) ? t("recently") : d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
              })()}
              </Text>
              {renderedPreviewCatch.description ? (
                <Text style={styles.previewCardDesc} numberOfLines={2}>{renderedPreviewCatch.description}</Text>
              ) : null}
              <View style={styles.previewCardBtn}>
                <Text style={styles.previewCardBtnText}>{language === "ru" ? "Открыть" : "View catch"}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.previewCardClose} onPress={() => setPreviewCatch(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      )}

      {waterBodyPreview && !newSpotCoord && (
        <Animated.View style={[styles.waterBodySheet, { paddingBottom: Math.max(insets.bottom, 20), transform: [{ translateY: waterBodySheetOffset }] }]}>
          <View style={styles.waterBodySheetHandle} {...waterBodySheetPanResponder.panHandlers} />
          <View style={styles.waterBodySheetHeader}>
            <Text style={styles.waterBodySheetName} numberOfLines={2}>{waterBodyPreview.name}</Text>
            <Pressable style={[styles.waterbodySave]}>
              <Ionicons name="bookmark-outline" size={20} color="#94a3b8">

              </Ionicons>
            </Pressable>
            <Pressable
              style={styles.waterBodySheetClose}
              onPress={() => {
                waterBodyPreviewRequestRef.current += 1;
                Animated.timing(waterBodySheetOffset, {
                  toValue: 320,
                  duration: 180,
                  useNativeDriver: true,
                }).start(() => {
                  setWaterBodyPreview(null);
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={language === "ru" ? "Закрыть" : "Close"}
            >

              <Ionicons name="close" size={20} color="#94a3b8" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.waterBodySheetContent}>
            <View style={styles.waterBodySheetLocation}>
              <Text style={[styles.waterBodySheetLocationText, styles.waterBodySheetLocationName]} numberOfLines={1}>
                {waterBodyPreview.isResolvingLocation
                  ? (language === "ru" ? "Определяем местоположение..." : "Finding location...")
                  : [waterBodyPreview.city, waterBodyPreview.country].filter(Boolean).join(", ")
                    || (language === "ru" ? "Московская область, Россия" : "Moscow Oblast, Russia")}
              </Text>
              {waterBodyDistanceText ? <Text style={styles.waterBodySheetLocationSeparator}>•</Text> : null}
              {waterBodyDistanceText ? (
                <Text style={styles.waterBodySheetLocationText} numberOfLines={1}>
                  {waterBodyDistanceText}
                </Text>
              ) : null}
            </View>
            {waterBodySheetCatches.length > 0 ? (
              <View style={styles.waterBodyCatches}>
                <Text style={styles.waterBodyCatchesTitle}>
                  {language === "ru" ? `Уловы: ${waterBodySheetCatches.length}` : `Catches: ${waterBodySheetCatches.length}`}
                </Text>
                <View style={styles.waterBodyCatchGrid}>
                {waterBodySheetCatches.map((catchItem) => (
                  <TouchableOpacity
                    key={catchItem.id}
                    style={styles.waterBodyCatchThumb}
                    onPress={() => {
                      setDetailCatch(catchItem);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={language === "ru" ? "Открыть улов" : "Open catch"}
                  >
                    <ExpoImage
                      source={catchItem.imageUrl ? { uri: catchItem.imageUrl } : require("../../assets/placeholder.png")}
                      style={styles.waterBodyCatchImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
                </View>
              </View>
            ) : (
              <Text style={styles.waterBodyEmptyText}>
                {language === "ru" ? "В этом водоёме пока нет уловов" : "No catches in this waterbody yet"}
              </Text>
            )}
          </ScrollView>
        </Animated.View>
      )}

      {/* Spot preview card */}
      {spotPreview && !newSpotCoord && (
        <View style={styles.spotPreviewCard}>
          <View style={styles.spotPreviewIcon}>
            <Ionicons name="location-sharp" size={22} color="#f59e0b" />
          </View>
          <View style={styles.spotPreviewBody}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.spotPreviewName} numberOfLines={1}>{spotPreview.name}</Text>
              {!spotPreview.is_public && <Ionicons name="lock-closed-outline" size={11} color="#64748b" />}
            </View>
            {spotPreview.description ? (
              <Text style={styles.spotPreviewDesc} numberOfLines={2}>{spotPreview.description}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.spotPreviewBtn}
              onPress={() => { setSelectedSpot(spotPreview); setSpotPreview(null); }}
            >
              <Text style={styles.spotPreviewBtnText}>{language === "ru" ? "Открыть точку" : "Open spot"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.previewCardClose} onPress={() => setSpotPreview(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      )}

      {/* Create spot form */}
      {newSpotCoord && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.createSpotSheet}
        >
          <View style={styles.createSpotContent}>
            <View style={styles.createSpotHeader}>
              <Ionicons name="location-sharp" size={18} color="#f59e0b" />
              <Text style={styles.createSpotTitle}>{language === "ru" ? "Новое место" : "New spot"}</Text>
              <TouchableOpacity onPress={() => setNewSpotCoord(null)} style={{ marginLeft: "auto" as any }}>
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.createSpotInput}
              value={newSpotName}
              onChangeText={setNewSpotName}
              placeholder={language === "ru" ? "Название места" : "Spot name"}
              placeholderTextColor="#475569"
              maxLength={60}
              autoFocus
            />
            <TextInput
              style={[styles.createSpotInput, { minHeight: 56, textAlignVertical: "top" }]}
              value={newSpotDesc}
              onChangeText={setNewSpotDesc}
              placeholder={language === "ru" ? "Описание (необязательно)" : "Description (optional)"}
              placeholderTextColor="#475569"
              multiline
              maxLength={300}
            />
            <View style={styles.createSpotToggleRow}>
              <Text style={styles.createSpotToggleLabel}>{language === "ru" ? "Публичное" : "Public"}</Text>
              <Switch
                value={newSpotPublic}
                onValueChange={setNewSpotPublic}
                trackColor={{ false: theme.colors.surfaceRaised, true: theme.colors.primaryMuted }}
                thumbColor={newSpotPublic ? "#0284c7" : "#475569"}
              />
            </View>
            <TouchableOpacity
              style={[styles.createSpotBtn, !newSpotName.trim() && { opacity: 0.4 }]}
              onPress={handleSaveSpot}
              disabled={savingSpot || !newSpotName.trim()}
            >
              {savingSpot
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createSpotBtnText}>{language === "ru" ? "Сохранить место" : "Save spot"}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {selectedSpot && (
        <SpotDetailModal
          spot={selectedSpot}
          currentUserId={user?.id}
          language={language}
          onClose={() => setSelectedSpot(null)}
          onDeleted={(id) => {
            setSpots((prev) => prev.filter((s) => s.id !== id));
            setPublicSpots((prev) => prev.filter((s) => s.id !== id));
            setSelectedSpot(null);
          }}
          onUpdated={(updated) => {
            setSpots((prev) => prev.map((s) => s.id === updated.id ? updated : s));
            setSelectedSpot(updated);
          }}
        />
      )}

      <CatchDetailModal
        catch={detailCatch ? {
          id: String(detailCatch.id),
          imageUrl: detailCatch.imageUrl ?? null,
          species: detailCatch.species,
          description: detailCatch.description,
          length: detailCatch.length != null ? String(detailCatch.length) : undefined,
          weight: detailCatch.weight != null ? String(detailCatch.weight) : undefined,
          date: detailCatch.createdAt,
          gear: detailCatch.gear,
          username: detailCatch.isOwn ? user?.username : (detailCatch.authorUsername ?? undefined),
          name: detailCatch.isOwn ? user?.name : (detailCatch.authorName ?? undefined),
          avatarUrl: detailCatch.isOwn
            ? (user?.avatar ? `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}?thumb=200x200` : undefined)
            : (detailCatch.authorAvatar ?? undefined),
          lat: detailCatch.lat,
          lon: detailCatch.lon,
        } : null}
        onClose={() => setDetailCatch(null)}
        onCommentAdded={() => {}}
        onCommentCountSynced={(catchId, count) => {
          syncCommentCountInMap(catchId, count);
          DeviceEventEmitter.emit("commentCountSynced", { catchId, count });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    position: "absolute",
    left: 16,
    bottom: 50,
    alignItems: "center",
    zIndex: 10,
  },
  controlsWithWelcome: {
    bottom: 224,
  },
  styleControlWrap: {
    position: "absolute",
    right: 16,
    bottom: 20,
    zIndex: 1,
    elevation: 0,
  },
  viewToggleWrap: {
    position: "absolute",
    top: 92,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderRadius: 20,
    padding: 3,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  viewToggleBtn: {
    width: VIEW_TOGGLE_THUMB_WIDTH,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  viewToggleThumb: {
    position: "absolute",
    top: 3,
    left: 3,
    width: VIEW_TOGGLE_THUMB_WIDTH,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primaryMuted,
  },
  viewToggleText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
  viewToggleTextActive: {
    color: "#ffffff",
  },
  zoomControls: {
    position: "absolute",
    left: 16,
    bottom: 80,
    alignItems: "center",
    zIndex: 9999,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    opacity: 1
  },
  controlBtnActive: {
    borderWidth: 2,
    borderColor: "#0ea5e9",
  },
  styleSheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  styleSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 12, 27, 0.58)",
  },
  styleSheetAnimation: {
    width: "100%",
  },
  styleSheet: {
    backgroundColor: "transparent",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "#334155",
  },
  styleSheetFallback: {
    backgroundColor: theme.colors.background,
  },
  styleSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    backgroundColor: "#64748b",
    marginBottom: 16,
  },
  styleSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  styleSheetTitle: {
    color: "#e6eef8",
    fontSize: 25,
    fontWeight: "800",
  },
  styleSheetClose: {
    width: 36,
    height: 36,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b",
  },
  mapStyleOption: {
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 20,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapStyleOptionActive: {
    backgroundColor: theme.colors.primaryMuted,
  },
  mapStyleOptionText: {
    color: "#cbd5e1",
    fontSize: 16,
    fontWeight: "600",
  },
  mapStyleOptionTextActive: {
    color: "#ffffff",
  },
  controlBtnText: {
    fontSize: 18,
    color: "#333",
    fontWeight: "bold",
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  closeBtn: {
    position: "absolute",
    top: 4,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  previewWrapper: {
    width: "100%",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  previewImage: {
    width: 250,
    height: 250,
    borderRadius: 10,
    resizeMode: "cover",
  },
  speciesText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  gearRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, alignSelf: "flex-start" },
  gearThumb: { width: 56, height: 56 },
  gearText: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  previewCardGearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, alignSelf: "flex-start" },
  previewCardGearThumb: { width: 36, height: 36 },
  previewCardGear: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  detailText: {
    color: "#cbd5e1",
    fontSize: 16,
    marginBottom: 4,
  },
  dateText: {
    color: "#94a3b8",
    fontSize: 14,
    marginTop: 4,
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  detailScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  detailClose: {
    padding: 16,
  },
  detailContent: {
    paddingBottom: 40,
  },
  detailImage: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    resizeMode: "cover",
    marginBottom: 20,
  },
  previewCard: {
    position: "absolute",
    bottom: 16,
    left: 72,
    right: 12,
    height: 210,
    zIndex: 20,
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    flexDirection: "row",
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  previewCardContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  previewCardImage: {
    width: 170,
    height: 210,
  },
  previewCardBody: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  previewCardSpecies: {
    color: "#e6eef8",
    fontSize: 16,
    fontWeight: "700",
  },
  previewCardDate: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 2,
  },
  previewCardDesc: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 4,
    flex: 1,
  },
  previewCardBtn: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.radius.control,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  previewCardBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  previewCardClose: {
    position: "absolute",
    top: 8,
    right: 8,
    padding: 4,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  detailHeaderTitle: {
    color: "#e6eef8",
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  detailUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  detailAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  detailAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  detailAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  detailUserName: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  detailUserHandle: { color: "#94a3b8", fontSize: 13 },
  detailBody: { paddingHorizontal: 20, paddingTop: 16 },
  dotRow: { flexDirection: "row", justifyContent: "center", marginTop: 8, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#334155" },
  dotActive: { backgroundColor: "#ffffff", width: 16 },
  likeCommentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  likeCount: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  likeCountActive: { color: "#ffffff" },
  commentCount: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  commentsSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  commentItem: { marginBottom: 10 },
  commentUsername: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
  commentText: { color: "#cbd5e1", fontSize: 14, marginTop: 2 },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  commentInput: {
    flex: 1,
    color: "#e6eef8",
    fontSize: 14,
    paddingVertical: 10,
  },

  spotPreviewCard: {
    position: "absolute",
    bottom: 16,
    left: 72,
    right: 12,
    zIndex: 20,
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  spotPreviewIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#1c1409",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#f59e0b44",
    flexShrink: 0,
  },
  spotPreviewBody: { flex: 1 },
  spotPreviewName: { color: "#e6eef8", fontSize: 15, fontWeight: "700" },
  spotPreviewDesc: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  spotPreviewBtn: {
    backgroundColor: theme.colors.primaryDark, borderRadius: theme.radius.control,
    paddingVertical: 7, alignItems: "center", marginTop: 8,
  },
  spotPreviewBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  waterBodySheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    height: "72%",
    backgroundColor: "#071828",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#1e4b68",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  waterBodySheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    backgroundColor: "#3b627a",
    marginBottom: 18,
  },
  waterBodySheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  waterBodySheetIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0c3147",
    borderWidth: 1,
    borderColor: "#1d6388",
  },
waterbodySave: {
  paddingHorizontal: 12,
},

  waterBodySheetClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10283a",
  },
  waterBodySheetName: { color: "#f1f5f9", fontSize: 26, lineHeight: 27, fontWeight: "800", flex: 1 },
  waterBodySheetContent: { paddingBottom: 24 },
  waterBodySheetType: { color: "#7dd3fc", fontSize: 14, fontWeight: "700", marginTop: 12 },
  waterBodySheetLocation: { marginTop: 4, flexDirection: "row", alignItems: "center" },
  waterBodySheetLocationName: { flexShrink: 1 },
  waterBodySheetLocationSeparator: { color: "#cbd5e1", fontSize: 16, marginHorizontal: 4 },
  waterBodySheetLocationText: { color: "#cbd5e1", fontSize: 14, fontWeight: "400" },
  waterBodyCatches: { marginTop: 18 },
  waterBodyCatchesTitle: { color: "#e6eef8", fontSize: 15, fontWeight: "700", marginBottom: 10 },
  waterBodyCatchGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  waterBodyCatchThumb: { width: "31.5%", aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: "#0f2236", marginBottom: 10 },
  waterBodyCatchImage: { width: "100%", height: "100%" },
  waterBodyEmptyText: { color: "#94a3b8", fontSize: 14, marginTop: 24, textAlign: "center" },

  createSpotSheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    zIndex: 999,
  },
  createSpotContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20,
    borderTopWidth: 1, borderColor: "#1e293b",
  },
  createSpotHeader: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14,
  },
  createSpotTitle: { color: "#e6eef8", fontSize: 16, fontWeight: "700" },
  createSpotInput: {
    backgroundColor: "#1e293b", color: "#e6eef8", fontSize: 15,
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#334155",
    marginBottom: 10,
  },
  createSpotToggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, marginBottom: 12,
  },
  createSpotToggleLabel: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  createSpotBtn: {
    backgroundColor: theme.colors.primaryDark, borderRadius: theme.radius.control,
    paddingVertical: 14, alignItems: "center",
  },
  createSpotBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  searchContainer: {
    position: "absolute",
    top: 36,
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    color: "#e6eef8",
    fontSize: 15,
    paddingVertical: 0,
  },
  searchDropdown: {
    backgroundColor: "rgba(15, 23, 42, 0.97)",
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#1e293b",
    overflow: "hidden",
    elevation: 6,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  searchResultText: {
    flex: 1,
    color: "#e6eef8",
    fontSize: 14,
    lineHeight: 20,
  },
  emptyCard: {
    position: "absolute",
    top: "70%",
    alignSelf: "center",
    width: "60%",
    backgroundColor: "rgba(15, 23, 42, 0.93)",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  emptyCardTitle: {
    color: "#e6eef8",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptyCardSub: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 14,
  },
  emptyCardBtn: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.radius.control,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  emptyCardBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  welcomeCard: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "hidden",
    backgroundColor: theme.colors.background,
    zIndex: 10001,
  },
  welcomeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.58)",
    zIndex: 10000,
  },
  welcomeCardClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 12, 27, 0.46)",
    zIndex: 1,
  },
  welcomeBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  welcomeBackgroundScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 12, 27, 0.62)",
  },
  welcomeCardTitle: {
    color: "#ffffff",
    fontFamily: theme.fonts.displayBold,
    fontSize: 30,
    lineHeight: 36,
  },
  welcomeCardContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  welcomeCardMessage: {
    color: "#e2e8f0",
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 8,
    textAlign: "center",
  },
  welcomeAddCatchGuide: {
    position: "absolute",
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  welcomeAddCatchGuideText: {
    color: "#ffffff",
    fontFamily: theme.fonts.bodyBold,
    fontSize: 15,
    marginBottom: 0
  },
});
