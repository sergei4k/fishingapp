// MUST be the first import
import "react-native-gesture-handler";

import { useLanguage } from "@/lib/language";
import { getSpeciesLabel } from "@/lib/species";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext, type SQLiteDatabase } from "expo-sqlite";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, GestureResponderEvent, Image, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
const DARK_MAP_STYLE = [
  {
    "elementType": "geometry",
    "stylers": [{ "color": "#212121" }]
  },
  {
    "elementType": "labels.icon",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#212121" }]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "administrative.country",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#9e9e9e" }]
  },
  {
    "featureType": "administrative.land_parcel",
    "stylers": [{ "visibility": "off" }]
  },
  {
    "featureType": "administrative.locality",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#bdbdbd" }]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [{ "color": "#181818" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#1b1b1b" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry.fill",
    "stylers": [{ "color": "#2c2c2c" }]
  },
  {
    "featureType": "road",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#8a8a8a" }]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [{ "color": "#373737" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#3c3c3c" }]
  },
  {
    "featureType": "road.highway.controlled_access",
    "elementType": "geometry",
    "stylers": [{ "color": "#4e4e4e" }]
  },
  {
    "featureType": "road.local",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#616161" }]
  },
  {
    "featureType": "transit",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#757575" }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#000000" }]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#3d3d3d" }]
  }
];
type CatchMarker = {
  id: number;
  lat: number | null;
  lon: number | null;
  image_uri: string | null;
  species: string | null;
  description: string | null;
  length_cm: number | null;
  weight_kg: number | null;
  created_at: number;
};

// small helper: sleep
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// robust wrapper that retries on closed-resource / transient DB errors
async function safeQueryAll(
  db: SQLiteDatabase | null | undefined,
  sql: string,
  params: any[] = [],
  retries = 5, // ✅ increase retries
  delayMs = 400 // ✅ increase delay
): Promise<any[]> {
  if (!db || typeof db.getAllAsync !== "function") return [];
  let lastErr: any = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await db.getAllAsync(sql, params);
      return res || [];
    } catch (e: any) {
      lastErr = e;
      const msg = (e && (e.message || String(e))) || "";
      // retry on closed/resource or prepare/finalize errors
      if (msg.includes("closed resource") || msg.includes("finalizeAsync") || msg.includes("prepareAsync")) {
        await sleep(delayMs);
        continue;
      }
      // for other errors, rethrow immediately
      throw e;
    }
  }
  // exhausted retries — log and return empty
  console.warn("safeQueryAll: exhausted retries, returning empty. lastErr:", lastErr);
  return [];
}

const fishSpeciesImages: Record<string, any> = {
  pike: require("../assets/fishicons/schuka.420x420.png"),
  perch: require("../assets/fishicons/perch.png"),
  carp: require("../assets/fishicons/carp.png"),
  pikeperch: require("../assets/fishicons/pikeperch.png"),
};

