import { useAuth, useRequireAuth } from "@/lib/auth";
import { theme } from '../lib/theme';
import { getGearLabel, getGearOptions, GEAR_CATEGORY_COLOR, GEAR_CATEGORY_ICON } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import { useLanguage } from "@/lib/language";
import { isProfane } from "@/lib/profanity";
import { pb } from "@/lib/pocketbase";
import { getSpeciesHabitat, getSpeciesLabel, getSpeciesOptions, type SpeciesHabitat } from "@/lib/species";
import speciesPhotos from "@/lib/speciesPhotos";
import { Ionicons } from "@expo/vector-icons";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, ActivityIndicator, Alert, Dimensions, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

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
  userId?: string;
  username?: string;
  name?: string;
  avatarUrl?: string;
  verified?: boolean;
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
  onCommentCountSynced?: (catchId: string, count: number) => void;
  // Owner-only (show edit/delete/public UI when provided)
  onSave?: (catchId: string, fields: EditableFields) => Promise<void>;
  onDelete?: (catchId: string) => void;
  onTogglePublic?: (catchId: string, isPublic: boolean) => void;
  onUserPress?: (userId: string) => void;
  onReportCatch?: (catchId: string, userId?: string | null) => void;
  onReportComment?: (commentId: string, userId?: string | null, catchId?: string | null) => void;
  onBlockUser?: (userId: string) => void;
  blockedUserIds?: string[];
};

