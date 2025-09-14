import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Auth screen temporarily disabled during development.
 * Keeps the import usable without triggering auth flows.
 */
export default function AuthScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Авторизация временно отключена</Text>
      <Text style={styles.subtitle}>Функция входа будет добавлена позже. Продолжите анонимно.</Text>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/")}>
        <Text style={styles.buttonText}>Продолжить</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center", padding: 24 },
  title: { color: "#e6eef8", fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  subtitle: { color: "#94a3b8", textAlign: "center", marginBottom: 20 },
  button: { backgroundColor: "#0ea5e9", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: "#fff", fontWeight: "700" },
});