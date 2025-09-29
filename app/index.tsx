
import "react-native-gesture-handler"; // MUST be first
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { distanceBetween, geohashQueryBounds } from "geofire-common";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapViewWithClustering from 'react-native-map-clustering'; // Add this import
import { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { firestore } from "../lib/firebase";
import { useCatches } from "../lib/useCatches";


let regionQueryTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchForRegion(region: Region, setPoints: (pts: any[]) => void) {
  // center + approximate radius (meters)
  const center: [number, number] = [region.latitude, region.longitude];
  // approximate radius: half of the larger delta in degrees -> meters
  const radiusInM = (Math.max(region.latitudeDelta, region.longitudeDelta) * 111000) / 2;

  // geohash range bounds
  const bounds = geohashQueryBounds(center, radiusInM);
  const collectionRef = collection(firestore, "catches");

  try {
    const prom = bounds.map((b) => {
      const q = query(collectionRef, where("geohash", ">=", b[0]), where("geohash", "<=", b[1]));
      return getDocs(q);
    });

    const snaps = await Promise.all(prom);
    const matches: any[] = [];
    snaps.forEach((snap) => {
      snap.forEach((doc) => {
        const data = doc.data() as any;
        if (data.lat == null || data.lon == null) return;
        const dkm = distanceBetween([data.lat, data.lon], center); // km
        if (dkm * 1000 <= radiusInM) {
          matches.push({ id: doc.id, ...data });
        }
      });
    });

    // optionally dedupe and sort; then set state
    setPoints(matches);
  } catch (e) {
    console.error("fetchForRegion error", e);
    setPoints([]);
  }
}

// Example usage inside your onRegionChangeComplete handler with simple debounce
function onRegionChangeComplete(region: Region, setPoints: (pts: any[]) => void) {
  if (regionQueryTimer) clearTimeout(regionQueryTimer);
  regionQueryTimer = setTimeout(() => {
    fetchForRegion(region, setPoints);
  }, 350); // 300–500ms debounce to reduce reads
}

// Add species data (same as in add.tsx)
const fishSpecies = [
  { id: "pike", label: "Щука", image: require("../assets/fishicons/schuka.420x420.png") },
  { id: "perch", label: "Окунь", image: require("../assets/fishicons/perch.png") },
  { id: "carp", label: "Карп", image: require("../assets/fishicons/carp.png") },
  { id: "pikeperch", label: "Берш", image: require("../assets/fishicons/pikeperch.png") },
];

const moreSpecies = [
  { id: "shchuka", label: "Щука" }, { id: "okun", label: "Окунь" }, { id: "sudak", label: "Судак" },
  { id: "karp", label: "Карп" }, { id: "leshch", label: "Лещ" }, { id: "nalim", label: "Налим" },
  { id: "som", label: "Сом" }, { id: "forel", label: "Форель" }, { id: "sig", label: "Сиг" },
  { id: "kharius", label: "Хариус" }, { id: "gustera", label: "Густера" }, { id: "karas", label: "Карась" },
  { id: "lin", label: "Линь" }, { id: "golavl", label: "Голавль" }, { id: "yaz", label: "Язь" },
  { id: "plotva", label: "Плотва" }, { id: "sazan", label: "Сазан" },
  { id: "rotan", label: "Ротан" },
  { id: "peskar", label: "Пескарь" }, { id: "ukleya", label: "Уклея" },
];

// Add helper function
const getSpeciesLabel = (id: string | null) => {
  if (!id) return null;
  return [...fishSpecies, ...moreSpecies].find((s) => s.id === id)?.label || id;
};

export default function Map() {
  const router = useRouter();
  const mapRef = useRef<any>(null);
  const { catches, loading } = useCatches(50);
  const [selectedCatch, setSelectedCatch] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['60%', '80%'], []);


  const [region, setRegion] = useState<Region>({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [points, setPoints] = useState<any[]>([]);

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

      // center map on user location immediately (make user location the default)
      const userRegion: Region = {
        latitude: newUserLoc.latitude,
        longitude: newUserLoc.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      // animate if map is ready
      if (mapRef.current) {
        try {
          mapRef.current.animateToRegion(userRegion, 800);
        } catch (e) {
          // ignore animation errors on some platforms/emulators
        }
      }

      // keep region state in sync
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
      <MapViewWithClustering 
        ref={(r) => { mapRef.current = r; }}
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        showsUserLocation={true}
        showsMyLocationButton={true}
        zoomControlEnabled={true}
        onRegionChangeComplete={(r) => {
          setRegion(r);
          onRegionChangeComplete(r, setPoints);
        }}
      >
        {catches.map((catch_item) => {
          if (catch_item.lat == null || catch_item.lon == null) return null;
          const item = {
            id: catch_item.id,
            imageUrl: catch_item.imageUrl,
            species: catch_item.species,
            description: catch_item.description,
            createdAt: catch_item.createdAt,
          };
          return (
            <Marker
              key={catch_item.id}
              coordinate={{ latitude: catch_item.lat!, longitude: catch_item.lon! }}
              onPress={() => setSelectedCatch(item)}
            >
              <View style={styles.catchMarker}>
                {catch_item.imageUrl ? (
                  <Image source={{ uri: catch_item.imageUrl }} style={styles.catchMarkerImage} />
                ) : (
                  <Text style={styles.catchMarkerText}>🐟</Text>
                )}
              </View>
            </Marker>
          );
        })}
      </MapViewWithClustering>

      {/* BottomSheet for selected catch */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={(index) => {
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
              <Text style={styles.catchSpecies}>{getSpeciesLabel(selectedCatch.species) || "Unknown species"}</Text>  
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
      <View style={styles.controlsContainer}>
        {/* Zoom controls */}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
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
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#071023",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  zoomButtonSmallBottom: {
    marginBottom: 0,
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
    shadowRadius: 3,
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
    backgroundColor: "rgba(0, 0, 0, 0.8)",  // Semi-transparent background
    justifyContent: "center",  // Center content vertically
    alignItems: "center",  // Center content horizontally
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
    backgroundColor: "#ff4444",
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
    left: 12,
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
    marginBottom: 8,
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