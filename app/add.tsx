import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { geohashForLocation } from "geofire-common";
import React, { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Toast from "react-native-toast-message";
import AuthScreen from "../components/AuthScreen";
import { extractGpsFromUri } from "../lib/exif";
import { firestore } from "../lib/firebase";
import { uploadImageAndSaveCatch } from "../lib/firebaseHelpers";
import { useAuth } from "../lib/useAuth";

export default function Add() {
  const { user, loading: authLoading } = useAuth();
  const [image, setImage] = useState<string | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]); // <-- new
  const [description, setDescription] = useState("");
  const [length, setLength] = useState("");
  const [weight, setWeight] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [moreModalVisible, setMoreModalVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageCoords, setImageCoords] = useState<{ lat: number; lon: number } | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Please grant photo library permission to add a photo."
        );
      }
    })();
  }, []);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        exif: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setImage(asset.uri);
        // try to extract coords from EXIF (expo returns asset.exif when exif:true)
        const coords = exifToLatLon(asset.exif);
        if (coords) setImageCoords(coords);
      }
    } catch (e) {
      console.error("Image pick error", e);
    }
  };

  // add extra photo (appends to extraPhotos)
  const addExtraPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        exif: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setExtraPhotos((p) => [...p, asset.uri]);
        // optional: you could collect coords per extra photo if needed
      }
    } catch (e) {
      console.error("Add extra photo error", e);
    }
  };

  const fishSpecies = [
    { id: "pike", label: "Щука", image: require("../assets/fishicons/schuka.420x420.png") },
    { id: "perch", label: "Окунь", image: require("../assets/fishicons/perch.png") },
    { id: "carp", label: "Карп", image: require("../assets/fishicons/carp.png") },
    { id: "pikeperch", label: "Берш", image: require("../assets/fishicons/pikeperch.png") },
  ];

  // 20 common freshwater species in Russian for the "More" popup
  const moreSpecies = [
    { id: "shchuka", label: "Щука" },
    { id: "okun", label: "Окунь" },
    { id: "sudak", label: "Судак" },
    { id: "karp", label: "Карп" },
    { id: "leshch", label: "Лещ" },
    { id: "nalim", label: "Налим" },
    { id: "som", label: "Сом" },
    { id: "forel", label: "Форель" },
    { id: "sig", label: "Сиг" },
    { id: "kharius", label: "Хариус" },
    { id: "gustera", label: "Густера" },
    { id: "karas", label: "Карась" },
    { id: "lin", label: "Линь" },
    { id: "golavl", label: "Голавль" },
    { id: "yaz", label: "Язь" },
    { id: "plotva", label: "Плотва" },
    { id: "sazan", label: "Сазан" },
    { id: "rotan", label: "Ротан" },
    { id: "peskar", label: "Пескарь" },
    { id: "ukleya", label: "Уклея" },
  ];

  const openMore = () => {
    if (Platform.OS === "ios") {
      const options = moreSpecies.map((s) => s.label).concat("Отмена");
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
        },
        (buttonIndex) => {
          if (buttonIndex >= 0 && buttonIndex < moreSpecies.length) {
            setSelectedSpecies(moreSpecies[buttonIndex].id);
          }
        }
      );
      return;
    }
    setMoreModalVisible(true);
  };

  const selectMoreSpecies = (id: string) => {
    setSelectedSpecies(id);
    setMoreModalVisible(false);
  };

  const getSpeciesLabel = (id: string | null) => {
    if (!id) return null;
    const found = fishSpecies.find((s) => s.id === id) || moreSpecies.find((s) => s.id === id);
    return found ? found.label : id;
  };

  const handleUpload = async () => {
    try {
      // try to get uid from current user context, fallback to auth instance after waiting
      let uid: string | null = user?.uid ?? null;

      // if we don't have a uid yet, wait briefly for auth state change (covers anonymous sign-in)
      if (!uid) {
        const authInstance = getAuth();
        if (!authInstance.currentUser) {
          await new Promise<void>((resolve) => {
            const unsub = onAuthStateChanged(authInstance, (u) => {
              if (u) {
                unsub();
                resolve();
              }
            });
          });
        }
        uid = getAuth().currentUser?.uid ?? null;
      }

      if (!uid) {
        throw new Error("User not authenticated");
      }

      // mark upload started
      setIsUploading(true);

      // prefer EXIF coords from image if available
      let lat: number | null = null;
      let lon: number | null = null;
      let geohash: string | null = null;

      if (image) {
        const imgGps = await extractGpsFromUri(image).catch(() => null);
        if (imgGps) {
          lat = imgGps.lat;
          lon = imgGps.lon;
          geohash = imgGps.geohash;
        }
      }

      // fallback to device location if EXIF missing
      if (lat == null || lon == null) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        }
      }

      // upload image + create Firestore doc; pass lat/lon/geohash in meta
      if (image) {
        const docId = await uploadImageAndSaveCatch({
          imageUri: image,
          lat,
          lon,
          meta: {
            species: selectedSpecies ?? undefined,
            description,
            length,
            weight,
            visibility: "public",
            geohash: geohash ?? undefined,
          },
          userId: uid,
        });

        console.log("uploaded catch docId:", docId, "coords:", { lat, lon, geohash });
      } else {
        // create a Firestore doc even without image
        const geohash = lat != null && lon != null ? geohashForLocation([lat, lon]) : null;
        const docRef = await addDoc(collection(firestore, "catches"), {
          imageUrl: null,
          thumbUrl: null,
          lat,
          lon,
          geohash,
          species: selectedSpecies ?? null,
          description,
          length,
          weight,
          visibility: "public",
          userId: uid,
          createdAt: serverTimestamp(),
        });
        console.log("Firestore doc created (no image) id:", docRef.id);
      }

      // show success toast (Russian) and navigate
      Toast.show({
        type: "success",
        text1: "Успешно",
        text2: "Запись успешно добавлена.",
        position: "bottom",
      });

      // also keep local copy for offline / profile list
      const item = {
        id: Date.now().toString(),
        image,
        extraPhotos,
        description,
        length,
        weight,
        species: selectedSpecies,
        date: new Date().toISOString(),
      };
      try {
        await addCatch(item);
      } catch (err) {
        console.error("addCatch error", err);
        Alert.alert("Local storage error", String(err));
      }

      // reset form
      setImage(null);
      setExtraPhotos([]);
      setDescription("");
      setLength("");
      setWeight("");
      setSelectedSpecies(null);

      // navigate after success
      router.push("/profile");
    } catch (e) {
      console.error("handleUpload error", e);
      Toast.show({
        type: "error",
        text1: "Ошибка",
        text2: String(e),
        position: "bottom",
      });
    } finally {
      // allow button again
      setIsUploading(false);
    }
  };

  // Show auth screen if not logged in
  if (authLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "#fff" }}>Загрузка...</Text>
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* top-level wrapper with pointerEvents box-none so siblings can receive touches */}
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32, backgroundColor: "#0f172a", flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={{ alignItems: "center", justifyContent: "flex-start" }}>
            {/* image row with small plus button to the right */}
            <View style={styles.imageRow}>
              <TouchableOpacity onPress={pickImage} style={styles.photoBox}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.photo} />
                ) : (
                  <Text style={styles.placeholderText}>Добавить фото</Text>
                )}
              </TouchableOpacity>

              <View style={styles.rightColumn}>
                <TouchableOpacity onPress={addExtraPhoto} style={styles.plusButton}>
                  <Text style={styles.plusText}>+</Text>
                </TouchableOpacity>

                {/* show small thumbnails of extra photos (if any) */}
                <View style={styles.extraThumbs}>
                  {extraPhotos.slice(0, 3).map((uri, i) => (
                    <Image key={i} source={{ uri }} style={styles.extraThumb} />
                  ))}
                  {extraPhotos.length > 3 && (
                    <View style={styles.moreBadge}>
                      <Text style={styles.moreBadgeText}>+{extraPhotos.length - 3}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* moved description + length + weight below the image */}
            <View style={styles.inputs}>
              <TextInput
                style={styles.descriptionInput}
                placeholder="Описание"
                placeholderTextColor="#94a3b8"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <TextInput
                style={styles.input}
                placeholder="Длина (см)"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={length}
                onChangeText={setLength}
              />
              <TextInput
                style={styles.input}
                placeholder="Вес (кг)"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={weight}
                onChangeText={setWeight}
              />
            </View>

            {/* Horizontal species selector (stays with page content but won't be pushed out) */}
            <View style={styles.speciesWrapper}>
              <Text style={styles.speciesTitle}>Вид</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.speciesContainer}
              >
                {fishSpecies.map((s) => {
                  const selected = selectedSpecies === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.speciesItem, selected && styles.speciesItemSelected]}
                      onPress={() => setSelectedSpecies(s.id)}
                    >
                      <Image source={s.image} style={styles.speciesImage} />
                      <Text style={styles.speciesLabel}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}

                {/* More button */}
                <TouchableOpacity style={styles.moreButton} onPress={openMore}>
                  <Text style={styles.moreText}>Ещё</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Selected species label shown below the horizontal selector */}
              {selectedSpecies ? (
                <Text style={styles.selectedSpeciesText}>
                  Выбранный вид: {getSpeciesLabel(selectedSpecies)}
                </Text>
              ) : (
                <Text style={styles.selectedSpeciesText}>Вид не выбран</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.uploadBtn, isUploading && { opacity: 0.7 }]}
              onPress={handleUpload}
              disabled={isUploading}
            >
              <Text style={styles.uploadBtnText}>{isUploading ? "Загрузка..." : "Выложить"}</Text>
            </TouchableOpacity>
          </View>

          {/* Modal for Android / others */}
          <Modal
            visible={moreModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setMoreModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.speciesTitle}>Выберите вид</Text>
                <ScrollView>
                  {moreSpecies.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => selectMoreSpecies(s.id)}
                      style={({ pressed }) => [
                        styles.modalItem,
                        pressed && { backgroundColor: "#061420" },
                      ]}
                    >
                      <Text style={styles.modalItemText}>{s.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={styles.modalClose}
                  onPress={() => setMoreModalVisible(false)}
                >
                  <Text style={styles.moreText}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 16,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  imageRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  photoBox: {
    width: 160,
    height: 160,
    backgroundColor: "#0b1220",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    overflow: "hidden",
  },
  placeholderText: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
  },
  photo: {
    width: 160,
    height: 160,
    resizeMode: "cover",
  },
  rightColumn: {
    marginLeft: 12,
    alignItems: "center",
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#06202b",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  plusText: {
    color: "#60a5fa",
    fontSize: 24,
    lineHeight: 24,
  },
  extraThumbs: {
    flexDirection: "row",
    alignItems: "center",
  },
  extraThumb: {
    width: 40,
    height: 40,
    marginRight: 6,
    borderRadius: 4,
    resizeMode: "cover",
  },
  moreBadge: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: "#072033",
    alignItems: "center",
    justifyContent: "center",
  },
  moreBadgeText: {
    color: "#60a5fa",
  },

  inputs: {
    width: "100%",
    marginBottom: 12,
  },
  descriptionInput: {
    backgroundColor: "#071023",
    color: "#ffffff",
    borderColor: "#1f2937",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    minHeight: 70,
    textAlignVertical: "top",
  },
  input: {
    backgroundColor: "#071023",
    color: "#ffffff",
    borderColor: "#1f2937",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  speciesWrapper: {
    width: "100%",
    marginBottom: 16,
  },
  speciesTitle: {
    color: "#cfe8ff",
    marginBottom: 8,
    marginLeft: 4,
  },
  speciesContainer: {
    paddingHorizontal: 4,
    alignItems: "center",
  },
  speciesItem: {
    width: 90,
    marginRight: 12,
    alignItems: "center",
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#071023",
  },
  speciesItemSelected: {
    borderWidth: 2,
    borderColor: "#60a5fa",
    backgroundColor: "#092032",
  },
  speciesImage: {
    width: 64,
    height: 64,
    marginBottom: 6,
    resizeMode: "contain",
  },
  speciesLabel: {
    color: "#e6eef8",
    fontSize: 12,
    textAlign: "center",
  },
  moreButton: {
    width: 64,
    height: 64,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#06202b",
  },
  moreText: {
    color: "#60a5fa",
    fontWeight: "700",
  },
  selectedSpeciesText: {
    color: "#cfe8ff",
    marginTop: 8,
    marginLeft: 6,
  },
  uploadBtn: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  uploadBtnText: {
    color: "#001219",
    fontWeight: "700",
    textAlign: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#071023",
    borderRadius: 12,
    maxHeight: "80%",
    padding: 12,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomColor: "#0b1220",
    borderBottomWidth: 1,
  },
  modalItemText: {
    color: "#e6eef8",
    fontSize: 16,
  },
  modalClose: {
    marginTop: 8,
    alignSelf: "flex-end",
    padding: 8,
  },
});

