import { FontAwesome } from "@expo/vector-icons";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { collection, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth, firestore } from "../lib/firebase";
import { CatchItem, deleteCatch, getCatches, updateCatch } from "../lib/storage";

const fishSpecies = [
  { id: "pike", label: "Щука" },
  { id: "perch", label: "Окунь" },
  { id: "carp", label: "Карп" },
  { id: "pikeperch", label: "Берш" },
  { id: "shchuka", label: "Щука" },
  { id: "okun", label: "Окунь" },
  { id: "sudak", label: "Судак" },
  { id: "leshch", label: "Лещ" },
  { id: "nalim", label: "Налим" },
  { id: "som", label: "Сом" },
  { id: "forel", label: "Форель" },
  { id: "sig", label: "Сиг" },
  { id: "kharius", label: "Хариус" },
  { id: "gustera", label: "Густера" },
  { id: "karas", label: "Карась" },
  { id: "lin", label: "Линь" },
  { id: "golavl", label: "Голавль" },
  { id: "yaz", label: "Язь" },
  { id: "plotva", label: "Плотва" },
  { id: "sazan", label: "Сазан" },
  { id: "rotan", label: "Ротан" },
  { id: "peskar", label: "Пескарь" },
  { id: "ukleya", label: "Уклея" },
];

function getSpeciesLabel(id: string | null | undefined) {
  if (!id) return "Неизвестно";
  const found = fishSpecies.find((s) => s.id === id);
  return found ? found.label : id;
}

