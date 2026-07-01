import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { usePurchases } from "@/lib/purchases";
import { useLanguage, type Language } from "@/lib/language";
import { parseBadges } from "@/lib/badges";
import { registerForPushNotificationsAsync } from "@/lib/notifications";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import React, { useEffect, useState } from "react";
import { Alert, Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { signOut, user } = useAuth();
  const { enabled: purchasesEnabled, isPro, presentPaywall, restore } = usePurchases();
  const [restoring, setRestoring] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(
    user?.avatar ? `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}?thumb=200x200` : null
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [name, setName] = useState<string>(user?.name ?? "");
  const [username, setUsername] = useState<string>(user?.username ?? "");
  const [profileInitialized, setProfileInitialized] = useState(!!user?.id);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [bio, setBio] = useState<string>(user?.bio ?? "");
  const [bioInitialized, setBioInitialized] = useState(!!user?.id);
  const [savingBio, setSavingBio] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [pushTokenStatus, setPushTokenStatus] = useState<string>("checking…");

  const currentVersion = Constants.expoConfig?.version ?? "0.0.0";

  useEffect(() => {
    if (!profileInitialized && user?.id) {
      setName(user.name ?? "");
      setUsername(user.username ?? "");
      setProfileInitialized(true);
    }
  }, [user?.id, profileInitialized]);

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

        let fcmToken: string | null = null;
        try {
          const deviceToken = await Notifs.getDevicePushTokenAsync();
          fcmToken = deviceToken?.data ?? null;
        } catch (e: any) {
          setPushTokenStatus(`FAILED — FCM (Firebase) error: ${e?.message ?? "no native token"}`);
          return;
        }
        if (!fcmToken) {
          setPushTokenStatus("FAILED — FCM returned empty token (google-services.json issue)");
          return;
        }

        try {
          const token = (await Notifs.getExpoPushTokenAsync({ projectId })).data;
          setPushTokenStatus(token ? `OK: ${token.slice(0, 28)}…` : "FAILED — empty Expo token");
        } catch (e: any) {
          setPushTokenStatus(`FAILED — Expo API error (FCM ok): ${e?.message ?? "getExpoPushToken error"}`);
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

  const handleLanguageChange = async (newLanguage: Language) => {
    await setLanguage(newLanguage);
    setLanguageModalVisible(false);
    Alert.alert(t("languageChanged"), t("languageChangedMessage"));
  };

  const handleBuyPremium = async () => {
    const ok = await presentPaywall();
    if (ok) {
      Alert.alert(language === "ru" ? "Премиум активирован" : "Premium activated");
    }
  };

  const handleRestorePurchases = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const ok = await restore();
      Alert.alert(
        ok
          ? (language === "ru" ? "Покупки восстановлены" : "Purchases restored")
          : (language === "ru" ? "Покупки не найдены" : "No purchases found")
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t("settings")}</Text>

      <ScrollView style={styles.content}>
        {user && (
          <View style={styles.userCard}>
            <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} style={styles.userAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.userAvatarText}>
                  {(user.name || user.username || "?").slice(0, 2).toUpperCase()}
                </Text>
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
            <View style={styles.bioFooter}>
              <Text style={styles.bioCount}>@{username || "…"}</Text>
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

        {purchasesEnabled && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{language === "ru" ? "Премиум" : "Premium"}</Text>

            {isPro ? (
              <View style={styles.settingItem}>
                <View style={styles.settingLeft}>
                  <Ionicons name="checkmark-circle" size={20} color="#1d9bf0" />
                  <Text style={styles.settingText}>
                    {language === "ru" ? "Премиум активен" : "Premium active"}
                  </Text>
                </View>
                <VerifiedBadge size={20} />
              </View>
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
                        {language === "ru" ? "Купить Премиум" : "Buy Premium"}
                      </Text>
                      <Text style={styles.premiumSub}>
                        {language === "ru"
                          ? "Значок верификации и премиум-функции"
                          : "Verified badge & premium features"}
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
                        ? (language === "ru" ? "Восстановление…" : "Restoring…")
                        : (language === "ru" ? "Восстановить покупки" : "Restore purchases")}
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
              <Text style={styles.settingText}>Push token</Text>
            </View>
            <Text style={[styles.settingValue, { fontSize: 11, maxWidth: 200 }]} numberOfLines={1}>{pushTokenStatus}</Text>
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
      </ScrollView>

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
    backgroundColor: "#0f172a",
    padding: 16,
  },
  title: {
    color: "#e6eef8",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
  },
  content: {
    flex: 1,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
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
    backgroundColor: "#071023",
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
    backgroundColor: "#0f172a",
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
    backgroundColor: "#071023",
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
    backgroundColor: "#071023",
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
    backgroundColor: "#0c4a6e",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
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
});
