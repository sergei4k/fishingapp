import { getSpeciesLabel } from "@/lib/species";
import { getGearLabel } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import { useLanguage } from "@/lib/language";
import BadgeChip from "@/components/BadgeChip";
import { parseBadges } from "@/lib/badges";
import { getCatches, deleteCatch, updateCatch, CatchItem } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import CatchDetailModal, { EditableFields } from "@/components/CatchDetailModal";
import { FontAwesome6 as FontAwesome } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from "react-native-safe-area-context";

type CatchWithExtras = CatchItem & { extraPhotos?: string[] };

export default function Profile() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { user } = useAuth();

  const catchCountLabel = (n: number) => {
    if (language === "ru") {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return `${n} улов`;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} улова`;
      return `${n} уловов`;
    }
    return `${n} ${n === 1 ? "catch" : "catches"}`;
  };

  const formatDate = (val: any, full = false) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    const locale = language === "ru" ? "ru-RU" : "en-US";
    return full ? d.toLocaleString(locale) : d.toLocaleDateString(locale);
  };

  const [catches, setCatches] = useState<CatchWithExtras[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCatch, setSelectedCatch] = useState<CatchWithExtras | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const load = async (_opts: { force?: boolean } = {}) => {
    try {
      const items = await getCatches();
      setCatches(items as CatchWithExtras[]);
    } catch (e) {
      console.error("load error:", e);
    }
  };

  useFocusEffect(useCallback(() => {
    load();
    if (user) {
      Promise.all([
        pb.collection("follows").getList(1, 1, { filter: `following_id = "${user.id}"`, requestKey: null }),
        pb.collection("follows").getList(1, 1, { filter: `follower_id = "${user.id}"`, requestKey: null }),
      ]).then(([followers, following]) => {
        setFollowerCount(followers.totalItems);
        setFollowingCount(following.totalItems);
      }).catch(() => {});
    }
  }, [user]));

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load({ force: true }); } finally { setRefreshing(false); }
  };

  const openCatch = (item: CatchWithExtras) => setSelectedCatch(item);
  const closeCatch = () => setSelectedCatch(null);

  const handleDelete = (id: string) => {
    Alert.alert(t("deleteConfirm"), t("deleteConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCatch(id);
            try {
              await pb.collection('catches').delete(id);
            } catch (_) {
              // not on server or already deleted — ignore
            }
            await load({ force: true });
            closeCatch();
          } catch (e) {
            Alert.alert(t("error"), t("deleteError"));
          }
        },
      },
    ]);
  };

  const handleSave = async (catchId: string, fields: EditableFields) => {
    if (!selectedCatch) return;
    const parsedLength = parseFloat(fields.length ?? "");
    const parsedWeight = parseFloat(fields.weight ?? "");
    const updatedItem: CatchWithExtras = {
      ...selectedCatch,
      description: fields.description ?? "",
      length: isNaN(parsedLength) ? "" : String(parsedLength),
      weight: isNaN(parsedWeight) ? "" : String(parsedWeight),
      species: fields.species ?? undefined,
      gear: fields.gear ?? undefined,
    };
    await updateCatch(catchId, updatedItem);
    try {
      await pb.collection('catches').update(catchId, {
        species: fields.species ?? '',
        gear: fields.gear ?? '',
        description: fields.description ?? '',
        length_cm: isNaN(parsedLength) ? null : parsedLength,
        weight_kg: isNaN(parsedWeight) ? null : parsedWeight,
      });
    } catch (_) {}
    setSelectedCatch(updatedItem);
    await load({ force: true });
  };

  const handleTogglePublic = async (catchId: string, value: boolean) => {
    if (!selectedCatch) return;
    const updated = { ...selectedCatch, isPublic: value };
    setSelectedCatch(updated);
    await updateCatch(catchId, updated);
    try {
      await pb.collection("catches").update(catchId, { is_public: value });
    } catch (_) {}
    await load();
  };

  const renderItem = ({ item }: { item: CatchWithExtras }) => (
    <Swipeable
      renderRightActions={() => (
        <View style={styles.deleteAction}>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
            <Text style={styles.deleteText}>{t("delete")}</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      <TouchableOpacity style={styles.item} onPress={() => openCatch(item)}>
        <ExpoImage
          source={(item.image ?? item.imageUrl) ? { uri: (item.image ?? item.imageUrl) } : require("../../assets/placeholder.png")}
          placeholder={require("../../assets/placeholder.png")}
          contentFit="cover"
          style={styles.thumb}
        />
        <View style={styles.info}>
          <Text style={styles.species}>{getSpeciesLabel(item.species, language)}</Text>
          {item.gear ? (
            <View style={styles.gearRow}>
              {gearPhotos[item.gear] && <ExpoImage source={gearPhotos[item.gear]} style={styles.gearThumb} contentFit="contain" />}
              <Text style={styles.gear}>{getGearLabel(item.gear, language)}</Text>
            </View>
          ) : null}
          <Text style={styles.desc} numberOfLines={1}>{item.description || t("noDescription")}</Text>
          <Text style={styles.meta}>
            {item.length ? `${item.length} cm` : "--"} • {item.weight ? `${item.weight} kg` : "--"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={styles.date}>{formatDate(item.date)}</Text>
          {!item.isPublic && (
            <FontAwesome name="lock" size={12} color="#475569" />
          )}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {user && (
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/settings')} style={styles.settingsBtn}>
            <FontAwesome name="gear" size={22} color="#94a3b8" />
          </TouchableOpacity>
          <View style={styles.profileAvatar}>
            {user.avatar ? (
              <ExpoImage
                source={{ uri: `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` }}
                contentFit="cover"
                style={styles.profileAvatarImage}
              />
            ) : (
              <Text style={styles.profileAvatarText}>
                {(user.name || user.username || "?").slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.profileInfo}>
            {user.name ? <Text style={styles.profileName}>{user.name}</Text> : null}
            {user.username ? <Text style={styles.profileUsername}>@{user.username}</Text> : null}
            <BadgeChip badges={parseBadges(user.badges)} language={language} />
            {user.bio ? <Text style={styles.profileBio}>{user.bio}</Text> : null}
            <View style={styles.profileStats}>
              <Text style={styles.profileCatchCount}>{catchCountLabel(catches.length)}</Text>
              <Text style={styles.profileStatDivider}>·</Text>
              <Text style={styles.profileStatItem}>
                <Text style={styles.profileStatNum}>{followerCount}</Text>
                {" "}{language === "ru" ? "подписчиков" : "followers"}
              </Text>
              <Text style={styles.profileStatDivider}>·</Text>
              <Text style={styles.profileStatItem}>
                <Text style={styles.profileStatNum}>{followingCount}</Text>
                {" "}{language === "ru" ? "подписок" : "following"}
              </Text>
            </View>
          </View>
        </View>
      )}

      <FlatList
        data={catches}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        ListEmptyComponent={<Text style={styles.empty}>{t("empty")}</Text>}
        contentContainerStyle={catches.length === 0 ? { flex: 1, justifyContent: "center" } : { paddingBottom: 140 }}
      />

      <CatchDetailModal
        catch={selectedCatch ? {
          id: selectedCatch.id,
          imageUrl: selectedCatch.image ?? selectedCatch.imageUrl ?? null,
          extraPhotos: selectedCatch.extraPhotos,
          species: selectedCatch.species,
          description: selectedCatch.description,
          length: selectedCatch.length,
          weight: selectedCatch.weight,
          date: selectedCatch.date,
          gear: selectedCatch.gear,
          username: user?.username,
          name: user?.name,
          avatarUrl: user?.avatar
            ? `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}`
            : undefined,
          lat: selectedCatch.lat,
          lon: selectedCatch.lon,
          isPublic: selectedCatch.isPublic,
        } : null}
        onClose={closeCatch}
        onSave={handleSave}
        onDelete={handleDelete}
        onTogglePublic={handleTogglePublic}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 5 },
  title: { color: "#e6eef8", fontSize: 18, marginBottom: 4 },
  settingsBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 1,
    padding: 4,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileAvatarImage: { width: 64, height: 64, borderRadius: 32 },
  profileAvatarText: { color: "#60a5fa", fontWeight: "700", fontSize: 22 },
  profileInfo: { flex: 1 },
  profileName: { color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  profileUsername: { color: "#64748b", fontSize: 14, marginTop: 2 },
  profileStats: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 4 },
  profileCatchCount: { color: "#60a5fa", fontSize: 13 },
  profileStatDivider: { color: "#334155", fontSize: 13 },
  profileStatItem: { color: "#60a5fa", fontSize: 13 },
  profileStatNum: { fontWeight: "700" },
  profileBio: { color: "#94a3b8", fontSize: 13, marginTop: 4, lineHeight: 18 },
  empty: { color: "#94a3b8", textAlign: "center" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  thumb: { width: 72, height: 72, borderRadius: 8, marginRight: 12 },
  info: { flex: 1 },
  species: { color: "#cfe8ff", fontWeight: "600" },
  gearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, alignSelf: "flex-start" },
  gearThumb: { width: 36, height: 36 },
  gear: { color: "#60a5fa", fontSize: 14, fontWeight: "600" },
  detailGearRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4, marginBottom: 8, alignSelf: "flex-start" },
  detailGearThumb: { width: 56, height: 56 },
  detailGear: { color: "#60a5fa", fontSize: 18, fontWeight: "600" },
  desc: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  meta: { color: "#7ea8c9", fontSize: 12, marginTop: 6 },
  date: { color: "#94a3b8", fontSize: 12, marginLeft: 8 },
  deleteAction: { justifyContent: "center" },
  deleteButton: {
    backgroundColor: "#7d1616",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    marginVertical: 8,
    marginRight: 12,
  },
  deleteText: { color: "#fff", fontWeight: "700" },
  detailScreen: { flex: 1, backgroundColor: "#0f172a" },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  detailBack: { padding: 4 },
  detailHeaderTitle: { color: "#e6eef8", fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center", marginHorizontal: 8 },
  detailContent: { paddingBottom: 40 },
  carouselWrapper: { marginBottom: 4 },
  dotRow: { flexDirection: "row", justifyContent: "center", marginTop: 8, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#334155" },
  dotActive: { backgroundColor: "#60a5fa", width: 16 },
  detailBody: { paddingHorizontal: 20, paddingTop: 16 },
  detailUserRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  detailAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  detailAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  detailAvatarText: { color: "#60a5fa", fontWeight: "700", fontSize: 15 },
  detailUserName: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  detailUserHandle: { color: "#64748b", fontSize: 13 },
  detailSpecies: { color: "#fff", fontSize: 22, fontWeight: "700" },
  detailDate: { color: "#94a3b8", fontSize: 14, marginTop: 4, marginBottom: 8 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 16 },
  value: { color: "#cbd5e1", fontSize: 14, marginTop: 4 },
  metricsRow: { flexDirection: "row", gap: 12 },
  metricItem: { flex: 1 },
  input: { backgroundColor: "#1e293b", color: "#fff", padding: 8, borderRadius: 8, marginTop: 4, minHeight: 40 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  btnEdit: {
    backgroundColor: "#1e3a5f",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  btnSave: {
    backgroundColor: "#1e3a5f",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  btnCancel: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  btnMap: {
    backgroundColor: "#0c4a6e",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  btnText: { color: "#cbd5e1", fontWeight: "700", fontSize: 15 },
  btnDelete: {
    backgroundColor: "#7d1616",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  likeCommentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  likeCount: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  likeCountActive: { color: "#60a5fa" },
  commentCount: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  commentsSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  commentItem: { marginBottom: 10 },
  commentUsername: { color: "#60a5fa", fontSize: 13, fontWeight: "600" },
  commentText: { color: "#cbd5e1", fontSize: 14, marginTop: 2 },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  commentInput: {
    flex: 1,
    color: "#e6eef8",
    fontSize: 14,
    paddingVertical: 10,
  },
  dropdownMenu: {
    position: "absolute",
    top: 32,
    right: 0,
    backgroundColor: "#071023",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    minWidth: 150,
    zIndex: 100,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownItemText: {
    color: "#cbd5e1",
    fontSize: 15,
    fontWeight: "600",
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: "#1e293b",
  },
  publicRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#071023",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  publicLabel: { color: "#e6eef8", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  publicSub: { color: "#64748b", fontSize: 12 },
  editPickerRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#071023", borderRadius: 10, padding: 12, marginBottom: 10, gap: 12, borderWidth: 1, borderColor: "#1e293b" },
  editPickerThumb: { width: 44, height: 44 },
  editPickerLabel: { color: "#64748b", fontSize: 12, marginBottom: 2 },
  editPickerValue: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  pickerModal: { flex: 1, backgroundColor: "#071023" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  pickerTitle: { color: "#cfe8ff", fontSize: 16, fontWeight: "700" },
  pickerSearch: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f2236", borderRadius: 10, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8 },
  pickerSearchInput: { flex: 1, color: "#e6eef8", fontSize: 15, padding: 0 },
  pickerItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, borderBottomColor: "#0b1220", borderBottomWidth: 1, gap: 12 },
  pickerItemImg: { width: 52, height: 52, flexShrink: 0 },
  pickerItemImgPlaceholder: { width: 52, height: 52, borderRadius: 8, backgroundColor: "#0f2236", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pickerItemText: { color: "#e6eef8", fontSize: 16 },
  pickerItemSub: { color: "#94a3b8", fontSize: 13, fontStyle: "italic", marginTop: 3 },
});
