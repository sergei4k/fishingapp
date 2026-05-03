import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { parseBadges } from "@/lib/badges";
import { addCatch } from "@/lib/storage";
import ExifParser from 'exif-parser';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system/next';
import { Image as ExpoImage } from 'expo-image';
import { FontAwesome6 as FontAwesome } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { useLanguage } from "@/lib/language";
import { getSpeciesLabel as getSpeciesLabelTranslated, getSpeciesOptions } from "@/lib/species";
import { getGearOptions, getGearLabel, GEAR_CATEGORY_COLOR, GEAR_CATEGORY_ICON } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import {
    Alert,
    FlatList,
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

import speciesPhotoMap from "@/lib/speciesPhotos";

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
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [selectedGear, setSelectedGear] = useState<string | null>(null);
  const [gearModalVisible, setGearModalVisible] = useState(false);
  const [gearSearch, setGearSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [imageCoords, setImageCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [waterBody, setWaterBody] = useState<string | null>(null);
  const [detectingWater, setDetectingWater] = useState(false);
  const router = useRouter();

  const detectWaterBody = async (lat: number, lon: number) => {
    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;
    setDetectingWater(true);
    setWaterBody(null);
    try {
      const lang = language === "ru" ? "ru" : "en";
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&types=poi,place,locality&language=${lang}&limit=5`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.features?.length) return;
      const waterRe = /lake|river|sea|ocean|bay|pond|creek|stream|reservoir|gulf|fjord|strait|canal|озеро|река|море|залив|пруд|водохранилище|ручей|канал|бухта/i;
      const match = data.features.find((f: any) =>
        waterRe.test(f.text ?? '') || waterRe.test(f.place_name ?? '')
      );
      if (match) {
        setWaterBody(match.text);
      }
    } catch (e) {
      // silent — water body is optional info
    } finally {
      setDetectingWater(false);
    }
  };

  const pickImageAndGetGps = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const pickedFile = result.assets?.[0];
      if (!pickedFile) return;

      setImage(pickedFile.uri);

      const file = new File(pickedFile.uri);
      const fileBytes = await file.bytes();

      const arrayBuffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength
      );

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
        detectWaterBody(coords.lat, coords.lon);
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
    { id: "pike", image: require("../../assets/fishicons/pike.png") },
    { id: "perch", image: require("../../assets/fishicons/perch.png") },
    { id: "carp", image: require("../../assets/fishicons/carp.png") },
    { id: "pikeperch", image: require("../../assets/fishicons/pikeperch.png") },
  ];

  const allSpeciesOptions = getSpeciesOptions(language);
  const moreSpecies = allSpeciesOptions;
  const filteredMoreSpecies = speciesSearch.trim()
    ? moreSpecies.filter(s => {
        const q = speciesSearch.toLowerCase();
        return s.labelRu.toLowerCase().includes(q) ||
               s.labelEn.toLowerCase().includes(q) ||
               s.scientificName.toLowerCase().includes(q);
      })
    : moreSpecies;

  const openMore = () => {
    setMoreModalVisible(true);
  };

  const selectMoreSpecies = (id: string) => {
    setSelectedSpecies(id);
    setMoreModalVisible(false);
    setSpeciesSearch("");
  };

  const allGearOptions = getGearOptions(language);
  const filteredGearOptions = gearSearch.trim()
    ? allGearOptions.filter(g => {
        const q = gearSearch.toLowerCase();
        return g.labelRu.toLowerCase().includes(q) ||
               g.labelEn.toLowerCase().includes(q);
      })
    : allGearOptions;

  const featuredGear = ["vobler", "spoon", "vrashchalka", "silikon"].map(id =>
    allGearOptions.find(g => g.id === id)!
  ).filter(Boolean);

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
          formData.append('gear', selectedGear ?? '');
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

          // Grant "rybolov" badge on first catch
          const existingBadges = parseBadges(user.badges);
          if (!existingBadges.includes("rybolov")) {
            const catchCount = await pb.collection("catches").getList(1, 1, {
              filter: `user_id = "${user.id}"`,
              requestKey: null,
            });
            if (catchCount.totalItems === 1) {
              const newBadges = [...existingBadges, "rybolov"];
              await pb.collection("users").update(user.id, { badges: newBadges });
              pb.authStore.save(pb.authStore.token, { ...pb.authStore.record!, badges: newBadges });
            }
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
        gear: selectedGear ?? undefined,
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
      setSelectedGear(null);
      setImageCoords(null);
      setWaterBody(null);
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
                    <FontAwesome name="xmark" size={9} color="#fff" />
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
            <View style={styles.locationRow}>
              <FontAwesome name="location-dot" size={13} color="#60a5fa" style={{ marginRight: 6 }} />
              <Text style={styles.coordsText}>
                {imageCoords.lat.toFixed(4)}, {imageCoords.lon.toFixed(4)}
              </Text>
              {(detectingWater || waterBody) && (
                <View style={styles.waterBadge}>
                  <FontAwesome name="droplet" size={11} color="#38bdf8" style={{ marginRight: 4 }} />
                  <Text style={styles.waterBadgeText}>
                    {detectingWater ? t("detectingWater") : waterBody}
                  </Text>
                </View>
              )}
            </View>
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

          {/* Gear selector */}
          <View style={styles.speciesWrapper}>
            <Text style={styles.speciesTitle}>{t("gear")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speciesContainer}>
              {featuredGear.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.speciesItem, selectedGear === g.id && styles.speciesItemSelected]}
                  onPress={() => setSelectedGear(g.id)}
                >
                  {gearPhotos[g.id] ? (
                    <ExpoImage source={gearPhotos[g.id]} style={styles.speciesImage} contentFit="contain" />
                  ) : (
                    <View style={[styles.gearIconBox, { borderColor: GEAR_CATEGORY_COLOR[g.category] }]}>
                      <FontAwesome name={GEAR_CATEGORY_ICON[g.category] as any} size={28} color={GEAR_CATEGORY_COLOR[g.category]} />
                    </View>
                  )}
                  <Text style={styles.speciesLabel}>{g.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.moreButton} onPress={() => setGearModalVisible(true)}>
                <Text style={styles.moreText}>{t("more")}</Text>
              </TouchableOpacity>
            </ScrollView>
            <Text style={styles.selectedSpeciesText}>
              {selectedGear ? `${t("selectedGear")}: ${getGearLabel(selectedGear, language)}` : t("gearNotSelected")}
            </Text>
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

          <Modal
            visible={moreModalVisible}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={() => { setMoreModalVisible(false); setSpeciesSearch(""); }}
          >
            <SafeAreaView style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.speciesTitle}>{t("selectSpecies")}</Text>
                  <TouchableOpacity onPress={() => { setMoreModalVisible(false); setSpeciesSearch(""); }} hitSlop={8}>
                    <FontAwesome name="xmark" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <View style={styles.searchRow}>
                  <FontAwesome name="magnifying-glass" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={language === "ru" ? "Поиск..." : "Search..."}
                    placeholderTextColor="#475569"
                    value={speciesSearch}
                    onChangeText={setSpeciesSearch}
                    autoCorrect={false}
                    keyboardAppearance="dark"
                    clearButtonMode="while-editing"
                  />
                </View>
                <FlatList
                  data={filteredMoreSpecies}
                  keyExtractor={(s) => s.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: s }) => (
                    <Pressable
                      key={s.id}
                      onPress={() => selectMoreSpecies(s.id)}
                      style={({ pressed }) => pressed ? { backgroundColor: "#061420" } : undefined}
                    >
                      <View style={styles.modalItem}>
                        {speciesPhotoMap[s.id] ? (
                          <ExpoImage source={speciesPhotoMap[s.id]} style={styles.modalItemImage} contentFit="contain" />
                        ) : (
                          <View style={styles.modalItemImagePlaceholder}>
                            <FontAwesome name="question" size={20} color="#334155" />
                          </View>
                        )}
                        <View style={styles.modalItemLeft}>
                          <Text style={styles.modalItemText}>{s.label}</Text>
                          <Text style={styles.modalItemScientific}>{s.scientificName}</Text>
                        </View>
                      </View>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <Text style={{ color: "#475569", textAlign: "center", paddingVertical: 24 }}>
                      {language === "ru" ? "Ничего не найдено" : "No results"}
                    </Text>
                  }
                />
              </View>
            </SafeAreaView>
          </Modal>

          {/* Gear modal */}
          <Modal
            visible={gearModalVisible}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={() => { setGearModalVisible(false); setGearSearch(""); }}
          >
            <SafeAreaView style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.speciesTitle}>{t("selectGear")}</Text>
                  <TouchableOpacity onPress={() => { setGearModalVisible(false); setGearSearch(""); }} hitSlop={8}>
                    <FontAwesome name="xmark" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <View style={styles.searchRow}>
                  <FontAwesome name="magnifying-glass" size={14} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={language === "ru" ? "Поиск..." : "Search..."}
                    placeholderTextColor="#475569"
                    value={gearSearch}
                    onChangeText={setGearSearch}
                    autoCorrect={false}
                    keyboardAppearance="dark"
                    clearButtonMode="while-editing"
                  />
                </View>
                <FlatList
                  data={filteredGearOptions}
                  keyExtractor={(g) => g.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: g }) => (
                    <Pressable
                      onPress={() => { setSelectedGear(g.id); setGearModalVisible(false); setGearSearch(""); }}
                      style={({ pressed }) => pressed ? { backgroundColor: "#061420" } : undefined}
                    >
                      <View style={styles.modalItem}>
                        {gearPhotos[g.id] ? (
                          <ExpoImage source={gearPhotos[g.id]} style={styles.modalItemImage} contentFit="contain" />
                        ) : (
                          <View style={[styles.modalItemImagePlaceholder, { backgroundColor: "#0f2236", borderWidth: 1.5, borderColor: GEAR_CATEGORY_COLOR[g.category] }]}>
                            <FontAwesome name={GEAR_CATEGORY_ICON[g.category] as any} size={22} color={GEAR_CATEGORY_COLOR[g.category]} />
                          </View>
                        )}
                        <View style={styles.modalItemLeft}>
                          <Text style={styles.modalItemText}>{g.label}</Text>
                          <Text style={[styles.modalItemScientific, { color: GEAR_CATEGORY_COLOR[g.category] }]}>
                            {t(g.category === "lure" ? "gearCategoryLure" : g.category === "bait" ? "gearCategoryBait" : "gearCategoryRig")}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <Text style={{ color: "#475569", textAlign: "center", paddingVertical: 24 }}>
                      {language === "ru" ? "Ничего не найдено" : "No results"}
                    </Text>
                  }
                />
              </View>
            </SafeAreaView>
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
  coordsText: { color: "#94a3b8", fontSize: 13 },
  inputs: { width: "100%", marginBottom: 12 },
  descriptionInput: { backgroundColor: "#071023", color: "#ffffff", borderColor: "#1f2937", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, minHeight: 70, textAlignVertical: "top" },
  input: { backgroundColor: "#071023", color: "#ffffff", borderColor: "#1f2937", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  speciesWrapper: { width: "100%", marginBottom: 16 },
  speciesTitle: { color: "#cfe8ff", marginBottom: 8, marginLeft: 4 },
  speciesContainer: { paddingHorizontal: 4, alignItems: "center" },
  speciesItem: { width: 90, marginRight: 12, alignItems: "center", padding: 6, borderRadius: 8, backgroundColor: "#071023" },
  speciesItemSelected: { borderWidth: 2, borderColor: "#60a5fa", backgroundColor: "#092032" },
  speciesImage: { width: 64, height: 64, marginBottom: 6, resizeMode: "contain" },
  gearIconBox: { width: 64, height: 64, marginBottom: 6, borderRadius: 12, backgroundColor: "#0f2236", alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  speciesLabel: { color: "#e6eef8", fontSize: 12, textAlign: "center" },
  moreButton: { width: 64, height: 64, marginRight: 12, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#06202b" },
  moreText: { color: "#60a5fa", fontWeight: "700" },
  selectedSpeciesText: { color: "#cfe8ff", marginTop: 8, marginLeft: 6 },
  publicRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#071023", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  publicLabel: { color: "#e6eef8", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  publicSub: { color: "#64748b", fontSize: 12 },
  uploadBtn: { backgroundColor: "#0077b6", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  uploadBtnText: { color: "#ffffff", fontWeight: "700", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "#071023" },
  modalContent: { flex: 1, paddingTop: 8, paddingBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f2236", borderRadius: 10, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, color: "#e6eef8", fontSize: 15, padding: 0 },
  modalItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, borderBottomColor: "#0b1220", borderBottomWidth: 1, gap: 12 },
  modalItemLeft: { flex: 1 },
  modalItemText: { color: "#e6eef8", fontSize: 16 },
  modalItemScientific: { color: "#94a3b8", fontSize: 13, fontStyle: "italic", marginTop: 3 },
  modalItemImage: { width: 52, height: 52, resizeMode: "contain", flexShrink: 0 },
  modalItemImagePlaceholder: { width: 52, height: 52, borderRadius: 8, backgroundColor: "#0f2236", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalClose: { marginTop: 8, alignSelf: "flex-end", padding: 8 },
  locationRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", width: "100%", marginBottom: 14, paddingHorizontal: 4, gap: 8 },
  waterBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#0c2d48", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  waterBadgeText: { color: "#38bdf8", fontSize: 13 },
});
