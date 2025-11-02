import { getSpeciesLabel } from "@/lib/species";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite"; // FIX: use context, not openDatabase
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { CatchItem } from "../lib/storage";

type CatchWithExtras = CatchItem & { extraPhotos?: string[] };

export default function Profile() {
  const router = useRouter();
  const db = useSQLiteContext(); // FIX: use context provider
  const [catches, setCatches] = useState<CatchWithExtras[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCatch, setSelectedCatch] = useState<CatchWithExtras | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editLength, setEditLength] = useState("");
  const [editWeight, setEditWeight] = useState("");

  // BottomSheet setup
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["50%", "90%"], []);

  // Helper to run SQL using expo-sqlite provider API
  async function execSqlAsync(sql: string, params?: any[]): Promise<any[]> {
    if (!db || typeof db.getAllAsync !== "function") {
      console.error("SQLite DB not available in Profile screen");
      return [];
    }
    try {
      const result = await db.getAllAsync(sql, params || []);
      return result as any[];
    } catch (error) {
      console.error("SQL execution error:", error);
      return [];
    }
  }

  const load = async (opts: { force?: boolean } = {}) => {
    try {
      const rows = await execSqlAsync(
        `SELECT id, image_uri, description, length_cm, weight_kg, species, lat, lon, created_at
         FROM catches
         ORDER BY created_at DESC`
      );

      // collect ids to query extra_photos in one go
      const ids = (rows || []).map((r: any) => r.id).filter(Boolean);
      let extrasMap: Record<string, string[]> = {};
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        const extraRows = await execSqlAsync(
          `SELECT catch_id, uri FROM extra_photos WHERE catch_id IN (${placeholders})`,
          ids
        );
        extrasMap = {};
        for (const er of extraRows || []) {
          const k = String(er.catch_id);
          extrasMap[k] = extrasMap[k] || [];
          if (er.uri) extrasMap[k].push(er.uri);
        }
      }

      const list: CatchWithExtras[] = (rows || []).map((r: any) => ({
        id: String(r.id),
        image: r.image_uri ?? null,
        imageUrl: r.image_uri ?? null,
        description: r.description ?? "",
        length: r.length_cm != null ? String(r.length_cm) : "",
        weight: r.weight_kg != null ? String(r.weight_kg) : "",
        species: r.species ?? null,
        date: new Date(r.created_at || Date.now()).toISOString(),
        lat: r.lat ?? null,
        lon: r.lon ?? null,
        extraPhotos: extrasMap[String(r.id)] ?? [],
      }));
      setCatches(list);
    } catch (e) {
      console.error("load error:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [db])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load({ force: true });
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
          try {
            await execSqlAsync("DELETE FROM extra_photos WHERE catch_id = ?;", [Number(id)]);
            await execSqlAsync("DELETE FROM catches WHERE id = ?;", [Number(id)]);
            await load({ force: true });
            setSelectedCatch(null);
          } catch (e) {
            console.error("delete error:", e);
            Alert.alert("Ошибка", "Не удалось удалить запись.");
          }
        },
      },
    ]);
  };

  const onSave = async () => {
    if (!selectedCatch) return;
    try {
      const parsedLength = parseFloat(editLength);
      const parsedWeight = parseFloat(editWeight);

      const patchDesc = editDescription ?? "";
      const patchLength = isNaN(parsedLength) ? null : parsedLength;
      const patchWeight = isNaN(parsedWeight) ? null : parsedWeight;

      await execSqlAsync(
        `UPDATE catches SET description = ?, length_cm = ?, weight_kg = ? WHERE id = ?;`,
        [patchDesc, patchLength, patchWeight, Number(selectedCatch.id)]
      );

      const updatedItem: CatchWithExtras = {
        ...selectedCatch,
        description: patchDesc,
        length: patchLength == null ? "" : String(patchLength),
        weight: patchWeight == null ? "" : String(patchWeight),
      };

      setEditing(false);
      setSelectedCatch(updatedItem);
      await load({ force: true });
    } catch (e) {
      console.error("Save error:", e);
      Alert.alert("Ошибка", "Не удалось сохранить изменения");
    }
  };

  const renderItem = ({ item }: { item: CatchWithExtras }) => (
    <Swipeable
      renderRightActions={() => (
        <View style={styles.deleteAction}>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Удалить</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      <TouchableOpacity
        style={styles.item}
        onPress={() => {
          setSelectedCatch(item);
          try {
            bottomSheetRef.current?.expand();
          } catch {}
        }}
      >
        <Image
          source={(item.image ?? item.imageUrl) ? { uri: (item.image ?? item.imageUrl) } : require("../assets/placeholder.png")}
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
    <SafeAreaView style={styles.container}>
       <Text style={styles.title}>Мои пойманные</Text>

       <FlatList
         data={catches}
         keyExtractor={(i) => i.id}
         renderItem={renderItem}
         refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
         ListEmptyComponent={<Text style={styles.empty}>Тут пока пусто...</Text>}
         contentContainerStyle={
           catches.length === 0 
             ? { flex: 1, justifyContent: "center" } 
             : { paddingBottom: 100 }
         }
       />

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
              <ScrollView
                horizontal
                style={styles.profilescroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bigimagescroller}
              >
                <Image
                  source={(selectedCatch.image ?? selectedCatch.imageUrl) ? { uri: (selectedCatch.image ?? selectedCatch.imageUrl) } : require("../assets/placeholder.png")}
                  style={{ width: 320, height: 200, borderRadius: 10, marginRight: 8, marginTop: 8 }}
                />
                {(selectedCatch.extraPhotos || []).map((uri, idx) => (
                  <Image
                    key={idx}
                    source={{ uri }}
                    style={{ width: 320, height: 200, borderRadius: 10, marginRight: 8, marginTop: 8 }}
                  />
                ))}
              </ScrollView>

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
                 <TextInput style={styles.input} value={editLength} onChangeText={setEditLength} keyboardType="numeric" />
               ) : (
                 <Text style={styles.value}>{selectedCatch.length || "--"}</Text>
               )}

               <Text style={styles.label}>Вес (kg)</Text>
               {editing ? (
                 <TextInput style={styles.input} value={editWeight} onChangeText={setEditWeight} keyboardType="numeric" />
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
                     <TouchableOpacity
                       style={styles.btnEdit}
                       onPress={() => {
                         if (!selectedCatch) return;
                         setEditDescription(selectedCatch.description || "");
                         setEditLength(selectedCatch.length || "");
                         setEditWeight(selectedCatch.weight || "");
                         setEditing(true);
                       }}
                     >
                       <Text style={styles.btnText}>Редактировать</Text>
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.btnClose} onPress={() => { setSelectedCatch(null); bottomSheetRef.current?.close(); }}>
                       <Text style={styles.btnText}>Закрыть</Text>
                     </TouchableOpacity>
                   </>
                 )}
               </View>
             </View>
           )}
         </BottomSheetView>
       </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 5 },
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
  label: { color: "#ffffffff", fontSize: 14, fontWeight: "600", marginTop: 12 },
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

  profilescroll : {
    marginTop: 0,
  },

  bigimagescroller : {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
  }
});
