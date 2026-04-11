import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { useLanguage, type Language } from "@/lib/language";
import { FontAwesome } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { signOut, user } = useAuth();
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(
    user?.avatar ? `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` : null
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

  const handleLanguageChange = async (newLanguage: Language) => {
    await setLanguage(newLanguage);
    setLanguageModalVisible(false);
    Alert.alert(t("languageChanged"), t("languageChangedMessage"));
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
              {user.username ? <Text style={styles.userUsername}>@{user.username}</Text> : null}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("general")}</Text>
          
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setLanguageModalVisible(true)}
          >
            <View style={styles.settingLeft}>
              <FontAwesome name="language" size={20} color="#60a5fa" />
              <Text style={styles.settingText}>{t("language")}</Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>
                {language === "en" ? "English (US)" : "Русский"}
              </Text>
              <FontAwesome name="chevron-right" size={16} color="#94a3b8" style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("about")}</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <FontAwesome name="info-circle" size={20} color="#60a5fa" />
              <Text style={styles.settingText}>{t("version")}</Text>
            </View>
            <Text style={styles.settingValue}>1.1.0</Text>
          </View>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <FontAwesome name="file-text" size={20} color="#60a5fa" />
              <Text style={styles.settingText}>{t("privacyPolicy")}</Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("account")}</Text>

          {user?.email && (
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <FontAwesome name="envelope" size={20} color="#60a5fa" />
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
              <FontAwesome name="sign-out" size={20} color="#ef4444" />
              <Text style={[styles.settingText, styles.dangerText]}>{t("signOut")}</Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#94a3b8" />
          </TouchableOpacity>
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
                <FontAwesome name="times" size={24} color="#94a3b8" />
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
                <FontAwesome name="check" size={20} color="#60a5fa" />
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
                <FontAwesome name="check" size={20} color="#60a5fa" />
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
    borderWidth: 1,
    borderColor: "#1e293b",
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
    color: "#60a5fa",
    fontWeight: "700",
    fontSize: 20,
  },
  userName: {
    color: "#e6eef8",
    fontSize: 17,
    fontWeight: "700",
  },
  userUsername: {
    color: "#64748b",
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
    borderColor: "#60a5fa",
  },
  languageOptionText: {
    color: "#e6eef8",
    fontSize: 16,
  },
  languageOptionTextActive: {
    color: "#60a5fa",
    fontWeight: "600",
  },
});
