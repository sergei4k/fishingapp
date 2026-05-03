import { useAuth } from "@/lib/auth";
import { getGearLabel, getGearOptions, GEAR_CATEGORY_COLOR, GEAR_CATEGORY_ICON } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import { useLanguage } from "@/lib/language";
import { pb } from "@/lib/pocketbase";
import { getSpeciesLabel, getSpeciesOptions } from "@/lib/species";
import speciesPhotos from "@/lib/speciesPhotos";
import { FontAwesome6 as FontAwesome } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;

export type CatchDetail = {
  id: string;
  imageUrl?: string | null;
  extraPhotos?: string[];
  species?: string;
  description?: string;
  length?: string;
  weight?: string;
  date?: string;
  gear?: string;
  username?: string;
  name?: string;
  avatarUrl?: string;
  lat?: number | null;
  lon?: number | null;
  isPublic?: boolean;
};

export type EditableFields = {
  species?: string | null;
  gear?: string | null;
  description?: string;
  length?: string;
  weight?: string;
};

type Props = {
  catch: CatchDetail | null;
  onClose: () => void;
  onLikeChange?: (catchId: string, delta: number, isLiked: boolean, likeId: string | null) => void;
  onCommentAdded?: (catchId: string) => void;
  // Owner-only (show edit/delete/public UI when provided)
  onSave?: (catchId: string, fields: EditableFields) => Promise<void>;
  onDelete?: (catchId: string) => void;
  onTogglePublic?: (catchId: string, isPublic: boolean) => void;
};

