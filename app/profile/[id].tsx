import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CatchItem, getCatch, updateCatch } from "../../lib/storage";

export default function CatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<CatchItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [length, setLength] = useState("");
  const [weight, setWeight] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      const c = await getCatch(id);
      if (!c) {
        Alert.alert("Not found", "Catch not found");
        router.back();
        return;
      }
      setItem(c);
      setDescription(c.description ?? "");
      setLength(c.length ?? "");
      setWeight(c.weight ?? "");
    })();
  }, [id]);

  const onSave = async () => {
    if (!item) return;
    const updated: CatchItem = {
      ...item,
      description,
      length,
      weight,
    };
    await updateCatch(updated);
    setItem(updated);
    setEditing(false);
    // go back so Profile will refresh via useFocusEffect, or just notify user
    router.back();
  };

  if (!item) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Загрузка...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Image source={item.image ? { uri: item.image } : require("../../assets/placeholder.png")} style={styles.mainImage} />
      {item.extraPhotos && item.extraPhotos.length > 0 && (
        <ScrollView horizontal style={{ marginTop: 8 }}>
          {item.extraPhotos.map((u, i) => (
            <Image key={i} source={{ uri: u }} style={styles.extra} />
          ))}
        </ScrollView>
      )}

      <View style={{ marginTop: 12 }}>
        <Text style={styles.label}>Вид</Text>
        <Text style={styles.value}>{item.species ?? "Неизвестно"}</Text>

        <Text style={styles.label}>Дата</Text>
        <Text style={styles.value}>{new Date(item.date).toLocaleString()}</Text>

        <Text style={styles.label}>Описание</Text>
        {editing ? (
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />
        ) : (
          <Text style={styles.value}>{item.description || "Без описания"}</Text>
        )}

        <Text style={styles.label}>Длина (cm)</Text>
        {editing ? (
          <TextInput style={styles.input} value={length} onChangeText={setLength} keyboardType="numeric" />
        ) : (
          <Text style={styles.value}>{item.length || "--"}</Text>
        )}

        <Text style={styles.label}>Вес (kg)</Text>
        {editing ? (
          <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" />
        ) : (
          <Text style={styles.value}>{item.weight || "--"}</Text>
        )}
      </View>

      <View style={{ flexDirection: "row", marginTop: 16, justifyContent: "space-between" }}>
        {editing ? (
          <>
            <TouchableOpacity style={styles.btnSave} onPress={onSave}>
              <Text style={styles.btnText}>Сохранить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCancel} onPress={() => setEditing(false)}>
              <Text style={styles.btnText}>Отмена</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.btnEdit} onPress={() => setEditing(true)}>
              <Text style={styles.btnText}>Редактировать</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnClose} onPress={() => router.back()}>
              <Text style={styles.btnText}>Назад</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  title: { color: "#e6eef8", fontSize: 18, padding: 16 },
  mainImage: { width: "100%", height: 300, resizeMode: "cover", backgroundColor: "#071023" },
  extra: { width: 80, height: 80, marginRight: 8, borderRadius: 6 },
  label: { color: "#94a3b8", marginTop: 10 },
  value: { color: "#e6eef8", fontSize: 16, marginTop: 4 },
  input: {
    backgroundColor: "#071023",
    color: "#ffffff",
    borderColor: "#1f2937",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  btnEdit: { backgroundColor: "#0ea5e9", padding: 12, borderRadius: 8, flex: 1, marginRight: 8, alignItems: "center" },
  btnSave: { backgroundColor: "#10b981", padding: 12, borderRadius: 8, flex: 1, marginRight: 8, alignItems: "center" },
  btnCancel: { backgroundColor: "#ef4444", padding: 12, borderRadius: 8, flex: 1, alignItems: "center" },
  btnClose: { backgroundColor: "#64748b", padding: 12, borderRadius: 8, flex: 1, alignItems: "center" },
  btnText: { color: "#001219", fontWeight: "700" },
});