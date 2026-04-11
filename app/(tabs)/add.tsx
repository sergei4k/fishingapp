import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { addCatch } from "@/lib/storage";
import ExifParser from 'exif-parser';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system/next';
import { Image as ExpoImage } from 'expo-image';
import { FontAwesome } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Add() {
  const { language, t } = useLanguage();
  const { user } = useAuth();

  const [image, setImage] = useState<string | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [length, setLength] = useState("");
  const [weight, setWeight] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [moreModalVisible, setMoreModalVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [imageCoords, setImageCoords] = useState<{ lat: number; lon: number } | null>(null);
  const router = useRouter();

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

  const pickExtraPhoto = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setExtraPhotos(prev => [...prev, asset.uri]);
    } catch (e) {
      console.error('Extra photo error:', e);
    }
  };

  const removeExtraPhoto = (index: number) => {
    setExtraPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const fishSpecies = [
    { id: "pike", image: require("../../assets/fishicons/schuka.420x420.png") },
    { id: "perch", image: require("../../assets/fishicons/perch.png") },
    { id: "carp", image: require("../../assets/fishicons/carp.png") },
    { id: "pikeperch", image: require("../../assets/fishicons/pikeperch.png") },
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

      const lengthNum = length ? Number(length) : null;
      const weightNum = weight ? Number(weight) : null;
      const createdAt = Date.now();

      let pbImageUrl: string | undefined;
      let pbRecordId: string | undefined;

      // Always upload to PocketBase for backup (public or private)
      if (user) {
        try {
          const formData = new FormData();
          formData.append('user_id', user.id);
          formData.append('species', selectedSpecies ?? '');
          formData.append('lat', String(lat));
          formData.append('lon', String(lon));
          formData.append('description', description || '');
          if (lengthNum != null) formData.append('length_cm', String(lengthNum));
          if (weightNum != null) formData.append('weight_kg', String(weightNum));
          formData.append('created_at', String(createdAt));
          formData.append('is_public', isPublic ? 'true' : 'false');

          if (image) {
            formData.append('image', {
              uri: image,
              name: 'catch.jpg',
              type: 'image/jpeg',
            } as any);
          }

          const record = await pb.collection('catches').create(formData);
          pbRecordId = record.id;

          if (record.image) {
            pbImageUrl = pb.files.getURL(record, record.image);
          }
        } catch (e) {
          console.warn('PocketBase sync failed:', e);
        }
      }

      // Always copy to permanent local storage so image loads offline
      let localImageUri = image;
      if (image) {
        try {
          const dest = new File(Paths.document, `catch_${createdAt}.jpg`);
          new File(image).copy(dest);
          localImageUri = dest.uri;
        } catch (e) {
          console.warn('Failed to copy image to permanent storage:', e);
        }
      }

      const persistedExtraPhotos: string[] = [];
      for (let i = 0; i < extraPhotos.length; i++) {
        try {
          const dest = new File(Paths.document, `catch_${createdAt}_extra_${i}.jpg`);
          new File(extraPhotos[i]).copy(dest);
          persistedExtraPhotos.push(dest.uri);
        } catch (e) {
          persistedExtraPhotos.push(extraPhotos[i]);
        }
      }

      await addCatch({
        id: pbRecordId ?? String(createdAt),
        image: localImageUri ?? undefined,
        pbImageUrl: pbImageUrl,
        extraPhotos: persistedExtraPhotos,
        description: description || '',
        length: lengthNum != null ? String(lengthNum) : '',
        weight: weightNum != null ? String(weightNum) : '',
        species: selectedSpecies ?? undefined,
        date: new Date(createdAt).toISOString(),
        lat,
        lon,
        isPublic,
      });

      router.push("/profile");

      setImage(null);
      setExtraPhotos([]);
      setDescription("");
      setLength("");
      setWeight("");
      setSelectedSpecies(null);
      setImageCoords(null);
      setIsPublic(false);

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
              {extraPhotos.slice(0, 5).map((uri, i) => (
                <View key={i} style={styles.extraThumbWrapper}>
                  <ExpoImage source={{ uri }} style={styles.extraThumb} contentFit="cover" />
                  <TouchableOpacity style={styles.removeThumbBtn} onPress={() => removeExtraPhoto(i)}>
                    <FontAwesome name="times" size={9} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {extraPhotos.length < 5 && (
                <TouchableOpacity style={styles.addExtraBtn} onPress={pickExtraPhoto}>
                  <FontAwesome name="plus" size={16} color="#64748b" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {imageCoords && (
            <Text style={styles.coordsText}>
              📍 {imageCoords.lat.toFixed(4)}, {imageCoords.lon.toFixed(4)}
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

          <View style={styles.publicRow}>
            <View>
              <Text style={styles.publicLabel}>{t("makePublic")}</Text>
              <Text style={styles.publicSub}>{t("makePublicSub")}</Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: "#1f2937", true: "#0ea5e9" }}
              thumbColor="#ffffff"
            />
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
  rightColumn: { marginLeft: 10, flexDirection: "column", gap: 6 },
  extraThumbWrapper: { position: "relative" },
  extraThumb: { width: 56, height: 56, borderRadius: 6 },
  removeThumbBtn: { position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
  addExtraBtn: { width: 56, height: 56, borderRadius: 6, backgroundColor: "#071023", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#1f2937" },
  coordsText: { color: "#ffffff", fontSize: 14, marginBottom: 14, padding: 10 },
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
  publicRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#071023", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  publicLabel: { color: "#e6eef8", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  publicSub: { color: "#64748b", fontSize: 12 },
  uploadBtn: { backgroundColor: "#0077b6", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  uploadBtnText: { color: "#ffffff", fontWeight: "700", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#071023", borderRadius: 12, maxHeight: "80%", padding: 12 },
  modalItem: { paddingVertical: 26, paddingHorizontal: 16, borderBottomColor: "#0b1220", borderBottomWidth: 1 },
  modalItemText: { color: "#e6eef8", fontSize: 17 },
  modalClose: { marginTop: 8, alignSelf: "flex-end", padding: 8 },
});