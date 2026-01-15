import AsyncStorage from "@react-native-async-storage/async-storage";
import ExifParser from 'exif-parser';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system/next';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from "expo-router";
import { useSQLiteContext } from 'expo-sqlite';
import React, { useState } from "react";
import { useLanguage } from "@/lib/language";
import { getSpeciesLabel as getSpeciesLabelTranslated, getSpeciesOptions } from "@/lib/species";
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
import { SafeAreaView } from "react-native-safe-area-context";

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

export default function Add() {
  const db = useSQLiteContext();
  const { language, t } = useLanguage();

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

  const runSql = async (sql: string, params: any[] = []) => {
    if (!db || typeof db.execAsync !== "function") throw new Error("no sqlite db available");

    if (!params || params.length === 0) {
      return db.execAsync(sql);
    }

    let idx = 0;
    const finalSql = sql.replace(/\?/g, () => {
      const p = params[idx++];
      if (p === null || p === undefined) return "NULL";
      if (typeof p === "number") return String(p);
      if (typeof p === "boolean") return p ? "1" : "0";
      const s = String(p).replace(/'/g, "''");
      return `'${s}'`;
    });

    return db.execAsync(finalSql);
  };

  const pickImageAndGetGps = async () => {
    try {
      // Pick image using DocumentPicker
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const pickedFile = result.assets?.[0];
      if (!pickedFile) return;

      setImage(pickedFile.uri);

      // Read file using new expo-file-system/next API
      const file = new File(pickedFile.uri);
      const fileBytes = await file.bytes();
      
      // Convert Uint8Array to ArrayBuffer for EXIF parser
      const arrayBuffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength
      );

      // Parse EXIF
      const parser = ExifParser.create(arrayBuffer);
      const exifResult = parser.parse();

      if (__DEV__) {
        console.log("EXIF result:", exifResult);
      }

      let coords: { lat: number; lon: number } | null = null;
      const tags = exifResult.tags;

      if (tags && tags.GPSLatitude && tags.GPSLongitude) {
        let lat = tags.GPSLatitude;
        let lon = tags.GPSLongitude;
        if (tags.GPSLatitudeRef === 'S') lat = -Math.abs(lat);
        if (tags.GPSLongitudeRef === 'W') lon = -Math.abs(lon);
        if (lat !== 0 || lon !== 0) {
          if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            coords = { lat, lon };
            if (__DEV__) {
              console.log("SUCCESS from EXIF:", coords);
            }
          }
        }
      }

      if (coords) {
        setImageCoords(coords);
      } else {
        setImageCoords(null);
        Alert.alert(
          t("gpsNotFound"),
          t("gpsNotFoundMessage")
        );
      }
    } catch (error: any) {
      console.error("Picker/EXIF error:", error);
      Alert.alert(t("error"), t("photoError"));
    }
  };

  const fishSpecies = [
    { id: "pike", image: require("../assets/fishicons/schuka.420x420.png") },
    { id: "perch", image: require("../assets/fishicons/perch.png") },
    { id: "carp", image: require("../assets/fishicons/carp.png") },
    { id: "pikeperch", image: require("../assets/fishicons/pikeperch.png") },
  ];

  const allSpeciesOptions = getSpeciesOptions(language);
  const moreSpecies = allSpeciesOptions.filter(s => !fishSpecies.find(f => f.id === s.id));

  const openMore = () => {
    if (Platform.OS === "ios") {
      const options = moreSpecies.map((s) => s.label).concat(t("cancel"));
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

  const handleUpload = async () => {
    setIsUploading(true);
    try {
      if (!imageCoords || imageCoords.lat == null || imageCoords.lon == null) {
        Alert.alert(
          t("noCoordinatesInPhoto"),
          t("noCoordinatesInPhotoMessage")
        );
        setIsUploading(false);
        return;
      }

      const lat = imageCoords.lat;
      const lon = imageCoords.lon;

      if (!db || typeof db.execAsync !== "function") {
        throw new Error("SQLite database is not available.");
      }

      const lengthNum = length ? Number(length) : null;
      const weightNum = weight ? Number(weight) : null;
      const createdAt = Date.now();

      await runSql(
        `INSERT INTO catches (image_uri, description, length_cm, weight_kg, species, lat, lon, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [image ?? null, description || null, lengthNum, weightNum, selectedSpecies ?? null, lat, lon, createdAt]
      );

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
      Alert.alert(t("error"), t("uploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#0f172a" }}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
        <ScrollView
          style={{ flex: 1, backgroundColor: "#0f172a" }}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.imageRow}>
            <TouchableOpacity onPress={pickImageAndGetGps} style={styles.photoBox}>
              {image ? (<ExpoImage source={{ uri: image }} style={styles.photo} />) :
              <Text style={styles.placeholderText}>{t("addPhoto")}</Text>}
            </TouchableOpacity>
            <View style={styles.rightColumn}>
              <View style={styles.extraThumbs}>
                {extraPhotos.slice(0, 3).map((uri, i) => (
                  <ExpoImage key={i} source={{ uri }} style={styles.extraThumb} />
                ))}
                {extraPhotos.length > 3 && <View style={styles.moreBadge}><Text style={styles.moreBadgeText}>+{extraPhotos.length - 3}</Text></View>}
              </View>
            </View>
          </View>

          {imageCoords && (
            <Text style={styles.speciesLabel}>
              📍 {imageCoords.lat.toFixed(5)}, {imageCoords.lon.toFixed(5)}
            </Text>
          )}

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
              keyboardType="numeric"
              returnKeyType='done'
              value={length}
              onChangeText={setLength}
              keyboardAppearance="dark"
            />
            <TextInput
              style={styles.input}
              placeholder={t("weightPlaceholder")}
              placeholderTextColor="#94a3b8"
              returnKeyType="done"
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
              keyboardAppearance="dark"
            />
          </View>

          <View style={styles.speciesWrapper}>
            <Text style={styles.speciesTitle}>{t("species")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speciesContainer}>
              {fishSpecies.map((s) => {
                const speciesOption = allSpeciesOptions.find(opt => opt.id === s.id);
                return (
                  <TouchableOpacity key={s.id} style={[styles.speciesItem, selectedSpecies === s.id && styles.speciesItemSelected]} onPress={() => setSelectedSpecies(s.id)}>
                    <Image source={s.image} style={styles.speciesImage} />
                    <Text style={styles.speciesLabel}>{speciesOption?.label || s.id}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.moreButton} onPress={openMore}><Text style={styles.moreText}>{t("more")}</Text></TouchableOpacity>
            </ScrollView>
            <Text style={styles.selectedSpeciesText}>{selectedSpecies ? `${t("selectedSpecies")}: ${getSpeciesLabelTranslated(selectedSpecies, language)}` : t("speciesNotSelected")}</Text>
          </View>

          <TouchableOpacity style={[styles.uploadBtn, isUploading && { opacity: 0.7 }]} onPress={handleUpload} disabled={isUploading}>
            <Text style={styles.uploadBtnText}>{isUploading ? t("uploading") : t("upload")}</Text>
          </TouchableOpacity>

          <Modal visible={moreModalVisible} animationType="slide" transparent={true} onRequestClose={() => setMoreModalVisible(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.speciesTitle}>{t("selectSpecies")}</Text>
                <ScrollView>
                  {moreSpecies.map((s) => (
                    <Pressable key={s.id} onPress={() => selectMoreSpecies(s.id)} style={({ pressed }) => [styles.modalItem, pressed && { backgroundColor: "#061420" }]}>
                      <Text style={styles.modalItemText}>{s.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <TouchableOpacity style={styles.modalClose} onPress={() => setMoreModalVisible(false)}><Text style={styles.moreText}>{t("cancel")}</Text></TouchableOpacity>
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
  photo: { width: 160, height: 160 },
  rightColumn: { marginLeft: 12, alignItems: "center" },
  extraThumbs: { flexDirection: "row", alignItems: "center" },
  extraThumb: { width: 40, height: 40, marginRight: 6, borderRadius: 4 },
  moreBadge: { width: 40, height: 40, borderRadius: 4, backgroundColor: "#072033", alignItems: "center", justifyContent: "center" },
  moreBadgeText: { color: "#60a5fa" },
  coordsText: { color: "#22c55e", fontSize: 12, marginBottom: 12 },
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
  uploadBtn: { backgroundColor: "#0077b6", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  uploadBtnText: { color: "#ffffff", fontWeight: "700", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#071023", borderRadius: 12, maxHeight: "80%", padding: 12 },
  modalItem: { paddingVertical: 12, paddingHorizontal: 8, borderBottomColor: "#0b1220", borderBottomWidth: 1 },
  modalItemText: { color: "#e6eef8", fontSize: 16 },
  modalClose: { marginTop: 8, alignSelf: "flex-end", padding: 8 },
});