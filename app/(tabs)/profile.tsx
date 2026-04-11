import { getSpeciesLabel } from "@/lib/species";
import { useLanguage } from "@/lib/language";
import { getCatches, deleteCatch, updateCatch, CatchItem } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { FontAwesome } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Dimensions } from "react-native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;

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
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editLength, setEditLength] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [fullscreenPhotos, setFullscreenPhotos] = useState<string[]>([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const fullscreenScrollRef = useRef<ScrollView>(null);

  const [showMenu, setShowMenu] = useState(false);

  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likeId, setLikeId] = useState<string | null>(null);
  const [catchComments, setCatchComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const load = async (_opts: { force?: boolean } = {}) => {
    try {
      const items = await getCatches();
      setCatches(items as CatchWithExtras[]);
    } catch (e) {
      console.error("load error:", e);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load({ force: true }); } finally { setRefreshing(false); }
  };

  const fetchLikesAndComments = async (catchId: string) => {
    try {
      const [likesResult, commentsResult] = await Promise.all([
        pb.collection("likes").getFullList({ filter: `catch_id = "${catchId}"`, requestKey: null }),
        pb.collection("comments").getFullList({ filter: `catch_id = "${catchId}"`, sort: "created", requestKey: null }),
      ]);
      setLikeCount(likesResult.length);
      const myLike = likesResult.find((l: any) => l.user_id === user?.id);
      setIsLiked(!!myLike);
      setLikeId(myLike?.id ?? null);
      setCatchComments(commentsResult);
    } catch (e) {
      console.warn("fetchLikesAndComments error:", e);
    }
  };

  const toggleLike = async () => {
    if (!selectedCatch || !user) return;
    if (isLiked && likeId) {
      const prevId = likeId;
      setIsLiked(false);
      setLikeCount((c) => c - 1);
      setLikeId(null);
      try {
        await pb.collection("likes").delete(prevId);
      } catch (e) {
        setIsLiked(true);
        setLikeCount((c) => c + 1);
        setLikeId(prevId);
      }
    } else {
      setIsLiked(true);
      setLikeCount((c) => c + 1);
      try {
        const record = await pb.collection("likes").create({ catch_id: selectedCatch.id, user_id: user.id });
        setLikeId(record.id);
      } catch (e) {
        setIsLiked(false);
        setLikeCount((c) => c - 1);
      }
    }
  };

  const submitComment = async () => {
    if (!newComment.trim() || !selectedCatch || !user) return;
    setSubmittingComment(true);
    try {
      const record = await pb.collection("comments").create({
        catch_id: selectedCatch.id,
        user_id: user.id,
        username: user.username || user.name || "",
        text: newComment.trim(),
      });
      setCatchComments((prev) => [...prev, record]);
      setNewComment("");
    } catch (e) {
      console.warn("submitComment error:", e);
    } finally {
      setSubmittingComment(false);
    }
  };

  const openCatch = (item: CatchWithExtras) => {
    setSelectedCatch(item);
    setPhotoIndex(0);
    setEditing(false);
    setLikeCount(0);
    setIsLiked(false);
    setLikeId(null);
    setCatchComments([]);
    setNewComment("");
    setShowComments(false);
    fetchLikesAndComments(item.id);
  };

  const closeCatch = () => {
    setSelectedCatch(null);
    setEditing(false);
    setShowMenu(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert(t("deleteConfirm"), t("deleteConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCatch(id);
            await load({ force: true });
            closeCatch();
          } catch (e) {
            Alert.alert(t("error"), t("deleteError"));
          }
        },
      },
    ]);
  };

  const togglePublic = async (value: boolean) => {
    if (!selectedCatch) return;
    const updated = { ...selectedCatch, isPublic: value };
    setSelectedCatch(updated);
    await updateCatch(selectedCatch.id, updated);
    try {
      await pb.collection("catches").update(selectedCatch.id, { is_public: value });
    } catch (e) {
      console.warn("togglePublic error:", e);
    }
    await load();
  };

  const onSave = async () => {
    if (!selectedCatch) return;
    try {
      const parsedLength = parseFloat(editLength);
      const parsedWeight = parseFloat(editWeight);
      const updatedItem: CatchWithExtras = {
        ...selectedCatch,
        description: editDescription ?? "",
        length: isNaN(parsedLength) ? "" : String(parsedLength),
        weight: isNaN(parsedWeight) ? "" : String(parsedWeight),
      };
      await updateCatch(selectedCatch.id, updatedItem);
      setEditing(false);
      setSelectedCatch(updatedItem);
      await load({ force: true });
    } catch (e) {
      Alert.alert(t("error"), t("saveError"));
    }
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

  const photos = selectedCatch ? [
    selectedCatch.image ?? selectedCatch.imageUrl ?? null,
    ...(selectedCatch.extraPhotos || []),
  ].filter(Boolean) as string[] : [];

  return (
    <SafeAreaView style={styles.container}>
      {user && (
        <View style={styles.profileHeader}>
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
            <Text style={styles.profileCatchCount}>{catchCountLabel(catches.length)}</Text>
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
        contentContainerStyle={catches.length === 0 ? { flex: 1, justifyContent: "center" } : { paddingBottom: 100 }}
      />

      {/* Catch detail modal */}
      <Modal
        visible={!!selectedCatch}
        animationType="slide"
        onRequestClose={closeCatch}
      >
        <SafeAreaView style={styles.detailScreen}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={closeCatch} style={styles.detailBack}>
              <FontAwesome name="arrow-left" size={20} color="#e6eef8" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {getSpeciesLabel(selectedCatch?.species, language)}
            </Text>
            <View>
              <TouchableOpacity onPress={() => setShowMenu((v) => !v)} style={styles.detailBack} hitSlop={8}>
                <FontAwesome name="ellipsis-v" size={20} color="#e6eef8" />
              </TouchableOpacity>
              {showMenu && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      setShowMenu(false);
                      if (!selectedCatch) return;
                      setEditDescription(selectedCatch.description || "");
                      setEditLength(selectedCatch.length || "");
                      setEditWeight(selectedCatch.weight || "");
                      setEditing(true);
                    }}
                  >
                    <FontAwesome name="pencil" size={15} color="#cbd5e1" style={{ marginRight: 10 }} />
                    <Text style={styles.dropdownItemText}>{t("edit")}</Text>
                  </TouchableOpacity>
                  <View style={styles.dropdownDivider} />
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      setShowMenu(false);
                      selectedCatch && handleDelete(selectedCatch.id);
                    }}
                  >
                    <FontAwesome name="trash" size={15} color="#f87171" style={{ marginRight: 10 }} />
                    <Text style={[styles.dropdownItemText, { color: "#f87171" }]}>{t("delete")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
            {user && (
              <View style={styles.detailUserRow}>
                <View style={styles.detailAvatar}>
                  {user.avatar ? (
                    <ExpoImage
                      source={{ uri: `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` }}
                      contentFit="cover"
                      style={styles.detailAvatarImg}
                    />
                  ) : (
                    <Text style={styles.detailAvatarText}>
                      {(user.name || user.username || "?").slice(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View>
                  {user.name ? <Text style={styles.detailUserName}>{user.name}</Text> : null}
                  {user.username ? <Text style={styles.detailUserHandle}>@{user.username}</Text> : null}
                </View>
              </View>
            )}

            {/* Photo carousel */}
            {photos.length > 0 && (
              <View style={styles.carouselWrapper}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  style={{ width: SCREEN_WIDTH }}
                  onMomentumScrollEnd={(e) =>
                    setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
                  }
                >
                  {photos.map((uri, i) => (
                    <TouchableOpacity
                      key={i}
                      activeOpacity={0.9}
                      onPress={() => {
                        setFullscreenPhotos(photos);
                        setFullscreenIndex(i);
                        setTimeout(() => fullscreenScrollRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: false }), 50);
                      }}
                    >
                      <ExpoImage
                        source={{ uri }}
                        placeholder={require("../../assets/placeholder.png")}
                        contentFit="cover"
                        style={{ width: SCREEN_WIDTH, height: 280 }}
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {photos.length > 1 && (
                  <View style={styles.dotRow}>
                    {photos.map((_, i) => (
                      <View key={i} style={[styles.dot, i === photoIndex && styles.dotActive]} />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Like and comment row */}
            <View style={styles.likeCommentRow}>
              <TouchableOpacity style={styles.likeBtn} onPress={toggleLike}>
                <FontAwesome
                  name={isLiked ? "thumbs-up" : "thumbs-o-up"}
                  size={22}
                  color={isLiked ? "#60a5fa" : "#64748b"}
                />
                <Text style={[styles.likeCount, isLiked && styles.likeCountActive]}>{likeCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.commentBtn} onPress={() => setShowComments((s) => !s)}>
                <FontAwesome name="comment-o" size={22} color="#64748b" />
                <Text style={styles.commentCount}>{catchComments.length}</Text>
              </TouchableOpacity>
            </View>

            {/* Comments section */}
            {showComments && (
              <View style={styles.commentsSection}>
                {catchComments.map((c, i) => (
                  <View key={c.id || i} style={styles.commentItem}>
                    <Text style={styles.commentUsername}>@{c.username}</Text>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                ))}
                <View style={styles.commentInputRow}>
                  <TextInput
                    style={styles.commentInput}
                    value={newComment}
                    onChangeText={setNewComment}
                    placeholder={t("addComment")}
                    placeholderTextColor="#475569"
                    returnKeyType="send"
                    onSubmitEditing={submitComment}
                  />
                  <TouchableOpacity onPress={submitComment} disabled={submittingComment} style={{ padding: 8 }}>
                    {submittingComment ? (
                      <ActivityIndicator size="small" color="#60a5fa" />
                    ) : (
                      <FontAwesome name="send" size={18} color="#60a5fa" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.detailBody}>
              <Text style={styles.detailSpecies}>{getSpeciesLabel(selectedCatch?.species, language)}</Text>
              <Text style={styles.detailDate}>{formatDate(selectedCatch?.date, true)}</Text>

              <Text style={styles.label}>{t("description")}</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  textAlignVertical="top"
                  returnKeyType="done"
                />
              ) : (
                <Text style={styles.value}>{selectedCatch?.description || t("noDescription")}</Text>
              )}

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.label}>{t("length")}</Text>
                  {editing ? (
                    <TextInput style={styles.input} value={editLength} onChangeText={setEditLength} keyboardType="numeric" returnKeyType="done" />
                  ) : (
                    <Text style={styles.value}>{selectedCatch?.length ? `${selectedCatch.length} cm` : "--"}</Text>
                  )}
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.label}>{t("weight")}</Text>
                  {editing ? (
                    <TextInput style={styles.input} value={editWeight} onChangeText={setEditWeight} keyboardType="numeric" returnKeyType="done" />
                  ) : (
                    <Text style={styles.value}>{selectedCatch?.weight ? `${selectedCatch.weight} kg` : "--"}</Text>
                  )}
                </View>
              </View>

              <View style={styles.publicRow}>
                <View>
                  <Text style={styles.publicLabel}>{t("makePublic")}</Text>
                  <Text style={styles.publicSub}>{t("makePublicSub")}</Text>
                </View>
                <Switch
                  value={!!selectedCatch?.isPublic}
                  onValueChange={togglePublic}
                  trackColor={{ false: "#1e293b", true: "#166534" }}
                  thumbColor={selectedCatch?.isPublic ? "#22c55e" : "#475569"}
                />
              </View>

              <View style={styles.modalActions}>
                {editing ? (
                  <>
                    <TouchableOpacity style={styles.btnSave} onPress={onSave}>
                      <Text style={styles.btnText}>{t("save")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnCancel} onPress={() => setEditing(false)}>
                      <Text style={styles.btnText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.btnMap}
                    onPress={() => {
                      if (selectedCatch?.lat != null && selectedCatch?.lon != null) {
                        closeCatch();
                        router.navigate({
                          pathname: "/(tabs)",
                          params: { focusLat: selectedCatch.lat, focusLon: selectedCatch.lon, catchId: selectedCatch.id },
                        });
                      } else {
                        Alert.alert(t("noCoordinates"), t("noCoordinatesMessage"));
                      }
                    }}
                  >
                    <FontAwesome name="map-marker" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.btnText}>{t("showOnMap")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Fullscreen photo viewer */}
      <Modal visible={fullscreenPhotos.length > 0} transparent animationType="fade" onRequestClose={() => setFullscreenPhotos([])}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <ScrollView
            ref={fullscreenScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            style={{ width: SCREEN_WIDTH, flex: 1 }}
            onMomentumScrollEnd={(e) =>
              setFullscreenIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
            }
          >
            {fullscreenPhotos.map((uri, i) => (
              <Pressable key={i} style={{ width: SCREEN_WIDTH, flex: 1, justifyContent: "center" }} onPress={() => setFullscreenPhotos([])}>
                <ExpoImage source={{ uri }} contentFit="contain" style={{ width: SCREEN_WIDTH, height: "100%" }} />
              </Pressable>
            ))}
          </ScrollView>
          {fullscreenPhotos.length > 1 && (
            <View style={{ position: "absolute", bottom: 40, width: "100%", flexDirection: "row", justifyContent: "center", gap: 6 }}>
              {fullscreenPhotos.map((_, i) => (
                <View key={i} style={{ width: i === fullscreenIndex ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === fullscreenIndex ? "#fff" : "rgba(255,255,255,0.35)" }} />
              ))}
            </View>
          )}
          <Pressable onPress={() => setFullscreenPhotos([])} style={{ position: "absolute", top: 52, right: 20, padding: 8 }}>
            <FontAwesome name="times" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 5 },
  title: { color: "#e6eef8", fontSize: 18, marginBottom: 4 },
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
  profileCatchCount: { color: "#60a5fa", fontSize: 13, marginTop: 4 },
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
    backgroundColor: "#0f2236",
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
});
