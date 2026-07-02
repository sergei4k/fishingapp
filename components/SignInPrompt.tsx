import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage } from "@/lib/language";

// Full-screen "sign in to continue" state shown to guests on account-only tabs.
export default function SignInPrompt({
  title,
  subtitle,
  icon = "person-circle-outline",
}: {
  title?: string;
  subtitle?: string;
  icon?: any;
}) {
  const { language } = useLanguage();
  const ru = language === "ru";
  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.inner}>
        <Ionicons name={icon} size={56} color="#1e3a5f" />
        <Text style={styles.title}>{title ?? (ru ? "Войдите в аккаунт" : "Sign in")}</Text>
        <Text style={styles.sub}>
          {subtitle ?? (ru ? "Создайте бесплатный аккаунт, чтобы пользоваться этой функцией." : "Create a free account to use this feature.")}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push("/(auth)/login" as any)}>
          <Text style={styles.btnText}>{ru ? "Войти / Регистрация" : "Sign in / Register"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  inner: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  title: { color: "#e6eef8", fontSize: 20, fontWeight: "700", marginTop: 8 },
  sub: { color: "#94a3b8", fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 12 },
  btn: { backgroundColor: "#0284c7", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
