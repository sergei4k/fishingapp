import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
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
import AuthScreen from "../components/AuthScreen";
import { CatchItem, deleteCatch, getCatch, getCatches, updateCatch } from "../lib/storage";
import { useAuth } from "../lib/useAuth";
import { useCatches } from "../lib/useCatches";

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
  // Always call all hooks at the top level - never conditionally
  const { user, loading: authLoading, logout } = useAuth();
  const { catches: firestoreCatches, loading: catchesLoading } = useCatches();
  const [catches, setCatches] = useState<CatchItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // modal + editing state
  const [modalVisible, setModalVisible] = useState(false);
  const [activeCatch, setActiveCatch] = useState<CatchItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editLength, setEditLength] = useState("");
  const [editWeight, setEditWeight] = useState("");

  const load = async () => {
    if (!user) return; // Early return if no user, but hooks are already called
    
    // Load both local catches and Firestore catches
    const list = await getCatches();
    
    // Filter Firestore catches for current user
    const userFirestoreCatches = firestoreCatches
      .filter(catch_item => catch_item.userId === user.uid)
      .map(catch_item => {
        const ci = catch_item as any;
        return {
          id: ci.id,
          image: ci.imageUrl || "",
          extraPhotos: [],
          description: ci.description || "",
          length: ci.length?.toString() || "",
          weight: ci.weight?.toString() || "",
          species: ci.species || "",
          date: ci.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        } as CatchItem;
      }) as CatchItem[];
    
    // Combine local and Firestore catches (avoid duplicates by checking IDs)
    const allCatches = [...list];
    userFirestoreCatches.forEach(firestoreCatch => {
      if (!allCatches.find(localCatch => localCatch.id === firestoreCatch.id)) {
        allCatches.push(firestoreCatch);
      }
    });
    
    // Sort by date (newest first)
    allCatches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    setCatches(allCatches);
  };

  useFocusEffect(
    useCallback(() => {
      if (user) {
        load();
      }
    }, [firestoreCatches, user])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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
          // close modal if deleted item was open
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
         source={item.image ? { uri: item.image } : require("../assets/placeholder.png")}
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
 
   const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти из аккаунта?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти",
        style: "destructive",
        onPress: logout,
      },
    ]);
  };

  // Conditional rendering AFTER all hooks are called
  if (authLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.title}>Загрузка...</Text>
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Мои пойманные</Text>
          <Text style={styles.subtitle}>{user.email}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Выйти</Text>
        </TouchableOpacity>
      </View>

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
                    source={activeCatch.image ? { uri: activeCatch.image } : require("../assets/placeholder.png")}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { color: "#e6eef8", fontSize: 18, marginBottom: 4 },
  subtitle: { 
    color: "#94a3b8", 
    fontSize: 14 
  },
  logoutButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  logoutText: { 
    color: "#ffffff", 
    fontSize: 12, 
    fontWeight: "bold" 
  },
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

  // swipe delete styles
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
});