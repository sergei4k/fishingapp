import React, { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome6 as FontAwesome } from "@expo/vector-icons";
import { pb } from "@/lib/pocketbase";

export type Spot = {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  is_public: boolean;
  user_id: string;
};

type Props = {
  spot: Spot | null;
  currentUserId?: string;
  language: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (spot: Spot) => void;
};

export default function SpotDetailModal({ spot, currentUserId, language, onClose, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPublic, setEditPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  const ru = language === "ru";
  const isOwner = !!spot && spot.user_id === currentUserId;

  const startEdit = () => {
    if (!spot) return;
    setEditName(spot.name);
    setEditDesc(spot.description ?? "");
    setEditPublic(!!spot.is_public);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!spot || !editName.trim()) return;
    setSaving(true);
    try {
      const updated = await pb.collection("spots").update(spot.id, {
        name: editName.trim(),
        description: editDesc.trim(),
        is_public: editPublic,
      });
      onUpdated({ ...spot, name: updated.name, description: updated.description, is_public: !!updated.is_public });
      setEditing(false);
    } catch (e) {
      console.warn("update spot error:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      ru ? "Удалить место?" : "Delete spot?",
      ru ? "Это действие необратимо." : "This cannot be undone.",
      [
        { text: ru ? "Отмена" : "Cancel", style: "cancel" },
        {
          text: ru ? "Удалить" : "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await pb.collection("spots").delete(spot!.id);
              onDeleted(spot!.id);
              onClose();
            } catch (e) {
              console.warn("delete spot error:", e);
            }
          },
        },
      ]
    );
  };

  if (!spot) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <FontAwesome name="arrow-left" size={20} color="#e6eef8" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {editing ? (ru ? "Редактировать" : "Edit spot") : spot.name}
          </Text>
          {isOwner && !editing && (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={startEdit} style={styles.headerBtn}>
                <FontAwesome name="pen" size={15} color="#60a5fa" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
                <FontAwesome name="trash" size={15} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}
          {editing && (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.headerBtn}>
                <Text style={styles.cancelText}>{ru ? "Отмена" : "Cancel"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerBtn}>
                <Text style={[styles.saveText, saving && { opacity: 0.5 }]}>{ru ? "Сохранить" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.iconRow}>
            <View style={styles.spotIcon}>
              <FontAwesome name="location-dot" size={28} color="#f59e0b" />
            </View>
            {!spot.is_public && !editing ? (
              <View style={styles.privateBadge}>
                <FontAwesome name="lock" size={11} color="#94a3b8" style={{ marginRight: 4 }} />
                <Text style={styles.privateBadgeText}>{ru ? "Приватное" : "Private"}</Text>
              </View>
            ) : !editing ? (
              <View style={styles.publicBadge}>
                <FontAwesome name="earth-europe" size={11} color="#34d399" style={{ marginRight: 4 }} />
                <Text style={styles.publicBadgeText}>{ru ? "Публичное" : "Public"}</Text>
              </View>
            ) : null}
          </View>

          {editing ? (
            <>
              <Text style={styles.label}>{ru ? "Название" : "Name"}</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder={ru ? "Название места" : "Spot name"}
                placeholderTextColor="#475569"
                maxLength={60}
              />
              <Text style={styles.label}>{ru ? "Описание" : "Description"}</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder={ru ? "Описание (необязательно)" : "Description (optional)"}
                placeholderTextColor="#475569"
                multiline
                maxLength={300}
              />
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>{ru ? "Публичное место" : "Public spot"}</Text>
                  <Text style={styles.toggleSub}>
                    {ru ? "Другие пользователи увидят его на карте" : "Other users will see it on the map"}
                  </Text>
                </View>
                <Switch
                  value={editPublic}
                  onValueChange={setEditPublic}
                  trackColor={{ false: "#1e293b", true: "#0c4a6e" }}
                  thumbColor={editPublic ? "#0284c7" : "#475569"}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.spotName}>{spot.name}</Text>
              {spot.description ? <Text style={styles.spotDesc}>{spot.description}</Text> : null}
              <Text style={styles.coordText}>
                {Number(spot.lat).toFixed(5)}, {Number(spot.lon).toFixed(5)}
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  headerActions: { flexDirection: "row", gap: 4 },
  headerBtn: { padding: 8 },
  cancelText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  saveText: { color: "#0284c7", fontSize: 14, fontWeight: "700" },
  body: { padding: 20 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  spotIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#1c1409", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#f59e0b44",
  },
  privateBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#1e293b", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  privateBadgeText: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  publicBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#064e3b", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  publicBadgeText: { color: "#34d399", fontSize: 12, fontWeight: "600" },
  spotName: { color: "#e6eef8", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  spotDesc: { color: "#94a3b8", fontSize: 15, lineHeight: 22, marginBottom: 12 },
  coordText: { color: "#475569", fontSize: 13, marginTop: 8 },
  label: { color: "#94a3b8", fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: "#1e293b", color: "#e6eef8", fontSize: 15,
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#334155",
  },
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#071023", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 20, borderWidth: 1, borderColor: "#1e293b",
    gap: 12,
  },
  toggleLabel: { color: "#e6eef8", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  toggleSub: { color: "#64748b", fontSize: 12 },
});
