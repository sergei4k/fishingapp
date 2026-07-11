// MUST be the first import
import "react-native-gesture-handler";
import { theme } from '../../lib/theme';

import { useLanguage } from "@/lib/language";
import { getSpeciesLabel } from "@/lib/species";
import { getGearLabel } from "@/lib/gear";
import { pocketbaseThumbUrl } from "@/lib/imageUrls";
import gearPhotos from "@/lib/gearPhotos";
import CatchDetailModal from "@/components/CatchDetailModal";
import ImageWithLoader from "@/components/ImageWithLoader";
import SpotDetailModal, { type Spot } from "@/components/SpotDetailModal";
import { getCatches } from "@/lib/storage";
import { pb, isNetworkError } from "@/lib/pocketbase";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { Ionicons } from "@expo/vector-icons";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as ExpoImage } from "expo-image";
import { MAPBOX_ACCESS_TOKEN, useMapboxReady } from "@/lib/mapbox";
import { ActivityIndicator, Alert, DeviceEventEmitter, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PIN_URI = Image.resolveAssetSource(require("../../assets/images/pin.png")).uri;
const PREVIEW_THUMB_SIZE = "300x300";


const STYLE_URL = "mapbox://styles/mapbox/satellite-streets-v12";

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
};



export default function Map() {
  const { focusLat, focusLon, catchId } = useLocalSearchParams<{
    focusLat?: string;
    focusLon?: string;
    catchId?: string;
  }>();

  const { language, t } = useLanguage();
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const mapboxReady = useMapboxReady();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const [previewCatch, setPreviewCatch] = useState<any>(null);
  const [detailCatch, setDetailCatch] = useState<any>(null);

  const [showHeatmap, setShowHeatmap] = useState(false);
  // "public" = all public catches (own public + everyone's); "mine" = all of the user's own catches
  const [mapView, setMapView] = useState<"public" | "mine">("public");

  const [spots, setSpots] = useState<Spot[]>([]);
  const [publicSpots, setPublicSpots] = useState<Spot[]>([]);
  const [spotPreview, setSpotPreview] = useState<Spot | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [newSpotCoord, setNewSpotCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [newSpotName, setNewSpotName] = useState("");
  const [newSpotDesc, setNewSpotDesc] = useState("");
  const [newSpotPublic, setNewSpotPublic] = useState(false);
  const [savingSpot, setSavingSpot] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; coords: [number, number] }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    }, [refreshMarkers, refreshPublicMarkers, refreshSpots])
  );

  useEffect(() => {
    refreshMarkers();
    refreshPublicMarkers();
    refreshSpots();
  }, [refreshMarkers, refreshPublicMarkers, refreshSpots]);

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
      // Small delay so the camera is ready after the tab transition
      const timer = setTimeout(() => {
        mapReadyRef.current && cameraRef.current?.setCamera({
          centerCoordinate: [lon, lat],
          zoomLevel: 14,
          animationDuration: 800,
          animationMode: "flyTo",
        });
      }, 150);
      return () => clearTimeout(timer);
    }, [focusLat, focusLon, catchId])
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
          is_own: true,
        },
      });

      // "Mine" view: all of the user's own catches (public and private).
      if (mapView === "mine") {
        return {
          type: "FeatureCollection" as const,
          features: ownValid.map(ownFeature),
        };
      }

      // Public view: own public catches + everyone else's public catches.
      return {
        type: "FeatureCollection" as const,
        features: [
          ...ownValid.filter((m) => m.is_public).map(ownFeature),
          ...publicMarkers
            .filter((m) => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)) && m.lat !== 0 && m.lon !== 0)
            .map((m) => ({
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: [Number(m.lon), Number(m.lat)] },
              properties: {
                id: m.id, species: m.species, gear: m.gear ?? null,
                image_uri: m.image_uri, description: m.description,
                length_cm: m.length_cm, weight_kg: m.weight_kg, created_at: m.created_at,
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

  const handleSpotPress = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const p = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
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
    });
  }, []);

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
        styleURL={STYLE_URL}
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
              circleOpacity: 0.9,
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
          <TouchableOpacity
            style={[styles.viewToggleBtn, mapView === "public" && styles.viewToggleBtnActive]}
            onPress={() => setMapView("public")}
          >
            <Text style={[styles.viewToggleText, mapView === "public" && styles.viewToggleTextActive]}>
              {language === "ru" ? "Все" : "Public"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, mapView === "mine" && styles.viewToggleBtnActive]}
            onPress={() => { if (requireAuth()) setMapView("mine"); }}
          >
            <Text style={[styles.viewToggleText, mapView === "mine" && styles.viewToggleTextActive]}>
              {language === "ru" ? "Мои уловы" : "My catches"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom-left controls: heatmap + location */}
      <View style={[styles.controls, newSpotCoord ? { bottom: 380 } : null]}>
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


      {/* Empty state — shown only after catches are confirmed to be empty */}
      {catchesLoaded && catchesGeoJSON.features.length === 0 && !previewCatch && !newSpotCoord && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>{t("noCatchesYet")}</Text>
          <Text style={styles.emptyCardSub}>{t("noCatchesMapSub")}</Text>
          <TouchableOpacity style={styles.emptyCardBtn} onPress={() => router.push("/(tabs)/add")}>
            <Text style={styles.emptyCardBtnText}>{t("addFirstCatch")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Preview card */}
      {previewCatch && (
        <TouchableOpacity
          style={styles.previewCard}
          activeOpacity={0.97}
          onPress={() => { setDetailCatch(previewCatch); setPreviewCatch(null); }}
        >
          <ImageWithLoader
            source={previewCatch.imageUrl ? { uri: previewCatch.imageUrl } : require("../../assets/placeholder.png")}
            placeholder={require("../../assets/placeholder.png")}
            cachePolicy="memory-disk"
            transition={120}
            contentFit="cover"
            style={styles.previewCardImage}
          />
          <View style={styles.previewCardBody}>
            <Text style={styles.previewCardSpecies} numberOfLines={1}>
              {getSpeciesLabel(previewCatch.species, language)}
            </Text>
            {previewCatch.gear ? (
              <View style={styles.previewCardGearRow}>
                {gearPhotos[previewCatch.gear] && <ExpoImage source={gearPhotos[previewCatch.gear]} style={styles.previewCardGearThumb} contentFit="contain" />}
                <Text style={styles.previewCardGear} numberOfLines={1}>{getGearLabel(previewCatch.gear, language)}</Text>
              </View>
            ) : null}
            <Text style={styles.previewCardDate}>
              {(() => {
                if (!previewCatch.createdAt) return t("recently");
                const d = new Date(previewCatch.createdAt);
                return isNaN(d.getTime()) ? t("recently") : d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
              })()}
            </Text>
            {previewCatch.description ? (
              <Text style={styles.previewCardDesc} numberOfLines={2}>{previewCatch.description}</Text>
            ) : null}
            <View style={styles.previewCardBtn}>
              <Text style={styles.previewCardBtnText}>{language === "ru" ? "Открыть" : "View catch"}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.previewCardClose} onPress={() => setPreviewCatch(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </TouchableOpacity>
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
    bottom: 100,
    alignItems: "center",
    zIndex: 9999,
  },
  viewToggleWrap: {
    position: "absolute",
    top: 92,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9998,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderRadius: 20,
    padding: 3,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  viewToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 17,
  },
  viewToggleBtnActive: {
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
    bottom: 100,
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
    opacity: 0.85
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
});