export default function Map() {
  const { focusLat, focusLon, catchId } = useLocalSearchParams<{
    focusLat?: string;
    focusLon?: string;
    catchId?: string;
  }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { language, t } = useLanguage(); // may be undefined until provider mounts
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const didCenterRef = useRef(false);
  const didFitToDataRef = useRef(false);
  const dbQueryLockRef = useRef(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // safe default region so code never sees undefined deltas
  const defaultRegion: Region = {
    latitude: 55.751244, // fallback default (Moscow) — only used if location unavailable
    longitude: 37.618423,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  };
  const [region, setRegion] = useState<Region | null>(null); // Start with null to wait for user location

  // helper to ensure region fields exist (avoid .longitudeDelta of undefined)
  const normalizeRegion = (r?: Region | null) => ({
    latitude: r?.latitude ?? defaultRegion.latitude,
    longitude: r?.longitude ?? defaultRegion.longitude,
    latitudeDelta: (r?.latitudeDelta ?? defaultRegion.latitudeDelta),
    longitudeDelta: (r?.longitudeDelta ?? defaultRegion.longitudeDelta),
  });
  // (duplicate refs removed — single declarations are kept above)
  const [markers, setMarkers] = useState<CatchMarker[]>([]);
  const [selectedCatch, setSelectedCatch] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['80%'], []);
  const [sheetIndex, setSheetIndex] = useState<number>(-1);
  // modal for full-screen image preview
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalImageUri, setModalImageUri] = useState<string | null>(null);
  const [highlightedCatchId, setHighlightedCatchId] = useState<string | null>(null);

  // prevent concurrent DB queries that can finalize the same statement
  // (dbQueryLockRef is declared once above; do not redeclare here)

  // Request location permission and get user location
  useEffect(() => {
    requestLocationPermission();
  }, []);
  
  useEffect(() => {
    if (selectedCatch) {
      bottomSheetRef.current?.snapToIndex(0); // ✅ already set to index 0 (80%)
    } else {
      bottomSheetRef.current?.close();
    }
  }, [selectedCatch]);

  // Focus on passed coordinates when navigating from profile
  useEffect(() => {
    if (focusLat && focusLon) {
      const lat = parseFloat(focusLat);
      const lon = parseFloat(focusLon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const newRegion = {
          latitude: lat,
          longitude: lon,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setRegion(newRegion);
        mapRef.current?.animateToRegion(newRegion, 500);
        if (catchId) {
          setHighlightedCatchId(catchId);
        }
      }
    }
  }, [focusLat, focusLon, catchId]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermission(true);

        // Try to use a quick last-known position as the initial region so the map opens at user's location
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last && last.coords) {
            const quickRegion: Region = {
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            };
            setUserLocation({ latitude: last.coords.latitude, longitude: last.coords.longitude });
            setRegion(quickRegion); // Set region immediately so map centers on user location

            // if the map is already ready, animate to the user location once
            if (mapReady && !didCenterRef.current) {
              try { mapRef.current?.animateToRegion?.(quickRegion, 800); } catch (e) {}
              didCenterRef.current = true;
            }

            return;
          }
        } catch (e) {
          // ignore last-known failures and fall back to fresh location below
        }

        // Fall back to fresh location fetch
        await getCurrentLocation();
      } else {
        Alert.alert(
          t("locationPermission"),
          t("locationPermissionMessage"),
          [
            { text: t("cancel"), style: "cancel" },
            { text: t("settings"), onPress: () => Location.requestForegroundPermissionsAsync() }
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newUserLoc = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(newUserLoc);

      // center map on user location once (when map is ready)
      const userRegion: Region = {
        latitude: newUserLoc.latitude,
        longitude: newUserLoc.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      // Set region immediately so map centers on user location
      setRegion(userRegion);
      // only auto-center once to avoid repeated reloading of tiles
      if (mapReady && !didCenterRef.current) {
        try { mapRef.current?.animateToRegion?.(userRegion, 800); } catch (e) {}
        didCenterRef.current = true;
      }
    } catch (error) {
      console.error('Error getting current location:', error);
    }
  };

  const centerOnUserLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    } else if (!locationPermission) {
      requestLocationPermission();
    } else {
      getCurrentLocation();
    }
  };

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const zoomIn = () => {
    const factor = 0.5; // zoom in by reducing deltas
    const r = normalizeRegion(region);
    const newRegion: Region = {
      latitude: r.latitude,
      longitude: r.longitude,
      latitudeDelta: clamp(r.latitudeDelta * factor, 0.0005, 80),
      longitudeDelta: clamp(r.longitudeDelta * factor, 0.0005, 80),
    };
    mapRef.current?.animateToRegion(newRegion, 300);
    setRegion(newRegion);
  };

  const refreshMarkers = useCallback(async () => {
    // Check db directly instead of relying on ref
    if (!db || typeof db.getAllAsync !== "function") return;
    if (dbQueryLockRef.current) return;
    dbQueryLockRef.current = true;

    try {
      // Load ALL markers - let clustering library handle display
      let allRows: any[] = [];
      try {
        allRows = await safeQueryAll(
          db,
          `SELECT id, lat AS lat, lon AS lon, image_uri, species, description, length_cm, weight_kg, created_at
           FROM catches WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY created_at DESC LIMIT 500`,
          [], 6, 500
        );
      } catch (qErr) {
        console.error("query failed:", qErr);
        allRows = [];
      }
      
      const allParsed = (allRows || [])
        .filter(r => r.lat != null && r.lon != null)
        .map(r => ({ ...r, lat: Number(r.lat), lon: Number(r.lon) }));
      
      setMarkers(allParsed);
      if (__DEV__) {
        console.log("Loaded markers:", allParsed.length);
      }

      // Center on first marker if we haven't centered yet
      if (allParsed.length > 0 && mapRef.current && !didFitToDataRef.current) {
        const first = allParsed[0];
        try {
          mapRef.current.animateToRegion(
            { latitude: first.lat, longitude: first.lon, latitudeDelta: 0.05, longitudeDelta: 0.05 },
            800
          );
          didFitToDataRef.current = true;
        } catch {}
      }
    } catch (err) {
      console.error("refreshMarkers error:", err);
      setMarkers([]);
    } finally {
      dbQueryLockRef.current = false;
    }
  }, [db]);

  // Load markers on screen focus
  useFocusEffect(
    useCallback(() => {
      if (db && typeof db.getAllAsync === "function") {
        refreshMarkers();
      }
    }, [db, refreshMarkers])
  );

  // Also load markers when DB first becomes available
  useEffect(() => {
    if (db && typeof db.getAllAsync === "function") {
      refreshMarkers();
    }
  }, [db, refreshMarkers]);


  const zoomOut = () => {
    const factor = 2; // zoom out by increasing deltas
    const currentRegion = region || defaultRegion;
    const newRegion: Region = {
      ...currentRegion,
      latitudeDelta: clamp(currentRegion.latitudeDelta * factor, 0.0005, 80),
      longitudeDelta: clamp(currentRegion.longitudeDelta * factor, 0.0005, 80),
    };
    mapRef.current?.animateToRegion(newRegion, 300);
    setRegion(newRegion);
  };
 
  function handleCloseTutorial(_: GestureResponderEvent): void {
    // Close the tutorial overlay
    setShowTutorial(false);
  }
  
  // Avoid rendering on the Moscow fallback — wait until we have a region
  if (!region) {
    return <View style={{ flex: 1, backgroundColor: "#071023" }} />;
  }

  // choose map type; terrain should not use custom dark styling
  const mapType: "standard" | "satellite" | "hybrid" | "terrain" | "none" | "mutedStandard" = "terrain";
  const mapStyle = mapType === "terrain" ? undefined : DARK_MAP_STYLE;

   return (
     <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        mapType={mapType}
        initialRegion={region || defaultRegion}
        customMapStyle={mapStyle}
        showsUserLocation
        onMapReady={() => {
          setMapReady(true);
          if (userLocation && !didCenterRef.current) {
            try {
              const userRegion: Region = {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              };
              mapRef.current?.animateToRegion?.(userRegion, 800);
            } catch (e) {}
            didCenterRef.current = true;
          }
        }}
        onRegionChangeComplete={(newRegion) => {
          if (!newRegion) return;
          setRegion((prev) => ({
            latitude: newRegion.latitude ?? (prev?.latitude ?? defaultRegion.latitude),
            longitude: newRegion.longitude ?? (prev?.longitude ?? defaultRegion.longitude),
            latitudeDelta: newRegion.latitudeDelta ?? (prev?.latitudeDelta ?? defaultRegion.latitudeDelta),
            longitudeDelta: newRegion.longitudeDelta ?? (prev?.longitudeDelta ?? defaultRegion.longitudeDelta),
          }));
        }}
      >
        {markers
          .filter((m) => {
            const lat = Number(m.lat);
            const lon = Number(m.lon);
            return Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0;
          })
          .map((m) => (
            <Marker
              key={`marker-${m.id}`}
              coordinate={{ latitude: Number(m.lat), longitude: Number(m.lon) }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={true}
              onPress={() =>
                setSelectedCatch({
                  id: m.id,
                  imageUrl: m.image_uri,
                  species: m.species,
                  description: m.description,
                  length: m.length_cm,
                  weight: m.weight_kg,
                  createdAt: m.created_at,
                })
              }
            >
              <View style={styles.catchMarker}>
                {m.species && fishSpeciesImages[m.species] ? (
                  <Image 
                    source={fishSpeciesImages[m.species]} 
                    style={styles.catchMarkerSpeciesImage}
                  />
                ) : (
                  <Text style={styles.catchMarkerText}>🐟</Text>
                )}
              </View>
            </Marker>
          ))}
      </MapView>

      {/* BottomSheet for selected catch */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1} // ✅ starts closed
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={(index) => {
          setSheetIndex(index);
          if (index === -1) setSelectedCatch(null);
        }}
        handleIndicatorStyle={{ backgroundColor: "#94a3b8" }}
        backgroundStyle={{ backgroundColor: "rgba(2,6,23,0.95)" }}
      >
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {!selectedCatch ? (
            <Text style={{ color: "#94a3b8" }}>No selection</Text>
          ) : (
            <View style={styles.catchDetailsContent}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedCatch(null)}
              >
                <Text style={styles.closeButtonText}>X</Text>
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
                    <Image source={{ uri: selectedCatch.imageUrl }} style={styles.catchPreviewImage} />
                  </TouchableOpacity>
                </View>
              )}
              
              <Text style={styles.catchSpecies}>{getSpeciesLabel(selectedCatch.species, language)}</Text>
              {selectedCatch.description && (
                <Text style={styles.catchDescription}>{selectedCatch.description}</Text>
              )}
             {(selectedCatch.length || selectedCatch.weight) && (
               <Text style={styles.catchDescription}>
                 {selectedCatch.length ? `${selectedCatch.length} ${language === "ru" ? "см" : "cm"}` : ""} 
                 {selectedCatch.length && selectedCatch.weight ? " • " : ""}
                 {selectedCatch.weight ? `${selectedCatch.weight} ${language === "ru" ? "кг" : "kg"}` : ""}
               </Text>
             )}
              <Text style={styles.catchDate}>
                {selectedCatch.createdAt 
                  ? new Date(selectedCatch.createdAt).toLocaleDateString(language === "ru" ? "ru-RU" : "en-US")
                  : t("recently")}
              </Text>
            

              
            </View>
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
        <Pressable style={styles.fullscreenModal} onPress={() => setImageModalVisible(false)}>
          {modalImageUri ? (
            <Image source={{ uri: modalImageUri }} style={styles.fullscreenImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>

      {/* Location and zoom controls */}
      <View
        style={[styles.controlsContainer, sheetIndex >= 0 ? { opacity: 0 } : null]}
        pointerEvents={sheetIndex >= 0 ? "none" : "auto"}
      >

        <TouchableOpacity style={styles.zoomButton} onPress={centerOnUserLocation}>
          <Text style={styles.zoomText}>◎</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.zoomButtonSmall, styles.zoomButtonSmallBottom]}
          onPress={zoomIn}
        >
          <Text style={styles.zoomTextSmall}>＋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.zoomButtonSmall, styles.zoomButtonLast]} onPress={zoomOut}>
          <Text style={styles.zoomTextSmall}>－</Text>
        </TouchableOpacity>
      </View>
      
      {showTutorial && (
        <View style={styles.tutorial}>
          <TouchableOpacity style={styles.tutorialClose} onPress={handleCloseTutorial}>
            <Text style={styles.tutorialCloseText}>×</Text>
          </TouchableOpacity>
          <Text style={styles.tutorialText}>
            {t("appTitle")}
          </Text>
          <Text style={styles.tutdesc}>
            {t("appDescription")}
          </Text>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(2,6,23,0.95)" },
  map: {
    width: "100%",
    height: "100%",
  },
  
  tutorial: {
    position: "absolute",
    top: "30%",
    left: "50%",
    transform: [{ translateX: -150 }, { translateY: -150 }],
    width: 300,
    height: 450,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0b1220",
    borderRadius: 16,
    opacity: 0.9,
    borderWidth: 1,
    borderColor: "#000000ff",
    padding: 16,
  },
  tutorialClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  tutorialCloseText: {
    color: "#ffffff",
    fontSize: 20,
    lineHeight: 22,
  },
  // Added tutorialText style used in the tutorial modal
  tutorialText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  // Added tutdesc style to fix missing style reference
  tutdesc: {
    color: "#cccccc",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  zoomContainerBottom: {
    position: "absolute",
    left: 12,
    bottom: 24,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  
  zoomButtonSmall: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#071023",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#ffffff",
    
  },
  zoomButtonSmallBottom: {
    marginBottom: 10,
  },
  zoomTextSmall: {
    fontSize: 18,
    color: "#ffffff",
    lineHeight: 18,
  },
  userMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    borderWidth: 3,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 5,
  },
  
  userMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffffff",
  },
  catchMarker: {
    width: 40,
    height: 40,
    borderRadius: 25,
    backgroundColor: "#0ea5e9",
    borderWidth: 3,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    overflow: "visible",
  },
  catchMarkerSpeciesImage: {
    width: 38,
    height: 38,
    resizeMode: "contain",
  },
  catchMarkerText: {
    fontSize: 28,
  },
  catchDetailsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center", 
    alignItems: "center",  
    padding: 20,
  },
  catchDetailsContent: {
    alignItems: "flex-start",
    padding: 2  // Changed from "center" to "flex-start" for left alignment
  },
  closeButton: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 12,
    backgroundColor: "#676767ff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,

  },
  closeButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  catchPreviewImage: {
    width: 250,
    height: 250,
    borderRadius: 8,
    marginBottom: 8,
    resizeMode: "cover",
  },
  previewWrapper: {
    width: "100%",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
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
  catchSpecies: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  catchDescription: {
    color: "#cccccc",
    fontSize: 21,
    textAlign: "center",
    marginBottom: 4,
  },
  catchDate: {
    color: "#888888",
    fontSize: 20,
  },
  controlsContainer: {
    position: "absolute",
    right: 20,
    bottom: 50,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
    
  },
  
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
        shadowColor: "#000",

    elevation: 5,
  },
  
  zoomButtonLast: {
    marginBottom: 0,
  },
  
  zoomText: {
    fontSize: 18,
    color: "#333333",
    fontWeight: "bold",
  },
  clusterMarker: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#0ea5e9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  clusterText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
