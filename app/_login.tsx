import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { signInWithEmail, signUpWithEmail } from "../lib/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const router = useRouter();

  const onSignIn = async () => {
    try {
      await signInWithEmail(email.trim(), pw);
      router.replace("/profile"); // or home
    } catch (e: any) {
      Alert.alert("Sign in failed", e.message || String(e));
    }
  };

  const onSignUp = async () => {
    try {
      await signUpWithEmail(email.trim(), pw);
      router.replace("/profile");
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message || String(e));
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Почта"
        placeholderTextColor="#94a3b8"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Пароль"
        placeholderTextColor="#94a3b8"
        value={pw}
        onChangeText={setPw}
        style={styles.input}
        secureTextEntry
      />

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.btn} onPress={onSignIn}>
          <Text style={styles.btnText}>Войти</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.registerRow}>
        <Text style={styles.registerText}>Нет аккаунта?</Text>
        <TouchableOpacity onPress={onSignUp}>
          <Text style={styles.registerLink}> Зарегистрироваться</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#0f172a", padding: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, marginBottom: 12, textAlign: "center", color: "#e6eef8" },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#263544",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    color: "#ffffff",
    backgroundColor: "#071023",
  },
  buttons: { flexDirection: "row", justifyContent: "space-between", width: "100%", gap: 12, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#60a5fa",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondary: {
    backgroundColor: "#0ea5e9",
  },
  btnText: {
    color: "#001219",
    fontWeight: "700",
    fontSize: 16,
  },
  registerRow: {
    flexDirection: "row",
    marginTop: 18,
    alignItems: "center",
  },
  registerText: {
    color: "#94a3b8",
    fontSize: 14,
  },
  registerLink: {
    color: "#60a5fa",
    fontWeight: "700",
    fontSize: 14,
  },
});