export default function CatchDetailModal({
  catch: item,
  onClose,
  onLikeChange,
  onCommentAdded,
  onCommentCountSynced,
  onSave,
  onDelete,
  onTogglePublic,
  onUserPress,
  onReportCatch,
  onReportComment,
  onBlockUser,
  blockedUserIds = [],
}: Props) {
  const { user } = useAuth();
  const requireAuth = useRequireAuth();
  const { language, t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeTop = insets.top;
  const safeBottom = insets.bottom;

  const [photoIndex, setPhotoIndex] = useState(0);
  const [fullscreenPhotos, setFullscreenPhotos] = useState<string[]>([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const fullscreenScrollRef = useRef<ScrollView>(null);

  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likeId, setLikeId] = useState<string | null>(null);
  const pendingOps = useRef<Record<string, number>>({});
  const likeScale = useRef(new Animated.Value(1)).current;

  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentsInitialized, setCommentsInitialized] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editLength, setEditLength] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editSpecies, setEditSpecies] = useState<string | null>(null);
  const [editGear, setEditGear] = useState<string | null>(null);
  const [editSpeciesModal, setEditSpeciesModal] = useState(false);
  const [editSpeciesTab, setEditSpeciesTab] = useState<SpeciesHabitat>("freshwater");
  const [editGearModal, setEditGearModal] = useState(false);
  const [editSpeciesSearch, setEditSpeciesSearch] = useState("");
  const [editGearSearch, setEditGearSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentCatchId = item?.id ?? null;
  const commentCountSyncRef = useRef(onCommentCountSynced);

  const upsertComment = (list: any[], nextComment: any) => {
    if (!nextComment?.id) return list;
    const existingIndex = list.findIndex((comment) => comment.id === nextComment.id);
    if (existingIndex === -1) return [...list, nextComment];
    return list.map((comment, index) => (index === existingIndex ? nextComment : comment));
  };

  const avatarUrlFromUser = (u: any): string | null =>
    u?.avatar ? `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=100x100` : null;

  const formatCommentDate = (value: unknown) => {
    if (!value) return "";
    const date = new Date(typeof value === "number" ? value : String(value));
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    commentCountSyncRef.current = onCommentCountSynced;
  }, [onCommentCountSynced]);

  useEffect(() => {
    if (!currentCatchId || !commentsInitialized) return;
    commentCountSyncRef.current?.(currentCatchId, comments.length);
  }, [comments.length, commentsInitialized, currentCatchId]);

  useEffect(() => {
    if (fullscreenPhotos.length === 0) return;
    const frame = requestAnimationFrame(() => {
      fullscreenScrollRef.current?.scrollTo({ x: fullscreenIndex * SCREEN_WIDTH, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [fullscreenPhotos.length, fullscreenIndex]);

  useEffect(() => {
    if (!currentCatchId) return;
    const catchId = currentCatchId;

    setPhotoIndex(0);
    setLikeCount(0);
    setIsLiked(false);
    setLikeId(null);
    setComments([]);
    setNewComment("");
    setShowComments(false);
    setCommentsInitialized(false);
    setEditing(false);
    setShowMenu(false);
    setEditSpeciesSearch("");
    setEditGearSearch("");

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

        // Fetch commenters' avatars explicitly (works whether user_id is a relation or text)
        const commenterIds = [...new Set(commentsResult.map((c: any) => c.user_id).filter(Boolean))] as string[];
        const userMap: Record<string, any> = {};
        if (commenterIds.length > 0) {
          const users = await pb.collection("users").getFullList({
            filter: commenterIds.map((id) => `id = "${id}"`).join(" || "),
            fields: "id,avatar",
            requestKey: null,
          }).catch(() => [] as any[]);
          for (const u of users) userMap[u.id] = u;
        }
        setComments(commentsResult.map((c: any) => ({ ...c, _avatarUrl: avatarUrlFromUser(userMap[c.user_id]) })));
        setCommentsInitialized(true);
      } catch {}
    })();

    let unsubComments: (() => void) | null = null;
    pb.collection("comments").subscribe("*", (e) => {
      if (e.record?.catch_id !== catchId) return;
      if (e.action === "create") {
        setComments((prev) => upsertComment(prev, e.record));
        setCommentsInitialized(true);
        // Backfill the commenter's avatar (realtime events have no expand)
        (async () => {
          let avatarUrl: string | null = null;
          try {
            if (e.record.user_id === user?.id) {
              avatarUrl = avatarUrlFromUser(user);
            } else {
              const u = await pb.collection("users").getOne(e.record.user_id, { fields: "id,avatar", requestKey: null });
              avatarUrl = avatarUrlFromUser(u);
            }
          } catch {}
          setComments((prev) => prev.map((c) => (c.id === e.record.id ? { ...c, _avatarUrl: avatarUrl } : c)));
        })();
      } else if (e.action === "delete") {
        setComments((prev) => prev.filter((c) => c.id !== e.record.id));
        setCommentsInitialized(true);
      }
    }, { requestKey: null } as any)
      .then((fn: () => void) => { unsubComments = fn; })
      .catch(() => {});

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

    return () => { unsub?.(); unsubComments?.(); };
  }, [currentCatchId, user?.id]);

  const animateLike = () => {
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
  };

  const toggleLike = async () => {
    if (!requireAuth()) return;
    if (!item || !user) return;
    animateLike();
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
      setCommentsInitialized(true);
    } catch {}
  };

  const submitComment = async () => {
    if (submitting) return;
    if (!user) { requireAuth(); return; }
    if (!newComment.trim() || !item) return;
    if (isProfane(newComment.trim())) {
      Alert.alert(
        t("error"),
        language === "ru" ? "Комментарий содержит недопустимый текст." : "The comment contains objectionable text."
      );
      return;
    }
    setSubmitting(true);
    try {
      if (pb.authStore.record?.id !== user.id) {
        console.warn("[comments] auth user mismatch", {
          contextUserId: user.id,
          authStoreUserId: pb.authStore.record?.id ?? null,
        });
        pb.authStore.clear();
        router.push("/(auth)/login" as any);
        return;
      }

      if (!pb.authStore.isValid) {
        try {
          await pb.collection("users").authRefresh({ requestKey: null });
        } catch (authError: any) {
          console.warn("[comments] auth refresh failed", authError?.status, authError?.message, JSON.stringify(authError?.response));
          pb.authStore.clear();
          router.push("/(auth)/login" as any);
          return;
        }
      }

      const text = newComment.trim();
      const record = await pb.collection("comments").create({
        catch_id: item.id,
        user_id: user.id,
        username: user.username || user.name || "",
        text,
      }, { requestKey: null });
      setComments((prev) => upsertComment(prev, { ...record, _avatarUrl: avatarUrlFromUser(user) }));
      setCommentsInitialized(true);
      setNewComment("");
      onCommentAdded?.(item.id);
      // Push is sent server-side (pb_hooks) in the recipient's saved language.
    } catch (error: any) {
      console.warn("[comments] create failed", error?.status, error?.message, JSON.stringify(error?.response));
      Alert.alert(t("error"), t("saveError"));
    } finally { setSubmitting(false); }
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
      ? `🎣 ${parts}\n\nПоймано в StrikeFeed — приложение для рыбаков\nhttps://play.google.com/store/apps/details?id=com.strikefeed.myapp`
      : `🎣 ${parts}\n\nCaught with StrikeFeed — the fishing app\nhttps://play.google.com/store/apps/details?id=com.strikefeed.myapp`;
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
    setEditSpeciesTab(getSpeciesHabitat(item.species));
    setEditGear(item.gear ?? null);
    setShowMenu(false);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!item || !onSave) return;
    if (editDescription.trim() && isProfane(editDescription)) {
      Alert.alert(
        t("error"),
        language === "ru" ? "Описание содержит недопустимый текст." : "The description contains objectionable text."
      );
      return;
    }
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

  const openFullscreenPhoto = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenPhotos(photos);
  };

  const formatDate = (val?: string) => {
    if (!val) return t("recently");
    const num = Number(val);
    const d = !isNaN(num) && num > 0 ? new Date(num) : new Date(val);
    return isNaN(d.getTime()) ? t("recently") : d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
  };

  const canEdit = !!onSave || !!onDelete;
  const isOwner = canEdit || (!!item?.userId && item.userId === user?.id);
  const canModerate = !!item?.userId && !isOwner && (!!onReportCatch || !!onBlockUser);
  const canShowMenu = canEdit || canModerate;

  return (
    <>
      <Modal visible={!!item} animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={[styles.screen, { paddingTop: safeTop }]}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color="#e6eef8" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {getSpeciesLabel(item?.species, language)}
            </Text>
            {canShowMenu ? (
              <View>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setShowMenu((v) => !v)} hitSlop={8}>
                  <Ionicons name="ellipsis-vertical" size={20} color="#e6eef8" />
                </TouchableOpacity>
                {showMenu && (
                  <View style={styles.dropdownMenu}>
                    {onSave && isOwner && (
                      <TouchableOpacity style={styles.dropdownItem} onPress={startEdit}>
                        <Ionicons name="pencil-outline" size={15} color="#cbd5e1" style={{ marginRight: 10 }} />
                        <Text style={styles.dropdownItemText}>{t("edit")}</Text>
                      </TouchableOpacity>
                    )}
                    {onDelete && isOwner && (
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        onPress={() => { setShowMenu(false); item && onDelete(item.id); }}
                      >
                        <Ionicons name="trash-outline" size={15} color="#f87171" style={{ marginRight: 10 }} />
                        <Text style={[styles.dropdownItemText, { color: "#f87171" }]}>{t("delete")}</Text>
                      </TouchableOpacity>
                    )}
                    {canEdit && canModerate && <View style={styles.dropdownDivider} />}
                    {onReportCatch && item && !isOwner && (
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        onPress={() => { setShowMenu(false); onReportCatch(item.id, item.userId); }}
                      >
                        <Ionicons name="flag-outline" size={15} color="#fbbf24" style={{ marginRight: 10 }} />
                        <Text style={styles.dropdownItemText}>{t("reportContent")}</Text>
                      </TouchableOpacity>
                    )}
                    {onBlockUser && item?.userId && !isOwner && (
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        onPress={() => { setShowMenu(false); onBlockUser(item.userId!); }}
                      >
                        <Ionicons name="ban-outline" size={15} color="#f87171" style={{ marginRight: 10 }} />
                        <Text style={[styles.dropdownItemText, { color: "#f87171" }]}>{t("blockUser")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={{ width: 28 }} />
            )}
          </View>

          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: safeBottom + 40 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {/* User row */}
            {(item?.username || item?.name || item?.avatarUrl) && (
              <TouchableOpacity
                style={styles.userRow}
                activeOpacity={item.userId && onUserPress ? 0.7 : 1}
                onPress={() => item.userId && onUserPress && onUserPress(item.userId)}
              >
                <View style={styles.avatar}>
                  {item.avatarUrl ? (
                    <ExpoImage source={{ uri: item.avatarUrl }} contentFit="cover" style={styles.avatarImg} />
                  ) : (
                    <Ionicons name="person" size={20} color="#94a3b8" />
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={styles.userName}>{item.username || item.name}</Text>
                  {item.verified ? <VerifiedBadge size={12} /> : null}
                </View>
              </TouchableOpacity>
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
                    <Pressable
                      key={i}
                      onPress={() => openFullscreenPhoto(i)}
                      style={{ width: SCREEN_WIDTH, height: 280 }}
                    >
                      <ExpoImage
                        source={{ uri }}
                        placeholder={require("../assets/placeholder.png")}
                        cachePolicy="memory-disk"
                        transition={120}
                        contentFit="cover"
                        style={{ width: SCREEN_WIDTH, height: 280 }}
                      />
                    </Pressable>
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
                <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                  <Ionicons
                    name={isLiked ? "thumbs-up" : "thumbs-up-outline"}
                    size={22}
                    color={isLiked ? "#ffffff" : "#64748b"}
                  />
                </Animated.View>
                <Text style={[styles.likeCount, isLiked && styles.likeCountActive]}>{likeCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.commentBtn} onPress={() => setShowComments((s) => !s)}>
                <Ionicons name="chatbubble-outline" size={22} color="#64748b" />
                <Text style={styles.commentCount}>{comments.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Ionicons name="share-social-outline" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Comments */}
            {showComments && (
              <View style={styles.commentsSection}>
                {comments.filter((c) => !blockedUserIds.includes(c.user_id)).map((c, i) => {
                  const isOwn = c.user_id === user?.id;
                  return (
                    <View key={c.id || i} style={[styles.commentRow, isOwn && styles.commentRowOwn]}>
                      {!isOwn && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${c.username || "user"}'s profile`}
                          activeOpacity={onUserPress ? 0.7 : 1}
                          disabled={!onUserPress}
                          onPress={() => onUserPress?.(c.user_id)}
                          style={styles.commentAvatar}
                        >
                          {c._avatarUrl ? (
                            <ExpoImage source={{ uri: c._avatarUrl }} contentFit="cover" style={styles.commentAvatarImg} />
                          ) : (
                            <Ionicons name="person" size={15} color="#94a3b8" />
                          )}
                        </TouchableOpacity>
                      )}
                      <View style={[styles.commentBubble, isOwn ? styles.commentBubbleOwn : styles.commentBubbleOther]}>
                        {!isOwn && (
                          <Text style={styles.commentUsername}>{c.username}</Text>
                        )}
                        <Text style={styles.commentText}>{c.text}</Text>
                        <View style={styles.commentMeta}>
                          {!!formatCommentDate(c.created ?? c.created_at) && (
                            <Text style={styles.commentDate}>{formatCommentDate(c.created ?? c.created_at)}</Text>
                          )}
                          {isOwn && (
                            <TouchableOpacity onPress={() => deleteComment(c.id)} hitSlop={8} style={{ marginLeft: 8 }}>
                              <Ionicons name="trash" size={15} color="#f87171" />
                            </TouchableOpacity>
                          )}
                          {!isOwn && onReportComment && (
                            <TouchableOpacity
                              onPress={() => onReportComment(c.id, c.user_id, item?.id ?? null)}
                              hitSlop={8}
                              style={{ marginLeft: 8 }}
                            >
                              <Ionicons name="flag-outline" size={15} color="#fbbf24" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
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
                      ? <ActivityIndicator size="small" color="#ffffff" />
                      : <Ionicons name="send-outline" size={18} color="#ffffff" />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Details body */}
            <View style={styles.body}>
              {editing ? (
                <>
                  <TouchableOpacity style={styles.editPickerRow} onPress={() => { setEditSpeciesTab(getSpeciesHabitat(editSpecies)); setEditSpeciesModal(true); }}>
                    {editSpecies && speciesPhotos[editSpecies] && (
                      <ExpoImage source={speciesPhotos[editSpecies]} style={styles.editPickerThumb} contentFit="contain" />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editPickerLabel}>{t("species")}</Text>
                      <Text style={styles.editPickerValue}>{getSpeciesLabel(editSpecies, language)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color="#475569" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editPickerRow} onPress={() => setEditGearModal(true)}>
                    {editGear && gearPhotos[editGear] && (
                      <ExpoImage source={gearPhotos[editGear]} style={styles.editPickerThumb} contentFit="contain" />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editPickerLabel}>{t("gear")}</Text>
                      <Text style={styles.editPickerValue}>{editGear ? getGearLabel(editGear, language) : t("gearNotSelected")}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color="#475569" />
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
                    trackColor={{ false: theme.colors.surfaceRaised, true: theme.colors.primaryMuted }}
                    thumbColor="#ffffff"
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
                    <Ionicons name="location-sharp" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.btnText}>{t("showOnMap")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Species picker */}
        <Modal
          visible={editSpeciesModal}
          animationType="slide"
          transparent={false}
          statusBarTranslucent
          onRequestClose={() => { setEditSpeciesModal(false); setEditSpeciesSearch(""); }}
        >
          <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.pickerModal, { paddingTop: safeTop }]}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t("selectSpecies")}</Text>
              <TouchableOpacity onPress={() => { setEditSpeciesModal(false); setEditSpeciesSearch(""); }} style={styles.closeBtn} hitSlop={8}>
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearch}>
              <Ionicons name="search-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
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
            <View style={styles.speciesTabRow}>
              {(["freshwater", "saltwater"] as SpeciesHabitat[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.speciesTabBtn, editSpeciesTab === tab && styles.speciesTabBtnActive]}
                  onPress={() => setEditSpeciesTab(tab)}
                >
                  <Text style={[styles.speciesTabText, editSpeciesTab === tab && styles.speciesTabTextActive]}>
                    {t(tab)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <FlatList
              data={getSpeciesOptions(language).filter(s => {
                if (s.habitat !== editSpeciesTab) return false;
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
                        <Ionicons name="help-circle-outline" size={20} color="#334155" />
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
          <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.pickerModal, { paddingTop: safeTop }]}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t("selectGear")}</Text>
              <TouchableOpacity onPress={() => { setEditGearModal(false); setEditGearSearch(""); }} style={styles.closeBtn} hitSlop={8}>
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearch}>
              <Ionicons name="search-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
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
                        <Ionicons name={GEAR_CATEGORY_ICON[g.category] as any} size={22} color={GEAR_CATEGORY_COLOR[g.category]} />
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

        {/* Fullscreen photo viewer */}
        <Modal visible={fullscreenPhotos.length > 0} transparent animationType="none" onRequestClose={() => setFullscreenPhotos([])}>
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <ScrollView
              ref={fullscreenScrollRef}
              horizontal
              pagingEnabled
              contentOffset={{ x: fullscreenIndex * SCREEN_WIDTH, y: 0 }}
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
              <View style={{ position: "absolute", bottom: safeBottom + 24, width: "100%", flexDirection: "row", justifyContent: "center", gap: 6 }}>
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
            <Pressable onPress={() => setFullscreenPhotos([])} style={{ position: "absolute", top: safeTop + 12, right: 16, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
        </Modal>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
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
  avatarText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  userName: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  userHandle: { color: "#94a3b8", fontSize: 13 },
  dotRow: { flexDirection: "row", justifyContent: "center", marginTop: 8, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#334155" },
  dotActive: { backgroundColor: "#ffffff", width: 16 },
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
  likeCount: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  likeCountActive: { color: "#ffffff" },
  commentCount: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  commentsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    marginBottom: 8,
    justifyContent: "flex-start",
  },
  commentAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#0f3460",
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  commentAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  commentAvatarText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  commentRowOwn: {
    justifyContent: "flex-end",
  },
  commentBubble: {
    maxWidth: "78%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentBubbleOther: {
    backgroundColor: "#1e293b",
    borderBottomLeftRadius: 4,
  },
  commentBubbleOwn: {
    backgroundColor: theme.colors.primaryDark,
    borderBottomRightRadius: 4,
  },
  commentUsername: { color: "#cbd5e1", fontSize: 11, fontWeight: "600", marginBottom: 2 },
  commentDate: { color: "#94a3b8", fontSize: 10, marginTop: 4 },
  commentText: { color: "#e2e8f0", fontSize: 14 },
  commentMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
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
  detailGear: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  detailDate: { color: "#94a3b8", fontSize: 14, marginTop: 4, marginBottom: 8 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 16 },
  value: { color: "#cbd5e1", fontSize: 14, marginTop: 4 },
  metricsRow: { flexDirection: "row", gap: 12 },
  metricItem: { flex: 1 },
  input: { backgroundColor: "#1e293b", color: "#fff", padding: 8, borderRadius: theme.radius.control, marginTop: 4, minHeight: 40 },
  publicRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 20,
  },
  publicLabel: { color: "#e6eef8", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  publicSub: { color: "#94a3b8", fontSize: 12 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  btnSave: {
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: theme.radius.control,
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
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: theme.radius.control,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  btnText: { color: "#cbd5e1", fontWeight: "700", fontSize: 15 },
  dropdownMenu: {
    position: "absolute",
    top: 46,
    right: 0,
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  editPickerThumb: { width: 44, height: 44 },
  editPickerLabel: { color: "#94a3b8", fontSize: 12, marginBottom: 2 },
  editPickerValue: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  pickerModal: { flex: 1, backgroundColor: theme.colors.background },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  pickerTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  pickerSearch: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f2236", borderRadius: 10, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8 },
  pickerSearchInput: { flex: 1, color: "#e6eef8", fontSize: 15, padding: 0 },
  speciesTabRow: {
    flexDirection: "row",
    backgroundColor: "#0f2236",
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 3,
  },
  speciesTabBtn: { flex: 1, alignItems: "center", borderRadius: 8, paddingVertical: 9 },
  speciesTabBtnActive: { backgroundColor: theme.colors.primaryDark },
  speciesTabText: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  speciesTabTextActive: { color: "#ffffff" },
  pickerItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, borderBottomColor: theme.colors.border, borderBottomWidth: 1, gap: 12 },
  pickerItemImg: { width: 52, height: 52, flexShrink: 0 },
  pickerItemImgPlaceholder: { width: 52, height: 52, borderRadius: 8, backgroundColor: "#0f2236", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pickerItemText: { color: "#e6eef8", fontSize: 16 },
  pickerItemSub: { color: "#94a3b8", fontSize: 13, fontStyle: "italic", marginTop: 3 },
});