export default function Profile() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean>(!!auth.currentUser);
  const [catches, setCatches] = useState<CatchItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCatch, setSelectedCatch] = useState<CatchItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editLength, setEditLength] = useState("");
  const [editWeight, setEditWeight] = useState("");

  // BottomSheet setup
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["50%", "90%"], []);

  const load = async (opts: { force?: boolean } = {}) => {
    try {
      const list = await getCatches();
      if (!Array.isArray(list)) {
        console.warn("load: getCatches did not return an array");
        return;
      }

      // sort newest first
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Only replace state if we actually fetched results, or if caller forces.
      if (list.length > 0 || opts.force) {
        setCatches(list);
      } else {
        console.log("load: empty result — keeping existing catches in state");
      }
    } catch (e) {
      console.error("load error:", e);
      // preserve existing state on error
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    console.log("profile useEffect uid:", uid);
    if (!uid) return; // wait until signed in

    // show snapshot errors and log them
    const q = query(collection(firestore, "catches"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CatchItem[] = [];
        snap.forEach((doc) => {
          const data = doc.data() as CatchItem;
          list.push({ ...data, id: doc.id });
        });
        console.log("Firestore snapshot count:", list.length);
        setCatches(list);
      },
      (err) => {
        console.error("onSnapshot error (likely missing index):", err);
        // fallback: fetch recent docs and filter client-side (slow for big datasets)
        (async () => {
          try {
            const recentQ = query(collection(firestore, "catches"), orderBy("createdAt", "desc")); // top N if desired
            const snap = await getDocs(recentQ);
            const list: CatchItem[] = [];
            snap.forEach((doc) => {
              const d = doc.data() as any;
              if (d.userId === uid) list.push({ ...d, id: doc.id });
            });
            console.log("Fallback client-side filter count:", list.length);
            setCatches(list);
          } catch (e) {
            console.error("Fallback fetch error:", e);
          }
        })();
      }
    );
    return unsub;
  }, [auth.currentUser?.uid]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // attempt to refresh, but don't clobber existing catches if load returns empty
      await load({ force: false });
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert("Удалить запись", "Вы уверены, что хотите удалить эту запись?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          await deleteCatch(id);
          await load();
        },
      },
    ]);
  };

  const onSave = async () => {
    if (!selectedCatch) return;
    try {
      await updateCatch(selectedCatch.id, {
        description: editDescription,
        length: parseFloat(editLength) || undefined,
        weight: parseFloat(editWeight) || undefined,
      });
      setEditing(false);
      await load();
    } catch (e) {
      console.error("Save error:", e);
      Alert.alert("Ошибка", "Не удалось сохранить изменения");
    }
  };

  const renderItem = ({ item }: { item: CatchItem }) => (
    <Swipeable
      renderRightActions={() => (
        <View style={styles.deleteAction}>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Удалить</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      <TouchableOpacity style={styles.item} onPress={() => setSelectedCatch(item)}>
        <Image
          // show local image OR fallback to Firestore imageUrl
          source={ (item.image ?? item.imageUrl) ? { uri: (item.image ?? item.imageUrl) } : require("../assets/placeholder.png") }
          style={styles.thumb}
        />
        <View style={styles.info}>  
          <Text style={styles.species}>{getSpeciesLabel(item.species)}</Text>
          <Text style={styles.desc} numberOfLines={1}>
            {item.description || "Без описания"}
          </Text>
          <Text style={styles.meta}>
            {item.length ? `${item.length} cm` : "--"} • {item.weight ? `${item.weight} kg` : "--"}
          </Text>
        </View>
        <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <View style={styles.container}>
      {/* top-right login button */}
      {!loggedIn && (
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push("/login")}
          activeOpacity={0.8}
        >
          <FontAwesome name="user" size={18} color="#001219" />
          <Text style={styles.loginButtonText}>Войти</Text>
        </TouchableOpacity>
      )}
      <SafeAreaView />
      <Text style={styles.title}>Мои пойманные</Text>

      <FlatList
        data={catches}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Нет загруженных ловов</Text>}
        contentContainerStyle={
          catches.length === 0 ? { flex: 1, justifyContent: "center" } : { paddingBottom: 24 }
        }
      />

      {/* BottomSheet for selected catch */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onChange={(index) => {
          if (index === -1) setSelectedCatch(null);
        }}
        handleIndicatorStyle={{ backgroundColor: "#94a3b8" }}
        backgroundStyle={{ backgroundColor: "rgba(2,6,23,0.95)" }}
      >
        <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {!selectedCatch ? (
            <Text style={{ color: "#94a3b8" }}>No selection</Text>
          ) : (
            <View>
              <Image
                source={ (selectedCatch.image ?? selectedCatch.imageUrl) ? { uri: (selectedCatch.image ?? selectedCatch.imageUrl) } : require("../assets/placeholder.png") }
                style={{ width: "100%", height: 200, borderRadius: 10, marginTop: 8 }}
              />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 12 }}>
                {getSpeciesLabel(selectedCatch.species)}
              </Text>
              <Text style={{ color: "#94a3b8", marginTop: 8 }}>
                {new Date(selectedCatch.date).toLocaleString()}
              </Text>

              <Text style={styles.label}>Описание</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  textAlignVertical="top"
                />
              ) : (
                <Text style={styles.value}>{selectedCatch.description || "Без описания"}</Text>
              )}

              <Text style={styles.label}>Длина (cm)</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  value={editLength}
                  onChangeText={setEditLength}
                  keyboardType="numeric"
                />
              ) : (
                <Text style={styles.value}>{selectedCatch.length || "--"}</Text>
              )}

              <Text style={styles.label}>Вес (kg)</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  value={editWeight}
                  onChangeText={setEditWeight}
                  keyboardType="numeric"
                />
              ) : (
                <Text style={styles.value}>{selectedCatch.weight || "--"}</Text>
              )}

              <View style={styles.modalActions}>
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
                    <TouchableOpacity style={styles.btnClose} onPress={() => setSelectedCatch(null)}>
                      <Text style={styles.btnText}>Закрыть</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}
        </BottomSheetView>
      </BottomSheet>

      <SafeAreaView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 16 },
  title: { color: "#e6eef8", fontSize: 18, marginBottom: 4 },
  empty: { color: "#94a3b8", textAlign: "center" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  thumb: { width: 72, height: 72, borderRadius: 8, marginRight: 12, resizeMode: "cover" },
  info: { flex: 1 },
  species: { color: "#cfe8ff", fontWeight: "600" },
  desc: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  meta: { color: "#7ea8c9", fontSize: 12, marginTop: 6 },
  date: { color: "#94a3b8", fontSize: 12, marginLeft: 8 },

  deleteAction: { justifyContent: "center" },
  deleteButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    marginVertical: 8,
    marginRight: 12,
  },
  deleteText: { color: "#fff", fontWeight: "700" },

  loginButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#60a5fa",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 6,
  },
  loginButtonText: {
    color: "#001219",
    fontWeight: "700",
    marginLeft: 8,
  },
  label: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 12 },
  value: { color: "#cbd5e1", fontSize: 14, marginTop: 4 },
  input: {
    backgroundColor: "#1e293b",
    color: "#fff",
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
    minHeight: 40,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
  },
  btnEdit: { backgroundColor: "#60a5fa", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnSave: { backgroundColor: "#10b981", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnCancel: { backgroundColor: "#f59e0b", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnClose: { backgroundColor: "#ef4444", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: "#fff", fontWeight: "700" },
});