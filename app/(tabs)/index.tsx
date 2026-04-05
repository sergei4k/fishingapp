// MUST be the first import
import "react-native-gesture-handler";

import { useLanguage } from "@/lib/language";
import { getSpeciesLabel } from "@/lib/species";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext, type SQLiteDatabase } from "expo-sqlite";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// TouchableOpacity kept for bottom sheet close button and image preview

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

const STYLE_URL = "mapbox://styles/mapbox/outdoors-v12"; // swap with your Studio URL when ready

type CatchMarker = {
  id: number;
  lat: number;
  lon: number;
  image_uri: string | null;
  species: string | null;
  description: string | null;
  length_cm: number | null;
  weight_kg: number | null;
  created_at: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function safeQueryAll(
  db: SQLiteDatabase | null | undefined,
  sql: string,
  params: any[] = [],
  retries = 5,
  delayMs = 400
): Promise<any[]> {
  if (!db || typeof db.getAllAsync !== "function") return [];
  let lastErr: any = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return (await db.getAllAsync(sql, params)) || [];
    } catch (e: any) {
      lastErr = e;
      const msg = (e?.message || String(e)) ?? "";
      if (
        msg.includes("closed resource") ||
        msg.includes("finalizeAsync") ||
        msg.includes("prepareAsync")
      ) {
        await sleep(delayMs);
        continue;
      }
      throw e;
    }
  }
  console.warn("safeQueryAll: exhausted retries:", lastErr);
  return [];
}

const fishSpeciesImages: Record<string, any> = {
  pike: require("../../assets/fishicons/schuka.420x420.png"),
  perch: require("../../assets/fishicons/perch.png"),
  carp: require("../../assets/fishicons/carp.png"),
  pikeperch: require("../../assets/fishicons/pikeperch.png"),
};

