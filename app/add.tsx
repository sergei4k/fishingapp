import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from "expo-image-picker";
import Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import { useSQLiteContext } from 'expo-sqlite';
import { geohashForLocation } from "geofire-common";
import React, { useState } from "react";
import {
  ActionSheetIOS,
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
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

// **SAFER** Helper function to save a catch to local storage
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
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const KEY = "local_catches_v1";
    const raw = await AsyncStorage.getItem(KEY);
    let list: any[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) {
        console.warn("Could not parse local catches, starting fresh.", e);
        list = [];
      }
    }
    list = list.filter(i => i && typeof i === 'object' && i.id);
    list = list.filter((i) => i.id !== item.id);
    list.unshift(item);
    const MAX_ITEMS = 200;
    if (list.length > MAX_ITEMS) list = list.slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch (err) {
    console.error("addCatch error", err);
  }
}

type NewCatch = {
  imageUri: string | null;
  extraUris: string[];
  description: string;
  lengthCm: number | null;
  weightKg: number | null;
  species: string | null;
  lat: number | null;
  lon: number | null;
};


export default function Add() {
  const db = useSQLiteContext();

  const [image, setImage] = useState<string | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [length, setLength] = useState("");
  const [weight, setWeight] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [moreModalVisible, setMoreModalVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageCoords, setImageCoords] = useState<{ lat: number; lon: number } | null>(null);
  const router = useRouter();


  // SQLiteProvider in app/_layout.tsx initializes the DB and creates tables.
  // Here we only use the provided `db` via useSQLiteContext().
  // If db is not available at runtime, inserts will fail (handled below).
 
  // helper to run exec on provider-backed db, throws if no db available
  // note: expo-sqlite's execAsync accepts a single SQL string parameter,
  // so we substitute `?` placeholders with escaped values before calling it.
  const runSql = async (sql: string, params: any[] = []) => {
    if (!db || typeof db.execAsync !== "function") throw new Error("no sqlite db available");

    // If there are no params just run the SQL directly.
    if (!params || params.length === 0) {
      return db.execAsync(sql);
    }

    // Replace each `?` with the next parameter (simple escaping).
    let idx = 0;
    const finalSql = sql.replace(/\?/g, () => {
      const p = params[idx++];
      if (p === null || p === undefined) return "NULL";
      if (typeof p === "number") return String(p);
      if (typeof p === "boolean") return p ? "1" : "0";
      // Escape single quotes for strings
      const s = String(p).replace(/'/g, "''");
      return `'${s}'`;
    });

    return db.execAsync(finalSql);
  };

 const pickImageAndGetGps = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
      selectionLimit: 1,
      exif: true,
    });

    if (!result.canceled && result.assets?.[0]?.assetId) {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(result.assets[0].assetId);
      if (assetInfo.location) {
        console.log('lat:', assetInfo.location.latitude, 'lng:', assetInfo.location.longitude);
        setImage(result.assets[0].uri);
        // optionally store coords for later
        // setImageCoords({ lat: assetInfo.location.latitude, lon: assetInfo.location.longitude });
      } else {
        setImage(result.assets[0].uri);
      }
    } // ← closes the outer if
 }; // ← closes the function

