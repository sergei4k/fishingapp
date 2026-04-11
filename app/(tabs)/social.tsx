import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { getSpeciesLabel } from "@/lib/species";
import { useLanguage } from "@/lib/language";
import { FontAwesome } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
import { SafeAreaView } from "react-native-safe-area-context";

export default function Social() {
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const [activeTab, setActiveTab] = useState<"search" | "feed">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [myFollows, setMyFollows] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userCatches, setUserCatches] = useState<any[]>([]);
  const [userFollowerCount, setUserFollowerCount] = useState(0);
  const [loadingUserCatches, setLoadingUserCatches] = useState(false);
  const [feedCatches, setFeedCatches] = useState<any[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [selectedCatch, setSelectedCatch] = useState<any>(null);
  const [catchPhotoIndex, setCatchPhotoIndex] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likeId, setLikeId] = useState<string | null>(null);
  const [catchComments, setCatchComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedCatch) return;
    const fetchLikesAndComments = async () => {
      try {
        const [likesResult, commentsResult] = await Promise.all([
          pb.collection("likes").getFullList({ filter: `catch_id = "${selectedCatch.id}"`, requestKey: null }),
          pb.collection("comments").getFullList({ filter: `catch_id = "${selectedCatch.id}"`, sort: "created", requestKey: null }),
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
    setLikeCount(0);
    setIsLiked(false);
    setLikeId(null);
    setCatchComments([]);
    setNewComment("");
    setShowComments(false);
    fetchLikesAndComments();
  }, [selectedCatch?.id]);

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

  const loadFollows = useCallback(async () => {
    if (!user) return;
    try {
      const records = await pb.collection("follows").getFullList({
        filter: `follower_id = "${user.id}"`,
        requestKey: null,
      });
      setMyFollows(records);
    } catch (e) {
      console.warn("loadFollows error:", e);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadFollows();
    }, [loadFollows])
  );

  const loadFeed = useCallback(async () => {
    if (!user || myFollows.length === 0) {
      setFeedCatches([]);
      return;
    }
    setLoadingFeed(true);
    try {
      const filterStr = myFollows.map((f) => `user_id = "${f.following_id}"`).join(" || ");
      const records = await pb.collection("catches").getFullList({
        filter: filterStr,
        sort: "-created_at",
        requestKey: null,
      });
      const uniqueUserIds = [...new Set(records.map((c: any) => c.user_id))] as string[];
      const userMap: Record<string, string> = {};
      await Promise.all(
        uniqueUserIds.map(async (uid) => {
          try {
            const u = await pb.collection("users").getOne(uid, { requestKey: null });
            userMap[uid] = u.username || u.name || "";
          } catch {
            userMap[uid] = "";
          }
        })
      );
      setFeedCatches(records.map((c: any) => ({
        ...c,
        _username: userMap[c.user_id] ?? "",
        image_uri: c.image ? `${pb.baseURL}/api/files/${c.collectionId}/${c.id}/${c.image}` : (c.image_uri || null),
      })));
    } catch (e) {
      console.warn("loadFeed error:", e);
    } finally {
      setLoadingFeed(false);
    }
  }, [user, myFollows]);

  useEffect(() => {
    if (activeTab === "feed") loadFeed();
  }, [activeTab, myFollows, loadFeed]);

  const doSearch = useCallback(
    async (q: string) => {
      setSearching(true);
      try {
        const filter = q.trim()
          ? `(username ~ "${q}" || name ~ "${q}")`
          : undefined;
        const records = await pb.collection("users").getList(1, 30, {
          filter,
          sort: "username",
          requestKey: null,
        });
        setSearchResults(records.items.filter((u) => u.id !== user?.id));
      } catch (e) {
        console.warn("search error:", e);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [user]
  );

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(q), 350);
  };

  useEffect(() => {
    if (activeTab === "search") doSearch("");
  }, [activeTab, doSearch]);

  const isFollowing = (targetId: string) =>
    myFollows.some((f) => f.following_id === targetId);

  const toggleFollow = async (targetUser: any) => {
    if (!user) return;
    const existing = myFollows.find((f) => f.following_id === targetUser.id);
    if (existing) {
      try {
        await pb.collection("follows").delete(existing.id);
        setMyFollows((prev) => prev.filter((f) => f.id !== existing.id));
      } catch (e) {
        console.warn("unfollow error:", e);
      }
    } else {
      try {
        const record = await pb.collection("follows").create({
          follower_id: user.id,
          following_id: targetUser.id,
        });
        setMyFollows((prev) => [...prev, record]);
      } catch (e) {
        console.warn("follow error:", e);
      }
    }
  };

  const openUser = async (targetUser: any) => {
    setSelectedUser(targetUser);
    setUserCatches([]);
    setUserFollowerCount(0);
    setLoadingUserCatches(true);
    try {
      const [records, followersResult] = await Promise.all([
        pb.collection("catches").getFullList({
          filter: `user_id = "${targetUser.id}"`,
          sort: "-created_at",
          requestKey: null,
        }),
        pb.collection("follows").getList(1, 1, {
          filter: `following_id = "${targetUser.id}"`,
          requestKey: null,
        }),
      ]);
      const uname = targetUser.username || targetUser.name || "";
      setUserCatches(records.map((c: any) => ({
        ...c,
        _username: uname,
        image_uri: c.image ? `${pb.baseURL}/api/files/${c.collectionId}/${c.id}/${c.image}` : (c.image_uri || null),
      })));
      setUserFollowerCount(followersResult.totalItems);
    } catch (e) {
      console.warn("openUser catches error:", e);
    } finally {
      setLoadingUserCatches(false);
    }
  };

  const initials = (u: any) =>
    (u?.name || u?.username || "?").slice(0, 2).toUpperCase();

  const formatDate = (val: any) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
  };

  const renderUserRow = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.userRow} onPress={() => openUser(item)} activeOpacity={0.75}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(item)}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.username || item.name}</Text>
        {item.name && item.username ? (
          <Text style={styles.userFullName}>{item.name}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[styles.followBtn, isFollowing(item.id) && styles.followingBtn]}
        onPress={() => toggleFollow(item)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.followBtnText, isFollowing(item.id) && styles.followingBtnText]}>
          {isFollowing(item.id) ? t("followingBtn") : t("follow")}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderCatchRow = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.catchRow} onPress={() => setSelectedCatch(item)} activeOpacity={0.75}>
      {item.image_uri ? (
        <Image source={{ uri: item.image_uri }} style={styles.catchThumb} />
      ) : (
        <View style={[styles.catchThumb, styles.catchThumbEmpty]}>
          <FontAwesome name="camera" size={20} color="#334155" />
        </View>
      )}
      <View style={styles.catchInfo}>
        <Text style={styles.catchSpecies}>{getSpeciesLabel(item.species, language)}</Text>
        {item._username ? (
          <Text style={styles.catchUser}>@{item._username}</Text>
        ) : null}
        {item.description ? (
          <Text style={styles.catchDesc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        {(item.length_cm || item.weight_kg) ? (
          <Text style={styles.catchMeta}>
            {item.length_cm ? `${item.length_cm} cm` : ""}
            {item.length_cm && item.weight_kg ? " · " : ""}
            {item.weight_kg ? `${item.weight_kg} kg` : ""}
          </Text>
        ) : null}
        <Text style={styles.catchDate}>{formatDate(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerMsg}>
          <FontAwesome name="users" size={44} color="#1e3a5f" />
          <Text style={styles.centerText}>{t("signInToFollow")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "search" && styles.tabActive]}
          onPress={() => setActiveTab("search")}
        >
          <Text style={[styles.tabText, activeTab === "search" && styles.tabTextActive]}>
            {t("findAnglers")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "feed" && styles.tabActive]}
          onPress={() => setActiveTab("feed")}
        >
          <Text style={[styles.tabText, activeTab === "feed" && styles.tabTextActive]}>
            {t("following")}
          </Text>
          {myFollows.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{myFollows.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Search tab */}
      {activeTab === "search" && (
        <>
          <View style={styles.searchBar}>
            <FontAwesome name="search" size={15} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t("searchPlaceholder")}
              placeholderTextColor="#475569"
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              keyboardAppearance="dark"
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color="#60a5fa" />}
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={(i) => i.id}
            renderItem={renderUserRow}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              !searching ? (
                <Text style={styles.emptyText}>{t("noUsersFound")}</Text>
              ) : null
            }
          />
        </>
      )}

      {/* Following feed tab */}
      {activeTab === "feed" && (
        loadingFeed ? (
          <ActivityIndicator color="#60a5fa" style={{ marginTop: 48 }} />
        ) : feedCatches.length === 0 ? (
          <View style={styles.centerMsg}>
            <FontAwesome name="anchor" size={44} color="#1e3a5f" />
            <Text style={styles.centerText}>
              {myFollows.length === 0 ? t("followToSeeCatches") : t("noFollowingCatches")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={feedCatches}
            keyExtractor={(i) => i.id}
            renderItem={renderCatchRow}
            contentContainerStyle={styles.listContent}
          />
        )
      )}

      {/* User profile modal */}
      <Modal
        visible={!!selectedUser}
        animationType="slide"
        onRequestClose={() => setSelectedUser(null)}
      >
        <SafeAreaView style={styles.container}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.backBtn}>
              <FontAwesome name="arrow-left" size={20} color="#e6eef8" />
            </TouchableOpacity>
            <View style={styles.avatarLg}>
              <Text style={styles.avatarLgText}>{initials(selectedUser)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.modalUsername}>
                @{selectedUser?.username || selectedUser?.name}
              </Text>
              {selectedUser?.name && selectedUser?.username ? (
                <Text style={styles.modalFullName}>{selectedUser.name}</Text>
              ) : null}
            </View>
            {selectedUser && (
              <TouchableOpacity
                style={[styles.followBtn, isFollowing(selectedUser.id) && styles.followingBtn]}
                onPress={() => toggleFollow(selectedUser)}
              >
                <Text style={[styles.followBtnText, isFollowing(selectedUser.id) && styles.followingBtnText]}>
                  {isFollowing(selectedUser.id) ? t("followingBtn") : t("follow")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userCatches.length}</Text>
              <Text style={styles.statLabel}>{t("publicCatchesTitle")}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userFollowerCount}</Text>
              <Text style={styles.statLabel}>{language === "ru" ? "Подписчики" : "Followers"}</Text>
            </View>
          </View>

          {loadingUserCatches ? (
            <ActivityIndicator color="#60a5fa" style={{ marginTop: 48 }} />
          ) : (
            <FlatList
              data={userCatches}
              keyExtractor={(i) => i.id}
              renderItem={renderCatchRow}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={styles.emptyText}>{t("noPublicCatches")}</Text>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Catch detail modal */}
      <Modal
        visible={!!selectedCatch}
        animationType="slide"
        transparent
        onRequestClose={() => { setSelectedCatch(null); setCatchPhotoIndex(0); }}
      >
        <TouchableOpacity
          style={styles.catchModalOverlay}
          activeOpacity={1}
          onPress={() => { setSelectedCatch(null); setCatchPhotoIndex(0); }}
        >
          <View style={styles.catchModalCard}>
            <TouchableOpacity style={styles.catchModalClose} onPress={() => { setSelectedCatch(null); setCatchPhotoIndex(0); }}>
              <FontAwesome name="times" size={16} color="#94a3b8" />
            </TouchableOpacity>

            {(() => {
              const photos = [
                selectedCatch?.image_uri ?? null,
                ...(selectedCatch?.extraPhotos || []),
              ].filter(Boolean) as string[];
              if (photos.length === 0) return null;
              const W = SCREEN_WIDTH - 40;
              return (
                <View style={{ marginBottom: 14 }}>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    style={{ width: W }}
                    onMomentumScrollEnd={(e) =>
                      setCatchPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / W))
                    }
                  >
                    {photos.map((item, i) => (
                      <ExpoImage
                        key={i}
                        source={{ uri: item }}
                        placeholder={require("../../assets/placeholder.png")}
                        contentFit="cover"
                        style={{ width: W, height: 220, borderRadius: 12 }}
                      />
                    ))}
                  </ScrollView>
                  {photos.length > 1 && (
                    <View style={styles.dotRow}>
                      {photos.map((_, i) => (
                        <View key={i} style={[styles.dot, i === catchPhotoIndex && styles.dotActive]} />
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

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
                    placeholder={language === "ru" ? "Добавить комментарий..." : "Add a comment..."}
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

            <Text style={styles.catchModalSpecies}>
              {getSpeciesLabel(selectedCatch?.species, language)}
            </Text>

            {selectedCatch?._username ? (
              <TouchableOpacity
                onPress={() => {
                  setSelectedCatch(null);
                  setCatchPhotoIndex(0);
                  openUser({ id: selectedCatch.user_id, username: selectedCatch._username, name: "" });
                }}
              >
                <Text style={styles.catchModalUser}>@{selectedCatch._username}</Text>
              </TouchableOpacity>
            ) : null}

            {selectedCatch?.description ? (
              <Text style={styles.catchModalDesc}>{selectedCatch.description}</Text>
            ) : null}

            {(selectedCatch?.length_cm || selectedCatch?.weight_kg) ? (
              <Text style={styles.catchModalMeta}>
                {selectedCatch.length_cm ? `${selectedCatch.length_cm} cm` : ""}
                {selectedCatch.length_cm && selectedCatch.weight_kg ? " · " : ""}
                {selectedCatch.weight_kg ? `${selectedCatch.weight_kg} kg` : ""}
              </Text>
            ) : null}

            <Text style={styles.catchModalDate}>{formatDate(selectedCatch?.created_at)}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    marginHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#60a5fa",
  },
  tabText: {
    color: "#64748b",
    fontSize: 15,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#60a5fa",
  },
  badge: {
    backgroundColor: "#0ea5e9",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  searchInput: {
    flex: 1,
    color: "#e6eef8",
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#60a5fa",
    fontWeight: "700",
    fontSize: 16,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    color: "#e6eef8",
    fontSize: 15,
    fontWeight: "600",
  },
  userFullName: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  followingBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#334155",
  },
  followBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  followingBtnText: {
    color: "#64748b",
  },
  catchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  catchThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 12,
    resizeMode: "cover",
  },
  catchThumbEmpty: {
    backgroundColor: "#0b1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
  catchInfo: {
    flex: 1,
  },
  catchSpecies: {
    color: "#cfe8ff",
    fontWeight: "600",
    fontSize: 15,
  },
  catchUser: {
    color: "#0ea5e9",
    fontSize: 12,
    marginTop: 1,
  },
  catchDesc: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 3,
  },
  catchMeta: {
    color: "#7ea8c9",
    fontSize: 12,
    marginTop: 4,
  },
  catchDate: {
    color: "#475569",
    fontSize: 12,
    marginTop: 4,
  },
  centerMsg: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 16,
  },
  centerText: {
    color: "#475569",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyText: {
    color: "#475569",
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
  },
  catchModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  catchModalCard: {
    backgroundColor: "#071023",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  catchModalClose: {
    alignSelf: "flex-end",
    padding: 4,
    marginBottom: 12,
  },
  catchModalImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginBottom: 14,
    resizeMode: "cover",
  },
  catchModalSpecies: {
    color: "#e6eef8",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  catchModalUser: {
    color: "#0ea5e9",
    fontSize: 14,
    marginBottom: 8,
  },
  catchModalDesc: {
    color: "#94a3b8",
    fontSize: 15,
    marginBottom: 8,
    lineHeight: 22,
  },
  catchModalMeta: {
    color: "#7ea8c9",
    fontSize: 14,
    marginBottom: 6,
  },
  catchModalDate: {
    color: "#475569",
    fontSize: 13,
    marginTop: 4,
  },
  dotRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1e293b",
  },
  dotActive: {
    backgroundColor: "#60a5fa",
    width: 16,
  },
  likeCommentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    marginBottom: 12,
  },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  likeCount: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  likeCountActive: { color: "#60a5fa" },
  commentCount: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  commentsSection: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    marginBottom: 12,
  },
  commentItem: { marginBottom: 10 },
  commentUsername: { color: "#60a5fa", fontSize: 13, fontWeight: "600" },
  commentText: { color: "#cbd5e1", fontSize: 14, marginTop: 2 },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  commentInput: {
    flex: 1,
    color: "#e6eef8",
    fontSize: 14,
    paddingVertical: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  backBtn: {
    marginRight: 14,
    padding: 4,
  },
  avatarLg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLgText: {
    color: "#60a5fa",
    fontWeight: "700",
    fontSize: 20,
  },
  modalUsername: {
    color: "#e6eef8",
    fontSize: 17,
    fontWeight: "700",
  },
  modalFullName: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  sectionLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    marginHorizontal: 16,
    gap: 32,
  },
  statItem: {
    alignItems: "center",
    minWidth: 80,
  },
  statNumber: {
    color: "#e6eef8",
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statDivider: {
    width: 1,
    backgroundColor: "#1e293b",
  },
});
