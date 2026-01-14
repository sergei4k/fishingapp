import { FontAwesome } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Settings() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Настройки</Text>
      
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Общие</Text>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <FontAwesome name="bell" size={20} color="#60a5fa" />
              <Text style={styles.settingText}>Уведомления</Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <FontAwesome name="language" size={20} color="#60a5fa" />
              <Text style={styles.settingText}>Язык</Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Данные</Text>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <FontAwesome name="download" size={20} color="#60a5fa" />
              <Text style={styles.settingText}>Экспорт данных</Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <FontAwesome name="trash" size={20} color="#ef4444" />
              <Text style={[styles.settingText, styles.dangerText]}>Очистить все данные</Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>О приложении</Text>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <FontAwesome name="info-circle" size={20} color="#60a5fa" />
              <Text style={styles.settingText}>Версия</Text>
            </View>
            <Text style={styles.settingValue}>1.0.0</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <FontAwesome name="file-text" size={20} color="#60a5fa" />
              <Text style={styles.settingText}>Политика конфиденциальности</Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
});
