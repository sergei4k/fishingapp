import { useAuth } from "@/lib/auth";
import { theme } from '../../lib/theme';
import { pb } from "@/lib/pocketbase";
import { usePurchases } from "@/lib/purchases";
import SignInPrompt from "@/components/SignInPrompt";
import { useLanguage, type Language } from "@/lib/language";
import { parseBadges } from "@/lib/badges";
import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { getUpgradeCopy } from "@/lib/upgradeCopy";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type LocationResult = {
  id: string;
  label: string;
  city: string;
  country: string;
  subtitle: string;
};

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { signOut, user } = useAuth();
  const { enabled: purchasesEnabled, isPro, presentPaywall, restore, manageSubscription } = usePurchases();
  const insets = useSafeAreaInsets();
  const safeTop = insets.top;
  const [restoring, setRestoring] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationSaved, setLocationSaved] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(
    user?.avatar ? `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}?thumb=200x200` : null
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [name, setName] = useState<string>(user?.name ?? "");
  const [username, setUsername] = useState<string>(user?.username ?? "");
  const [profileInitialized, setProfileInitialized] = useState(!!user?.id);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [location, setLocation] = useState<string>(user?.city ?? "");
  const [bio, setBio] = useState<string>(user?.bio ?? "");
  const [bioInitialized, setBioInitialized] = useState(!!user?.id);
  const [savingBio, setSavingBio] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [pushTokenStatus, setPushTokenStatus] = useState<string>("checking…");

  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
  const showPurchases = Platform.OS !== "ios" && purchasesEnabled;
  const upgradeCopy = getUpgradeCopy(language);
  const notificationsEnabled = pushTokenStatus.startsWith("OK:");
  const notificationsChecking = pushTokenStatus === "checking…";

  useEffect(() => {
    if (!profileInitialized && user?.id) {
      setName(user.name ?? "");
      setUsername(user.username ?? "");
      setLocation(user.city ?? "");
      setProfileInitialized(true);
    }
  }, [user?.id, user?.city, user?.name, user?.username, profileInitialized]);

  useEffect(() => {
    if (!locationModalVisible) return;
    const q = locationQuery.trim();
    if (q.length < 2) {
      setLocationResults([]);
      setSearchingLocation(false);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?access_token=${MAPBOX_ACCESS_TOKEN}&types=place,locality&autocomplete=true&limit=8&language=${language}`;
        const res = await fetch(url);
        const json = await res.json();
        const results: LocationResult[] = (json.features ?? []).map((feature: any) => {
          const country = feature.context?.find((c: any) => String(c.id).startsWith("country"))?.text ?? "";
          const city = feature.text ?? "";
          const label = [city, country].filter(Boolean).join(", ") || feature.place_name;
          return {
            id: feature.id,
            label,
            city,
            country,
            subtitle: feature.place_name ?? label,
          };
        }).filter((item: LocationResult, index: number, arr: LocationResult[]) =>
          item.label && arr.findIndex((other) => other.label === item.label) === index
        );
        setLocationResults(results);
      } catch (e) {
        console.warn("Location search error:", e);
        setLocationResults([]);
      } finally {
        setSearchingLocation(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [language, locationModalVisible, locationQuery]);

  useEffect(() => {
    if (!bioInitialized && user?.id) {
      setBio(user.bio ?? "");
      setBioInitialized(true);
    }
  }, [user?.id, bioInitialized]);

  useEffect(() => {
    (async () => {
      try {
        const Constants_ = await import("expo-constants");
        const ownership = Constants_.default.appOwnership;
        if (ownership === "expo") { setPushTokenStatus("FAILED — Expo Go"); return; }

        let Notifs: any;
        try { Notifs = require("expo-notifications"); }
        catch { setPushTokenStatus("FAILED — module unavailable"); return; }

        const { status } = await Notifs.getPermissionsAsync();
        const finalStatus = status !== "granted"
          ? (await Notifs.requestPermissionsAsync()).status
          : status;
        if (finalStatus !== "granted") { setPushTokenStatus("FAILED — permission denied"); return; }

        const projectId = Constants_.default?.expoConfig?.extra?.eas?.projectId
          ?? Constants_.default?.easConfig?.projectId ?? null;
        if (!projectId) { setPushTokenStatus("FAILED — no projectId"); return; }

        const nativePushName = Platform.OS === "ios" ? "APNs" : "FCM";
        let nativeToken: string | null = null;
        try {
          const deviceToken = await Notifs.getDevicePushTokenAsync();
          nativeToken = deviceToken?.data ?? null;
        } catch (e: any) {
          setPushTokenStatus(`FAILED — ${nativePushName} error: ${e?.message ?? "no native token"}`);
          return;
        }
        if (!nativeToken) {
          setPushTokenStatus(`FAILED — ${nativePushName} returned empty token`);
          return;
        }

        try {
          const token = (await Notifs.getExpoPushTokenAsync({ projectId })).data;
          setPushTokenStatus(token ? `OK: ${token.slice(0, 28)}…` : "FAILED — empty Expo token");
        } catch (e: any) {
          setPushTokenStatus(`FAILED — Expo API error (${nativePushName} ok): ${e?.message ?? "getExpoPushToken error"}`);
        }
      } catch (e: any) {
        setPushTokenStatus(`FAILED — ${e?.message ?? "unknown"}`);
      }
    })();
  }, []);

  useEffect(() => {
    pb.collection("app_config").getFirstListItem('key = "latest_version"', { requestKey: null })
      .then((r) => setLatestVersion(r.value as string))
      .catch(() => {});
  }, []);

  const handlePickAvatar = async () => {
    if (!user) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append("avatar", {
        uri: asset.uri,
        name: "avatar.jpg",
        type: asset.mimeType || "image/jpeg",
      } as any);
      await pb.collection("users").update(user.id, formData);
      setAvatarUri(asset.uri);
    } catch (e) {
      console.warn("Avatar upload error:", e);
      Alert.alert(t("error"), t("uploadError"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    const trimmedUsername = username.trim();
    const trimmedName = name.trim();
    if (!/^\w{3,}$/.test(trimmedUsername)) {
      Alert.alert(t("error"), t("usernameInvalid"));
      return;
    }
    setSavingProfile(true);
    try {
      if (trimmedUsername !== user.username) {
        const existing = await pb.collection("users").getList(1, 1, {
          filter: `username = "${trimmedUsername}" && id != "${user.id}"`,
          requestKey: null,
        });
        if (existing.totalItems > 0) {
          Alert.alert(t("error"), t("usernameTaken"));
          setSavingProfile(false);
          return;
        }
      }
      await pb.collection("users").update(user.id, { name: trimmedName, username: trimmedUsername });
      pb.authStore.save(pb.authStore.token, { ...pb.authStore.record!, name: trimmedName, username: trimmedUsername });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (e) {
      Alert.alert(t("error"), t("saveError"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSelectLocation = async (result: LocationResult | null) => {
    if (!user || savingLocation) return;
    const nextLocation = result?.label ?? "";
    setSavingLocation(true);
    try {
      await pb.collection("users").update(user.id, { city: nextLocation });
      pb.authStore.save(pb.authStore.token, { ...pb.authStore.record!, city: nextLocation });
      setLocation(nextLocation);
      setLocationModalVisible(false);
      setLocationQuery("");
      setLocationResults([]);
      setLocationSaved(true);
      setTimeout(() => setLocationSaved(false), 2500);
    } catch (e) {
      Alert.alert(t("error"), t("saveError"));
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t("deleteAccount"),
      t("deleteAccountMessage"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("deleteAccount"),
          style: "destructive",
          onPress: async () => {
            try {
              await pb.collection("users").delete(user!.id);
              await signOut();
            } catch (e) {
              Alert.alert(t("error"), t("deleteAccountError"));
            }
          },
        },
      ]
    );
  };

  const handleSaveBio = async () => {
    if (!user) return;
    setSavingBio(true);
    try {
      await pb.collection("users").update(user.id, { bio });
      pb.authStore.save(pb.authStore.token, { ...pb.authStore.record!, bio });
      setBioSaved(true);
      setTimeout(() => setBioSaved(false), 2500);
    } catch (e) {
      Alert.alert(t("error"), t("uploadError"));
    } finally {
      setSavingBio(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!user || sendingFeedback) return;
    const message = feedback.trim();
    if (message.length < 3) {
      Alert.alert(t("error"), language === "ru" ? "Напишите пару слов." : "Write a few words first.");
      return;
    }
    setSendingFeedback(true);
    try {
      await pb.collection("feedback").create({
        user_id: user.id,
        username: user.username ?? "",
        name: user.name ?? "",
        message,
        platform: Platform.OS,
        app_version: currentVersion,
      });
      setFeedback("");
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 2500);
    } catch (e) {
      console.warn("Feedback submit error:", e);
      Alert.alert(
        t("error"),
        language === "ru"
          ? "Не удалось отправить отзыв. Проверьте коллекцию feedback в PocketBase."
          : "Could not send feedback. Check the feedback collection in PocketBase."
      );
    } finally {
      setSendingFeedback(false);
    }
  };

  const handleLanguageChange = async (newLanguage: Language) => {
    await setLanguage(newLanguage);
    setLanguageModalVisible(false);
    Alert.alert(t("languageChanged"), t("languageChangedMessage"));
  };

  const handleBuyPremium = async () => {
    const ok = await presentPaywall();
    if (ok) {
      Alert.alert(upgradeCopy.activated);
    }
  };

  const handleRestorePurchases = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const ok = await restore();
      Alert.alert(
        ok
          ? upgradeCopy.restored
          : upgradeCopy.noneFound
      );
    } finally {
      setRestoring(false);
    }
  };

  if (!user) {
    return (
      <SignInPrompt
        icon="settings-outline"
        subtitle={language === "ru" ? "Войдите, чтобы управлять профилем и настройками." : "Sign in to manage your profile and settings."}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <Text style={styles.title}>{t("settings")}</Text>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {user && (
          <View style={styles.userCard}>
            <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} style={styles.userAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={34} color="#94a3b8" />
              )}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              {user.name ? <Text style={styles.userName}>{user.name}</Text> : null}
              {user.username ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={styles.userUsername}>{user.username}</Text>
                  {parseBadges(user.badges).includes("verified") ? <VerifiedBadge size={13} /> : null}
                </View>
              ) : null}
            </View>
          </View>
        )}

        {user && (
          <View style={styles.bioCard}>
            <Text style={styles.bioLabel}>{language === "ru" ? "Профиль" : "Profile"}</Text>
            <Text style={styles.profileFieldLabel}>{language === "ru" ? "Имя" : "Name"}</Text>
            <TextInput
              style={[styles.bioInput, styles.profileInput]}
              value={name}
              onChangeText={setName}
              placeholder={t("namePlaceholder")}
              placeholderTextColor="#475569"
              maxLength={60}
              keyboardAppearance="dark"
              autoCapitalize="words"
            />
            <View style={styles.profileDivider} />
            <Text style={styles.profileFieldLabel}>{language === "ru" ? "Имя пользователя" : "Username"}</Text>
            <TextInput
              style={[styles.bioInput, styles.profileInput]}
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^\w]/g, ""))}
              placeholder={t("usernamePlaceholder")}
              placeholderTextColor="#475569"
              maxLength={30}
              keyboardAppearance="dark"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.profileDivider} />
            <Text style={styles.profileFieldLabel}>{language === "ru" ? "Город и страна" : "City and country"}</Text>
            <TouchableOpacity style={styles.locationPickerBtn} onPress={() => {
              setLocationQuery(location);
              setLocationModalVisible(true);
            }}>
              <View style={styles.locationPickerLeft}>
                <Ionicons name="location-outline" size={18} color="#94a3b8" />
                <Text style={[styles.locationPickerText, !location && styles.locationPickerPlaceholder]} numberOfLines={1}>
                  {location || (language === "ru" ? "Выбрать город" : "Select city")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#475569" />
            </TouchableOpacity>
            <View style={styles.bioFooter}>
              <Text style={styles.bioCount}>
                {locationSaved ? (language === "ru" ? "Место сохранено" : "Location saved") : `@${username || "…"}`}
              </Text>
              <TouchableOpacity
                style={[styles.bioSaveBtn, savingProfile && { opacity: 0.5 }, profileSaved && styles.bioSaveBtnSaved]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {profileSaved ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                    <Text style={styles.bioSaveBtnText}>{language === "ru" ? "Сохранено" : "Saved"}</Text>
                  </View>
                ) : (
                  <Text style={styles.bioSaveBtnText}>{t("save")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {user && (
          <View style={styles.bioCard}>
            <Text style={styles.bioLabel}>{language === "ru" ? "О себе" : "Bio"}</Text>
            <TextInput
              style={styles.bioInput}
              value={bio}
              onChangeText={setBio}
              placeholder={language === "ru" ? "Расскажи о себе, добавь соцсети..." : "Tell others about yourself, add your socials..."}
              placeholderTextColor="#475569"
              multiline
              maxLength={160}
              keyboardAppearance="dark"
            />
            <View style={styles.bioFooter}>
              <Text style={styles.bioCount}>{bio.length}/160</Text>
              <TouchableOpacity
                style={[styles.bioSaveBtn, savingBio && { opacity: 0.5 }, bioSaved && styles.bioSaveBtnSaved]}
                onPress={handleSaveBio}
                disabled={savingBio}
              >
                {bioSaved ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                    <Text style={styles.bioSaveBtnText}>{language === "ru" ? "Сохранено" : "Saved"}</Text>
                  </View>
                ) : (
                  <Text style={styles.bioSaveBtnText}>{language === "ru" ? "Сохранить" : "Save"}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showPurchases && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{upgradeCopy.sectionTitle}</Text>

            {isPro ? (
              <>
                <View style={styles.settingItem}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="checkmark-circle" size={20} color="#1d9bf0" />
                    <Text style={styles.settingText}>
                      {upgradeCopy.active}
                    </Text>
                  </View>
                  <VerifiedBadge size={20} />
                </View>

                <TouchableOpacity style={styles.settingItem} onPress={manageSubscription}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="close-circle-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingText}>
                      {upgradeCopy.manage}
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color="#94a3b8" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.settingItem, styles.premiumBuy]}
                  onPress={handleBuyPremium}
                >
                  <View style={styles.settingLeft}>
                    <Ionicons name="star" size={20} color="#f59e0b" />
                    <View style={styles.premiumTextWrap}>
                      <Text style={styles.premiumTitle}>
                        {upgradeCopy.buy}
                      </Text>
                      <Text style={styles.premiumSub}>
                        {upgradeCopy.benefit}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.settingItem} onPress={handleRestorePurchases}>
                  <View style={styles.settingLeft}>
                    <Ionicons name="refresh-outline" size={20} color="#ffffff" />
                    <Text style={styles.settingText}>
                      {restoring
                        ? upgradeCopy.restoring
                        : upgradeCopy.restore}
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("general")}</Text>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setLanguageModalVisible(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="globe-outline" size={20} color="#ffffff" />
              <Text style={styles.settingText}>{t("language")}</Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>
                {language === "en" ? "English (US)" : "Русский"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("about")}</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={20} color="#ffffff" />
              <Text style={styles.settingText}>{language === "ru" ? "Уведомления" : "Notifications"}</Text>
            </View>
            <View style={[
              styles.notificationStatus,
              notificationsEnabled ? styles.notificationStatusOn : styles.notificationStatusOff,
              notificationsChecking && styles.notificationStatusChecking,
            ]}>
              <View style={[
                styles.notificationDot,
                notificationsEnabled ? styles.notificationDotOn : styles.notificationDotOff,
                notificationsChecking && styles.notificationDotChecking,
              ]} />
              <Text style={[
                styles.notificationStatusText,
                notificationsEnabled ? styles.notificationStatusTextOn : styles.notificationStatusTextOff,
                notificationsChecking && styles.notificationStatusTextChecking,
              ]}>
                {notificationsChecking
                  ? (language === "ru" ? "Проверка" : "Checking")
                  : notificationsEnabled
                    ? (language === "ru" ? "Включены" : "Enabled")
                    : (language === "ru" ? "Выключены" : "Disabled")}
              </Text>
            </View>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="information-circle-outline" size={20} color="#ffffff" />
              <Text style={styles.settingText}>{t("version")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.settingValue}>{currentVersion}</Text>
              {latestVersion && (() => {
                const cmp = (a: string, b: string) => {
                  const pa = a.split(".").map(Number);
                  const pb_ = b.split(".").map(Number);
                  for (let i = 0; i < 3; i++) {
                    if ((pa[i] ?? 0) < (pb_[i] ?? 0)) return -1;
                    if ((pa[i] ?? 0) > (pb_[i] ?? 0)) return 1;
                  }
                  return 0;
                };
                const isOld = cmp(currentVersion, latestVersion) < 0;
                return isOld ? (
                  <View style={styles.updateBadge}>
                    <Ionicons name="arrow-up-circle-outline" size={13} color="#f59e0b" />
                    <Text style={styles.updateBadgeText}>
                      {language === "ru" ? "Есть обновление" : "Update available"}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.upToDateBadge}>
                    <Ionicons name="checkmark-circle-outline" size={13} color="#22c55e" />
                    <Text style={styles.upToDateBadgeText}>
                      {language === "ru" ? "Актуальная" : "Up to date"}
                    </Text>
                  </View>
                );
              })()}
            </View>
          </View>

          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://www.instagram.com/strikefeed.app/')}>
            <View style={styles.settingLeft}>
              <Ionicons name="logo-instagram" size={20} color="#E1306C" />
              <Text style={styles.settingText}>Instagram</Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>@strikefeed.app</Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://t.me/rybolovapp')}>
            <View style={styles.settingLeft}>
              <Ionicons name="paper-plane-outline" size={20} color="#229ED9" />
              <Text style={styles.settingText}>Telegram</Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>@rybolovapp</Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://sergei4k.github.io/fishingapp/privacy-policy.html')}>
            <View style={styles.settingLeft}>
              <Ionicons name="document-text-outline" size={20} color="#ffffff" />
              <Text style={styles.settingText}>{t("privacyPolicy")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("account")}</Text>

          {user?.email && (
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <Ionicons name="mail-outline" size={20} color="#ffffff" />
                <Text style={styles.settingText}>{user.email}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => {
              Alert.alert(t("signOutConfirm"), t("signOutConfirmMessage"), [
                { text: t("cancel"), style: "cancel" },
                {
                  text: t("signOut"),
                  style: "destructive",
                  onPress: () => signOut(),
                },
              ]);
            }}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
              <Text style={[styles.settingText, styles.dangerText]}>{t("signOut")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>

          {user && (
            <TouchableOpacity style={styles.settingItem} onPress={handleDeleteAccount}>
              <View style={styles.settingLeft}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                <Text style={[styles.settingText, styles.dangerText]}>{t("deleteAccount")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {user && (
          <View style={styles.bioCard}>
            <View style={styles.feedbackHeader}>
              <View style={styles.feedbackTitleRow}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#38bdf8" />
                <Text style={styles.feedbackTitle}>{language === "ru" ? "Обратная связь" : "Give feedback"}</Text>
              </View>
              {feedbackSent ? (
                <View style={styles.feedbackSentBadge}>
                  <Ionicons name="checkmark" size={13} color="#22c55e" />
                  <Text style={styles.feedbackSentText}>{language === "ru" ? "Отправлено" : "Sent"}</Text>
                </View>
              ) : null}
            </View>
            <TextInput
              style={[styles.bioInput, styles.feedbackInput]}
              value={feedback}
              onChangeText={setFeedback}
              placeholder={language === "ru" ? "Что улучшить? Ошибка, идея, неудобство..." : "What should improve? Bug, idea, rough spot..."}
              placeholderTextColor="#475569"
              multiline
              maxLength={800}
              keyboardAppearance="dark"
            />
            <View style={styles.bioFooter}>
              <Text style={styles.bioCount}>{feedback.length}/800</Text>
              <TouchableOpacity
                style={[styles.bioSaveBtn, (!feedback.trim() || sendingFeedback) && { opacity: 0.5 }, feedbackSent && styles.bioSaveBtnSaved]}
                onPress={handleSendFeedback}
                disabled={!feedback.trim() || sendingFeedback}
              >
                {sendingFeedback ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.bioSaveBtnText}>{language === "ru" ? "Отправить" : "Send"}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={locationModalVisible}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => setLocationModalVisible(false)}
      >
        <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.locationModalContainer, { paddingTop: safeTop }]}>
          <View style={styles.locationModalHeader}>
            <Text style={styles.locationModalTitle}>{language === "ru" ? "Город и страна" : "City and country"}</Text>
            <TouchableOpacity onPress={() => setLocationModalVisible(false)} style={styles.modalCloseBtn} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <View style={styles.locationSearchBox}>
            <Ionicons name="search-outline" size={15} color="#64748b" />
            <TextInput
              style={styles.locationSearchInput}
              value={locationQuery}
              onChangeText={setLocationQuery}
              placeholder={language === "ru" ? "Поиск города..." : "Search city..."}
              placeholderTextColor="#475569"
              autoCapitalize="words"
              autoCorrect={false}
              keyboardAppearance="dark"
              autoFocus
              returnKeyType="search"
            />
            {searchingLocation ? <ActivityIndicator size="small" color="#ffffff" /> : null}
          </View>
          {location ? (
            <TouchableOpacity style={styles.clearLocationBtn} onPress={() => handleSelectLocation(null)} disabled={savingLocation}>
              <Ionicons name="close-circle-outline" size={17} color="#f87171" />
              <Text style={styles.clearLocationText}>{language === "ru" ? "Убрать место из профиля" : "Remove location from profile"}</Text>
            </TouchableOpacity>
          ) : null}
          <FlatList
            data={locationResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              !searchingLocation && locationQuery.trim().length >= 2 ? (
                <Text style={styles.locationEmptyText}>{language === "ru" ? "Город не найден" : "No cities found"}</Text>
              ) : (
                <Text style={styles.locationEmptyText}>{language === "ru" ? "Введите город" : "Type a city"}</Text>
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.locationResultRow}
                activeOpacity={0.75}
                onPress={() => handleSelectLocation(item)}
                disabled={savingLocation}
              >
                <View style={styles.locationResultIcon}>
                  <Ionicons name="location-sharp" size={17} color="#38bdf8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationResultTitle}>{item.label}</Text>
                  <Text style={styles.locationResultSub} numberOfLines={1}>{item.subtitle}</Text>
                </View>
                {savingLocation ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="chevron-forward" size={16} color="#475569" />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Language Selection Modal */}
      <Modal
        visible={languageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("language")}</Text>
              <TouchableOpacity onPress={() => setLanguageModalVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity
              style={[styles.languageOption, language === "ru" && styles.languageOptionActive]}
              onPress={() => handleLanguageChange("ru")}
            >
              <Text style={[styles.languageOptionText, language === "ru" && styles.languageOptionTextActive]}>
                Русский
              </Text>
              {language === "ru" && (
                <Ionicons name="checkmark" size={20} color="#ffffff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.languageOption, language === "en" && styles.languageOptionActive]}
              onPress={() => handleLanguageChange("en")}
            >
              <Text style={[styles.languageOptionText, language === "en" && styles.languageOptionTextActive]}>
                English (US)
              </Text>
              {language === "en" && (
                <Ionicons name="checkmark" size={20} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  title: {
    color: "#e6eef8",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
  },
  keyboardAvoider: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 96,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 14,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  userAvatarText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 20,
  },
  userName: {
    color: "#e6eef8",
    fontSize: 17,
    fontWeight: "700",
  },
  userUsername: {
    color: "#94a3b8",
    fontSize: 14,
    marginTop: 2,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingText: {
    color: "#e6eef8",
    fontSize: 16,
    marginLeft: 12,
  },
  premiumBuy: {
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
  },
  premiumTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  premiumTitle: {
    color: "#e6eef8",
    fontSize: 16,
  },
  premiumSub: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  dangerText: {
    color: "#ef4444",
  },
  settingValue: {
    color: "#94a3b8",
    fontSize: 14,
  },
  notificationStatus: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  notificationStatusOn: {
    backgroundColor: "rgba(34,197,94,0.12)",
  },
  notificationStatusOff: {
    backgroundColor: "rgba(148,163,184,0.12)",
  },
  notificationStatusChecking: {
    backgroundColor: "rgba(56,189,248,0.12)",
  },
  notificationDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  notificationDotOn: {
    backgroundColor: "#22c55e",
  },
  notificationDotOff: {
    backgroundColor: "#94a3b8",
  },
  notificationDotChecking: {
    backgroundColor: "#38bdf8",
  },
  notificationStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  notificationStatusTextOn: {
    color: "#86efac",
  },
  notificationStatusTextOff: {
    color: "#cbd5e1",
  },
  notificationStatusTextChecking: {
    color: "#7dd3fc",
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    padding: 20,
    paddingBottom: 40,
    width: "85%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    color: "#e6eef8",
    fontSize: 20,
    fontWeight: "700",
  },
  languageOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  languageOptionActive: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  languageOptionText: {
    color: "#e6eef8",
    fontSize: 16,
  },
  languageOptionTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  bioCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  bioLabel: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bioInput: {
    color: "#e6eef8",
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: "top",
  },
  feedbackHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 12 },
  feedbackTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  feedbackTitle: { color: "#e6eef8", fontSize: 15, fontWeight: "700" },
  feedbackSentBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#052e16", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  feedbackSentText: { color: "#22c55e", fontSize: 11, fontWeight: "700" },
  feedbackInput: { minHeight: 96, lineHeight: 21 },
  profileInput: {
    minHeight: 0,
    paddingVertical: 6,
  },
  profileFieldLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
    marginTop: 4,
  },
  profileDivider: {
    height: 1,
    backgroundColor: "#1e293b",
    marginVertical: 4,
  },
  locationPickerBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    gap: 12,
  },
  locationPickerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  locationPickerText: { flex: 1, color: "#e6eef8", fontSize: 15 },
  locationPickerPlaceholder: { color: "#64748b" },
  bioFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  bioCount: {
    color: "#94a3b8",
    fontSize: 12,
  },
  bioSaveBtn: {
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: theme.radius.control,
  },
  bioSaveBtnSaved: { backgroundColor: "#16a34a" },
  updateBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#451a03", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  updateBadgeText: { color: "#f59e0b", fontSize: 11, fontWeight: "700" },
  upToDateBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#052e16", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  upToDateBadgeText: { color: "#22c55e", fontSize: 11, fontWeight: "700" },
  bioSaveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  locationModalContainer: { flex: 1, backgroundColor: theme.colors.background },
  locationModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  locationModalTitle: { color: "#e6eef8", fontSize: 18, fontWeight: "700" },
  modalCloseBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  locationSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f2236",
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  locationSearchInput: { flex: 1, color: "#e6eef8", fontSize: 15, padding: 0 },
  clearLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1e293b",
  },
  clearLocationText: { color: "#f87171", fontSize: 13, fontWeight: "600" },
  locationResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  locationResultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0f2236",
    alignItems: "center",
    justifyContent: "center",
  },
  locationResultTitle: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  locationResultSub: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  locationEmptyText: { color: "#64748b", textAlign: "center", marginTop: 40, fontSize: 14 },
});