const addMultiplePhotos = async () => {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    selectionLimit: 10, // adjust as needed
    quality: 1,
  });
  if (!res.canceled && res.assets?.length) {
    setExtraPhotos(prev => [...prev, ...res.assets.map(a => a.uri)]);
  }
};
  
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

  const openMore = () => {
    if (Platform.OS === "ios") {
      const options = moreSpecies.map((s) => s.label).concat("Отмена");
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1 }, (buttonIndex) => {
        if (buttonIndex < moreSpecies.length) setSelectedSpecies(moreSpecies[buttonIndex].id);
      });
    } else {
      setMoreModalVisible(true);
    }
  };

  const selectMoreSpecies = (id: string) => {
    setSelectedSpecies(id);
    setMoreModalVisible(false);
  };

  const getSpeciesLabel = (id: string | null) => {
    if (!id) return null;
    return [...fishSpecies, ...moreSpecies].find((s) => s.id === id)?.label || id;
  };

  const handleUpload = async () => {
    setIsUploading(true);
    try {
      let lat: number | null = null,
        lon: number | null = null,
        geohash: string | null = null;

      // prefer coordinates from picked image, fallback to device location
      if (imageCoords) {
        lat = imageCoords.lat;
        lon = imageCoords.lon;
      } else {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const pos = await Location.getCurrentPositionAsync({});
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
          }
        } catch (e) {
          console.warn("location request failed", e);
        }
      }

      if (lat != null && lon != null) {
        try {
          geohash = geohashForLocation([lat, lon]);
        } catch {}
      }

      // insert into sqlite if available, otherwise fallback to AsyncStorage addCatch
      if (!db || typeof db.execAsync !== "function") {
        throw new Error("SQLite database is not available. Cannot save catch.");
      }

      let insertedId: number | null = null;
      try {
        const lengthNum = length ? Number(length) : null;
        const weightNum = weight ? Number(weight) : null;
        const createdAt = Date.now();

        const res = await runSql(
          `INSERT INTO catches (image_uri, description, length_cm, weight_kg, species, lat, lon, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [image ?? null, description || null, lengthNum, weightNum, selectedSpecies ?? null, lat, lon, createdAt]
        );
        // execAsync may return an object with insertId or an array — try both
        {
          const anyRes = res as any;
          const maybeInsertId =
            (anyRes != null && anyRes.insertId != null)
              ? anyRes.insertId
              : (Array.isArray(anyRes) && anyRes[0] && anyRes[0].insertId)
                ? anyRes[0].insertId
                : undefined;
          insertedId = typeof maybeInsertId !== "undefined" ? maybeInsertId : null;
        }

        if (insertedId != null && extraPhotos.length > 0) {
          for (const uri of extraPhotos) {
            try {
              await runSql(`INSERT INTO extra_photos (catch_id, uri) VALUES (?, ?);`, [insertedId, uri]);
            } catch (e) {
              console.warn("insert extra photo failed", e);
            }
          }
        }
      } catch (e) {
        console.error("sqlite insert failed:", e);
        Alert.alert("Ошибка", "Не удалось сохранить запись в SQLite.");
        setIsUploading(false);
        return;
      }

      // no fallback to AsyncStorage — purely SQLite-backed now

      Toast.show({ type: "success", text1: "Успешно", text2: "Запись добавлена." });
      router.push("/profile");

      setImage(null);
      setExtraPhotos([]);
      setDescription("");
      setLength("");
      setWeight("");
      setSelectedSpecies(null);
      setImageCoords(null);

    } catch (e: any) {
      console.error("handleUpload error", e);
      Toast.show({ type: "error", text1: "Ошибка", text2: e.message || "Не удалось сохранить" });
    } finally {

      setExtraPhotos([]);

      setIsUploading(false);
    }
  
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.imageRow}>
            <TouchableOpacity onPress={pickImageAndGetGps} style={styles.photoBox}>
              {image ? (<ExpoImage source={{ uri: image }} style={styles.photo} />) :
              <Text style={styles.placeholderText}>Добавить фото</Text>}
            </TouchableOpacity>
          <View style={styles.rightColumn}>
            <TouchableOpacity onPress={addMultiplePhotos} style={styles.plusButton}><Text style={styles.plusText}>+</Text></TouchableOpacity>
            <View style={styles.extraThumbs}>
              {extraPhotos.slice(0, 3).map((uri, i) => (
                <ExpoImage key={i} source={{ uri }} style={styles.extraThumb} />
              ))}
              {extraPhotos.length > 3 && <View style={styles.moreBadge}><Text style={styles.moreBadgeText}>+{extraPhotos.length - 3}</Text></View>}
            </View>
          </View>
        </View>

        <View style={styles.inputs}>
          <TextInput style={styles.descriptionInput} placeholder="Описание" placeholderTextColor="#94a3b8" value={description} onChangeText={setDescription} multiline />
          <TextInput style={styles.input} placeholder="Длина (см)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={length} onChangeText={setLength} />
          <TextInput style={styles.input} placeholder="Вес (кг)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={weight} onChangeText={setWeight} />
        </View>

        <View style={styles.speciesWrapper}>
          <Text style={styles.speciesTitle}>Вид</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speciesContainer}>
            {fishSpecies.map((s) => (
              <TouchableOpacity key={s.id} style={[styles.speciesItem, selectedSpecies === s.id && styles.speciesItemSelected]} onPress={() => setSelectedSpecies(s.id)}>
                <Image source={s.image} style={styles.speciesImage} />
                <Text style={styles.speciesLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.moreButton} onPress={openMore}><Text style={styles.moreText}>Ещё</Text></TouchableOpacity>
          </ScrollView>
          <Text style={styles.selectedSpeciesText}>{selectedSpecies ? `Выбран: ${getSpeciesLabel(selectedSpecies)}` : "Вид не выбран"}</Text>
        </View>

        <TouchableOpacity style={[styles.uploadBtn, isUploading && { opacity: 0.7 }]} onPress={handleUpload} disabled={isUploading}>
          <Text style={styles.uploadBtnText}>{isUploading ? "Загрузка..." : "Выложить"}</Text>
        </TouchableOpacity>

        <Modal visible={moreModalVisible} animationType="slide" transparent={true} onRequestClose={() => setMoreModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.speciesTitle}>Выберите вид</Text>
              <ScrollView>
                {moreSpecies.map((s) => (
                  <Pressable key={s.id} onPress={() => selectMoreSpecies(s.id)} style={({ pressed }) => [styles.modalItem, pressed && { backgroundColor: "#061420" }]}>
                    <Text style={styles.modalItemText}>{s.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalClose} onPress={() => setMoreModalVisible(false)}><Text style={styles.moreText}>Отмена</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#0f172a", padding: 16, alignItems: "center" },
  imageRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  photoBox: { width: 200, height: 160, backgroundColor: "#0b1220", alignItems: "center", justifyContent: "center", borderRadius: 8, overflow: "hidden" },
  placeholderText: { color: "#94a3b8", fontSize: 16, textAlign: "center" },
  photo: { width: 160, height: 160, resizeMode: "cover" },
  rightColumn: { marginLeft: 12, alignItems: "center" },
  plusButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#06202b", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  plusText: { color: "#60a5fa", fontSize: 24, lineHeight: 24 },
  extraThumbs: { flexDirection: "row", alignItems: "center" },
  extraThumb: { width: 40, height: 40, marginRight: 6, borderRadius: 4, resizeMode: "cover" },
  moreBadge: { width: 40, height: 40, borderRadius: 4, backgroundColor: "#072033", alignItems: "center", justifyContent: "center" },
  moreBadgeText: { color: "#60a5fa" },
  inputs: { width: "100%", marginBottom: 12 },
  descriptionInput: { backgroundColor: "#071023", color: "#ffffff", borderColor: "#1f2937", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, minHeight: 70, textAlignVertical: "top" },
  input: { backgroundColor: "#071023", color: "#ffffff", borderColor: "#1f2937", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  speciesWrapper: { width: "100%", marginBottom: 16 },
  speciesTitle: { color: "#cfe8ff", marginBottom: 8, marginLeft: 4 },
  speciesContainer: { paddingHorizontal: 4, alignItems: "center" },
  speciesItem: { width: 90, marginRight: 12, alignItems: "center", padding: 6, borderRadius: 8, backgroundColor: "#071023" },
  speciesItemSelected: { borderWidth: 2, borderColor: "#60a5fa", backgroundColor: "#092032" },
  speciesImage: { width: 64, height: 64, marginBottom: 6, resizeMode: "contain" },
  speciesLabel: { color: "#e6eef8", fontSize: 12, textAlign: "center" },
  moreButton: { width: 64, height: 64, marginRight: 12, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#06202b" },
  moreText: { color: "#60a5fa", fontWeight: "700" },
  selectedSpeciesText: { color: "#cfe8ff", marginTop: 8, marginLeft: 6 },
  uploadBtn: { backgroundColor: "#0ea5e9", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  uploadBtnText: { color: "#001219", fontWeight: "700", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#071023", borderRadius: 12, maxHeight: "80%", padding: 12 },
  modalItem: { paddingVertical: 12, paddingHorizontal: 8, borderBottomColor: "#0b1220", borderBottomWidth: 1 },
  modalItemText: { color: "#e6eef8", fontSize: 16 },
  modalClose: { marginTop: 8, alignSelf: "flex-end", padding: 8 },
});