import { TextInput } from "@/components/AppText";
import { SelectableOption } from "@/components/onboarding/SelectableOption";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import {
  FishingStyle,
  getPublicCity,
  normalizeOnboardingPreferences,
  OnboardingLocation,
} from "@/lib/onboarding";
import { pb } from "@/lib/pocketbase";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type LocationResult = OnboardingLocation & {
  id: string;
  label: string;
  subtitle: string;
};

type AvatarSelection = {
  uri: string;
  mimeType: string;
  fileName: string;
};

const DEFAULT_ONBOARDING_GOAL = "discover_spots" as const;
const MAX_AVATAR_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function getAvatarExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  return "jpg";
}

export default function Onboarding() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const ru = language === "ru";
  const [step, setStep] = useState(0);
  const [fishingStyles, setFishingStyles] = useState<FishingStyle[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState<AvatarSelection | null>(null);

  const styles = useMemo(() => [
    { id: "spinning" as const, label: ru ? "Спиннинг" : "Spinning" },
    { id: "feeder" as const, label: ru ? "Фидер" : "Feeder" },
    { id: "bobber" as const, label: ru ? "Поплавок" : "Float" },
    { id: "fly" as const, label: ru ? "Нахлыст" : "Fly fishing" },
    { id: "ice" as const, label: ru ? "Зимняя рыбалка" : "Ice fishing" },
    { id: "sea" as const, label: ru ? "Морская рыбалка" : "Sea fishing" },
    { id: "other" as const, label: ru ? "Другое / пока не уверен(а)" : "Other / not sure yet" },
  ], [ru]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (step !== 1 || query.length < 2 || location?.label === query) {
      setLocationResults([]);
      setSearching(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
          `?access_token=${MAPBOX_ACCESS_TOKEN}&types=place,locality,region&autocomplete=true&limit=8&language=${language}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("MAPBOX_SEARCH_FAILED");
        const body = await response.json();
        const results = (body.features ?? []).map((feature: any): LocationResult => {
          const kind = feature.place_type?.[0];
          const regionFromContext = feature.context?.find((item: any) => String(item.id).startsWith("region"))?.text ?? "";
          const country = feature.context?.find((item: any) => String(item.id).startsWith("country"))?.text ?? "";
          const city = kind === "place" || kind === "locality" ? feature.text ?? "" : "";
          const region = kind === "region" ? feature.text ?? "" : regionFromContext;
          return {
            id: String(feature.id),
            label: feature.place_name ?? [city, region, country].filter(Boolean).join(", "),
            subtitle: [region, country].filter(Boolean).join(", "),
            city,
            region,
            country,
            longitude: Array.isArray(feature.center) ? Number(feature.center[0]) : null,
            latitude: Array.isArray(feature.center) ? Number(feature.center[1]) : null,
          };
        });
        setLocationResults(results.filter((item: LocationResult, index: number, all: LocationResult[]) =>
          item.label && all.findIndex((candidate) => candidate.label === item.label) === index
        ));
      } catch {
        setLocationResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [language, location?.label, locationQuery, step]);

  const toggleFishingStyle = (style: FishingStyle) => {
    setFishingStyles((current) => current.includes(style)
      ? current.filter((item) => item !== style)
      : [...current, style]
    );
  };

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const mimeType = (asset.mimeType || "image/jpeg").toLowerCase();
      if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
        Alert.alert(ru ? "Неподдерживаемый файл" : "Unsupported file", ru ? "Выберите изображение JPEG, PNG, WebP или HEIC." : "Choose a JPEG, PNG, WebP, or HEIC image.");
        return;
      }
      if (typeof asset.fileSize === "number" && asset.fileSize > MAX_AVATAR_SIZE_BYTES) {
        Alert.alert(ru ? "Файл слишком большой" : "File too large", ru ? "Выберите изображение размером до 8 МБ." : "Choose an image up to 8 MB.");
        return;
      }

      setAvatar({
        uri: asset.uri,
        mimeType,
        fileName: `avatar.${getAvatarExtension(mimeType)}`,
      });
    } catch {
      Alert.alert(ru ? "Не удалось выбрать фото" : "Could not choose photo", ru ? "Попробуйте ещё раз." : "Please try again.");
    }
  };

  const continueFromStep = () => {
    if (step === 0 && fishingStyles.length === 0) {
      Alert.alert(ru ? "Выберите хотя бы один вариант" : "Choose at least one option");
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  };

  const finishOnboarding = async () => {
    if (!user?.id || saving) return;
    setSaving(true);
    const preferences = normalizeOnboardingPreferences({ primaryGoal: DEFAULT_ONBOARDING_GOAL, fishingStyles, location });
    const payload = {
      user_id: user.id,
      primary_goal: preferences.primaryGoal,
      fishing_styles: preferences.fishingStyles,
      preferred_start_tab: preferences.preferredStartTab,
      location_city: preferences.location.city,
      location_region: preferences.location.region,
      location_country: preferences.location.country,
      location_longitude: preferences.location.longitude,
      location_latitude: preferences.location.latitude,
      language,
    };

    try {
      const publicCity = getPublicCity(preferences.location);
      const savePreferences = async () => {
        const collection = pb.collection("user_onboarding_preferences");
        try {
          return await collection.create(payload);
        } catch (createError: any) {
          if (createError?.status !== 400) throw createError;

          const existing = await collection.getFirstListItem(
            pb.filter("user_id = {:userId}", { userId: user.id }),
            { requestKey: null },
          ).catch((lookupError: any) => {
            if (lookupError?.status === 404) throw createError;
            throw lookupError;
          });
          return collection.update(existing.id, payload);
        }
      };

      const saveUser = async () => {
        if (!avatar) {
          return pb.collection("users").update(user.id, {
            city: publicCity,
            onboarding_pending: false,
          });
        }

        const formData = new FormData();
        formData.append("city", publicCity);
        formData.append("onboarding_pending", "false");
        formData.append("avatar", {
          uri: avatar.uri,
          name: avatar.fileName,
          type: avatar.mimeType,
        } as any);
        return pb.collection("users").update(user.id, formData);
      };

      const [userResult, preferencesResult] = await Promise.allSettled([saveUser(), savePreferences()]);
      if (userResult.status === "rejected" || preferencesResult.status === "rejected") {
        if (userResult.status === "fulfilled" && preferencesResult.status === "rejected") {
          try {
            const restoredUser = await pb.collection("users").update(user.id, { onboarding_pending: true });
            pb.authStore.save(pb.authStore.token, restoredUser);
          } catch {}
        }
        if (userResult.status === "rejected") throw userResult.reason;
        if (preferencesResult.status === "rejected") throw preferencesResult.reason;
      }

      const updatedUser = userResult.value;
      pb.authStore.save(pb.authStore.token, updatedUser);
      router.replace("/(tabs)" as any);
    } catch {
      Alert.alert(
        ru ? "Не удалось сохранить" : "Could not save",
        ru ? "Проверьте подключение и попробуйте ещё раз." : "Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const title = step === 0
    ? (ru ? "Какую рыбалку вы любите?" : "What kind of fishing do you enjoy?")
    : step === 1
      ? (ru ? "Где вы обычно рыбачите?" : "Where do you usually fish?")
      : (ru ? "Добавьте фото профиля" : "Add a profile photo");

  const subtitle = step === 0
    ? (ru ? "Можно выбрать несколько вариантов." : "Select as many as you like.")
    : step === 1
      ? (ru ? "Необязательно · ваш город будет виден всем в профиле." : "Optional · your city will be public on your profile.")
      : (ru ? "Необязательно · фото можно изменить позже." : "Optional · you can change it later.");

  const existingAvatarUrl = user?.avatar
    ? `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}?thumb=300x300`
    : null;
  const avatarPreviewUri = avatar?.uri ?? existingAvatarUrl;

  return (
    <SafeAreaView style={screenStyles.safeArea}>
      <KeyboardAvoidingView style={screenStyles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={screenStyles.header}>
          <View style={screenStyles.progressRow} accessibilityLabel={`${step + 1} / 3`}>
            {[0, 1, 2].map((index) => <View key={index} style={[screenStyles.progressPill, index <= step && screenStyles.progressPillFilled]} />)}
          </View>
          <Text style={screenStyles.title}>{title}</Text>
          <Text style={screenStyles.subtitle}>{subtitle}</Text>
        </View>

        <View style={screenStyles.content}>
          {step === 0 ? (
            <FlatList
              data={styles}
              keyExtractor={(item) => item.id}
              contentContainerStyle={screenStyles.optionList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <SelectableOption key={item.id} label={item.label} selected={fishingStyles.includes(item.id)} onPress={() => toggleFishingStyle(item.id)} />
              )}
            />
          ) : step === 1 ? (
            <View style={screenStyles.locationContent}>
              <View style={screenStyles.searchBox}>
                <Ionicons name="search-outline" size={19} color={theme.colors.text.secondary} />
                <TextInput
                  style={screenStyles.searchInput}
                  value={locationQuery}
                  onChangeText={(value) => { setLocationQuery(value); setLocation(null); }}
                  placeholder={ru ? "Город или регион" : "City or region"}
                  placeholderTextColor={theme.colors.text.muted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  keyboardAppearance="dark"
                  returnKeyType="search"
                  accessibilityLabel={ru ? "Поиск города или региона" : "Search city or region"}
                />
                {searching ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
              </View>

              {location ? (
                <View style={screenStyles.selectedLocation}>
                  <Ionicons name="location-sharp" size={20} color={theme.colors.primary} />
                  <Text style={screenStyles.selectedLocationText} numberOfLines={2}>{location.label}</Text>
                  <Pressable onPress={() => { setLocation(null); setLocationQuery(""); }} hitSlop={8} accessibilityLabel={ru ? "Убрать место" : "Remove location"}>
                    <Ionicons name="close-circle" size={22} color={theme.colors.text.muted} />
                  </Pressable>
                </View>
              ) : (
                <FlatList
                  data={locationResults}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={screenStyles.results}
                  renderItem={({ item }) => (
                    <Pressable
                      style={screenStyles.resultRow}
                      onPress={() => { setLocation(item); setLocationQuery(item.label); setLocationResults([]); }}
                    >
                      {({ pressed }) => (
                        <View style={[screenStyles.resultCard, pressed && screenStyles.resultPressed]}>
                          <View style={screenStyles.resultCopy}>
                            <Text style={screenStyles.resultTitle}>{item.city || item.region}</Text>
                            <Text style={screenStyles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  )}
                />
              )}

            </View>
          ) : (
            <View style={screenStyles.avatarContent}>
              <Pressable
                style={screenStyles.avatarPicker}
                onPress={pickAvatar}
                accessibilityRole="button"
                accessibilityLabel={ru ? "Выбрать фото профиля" : "Choose profile photo"}
              >
                {avatarPreviewUri ? (
                  <Image source={{ uri: avatarPreviewUri }} style={screenStyles.avatarImage} contentFit="cover" />
                ) : (
                  <View style={screenStyles.avatarPlaceholder}>
                    <Ionicons name="person" size={72} color={theme.colors.text.muted} />
                  </View>
                )}
                <View style={screenStyles.avatarEditBadge}>
                  <Ionicons name="camera" size={22} color="#ffffff" />
                </View>
              </Pressable>

              <Pressable style={screenStyles.choosePhotoButton} onPress={pickAvatar} accessibilityRole="button">
                <Ionicons name="image-outline" size={20} color={theme.colors.primary} />
                <Text style={screenStyles.choosePhotoText}>
                  {avatarPreviewUri ? (ru ? "Изменить фото" : "Change photo") : (ru ? "Выбрать фото" : "Choose photo")}
                </Text>
              </Pressable>
              <Text style={screenStyles.avatarPrivacyText}>
                {ru ? "Фото будет видно другим пользователям в вашем профиле и публикациях." : "Other anglers will see this photo on your profile and posts."}
              </Text>
            </View>
          )}
        </View>

        <View style={screenStyles.footer}>
          {step > 0 ? (
            <Pressable style={screenStyles.backButton} onPress={() => setStep((current) => current - 1)} disabled={saving}>
              <Ionicons name="arrow-back" size={20} color={theme.colors.text.secondary} />
              <Text style={screenStyles.backText}>{ru ? "Назад" : "Back"}</Text>
            </Pressable>
          ) : <View />}
          <Pressable
            style={[screenStyles.continueButton, saving && screenStyles.disabled]}
            onPress={step === 2 ? finishOnboarding : continueFromStep}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#ffffff" /> : (
              <>
                <Text style={screenStyles.continueText}>{step === 2 ? (ru ? "Готово" : "Finish") : (ru ? "Продолжить" : "Continue")}</Text>
                <Ionicons name={step === 2 ? "checkmark" : "arrow-forward"} size={20} color="#ffffff" />
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 28 },
  progressPill: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceRaised },
  progressPillFilled: { backgroundColor: theme.colors.primary },
  title: { color: theme.colors.text.primary, fontFamily: theme.fonts.displaySemibold, fontSize: 30, lineHeight: 36 },
  subtitle: { color: theme.colors.text.secondary, fontSize: 14, lineHeight: 21, marginTop: 8 },
  content: { flex: 1, paddingHorizontal: 24 },
  optionList: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 10,
    paddingBottom: 16,
  },
  locationContent: { flex: 1 },
  searchBox: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control },
  searchInput: { flex: 1, color: theme.colors.text.primary, fontSize: 16, paddingVertical: 12 },
  results: { width: "100%", flexDirection: "column", gap: 8, paddingTop: 10, paddingBottom: 12 },
  resultRow: { width: "100%" },
  resultCard: { width: "100%", minHeight: 62, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control },
  resultPressed: { backgroundColor: theme.colors.surface },
  resultCopy: { flex: 1 },
  resultTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "600" },
  resultSubtitle: { color: theme.colors.text.muted, fontSize: 12, marginTop: 3 },
  selectedLocation: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, padding: 14, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryMuted },
  selectedLocationText: { flex: 1, color: "#ffffff", fontSize: 15, fontWeight: "600" },
  avatarContent: { flex: 1, alignItems: "center", paddingTop: 28 },
  avatarPicker: { width: 172, height: 172, borderRadius: 86, position: "relative" },
  avatarImage: { width: 172, height: 172, borderRadius: 86, backgroundColor: theme.colors.surface },
  avatarPlaceholder: { width: 172, height: 172, borderRadius: 86, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  avatarEditBadge: { position: "absolute", right: 4, bottom: 8, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: theme.colors.background, backgroundColor: theme.colors.primaryDark },
  choosePhotoButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 28, paddingHorizontal: 18, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border },
  choosePhotoText: { color: theme.colors.text.primary, fontSize: 14, fontWeight: "700" },
  avatarPrivacyText: { maxWidth: 300, marginTop: 16, color: theme.colors.text.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  footer: { minHeight: 82, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  backButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 4 },
  backText: { color: theme.colors.text.secondary, fontSize: 15, fontWeight: "600" },
  continueButton: { minWidth: 142, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 22, borderRadius: theme.radius.control, backgroundColor: theme.colors.primaryDark },
  continueText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});
