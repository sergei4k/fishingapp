// MUST be the first import
import "react-native-gesture-handler";

import { getSpeciesLabel } from "@/lib/species";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useSQLiteContext, type SQLiteDatabase } from "expo-sqlite";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ClusteredMapView from "react-native-map-clustering";
import { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";

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
  retries = 3,
  delayMs = 250
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

async function getCatchesInBounds(
  db: SQLiteDatabase | null | undefined,
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number
): Promise<CatchMarker[]> {
  return safeQueryAll(
    db,
    `SELECT 
       id,
       lat AS lat,
       lon AS lon,
       image_uri, species, description, length_cm, weight_kg, created_at
     FROM catches
     WHERE lat BETWEEN ? AND ?
       AND lon BETWEEN ? AND ?`,
    [minLat, maxLat, minLon, maxLon]
  ) as Promise<CatchMarker[]>;
}

export default function Map() {
  const router = useRouter();
  const db = useSQLiteContext(); // may be undefined until provider mounts
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const didCenterRef = useRef(false);
  const didFitToDataRef = useRef(false);
  const dbQueryLockRef = useRef(false);
  const dbReadyRef = useRef(false);

  // safe default region so code never sees undefined deltas
  const initialRegion: Region = {
    latitude: 55.751244, // sensible default (Moscow) — won't force center on open
    longitude: 37.618423,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  };
  const [region, setRegion] = useState<Region>(initialRegion);

  // ensure we only run DB queries once provider is ready
  useEffect(() => {
    dbReadyRef.current = !!(db && typeof db.getAllAsync === "function");
  }, [db]);

  // helper to ensure region fields exist (avoid .longitudeDelta of undefined)
  const normalizeRegion = (r?: Region | null) => ({
    latitude: r?.latitude ?? initialRegion.latitude,
    longitude: r?.longitude ?? initialRegion.longitude,
    latitudeDelta: (r?.latitudeDelta ?? initialRegion.latitudeDelta),
    longitudeDelta: (r?.longitudeDelta ?? initialRegion.longitudeDelta),
  });
  // (duplicate refs removed — single declarations are kept above)
  const [markers, setMarkers] = useState<CatchMarker[]>([]);
  const [selectedCatch, setSelectedCatch] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['60%', '80%'], []);
  const [sheetIndex, setSheetIndex] = useState<number>(-1);
  // modal for full-screen image preview
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [modalImageUri, setModalImageUri] = useState<string | null>(null);

  // prevent concurrent DB queries that can finalize the same statement
  // (dbQueryLockRef is declared once above; do not redeclare here)

  // Request location permission and get user location
  useEffect(() => {
    requestLocationPermission();
  }, []);
  
  useEffect(() => {
    if (selectedCatch) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [selectedCatch]);

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
            setRegion(quickRegion);

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
          "Разрешение на местоположение",
          "Для отображения вашего местоположения на карте необходимо предоставить разрешение",
          [
            { text: "Отмена", style: "cancel" },
            { text: "Настройки", onPress: () => Location.requestForegroundPermissionsAsync() }
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
      // only auto-center once to avoid repeated reloading of tiles
      if (mapReady && !didCenterRef.current) {
        try { mapRef.current?.animateToRegion?.(userRegion, 800); } catch (e) {}
        didCenterRef.current = true;
      }
      // keep local region state for zoom controls (no longer passed directly to MapView)
      setRegion(userRegion);
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
     // don't run until DB provider is initialized and map ready
     if (!dbReadyRef.current || dbQueryLockRef.current) return;
     dbQueryLockRef.current = true;
 
    try {
      // normalize region so latitudeDelta / longitudeDelta always defined
      const useRegion = normalizeRegion(region);
      const minLat = useRegion.latitude - useRegion.latitudeDelta / 2;
      const maxLat = useRegion.latitude + useRegion.latitudeDelta / 2;
      const minLon = useRegion.longitude - useRegion.longitudeDelta / 2;
      const maxLon = useRegion.longitude + useRegion.longitudeDelta / 2;
     let rows: CatchMarker[] = [];
     try {
       rows = await getCatchesInBounds(db, minLat, minLon, maxLat, maxLon);
     } catch (innerErr) {
       console.warn("getCatchesInBounds failed:", innerErr);
       rows = [];
     }
 
      // coerce numeric coords
      const parsed = (rows || []).filter(r => r.lat != null && r.lon != null).map(r => ({
        ...r,
        lat: Number(r.lat),
        lon: Number(r.lon),
      }));
      if (parsed.length === 0) {
        // Fallback: fetch recent markers anywhere (bounds may be empty)
       let allRows: any[] = [];
       try {
         allRows = await safeQueryAll(
           db,
           `SELECT 
              id,
              lat AS lat,
              lon AS lon,
              image_uri, species, description, length_cm, weight_kg, created_at
            FROM catches
            WHERE lat IS NOT NULL
              AND lon IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 200`,
           [],
           4,
           300
         );
       } catch (qErr) {
         // handle closed resource / finalize errors gracefully
         console.error("fallback query failed:", qErr);
         allRows = [];
       }
       const allParsed = (allRows || []).map(r => ({ ...r, lat: Number(r.lat), lon: Number(r.lon) }));
        setMarkers(allParsed);
        // If nothing in view, auto-center to first marker once
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
      } else {
        setMarkers(parsed);
      }
    } catch (err) {
      console.error("refreshMarkers error:", err);
      setMarkers([]);
    }
    finally {
     // release lock even on error
     dbQueryLockRef.current = false;
   }
  }, [db, region]);
 
  // call refreshMarkers only when both map and DB are ready
  useEffect(() => {
    if (mapReady && dbReadyRef.current) refreshMarkers();
  }, [mapReady, dbReadyRef.current, refreshMarkers]);

  const zoomOut = () => {
    const factor = 2; // zoom out by increasing deltas
    if (!region) return;
    const newRegion: Region = {
      ...region,
      latitudeDelta: clamp(region.latitudeDelta * factor, 0.0005, 80),
      longitudeDelta: clamp(region.longitudeDelta * factor, 0.0005, 80),
    };
    mapRef.current?.animateToRegion(newRegion, 300);
    setRegion(newRegion);
  };
 
   return (
     <View style={{ flex: 1 }}>
       <ClusteredMapView
         ref={mapRef}
         style={{ flex: 1 }}
         provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
         initialRegion={region} // always provide a valid region to avoid undefined deltas
         showsUserLocation
         onMapReady={() => {
           setMapReady(true);
           refreshMarkers();
           // If we already have the user's location by the time the map is ready,
           // center the map on it immediately (only once).
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
           // merge to preserve deltas if some platforms provide partial region object
           setRegion((prev) => ({
             latitude: newRegion.latitude ?? prev.latitude,
             longitude: newRegion.longitude ?? prev.longitude,
             latitudeDelta: newRegion.latitudeDelta ?? prev.latitudeDelta,
             longitudeDelta: newRegion.longitudeDelta ?? prev.longitudeDelta,
           }));
         }}
         // optional cluster styling
         clusterColor="#0ea5e9"
         clusterTextColor="#ffffff"
         radius={50}
       >
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: Number(m.lat), longitude: Number(m.lon) }}
            tracksViewChanges={false}
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
              {m.image_uri ? (
                <Image source={{ uri: m.image_uri }} style={styles.catchMarkerImage} />
              ) : (
                <Text style={styles.catchMarkerText}>🐟</Text>
              )}
            </View>
          </Marker>
        ))}
      </ClusteredMapView>

      {/* BottomSheet for selected catch */}
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
              
              <Text style={styles.catchSpecies}>{getSpeciesLabel(selectedCatch.species)}</Text>
              {selectedCatch.description && (
                <Text style={styles.catchDescription}>{selectedCatch.description}</Text>
              )}
             {(selectedCatch.length || selectedCatch.weight) && (
               <Text style={styles.catchDescription}>
                 {selectedCatch.length ? `${selectedCatch.length} см` : ""} 
                 {selectedCatch.length && selectedCatch.weight ? " • " : ""}
                 {selectedCatch.weight ? `${selectedCatch.weight} кг` : ""}
               </Text>
             )}
              <Text style={styles.catchDate}>
                {selectedCatch.createdAt 
                  ? new Date(selectedCatch.createdAt).toLocaleDateString('en-GB')
                  : "Недавно"}
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
        <TouchableOpacity
          style={[styles.zoomButtonSmall, styles.zoomButtonSmallBottom]}
          onPress={zoomIn}
        >
          <Text style={styles.zoomTextSmall}>＋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomButton} onPress={centerOnUserLocation}>
          <Text style={styles.zoomText}>◎</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.zoomButtonSmall, styles.zoomButtonLast]} onPress={zoomOut}>
          <Text style={styles.zoomTextSmall}>－</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(2,6,23,0.95)" },
  map: {
    width: "100%",
    height: "100%",
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
    borderRadius: 20,
    backgroundColor: "#0ea5e9",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 5,
  },
  catchMarkerImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    resizeMode: "cover",
  },
  catchMarkerText: {
    fontSize: 20,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0ea5e9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  clusterText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
});