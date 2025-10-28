// MUST be the first import
import "react-native-gesture-handler";

import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useSQLiteContext, type SQLiteDatabase } from "expo-sqlite";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ClusteredMapView from "react-native-map-clustering";
import { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { getSpeciesLabel } from "@/lib/species";

type CatchMarker = {
  id: number;
  lat: number | null;
  lon: number | null;
  image_uri: string | null;
  species: string | null;
  description: string | null;
  created_at: number;
};



async function getCatchesInBounds(
  db: SQLiteDatabase | null | undefined,
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number
): Promise<CatchMarker[]> {
  if (!db || typeof db.getAllAsync !== "function") {
    // DB not ready — return empty list instead of throwing
    return [];
  }
  return db.getAllAsync<CatchMarker>(
    `SELECT 
       id,
       lat AS lat,
       lon AS lon,
       image_uri, species, description, created_at
     FROM catches
     WHERE lat BETWEEN ? AND ?
       AND lon BETWEEN ? AND ?`,
    [minLat, maxLat, minLon, maxLon]
  );
}

export default function Map() {
  const router = useRouter();
  const db = useSQLiteContext(); // may be undefined until provider mounts
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const didCenterRef = useRef(false); // ensure we only auto-center once
  const didFitToDataRef = useRef(false);

  const [markers, setMarkers] = useState<CatchMarker[]>([]);
  const [selectedCatch, setSelectedCatch] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['60%', '80%'], []);
  const [sheetIndex, setSheetIndex] = useState<number>(-1);

  // Default region: New York City (used as initialRegion to avoid forcing controlled re-renders)
  const initialRegion: Region = {
    latitude: 40.7128,
    longitude: -74.0060,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  };
  const [region, setRegion] = useState<Region>(initialRegion);

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
        getCurrentLocation();
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
    const newRegion: Region = {
      ...region,
      latitudeDelta: clamp(region.latitudeDelta * factor, 0.0005, 80),
      longitudeDelta: clamp(region.longitudeDelta * factor, 0.0005, 80),
    };
    mapRef.current?.animateToRegion(newRegion, 300);
    setRegion(newRegion);
  };

    const refreshMarkers = useCallback(async () => {
     if (!db) {
       // don't attempt DB queries if no db
       setMarkers([]);
       return;
     }
     try {
       const minLat = region.latitude - region.latitudeDelta / 2;
       const maxLat = region.latitude + region.latitudeDelta / 2;
       const minLon = region.longitude - region.longitudeDelta / 2;
       const maxLon = region.longitude + region.longitudeDelta / 2;
       const rows = await getCatchesInBounds(db, minLat, minLon, maxLat, maxLon);
       // coerce numeric coords
       const parsed = (rows || []).filter(r => r.lat != null && r.lon != null).map(r => ({
         ...r,
         lat: Number(r.lat),
         lon: Number(r.lon),
       }));
       if (parsed.length === 0) {
         // Fallback: fetch recent markers anywhere (bounds may be empty)
         const allRows = await db.getAllAsync<CatchMarker>(
           `SELECT 
             id,
             lat AS lat,
             lon AS lon,
             image_uri, species, description, created_at
           FROM catches
           WHERE lat IS NOT NULL
             AND lon IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 200`
         );
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
   }, [db, region]);

  useEffect(() => { refreshMarkers(); }, [refreshMarkers]);


  const zoomOut = () => {
    const factor = 2; // zoom out by increasing deltas
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
        initialRegion={initialRegion}
        showsUserLocation
        onMapReady={() => { setMapReady(true); refreshMarkers(); }}
        onRegionChangeComplete={(newRegion) => {
          setRegion(newRegion);
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
                <Image source={{ uri: selectedCatch.imageUrl }} style={styles.catchPreviewImage} />
              )}
              <Text style={styles.catchSpecies}>{getSpeciesLabel(selectedCatch.species)}</Text>
              {selectedCatch.description && (
                <Text style={styles.catchDescription}>{selectedCatch.description}</Text>
              )}
              <Text style={styles.catchDate}>
                {selectedCatch.createdAt?.toDate?.()?.toLocaleDateString() || "Recent"}
              </Text>
            

              
            </View>
          )}
        </BottomSheetView>
      </BottomSheet>

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
    alignItems: "flex-start",  // Changed from "center" to "flex-start" for left alignment
  },
  closeButton: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ff3333ff",
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
    width: 120,
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
    resizeMode: "cover",
  },
  catchSpecies: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  catchDescription: {
    color: "#cccccc",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 4,
  },
  catchDate: {
    color: "#888888",
    fontSize: 12,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
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