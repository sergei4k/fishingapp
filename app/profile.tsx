import { FontAwesome } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { collection, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { auth, firestore } from "../lib/firebase";
import { CatchItem, deleteCatch, getCatch, getCatches, updateCatch } from "../lib/storage";

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

  // modal + editing state
  const [modalVisible, setModalVisible] = useState(false);
  const [activeCatch, setActiveCatch] = useState<CatchItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editLength, setEditLength] = useState("");
  const [editWeight, setEditWeight] = useState("");

  const load = async (opts: { force?: boolean } = {}) => {
    try {
      const list = await getCatches();
      if (!Array.isArray(list)) {
        console.warn("load: getCatches did not return an array");
        return;
      }

      // sort newest first
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Only replace state if we actually fetched results, or if caller forces replace.
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

  const openModal = async (id: string) => {
    const c = await getCatch(id);
    if (!c) {
      Alert.alert("Ошибка", "Запись не найдена");
      return;
    }
    setActiveCatch(c);
    setEditDescription(c.description ?? "");
    setEditLength(c.length ?? "");
    setEditWeight(c.weight ?? "");
    setEditing(false);
    setModalVisible(true);
  };

  const onSave = async () => {
    if (!activeCatch) return;
    const updated: CatchItem = {
      ...activeCatch,
      description: editDescription,
      length: editLength,
      weight: editWeight,
    };
    await updateCatch(updated);
    setActiveCatch(updated);
    setEditing(false);
    await load();
    setModalVisible(false);
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
          if (activeCatch?.id === id) {
            setModalVisible(false);
            setActiveCatch(null);
          }
        },
      },
    ]);
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
      <TouchableOpacity style={styles.item} onPress={() => openModal(item.id)}>
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
      {/* top-right login button (shown when not signed in) */}
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

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              {!activeCatch ? (
                <Text style={styles.title}>Загрузка...</Text>
              ) : (
                <>
                  <Image
                    // fallback to imageUrl if image is missing
                    source={ (activeCatch?.image ?? activeCatch?.imageUrl) ? { uri: (activeCatch?.image ?? activeCatch?.imageUrl) } : require("../assets/placeholder.png") }
                    style={styles.mainImage}
                  />
                  <Text style={styles.label}>Вид</Text>
                  <Text style={styles.value}>{getSpeciesLabel(activeCatch.species)}</Text>

                  <Text style={styles.label}>Дата</Text>
                  <Text style={styles.value}>{new Date(activeCatch.date).toLocaleString()}</Text>

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
                    <Text style={styles.value}>{activeCatch.description || "Без описания"}</Text>
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
                    <Text style={styles.value}>{activeCatch.length || "--"}</Text>
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
                    <Text style={styles.value}>{activeCatch.weight || "--"}</Text>
                  )}
                </>
              )}
            </ScrollView>

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
                  <TouchableOpacity style={styles.btnClose} onPress={() => setModalVisible(false)}>
                    <Text style={styles.btnText}>Закрыть</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
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

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#071023", borderRadius: 12, maxHeight: "90%", padding: 12 },
  mainImage: { width: "100%", height: 260, resizeMode: "cover", backgroundColor: "#071023", borderRadius: 8 },
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
  modalActions: { flexDirection: "row", marginTop: 12, justifyContent: "space-between" },
  btnEdit: { backgroundColor: "#0ea5e9", padding: 12, borderRadius: 8, flex: 1, marginRight: 8, alignItems: "center" },
  btnSave: { backgroundColor: "#10b981", padding: 12, borderRadius: 8, flex: 1, marginRight: 8, alignItems: "center" },
  btnCancel: { backgroundColor: "#ef4444", padding: 12, borderRadius: 8, flex: 1, alignItems: "center" },
  btnClose: { backgroundColor: "#64748b", padding: 12, borderRadius: 8, flex: 1, alignItems: "center" },
  btnText: { color: "#001219", fontWeight: "700" },

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
});