export default function CatchDetailModal({
  catch: item,
  onClose,
  onLikeChange,
  onCommentAdded,
  onSave,
  onDelete,
  onTogglePublic,
}: Props) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();

  const [photoIndex, setPhotoIndex] = useState(0);
  const [fullscreenPhotos, setFullscreenPhotos] = useState<string[]>([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const fullscreenScrollRef = useRef<ScrollView>(null);

  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likeId, setLikeId] = useState<string | null>(null);
  const pendingOps = useRef<Record<string, number>>({});

  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editLength, setEditLength] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editSpecies, setEditSpecies] = useState<string | null>(null);
  const [editGear, setEditGear] = useState<string | null>(null);
  const [editSpeciesModal, setEditSpeciesModal] = useState(false);
  const [editGearModal, setEditGearModal] = useState(false);
  const [editSpeciesSearch, setEditSpeciesSearch] = useState("");
  const [editGearSearch, setEditGearSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const catchId = item.id;

    setPhotoIndex(0);
    setLikeCount(0);
    setIsLiked(false);
    setLikeId(null);
    setComments([]);
    setNewComment("");
    setShowComments(false);
    setEditing(false);
    setShowMenu(false);

    (async () => {
      try {
        const [likesResult, commentsResult] = await Promise.all([
          pb.collection("likes").getFullList({ filter: `catch_id = "${catchId}"`, requestKey: null }),
          pb.collection("comments").getFullList({ filter: `catch_id = "${catchId}"`, sort: "created", requestKey: null }),
        ]);
        setLikeCount(likesResult.length);
        const myLike = likesResult.find((l: any) => l.user_id === user?.id);
        setIsLiked(!!myLike);
        setLikeId(myLike?.id ?? null);
        setComments(commentsResult);
      } catch {}
    })();

    let unsub: (() => void) | null = null;
    pb.collection("likes").subscribe("*", (e) => {
      if (e.record?.catch_id !== catchId) return;
      const isOwn = e.record.user_id === user?.id;
      if (isOwn) {
        const key = `${catchId}:${e.action}`;
        if (pendingOps.current[key] && Date.now() - pendingOps.current[key] < 5000) {
          delete pendingOps.current[key];
          return;
        }
      }
      if (e.action === "create") {
        setLikeCount((c) => c + 1);
        if (isOwn) { setIsLiked(true); setLikeId(e.record.id); }
      } else if (e.action === "delete") {
        setLikeCount((c) => Math.max(0, c - 1));
        if (isOwn) { setIsLiked(false); setLikeId(null); }
      }
    }, { requestKey: null } as any)
      .then((fn: () => void) => { unsub = fn; })
      .catch(() => {});

    return () => { unsub?.(); };
  }, [item?.id, user?.id]);

  const toggleLike = async () => {
    if (!item || !user) return;
    const catchId = item.id;
    if (isLiked && likeId) {
      const prevId = likeId;
      pendingOps.current[`${catchId}:delete`] = Date.now();
      setIsLiked(false);
      setLikeCount((c) => c - 1);
      setLikeId(null);
      onLikeChange?.(catchId, -1, false, null);
      try {
        await pb.collection("likes").delete(prevId);
      } catch {
        delete pendingOps.current[`${catchId}:delete`];
        setIsLiked(true);
        setLikeCount((c) => c + 1);
        setLikeId(prevId);
        onLikeChange?.(catchId, 1, true, prevId);
      }
    } else {
      pendingOps.current[`${catchId}:create`] = Date.now();
      setIsLiked(true);
      setLikeCount((c) => c + 1);
      onLikeChange?.(catchId, 1, true, null);
      try {
        const record = await pb.collection("likes").create({ catch_id: catchId, user_id: user.id });
        setLikeId(record.id);
        onLikeChange?.(catchId, 0, true, record.id);
      } catch {
        delete pendingOps.current[`${catchId}:create`];
        setIsLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
        onLikeChange?.(catchId, -1, false, null);
      }
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await pb.collection("comments").delete(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {}
  };

  const submitComment = async () => {
    if (!newComment.trim() || !item || !user) return;
    setSubmitting(true);
    try {
      const record = await pb.collection("comments").create({
        catch_id: item.id,
        user_id: user.id,
        username: user.username || user.name || "",
        text: newComment.trim(),
      });
      setComments((prev) => [...prev, record]);
      setNewComment("");
      onCommentAdded?.(item.id);
    } catch {}
    finally { setSubmitting(false); }
  };

  const handleShare = async () => {
    if (!item) return;
    const species = getSpeciesLabel(item.species, language);
    const parts = [
      species,
      item.weight ? `${item.weight} kg` : null,
      item.length ? `${item.length} cm` : null,
    ].filter(Boolean).join(" • ");
    const message = language === "ru"
      ? `🎣 ${parts}\n\nПоймано в StrikeFeed — приложение для рыбаков\nhttps://www.rustore.ru/catalog/app/com.rybolov.app`
      : `🎣 ${parts}\n\nCaught with StrikeFeed — the fishing app\nhttps://www.rustore.ru/catalog/app/com.rybolov.app`;
    try {
      await Share.share({ message });
    } catch (e) {
      console.warn("share error:", e);
    }
  };

  const startEdit = () => {
    if (!item) return;
    setEditDescription(item.description || "");
    setEditLength(item.length || "");
    setEditWeight(item.weight || "");
    setEditSpecies(item.species ?? null);
    setEditGear(item.gear ?? null);
    setShowMenu(false);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!item || !onSave) return;
    setSaving(true);
    try {
      await onSave(item.id, {
        species: editSpecies,
        gear: editGear,
        description: editDescription,
        length: editLength,
        weight: editWeight,
      });
      setEditing(false);
    } catch {
      Alert.alert(t("error"), t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const photos = [
    ...(item?.imageUrl ? [item.imageUrl] : []),
    ...(item?.extraPhotos || []),
  ];

  const formatDate = (val?: string) => {
    if (!val) return t("recently");
    const d = new Date(val);
    return isNaN(d.getTime()) ? t("recently") : d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
  };

  const canEdit = !!onSave || !!onDelete;

  return (
    <>
      <Modal visible={!!item} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.screen}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <FontAwesome name="arrow-left" size={20} color="#e6eef8" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {getSpeciesLabel(item?.species, language)}
            </Text>
            {canEdit ? (
              <View>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setShowMenu((v) => !v)} hitSlop={8}>
                  <FontAwesome name="ellipsis-vertical" size={20} color="#e6eef8" />
                </TouchableOpacity>
                {showMenu && (
                  <View style={styles.dropdownMenu}>
                    {onSave && (
                      <TouchableOpacity style={styles.dropdownItem} onPress={startEdit}>
                        <FontAwesome name="pencil" size={15} color="#cbd5e1" style={{ marginRight: 10 }} />
                        <Text style={styles.dropdownItemText}>{t("edit")}</Text>
                      </TouchableOpacity>
                    )}
                    {onSave && onDelete && <View style={styles.dropdownDivider} />}
                    {onDelete && (
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        onPress={() => { setShowMenu(false); item && onDelete(item.id); }}
                      >
                        <FontAwesome name="trash" size={15} color="#f87171" style={{ marginRight: 10 }} />
                        <Text style={[styles.dropdownItemText, { color: "#f87171" }]}>{t("delete")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={{ width: 28 }} />
            )}
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* User row */}
            {(item?.username || item?.name || item?.avatarUrl) && (
              <View style={styles.userRow}>
                <View style={styles.avatar}>
                  {item.avatarUrl ? (
                    <ExpoImage source={{ uri: item.avatarUrl }} contentFit="cover" style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarText}>
                      {(item.name || item.username || "?").slice(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={styles.userName}>{item.name || item.username}</Text>
                  {item.name && item.username ? <Text style={styles.userHandle}>@{item.username}</Text> : null}
                </View>
              </View>
            )}

            {/* Photo carousel */}
            {photos.length > 0 && (
              <View>
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
                        placeholder={require("../assets/placeholder.png")}
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

            {/* Like / comment row */}
            <View style={styles.likeCommentRow}>
              <TouchableOpacity style={styles.likeBtn} onPress={toggleLike}>
                <FontAwesome
                  name="thumbs-up"
                  iconStyle={isLiked ? "solid" : "regular"}
                  size={22}
                  color={isLiked ? "#60a5fa" : "#64748b"}
                />
                <Text style={[styles.likeCount, isLiked && styles.likeCountActive]}>{likeCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.commentBtn} onPress={() => setShowComments((s) => !s)}>
                <FontAwesome name="comment" iconStyle="regular" size={22} color="#64748b" />
                <Text style={styles.commentCount}>{comments.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <FontAwesome name="share-from-square" iconStyle="regular" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Comments */}
            {showComments && (
              <View style={styles.commentsSection}>
                {comments.map((c, i) => (
                  <View key={c.id || i} style={styles.commentItem}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={styles.commentUsername}>@{c.username}</Text>
                      {c.user_id === user?.id && (
                        <TouchableOpacity onPress={() => deleteComment(c.id)} hitSlop={8}>
                          <FontAwesome name="trash" size={13} color="#475569" />
                        </TouchableOpacity>
                      )}
                    </View>
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
                  <TouchableOpacity onPress={submitComment} disabled={submitting} style={{ padding: 8 }}>
                    {submitting
                      ? <ActivityIndicator size="small" color="#60a5fa" />
                      : <FontAwesome name="paper-plane" size={18} color="#60a5fa" />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Details body */}
            <View style={styles.body}>
              {editing ? (
                <>
                  <TouchableOpacity style={styles.editPickerRow} onPress={() => setEditSpeciesModal(true)}>
                    {editSpecies && speciesPhotos[editSpecies] && (
                      <ExpoImage source={speciesPhotos[editSpecies]} style={styles.editPickerThumb} contentFit="contain" />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editPickerLabel}>{t("species")}</Text>
                      <Text style={styles.editPickerValue}>{getSpeciesLabel(editSpecies, language)}</Text>
                    </View>
                    <FontAwesome name="chevron-right" size={14} color="#475569" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editPickerRow} onPress={() => setEditGearModal(true)}>
                    {editGear && gearPhotos[editGear] && (
                      <ExpoImage source={gearPhotos[editGear]} style={styles.editPickerThumb} contentFit="contain" />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editPickerLabel}>{t("gear")}</Text>
                      <Text style={styles.editPickerValue}>{editGear ? getGearLabel(editGear, language) : t("gearNotSelected")}</Text>
                    </View>
                    <FontAwesome name="chevron-right" size={14} color="#475569" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.detailSpecies}>{getSpeciesLabel(item?.species, language)}</Text>
                  {item?.gear ? (
                    <View style={styles.detailGearRow}>
                      {gearPhotos[item.gear] && (
                        <ExpoImage source={gearPhotos[item.gear]} style={styles.detailGearThumb} contentFit="contain" />
                      )}
                      <Text style={styles.detailGear}>{getGearLabel(item.gear, language)}</Text>
                    </View>
                  ) : null}
                </>
              )}
              <Text style={styles.detailDate}>{formatDate(item?.date)}</Text>

              <Text style={styles.label}>{t("description")}</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  textAlignVertical="top"
                  returnKeyType="done"
                  placeholderTextColor="#475569"
                  placeholder={t("descriptionPlaceholder")}
                />
              ) : (
                <Text style={styles.value}>{item?.description || t("noDescription")}</Text>
              )}

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Text style={styles.label}>{t("length")}</Text>
                  {editing ? (
                    <TextInput
                      style={styles.input}
                      value={editLength}
                      onChangeText={setEditLength}
                      keyboardType="numeric"
                      returnKeyType="done"
                      placeholderTextColor="#475569"
                      placeholder="cm"
                    />
                  ) : (
                    <Text style={styles.value}>{item?.length ? `${item.length} cm` : "--"}</Text>
                  )}
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.label}>{t("weight")}</Text>
                  {editing ? (
                    <TextInput
                      style={styles.input}
                      value={editWeight}
                      onChangeText={setEditWeight}
                      keyboardType="numeric"
                      returnKeyType="done"
                      placeholderTextColor="#475569"
                      placeholder="kg"
                    />
                  ) : (
                    <Text style={styles.value}>{item?.weight ? `${item.weight} kg` : "--"}</Text>
                  )}
                </View>
              </View>

              {onTogglePublic && (
                <View style={styles.publicRow}>
                  <View>
                    <Text style={styles.publicLabel}>{t("makePublic")}</Text>
                    <Text style={styles.publicSub}>{t("makePublicSub")}</Text>
                  </View>
                  <Switch
                    value={!!item?.isPublic}
                    onValueChange={(v) => {
                      if (item) onTogglePublic(item.id, v);
                    }}
                    trackColor={{ false: "#1e293b", true: "#166534" }}
                    thumbColor={item?.isPublic ? "#22c55e" : "#475569"}
                  />
                </View>
              )}

              <View style={styles.modalActions}>
                {editing ? (
                  <>
                    <TouchableOpacity style={styles.btnSave} onPress={handleSave} disabled={saving}>
                      {saving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.btnText}>{t("save")}</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnCancel} onPress={() => setEditing(false)}>
                      <Text style={styles.btnText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.btnMap}
                    onPress={() => {
                      if (item?.lat != null && item?.lon != null) {
                        onClose();
                        router.navigate({
                          pathname: "/(tabs)",
                          params: { focusLat: item.lat, focusLon: item.lon, catchId: item.id },
                        });
                      } else {
                        Alert.alert(t("noCoordinates"), t("noCoordinatesMessage"));
                      }
                    }}
                  >
                    <FontAwesome name="location-dot" size={18} color="#fff" style={{ marginRight: 6 }} />
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
              <Pressable
                key={i}
                style={{ width: SCREEN_WIDTH, flex: 1, justifyContent: "center" }}
                onPress={() => setFullscreenPhotos([])}
              >
                <ExpoImage source={{ uri }} contentFit="contain" style={{ width: SCREEN_WIDTH, height: "100%" }} />
              </Pressable>
            ))}
          </ScrollView>
          {fullscreenPhotos.length > 1 && (
            <View style={{ position: "absolute", bottom: 40, width: "100%", flexDirection: "row", justifyContent: "center", gap: 6 }}>
              {fullscreenPhotos.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === fullscreenIndex ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === fullscreenIndex ? "#fff" : "rgba(255,255,255,0.35)",
                  }}
                />
              ))}
            </View>
          )}
          <Pressable onPress={() => setFullscreenPhotos([])} style={{ position: "absolute", top: 52, right: 20, padding: 8 }}>
            <FontAwesome name="xmark" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>

      {/* Species picker */}
      <Modal
        visible={editSpeciesModal}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => { setEditSpeciesModal(false); setEditSpeciesSearch(""); }}
      >
        <SafeAreaView style={styles.pickerModal}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{t("selectSpecies")}</Text>
            <TouchableOpacity onPress={() => { setEditSpeciesModal(false); setEditSpeciesSearch(""); }} hitSlop={8}>
              <FontAwesome name="xmark" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
          <View style={styles.pickerSearch}>
            <FontAwesome name="magnifying-glass" size={14} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.pickerSearchInput}
              placeholder={language === "ru" ? "Поиск..." : "Search..."}
              placeholderTextColor="#475569"
              value={editSpeciesSearch}
              onChangeText={setEditSpeciesSearch}
              autoCorrect={false}
              keyboardAppearance="dark"
              clearButtonMode="while-editing"
            />
          </View>
          <FlatList
            data={getSpeciesOptions(language).filter(s => {
              if (!editSpeciesSearch.trim()) return true;
              const q = editSpeciesSearch.toLowerCase();
              return s.labelRu.toLowerCase().includes(q) || s.labelEn.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q);
            })}
            keyExtractor={s => s.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: s }) => (
              <Pressable
                onPress={() => { setEditSpecies(s.id); setEditSpeciesModal(false); setEditSpeciesSearch(""); }}
                style={({ pressed }) => pressed ? { backgroundColor: "#061420" } : undefined}
              >
                <View style={styles.pickerItem}>
                  {speciesPhotos[s.id] ? (
                    <ExpoImage source={speciesPhotos[s.id]} style={styles.pickerItemImg} contentFit="contain" />
                  ) : (
                    <View style={styles.pickerItemImgPlaceholder}>
                      <FontAwesome name="question" size={20} color="#334155" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemText}>{s.label}</Text>
                    <Text style={styles.pickerItemSub}>{s.scientificName}</Text>
                  </View>
                </View>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Gear picker */}
      <Modal
        visible={editGearModal}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => { setEditGearModal(false); setEditGearSearch(""); }}
      >
        <SafeAreaView style={styles.pickerModal}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{t("selectGear")}</Text>
            <TouchableOpacity onPress={() => { setEditGearModal(false); setEditGearSearch(""); }} hitSlop={8}>
              <FontAwesome name="xmark" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
          <View style={styles.pickerSearch}>
            <FontAwesome name="magnifying-glass" size={14} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.pickerSearchInput}
              placeholder={language === "ru" ? "Поиск..." : "Search..."}
              placeholderTextColor="#475569"
              value={editGearSearch}
              onChangeText={setEditGearSearch}
              autoCorrect={false}
              keyboardAppearance="dark"
              clearButtonMode="while-editing"
            />
          </View>
          <FlatList
            data={getGearOptions(language).filter(g => {
              if (!editGearSearch.trim()) return true;
              const q = editGearSearch.toLowerCase();
              return g.labelRu.toLowerCase().includes(q) || g.labelEn.toLowerCase().includes(q);
            })}
            keyExtractor={g => g.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: g }) => (
              <Pressable
                onPress={() => { setEditGear(g.id); setEditGearModal(false); setEditGearSearch(""); }}
                style={({ pressed }) => pressed ? { backgroundColor: "#061420" } : undefined}
              >
                <View style={styles.pickerItem}>
                  {gearPhotos[g.id] ? (
                    <ExpoImage source={gearPhotos[g.id]} style={styles.pickerItemImg} contentFit="contain" />
                  ) : (
                    <View style={[styles.pickerItemImgPlaceholder, { borderWidth: 1.5, borderColor: GEAR_CATEGORY_COLOR[g.category] }]}>
                      <FontAwesome name={GEAR_CATEGORY_ICON[g.category] as any} size={22} color={GEAR_CATEGORY_COLOR[g.category]} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemText}>{g.label}</Text>
                    <Text style={[styles.pickerItemSub, { color: GEAR_CATEGORY_COLOR[g.category] }]}>
                      {t(g.category === "lure" ? "gearCategoryLure" : g.category === "bait" ? "gearCategoryBait" : "gearCategoryRig")}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  closeBtn: { padding: 4 },
  headerTitle: {
    color: "#e6eef8",
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  content: { paddingBottom: 40 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { color: "#60a5fa", fontWeight: "700", fontSize: 15 },
  userName: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  userHandle: { color: "#64748b", fontSize: 13 },
  dotRow: { flexDirection: "row", justifyContent: "center", marginTop: 8, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#334155" },
  dotActive: { backgroundColor: "#60a5fa", width: 16 },
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
  shareBtn: { flexDirection: "row", alignItems: "center", marginLeft: "auto" as any },
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
  commentInput: { flex: 1, color: "#e6eef8", fontSize: 14, paddingVertical: 10 },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  detailSpecies: { color: "#fff", fontSize: 22, fontWeight: "700" },
  detailGearRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4, marginBottom: 8, alignSelf: "flex-start" },
  detailGearThumb: { width: 56, height: 56 },
  detailGear: { color: "#60a5fa", fontSize: 18, fontWeight: "600" },
  detailDate: { color: "#94a3b8", fontSize: 14, marginTop: 4, marginBottom: 8 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 16 },
  value: { color: "#cbd5e1", fontSize: 14, marginTop: 4 },
  metricsRow: { flexDirection: "row", gap: 12 },
  metricItem: { flex: 1 },
  input: { backgroundColor: "#1e293b", color: "#fff", padding: 8, borderRadius: 8, marginTop: 4, minHeight: 40 },
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
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
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
  dropdownItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  dropdownItemText: { color: "#cbd5e1", fontSize: 15, fontWeight: "600" },
  dropdownDivider: { height: 1, backgroundColor: "#1e293b" },
  editPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
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