export default function Map() {
  const { focusLat, focusLon, catchId } = useLocalSearchParams<{
    focusLat?: string;
    focusLon?: string;
    catchId?: string;
  }>();

  const db = useSQLiteContext();
  const { language, t } = useLanguage();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const dbQueryLockRef = useRef(false);

  const [markers, setMarkers] = useState<CatchMarker[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [centerCoord, setCenterCoord] = useState<[number, number]>([37.618423, 55.751244]);
  const zoomLevelRef = useRef(10);

  const [selectedCatch, setSelectedCatch] = useState<any>(null);
  const [highlightedCatchId, setHighlightedCatchId] = useState<string | null>(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalImageUri, setModalImageUri] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(-1);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["80%"], []);

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
        setCenterCoord(coord);
        return;
      }
      const fresh = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coord: [number, number] = [fresh.coords.longitude, fresh.coords.latitude];
      setUserLocation(coord);
      setCenterCoord(coord);
    } catch (e) {
      console.error("Location error:", e);
    }
  };

  const centerOnUser = () => {
    if (userLocation) {
      cameraRef.current?.setCamera({
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
    if (!db || typeof db.getAllAsync !== "function") return;
    if (dbQueryLockRef.current) return;
    dbQueryLockRef.current = true;
    try {
      const rows = await safeQueryAll(
        db,
        `SELECT id, lat, lon, image_uri, species, description, length_cm, weight_kg, created_at
         FROM catches WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY created_at DESC LIMIT 500`,
        [],
        6,
        500
      );
      const parsed = rows
        .filter((r) => r.lat != null && r.lon != null)
        .map((r) => ({ ...r, lat: Number(r.lat), lon: Number(r.lon) }));
      setMarkers(parsed);
    } catch (err) {
      console.error("refreshMarkers error:", err);
      setMarkers([]);
    } finally {
      dbQueryLockRef.current = false;
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refreshMarkers();
    }, [refreshMarkers])
  );

  useEffect(() => {
    refreshMarkers();
  }, [db, refreshMarkers]);

  // ─── Focus on navigated-to catch ─────────────────────────────────────────────

  useEffect(() => {
    if (focusLat && focusLon) {
      const lat = parseFloat(focusLat);
      const lon = parseFloat(focusLon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        cameraRef.current?.setCamera({
          centerCoordinate: [lon, lat],
          zoomLevel: 14,
          animationDuration: 800,
          animationMode: "flyTo",
        });
        if (catchId) setHighlightedCatchId(catchId);
      }
    }
  }, [focusLat, focusLon, catchId]);

  // ─── Bottom sheet ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (selectedCatch) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [selectedCatch]);

  // ─── GeoJSON ──────────────────────────────────────────────────────────────────

  const catchesGeoJSON: GeoJSON.FeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: markers
        .filter(
          (m) =>
            Number.isFinite(m.lat) &&
            Number.isFinite(m.lon) &&
            m.lat !== 0 &&
            m.lon !== 0
        )
        .map((m) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [m.lon, m.lat] },
          properties: {
            id: m.id,
            species: m.species,
            image_uri: m.image_uri,
            description: m.description,
            length_cm: m.length_cm,
            weight_kg: m.weight_kg,
            created_at: m.created_at,
          },
        })),
    }),
    [markers]
  );

  const handleMarkerPress = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const p = feature.properties;
    if (p.cluster) {
      cameraRef.current?.setCamera({
        centerCoordinate: feature.geometry.coordinates,
        zoomLevel: zoomLevelRef.current + 2,
        animationDuration: 400,
        animationMode: "flyTo",
      });
      return;
    }
    setSelectedCatch({
      id: p.id,
      imageUrl: p.image_uri,
      species: p.species,
      description: p.description,
      length: p.length_cm,
      weight: p.weight_kg,
      createdAt: p.created_at,
    });
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <MapboxGL.MapView
        style={{ flex: 1 }}
        styleURL={STYLE_URL}
        logoEnabled={false}
        attributionEnabled={false}
        onCameraChanged={(state) => { zoomLevelRef.current = state.properties.zoom; }}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={centerCoord}
          zoomLevel={zoomLevelRef.current}
          animationMode="none"
        />

        <MapboxGL.UserLocation visible androidRenderMode="compass" />

        <MapboxGL.ShapeSource
          id="catches"
          shape={catchesGeoJSON}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={14}
          onPress={handleMarkerPress}
        >
          {/* Cluster background circle */}
          <MapboxGL.CircleLayer
            id="clusters"
            filter={["has", "point_count"]}
            style={{
              circleRadius: ["step", ["get", "point_count"], 20, 10, 28, 30, 36],
              circleColor: "#0ea5e9",
              circleOpacity: 0.9,
              circleStrokeWidth: 2,
              circleStrokeColor: "#ffffff",
            }}
          />

          {/* Cluster count label */}
          <MapboxGL.SymbolLayer
            id="cluster-count"
            filter={["has", "point_count"]}
            style={{
              textField: ["get", "point_count_abbreviated"],
              textColor: "#ffffff",
              textSize: 14,
              textFont: ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            }}
          />

          {/* Individual catch marker */}
          <MapboxGL.CircleLayer
            id="catch-points"
            filter={["!", ["has", "point_count"]]}
            style={{
              circleRadius: 12,
              circleColor: [
                "match",
                ["get", "species"],
                "pike", "#22c55e",
                "perch", "#f97316",
                "carp", "#a78bfa",
                "pikeperch", "#facc15",
                "#0ea5e9", // default
              ],
              circleStrokeWidth: 2.5,
              circleStrokeColor: "#ffffff",
            }}
          />
        </MapboxGL.ShapeSource>
      </MapboxGL.MapView>

      {/* Map controls */}
      <View
        style={styles.controls}
        pointerEvents={sheetIndex >= 0 ? "none" : "auto"}
      >
        <Pressable
          style={styles.controlBtn}
          onPress={centerOnUser}
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Text style={styles.controlBtnText}>◎</Text>
        </Pressable>
        <Pressable
          style={styles.controlBtn}
          onPress={() =>
            cameraRef.current?.setCamera({
              zoomLevel: zoomLevelRef.current + 1,
              animationDuration: 300,
              animationMode: "easeTo",
            })
          }
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Text style={styles.controlBtnText}>＋</Text>
        </Pressable>
        <Pressable
          style={[styles.controlBtn, { marginBottom: 0 }]}
          onPress={() =>
            cameraRef.current?.setCamera({
              zoomLevel: zoomLevelRef.current - 1,
              animationDuration: 300,
              animationMode: "easeTo",
            })
          }
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Text style={styles.controlBtnText}>－</Text>
        </Pressable>
      </View>

      {/* Bottom sheet — catch detail */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={(index) => {
          setSheetIndex(index);
          if (index === -1) setSelectedCatch(null);
        }}
        handleIndicatorStyle={{ backgroundColor: "#94a3b8" }}
        backgroundStyle={{ backgroundColor: "rgba(2,6,23,0.97)" }}
      >
        <BottomSheetView style={styles.sheetContent}>
          {selectedCatch && (
            <>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setSelectedCatch(null)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>

              {selectedCatch.imageUrl && (
                <View style={styles.previewWrapper}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setModalImageUri(selectedCatch.imageUrl);
                      setImageModalVisible(true);
                    }}
                  >
                    <Image
                      source={{ uri: selectedCatch.imageUrl }}
                      style={styles.previewImage}
                    />
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.speciesText}>
                {getSpeciesLabel(selectedCatch.species, language)}
              </Text>

              {selectedCatch.description && (
                <Text style={styles.detailText}>{selectedCatch.description}</Text>
              )}

              {(selectedCatch.length || selectedCatch.weight) && (
                <Text style={styles.detailText}>
                  {selectedCatch.length
                    ? `${selectedCatch.length} ${language === "ru" ? "см" : "cm"}`
                    : ""}
                  {selectedCatch.length && selectedCatch.weight ? " • " : ""}
                  {selectedCatch.weight
                    ? `${selectedCatch.weight} ${language === "ru" ? "кг" : "kg"}`
                    : ""}
                </Text>
              )}

              <Text style={styles.dateText}>
                {selectedCatch.createdAt
                  ? new Date(selectedCatch.createdAt).toLocaleDateString(
                      language === "ru" ? "ru-RU" : "en-US"
                    )
                  : t("recently")}
              </Text>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>

      {/* Fullscreen image modal */}
      <Modal
        visible={imageModalVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <Pressable
          style={styles.fullscreenModal}
          onPress={() => setImageModalVisible(false)}
        >
          {modalImageUri && (
            <Image
              source={{ uri: modalImageUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    position: "absolute",
    right: 16,
    bottom: 60,
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
  },
  controlBtnText: {
    fontSize: 18,
    color: "#333",
    fontWeight: "bold",
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  closeBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
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
  detailText: {
    color: "#cbd5e1",
    fontSize: 16,
    marginBottom: 4,
  },
  dateText: {
    color: "#64748b",
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
});