async function addCatch(item: {
    id: string;
    image: string | null;
    extraPhotos: string[];
    description: string;
    length: string;
    weight: string;
    species: string | null;
    date: string;
}): Promise<void> {
    try {
        // dynamic import so we don't need to add a top-level import in this file
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        const KEY = "local_catches_v1";

        const raw = await AsyncStorage.getItem(KEY);
        let list: typeof item[] = [];

        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) list = parsed;
            } catch {
                list = [];
            }
        }

        // ensure no duplicate ids, newest first
        list = list.filter((i) => i.id !== item.id);
        list.unshift(item);

        // keep a reasonable cap to avoid unbounded storage growth
        const MAX_ITEMS = 200;
        if (list.length > MAX_ITEMS) list = list.slice(0, MAX_ITEMS);

        await AsyncStorage.setItem(KEY, JSON.stringify(list));
    } catch (err) {
        console.error("addCatch error", err);
        throw err;
    }
}

function exifToLatLon(exif: Record<string, any> | null | undefined) {
    if (!exif) return null;

    const getKey = (...keys: string[]) => {
        for (const k of keys) {
            if (exif[k] !== undefined && exif[k] !== null) return exif[k];
        }
        return null;
    };

    const latRaw = getKey("GPSLatitude", "Latitude", "latitude", "Lat");
    const lonRaw = getKey("GPSLongitude", "Longitude", "longitude", "Lon");
    const latRef = getKey("GPSLatitudeRef", "LatitudeRef", "latitudeRef", "LatRef");
    const lonRef = getKey("GPSLongitudeRef", "LongitudeRef", "longitudeRef", "LonRef");

    if (!latRaw || !lonRaw) return null;

    const toNum = (v: any): number | null => {
        if (v == null) return null;
        if (typeof v === "number") return v;
        if (typeof v === "string") {
            if (v.includes("/")) {
                const [n, d] = v.split("/").map((s) => s.trim());
                const ni = Number(n);
                const di = Number(d) || 1;
                return Number.isFinite(ni) ? ni / di : null;
            }
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        }
        if (Array.isArray(v)) return null;
        if (typeof v === "object") {
            if ("numerator" in v && "denominator" in v) {
                const ni = Number(v.numerator);
                const di = Number(v.denominator) || 1;
                return Number.isFinite(ni) ? ni / di : null;
            }
            if ("value" in v && typeof v.value === "number") return v.value;
        }
        return null;
    };

    const parseDMS = (raw: any): number | null => {
        if (Array.isArray(raw)) {
            const parts = raw.map(toNum);
            if (parts.some((p) => p == null)) return null;
            const [d = 0, m = 0, s = 0] = parts as number[];
            return d + m / 60 + s / 3600;
        }
        if (typeof raw === "string" && raw.includes(",")) {
            const parts = raw.split(",").map((p) => p.trim());
            const nums = parts.map((p) => toNum(p));
            if (nums.some((n) => n == null)) return null;
            const [d = 0, m = 0, s = 0] = nums as number[];
            return d + m / 60 + s / 3600;
        }
        const single = toNum(raw);
        return single;
    };

    const lat = parseDMS(latRaw);
    const lon = parseDMS(lonRaw);
    if (lat == null || lon == null) return null;

    const applyRef = (val: number, ref: any, positiveRefs: string[]) => {
        if (!ref) return val;
        const r = String(ref).trim().toUpperCase();
        if (!positiveRefs.includes(r) && (r === "S" || r === "W" || r.startsWith("S") || r.startsWith("W") || r.includes("SOUTH") || r.includes("WEST"))) {
            return -Math.abs(val);
        }
        return val;
    };

    let finalLat = applyRef(lat, latRef, ["N", "NORTH"]);
    let finalLon = applyRef(lon, lonRef, ["E", "EAST"]);

    if (!Number.isFinite(finalLat) || !Number.isFinite(finalLon)) return null;

    return { lat: finalLat, lon: finalLon };
}

