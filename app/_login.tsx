import "react-native-gesture-handler"; // <- MUST be the very first import
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableNativeFeedback, TouchableOpacity, View } from "react-native";
import { signInWithEmail, signUpWithEmail } from "../lib/auth";


export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
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
    if (!name.trim()) {
      Alert.alert("Ошибка", "Пожалуйста, введите имя для регистрации.");
      return;
    }
    try {
      await signUpWithEmail(email.trim(), pw);
      router.replace("/profile");
    } catch (e: any) {
      Alert.alert("Sign up failed", e.message || String(e));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Создать Аккаунт</Text>

      <TextInput
        placeholder="Имя"
        placeholderTextColor="#94a3b8"
        value={name}
        onChangeText={setName}
        style={styles.input}
        keyboardType="default"
        autoCapitalize="none"
      />

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
        <TouchableOpacity style={styles.btn} onPress={onSignUp}>
          <Text style={styles.btnText}>Зарегистрироваться</Text>
        </TouchableOpacity>
      </View>

      <View style={{ 
        marginVertical: 12, flexDirection: "row", alignItems: "center", gap: 8, }}>
        <Text style={{ color: "#ffffff", fontWeight: "bold" }}>Или</Text>  // 
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onSignIn}>
          <TouchableNativeFeedback>
            <Text style={styles.btnText}>Войти с Яндекс</Text>
          </TouchableNativeFeedback>  
        </TouchableOpacity>
      </View>


      <View style={styles.registerRow}>
        <Text style={styles.registerText}>Есть аккаунта?</Text>
        <TouchableOpacity onPress={onSignIn}>
          <TouchableNativeFeedback>
            <Text style={styles.registerLink}> Войти</Text>
          </TouchableNativeFeedback>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#0f172a", padding: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, marginBottom: 12, fontWeight: "bold", textAlign: "center", color: "#e6eef8" },
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

