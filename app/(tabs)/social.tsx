import AsyncStorage from "@react-native-async-storage/async-storage";
import { theme } from '../../lib/theme';
import Toast from "react-native-toast-message";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { pb, isNetworkError } from "@/lib/pocketbase";
import { getGearLabel } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import { getSpeciesLabel } from "@/lib/species";
import { pocketbaseThumbUrl } from "@/lib/imageUrls";
import { useLanguage } from "@/lib/language";
import { useNetwork } from "@/lib/network";
import { blockUser, getBlockedUserIds, reportContent } from "@/lib/moderation";
import CatchDetailModal, { type CatchDetail } from "@/components/CatchDetailModal";
import BadgeChip from "@/components/BadgeChip";
import { parseBadges, BadgeId } from "@/lib/badges";
import GroupModal from "@/components/GroupModal";
import AppNewsModal from "@/components/AppNewsModal";
import AvatarPreviewModal from "@/components/AvatarPreviewModal";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { AppNewsItem, countUnreadNews, fetchAppNews, getLatestNewsTimestamp, readNewsLastSeen, writeNewsLastSeen } from "@/lib/appNews";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import ImageWithLoader from "@/components/ImageWithLoader";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, ActivityIndicator, DeviceEventEmitter, Dimensions, FlatList, Linking, Modal, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const PAGE_SIZE = 15;

function LikeButton({ isLiked, onPress, size = 20, style }: {
  isLiked: boolean; onPress: () => void; size?: number; style?: any;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.4, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 20, bounciness: 6 }),
    ]).start();
    onPress();
  };
  return (
    <TouchableOpacity style={style} onPress={handlePress}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={isLiked ? "thumbs-up" : "thumbs-up-outline"} size={size} color={isLiked ? "#ffffff" : "#64748b"} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// Swipeable photo carousel for a feed card (main image + extra photos)
function FeedPhotoCarousel({ photos }: { photos: string[] }) {
  const [active, setActive] = useState(0);
  const [w, setW] = useState(Dimensions.get("window").width);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          if (w > 0) setActive(Math.round(e.nativeEvent.contentOffset.x / w));
        }}
      >
        {photos.map((uri, i) => (
          <ImageWithLoader key={i} source={{ uri }} style={{ width: w, height: 280 }} contentFit="cover" />
        ))}
      </ScrollView>
      <View style={styles.feedDotRow} pointerEvents="none">
        {photos.map((_, i) => (
          <View key={i} style={[styles.feedDot, i === active && styles.feedDotActive]} />
        ))}
      </View>
    </View>
  );
}

async function fetchPublicProfileCatchCount(userId: string): Promise<number | null> {
  try {
    const response = await fetch(`${pb.baseURL}/public/users/${encodeURIComponent(userId)}/catch-count`);
    if (!response.ok) return null;
    const data = await response.json();
    const total = Number(data?.total);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

type CatchItem = Record<string, any> & {
  _username: string;
  _avatarUrl: string | null;
  _badges: BadgeId[];
  _likeCount: number;
  _commentCount: number;
  _isLiked: boolean;
  _likeId: string | null;
  image_uri: string | null;
};



async function enrichCatches(items: any[], userId?: string): Promise<CatchItem[]> {
  if (items.length === 0) return [];

  const userMap: Record<string, { username: string; avatarUrl: string | null; badges: BadgeId[] }> = {};

  // Seed current user's data from local auth store — no API call needed
  const me = pb.authStore.record;
  if (me?.id) {
    userMap[me.id] = {
      username: me.username || me.name || "",
      avatarUrl: me.avatar
        ? `${pb.baseURL}/api/files/_pb_users_auth_/${me.id}/${me.avatar}?thumb=200x200`
        : null,
      badges: parseBadges(me.badges),
    };
  }

  const uniqueUserIds = [...new Set(items.map((c) => c.user_id).filter((id) => id && !userMap[id]))] as string[];
  if (uniqueUserIds.length > 0) {
    try {
      const filter = uniqueUserIds.map((id) => `id = "${id}"`).join(" || ");
      const users = await pb.collection("users").getList(1, uniqueUserIds.length + 5, {
        filter,
        requestKey: null,
      });
      for (const u of users.items) {
        userMap[u.id] = {
          username: u.username || u.name || "",
          avatarUrl: u.avatar
            ? `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=100x100`
            : null,
          badges: parseBadges(u.badges),
        };
      }
    } catch (e) {
      console.warn("enrichCatches: user fetch failed", e);
    }
  }

  const ids = items.map((c) => c.id);
  const idFilter = ids.map((id) => `catch_id = "${id}"`).join(" || ");

  const [allLikes, allComments] = await Promise.all([
    pb.collection("likes").getFullList({ filter: idFilter, requestKey: null }),
    pb.collection("comments").getFullList({ filter: idFilter, requestKey: null }),
  ]);

  return items.map((c) => {
    const myLike = userId ? allLikes.find((l: any) => l.catch_id === c.id && l.user_id === userId) : null;
    const owner = userMap[c.user_id] ?? { username: "", avatarUrl: null };
    return {
      ...c,
      gear: c.gear ?? c.gear_id ?? c.gearId ?? null,
      _username: owner.username,
      _avatarUrl: owner.avatarUrl,
      _badges: owner.badges ?? [],
      _likeCount: allLikes.filter((l: any) => l.catch_id === c.id).length,
      _commentCount: allComments.filter((cm: any) => cm.catch_id === c.id).length,
      _isLiked: !!myLike,
      _likeId: myLike?.id ?? null,
      image_uri: c.image
        ? `${pb.baseURL}/api/files/${c.collectionId}/${c.id}/${c.image}?thumb=600x600`
        : c.image_uri ?? null,
      extraPhotos: Array.isArray(c.images)
        ? c.images.map((f: string) => `${pb.baseURL}/api/files/${c.collectionId}/${c.id}/${f}?thumb=600x600`)
        : [],
    };
  });
}

export default function Social() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const requireAuth = useRequireAuth();
  const { language, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const safeTop = insets.top;
  const { userId: navUserId, openSearch: openSearchParam } = useLocalSearchParams<{ userId?: string; openSearch?: string }>();

  const [activeTab, setActiveTab] = useState<"discover" | "feed" | "groups">("discover");
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const blockedUserIdSet = React.useMemo(() => new Set(blockedUserIds), [blockedUserIds]);

  // ── Notifications ─────────────────────────────────────────────────────────
  type NotifItem = {
    id: string;
    type: "follow" | "like" | "comment";
    actorId: string;
    actorUsername: string;
    actorAvatarUrl: string | null;
    catchId: string | null;
    catchImageUrl: string | null;
    createdAt: string;
  };
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [refreshingNotifs, setRefreshingNotifs] = useState(false);
  // Timestamp of the previous visit — rows newer than this render as unread
  const [notifSeenBefore, setNotifSeenBefore] = useState<string | null>(null);
  const lastSeenNotifsKey = "last_seen_notifs";

  // ── App news ──────────────────────────────────────────────────────────────
  const [newsVisible, setNewsVisible] = useState(false);
  const [newsItems, setNewsItems] = useState<AppNewsItem[]>([]);
  const [newsUnreadCount, setNewsUnreadCount] = useState(0);
  const [loadingNews, setLoadingNews] = useState(false);
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [newsError, setNewsError] = useState(false);

  const loadNews = useCallback(async (markSeen = false, showLoading = false) => {
    if (showLoading) setLoadingNews(true);
    try {
      const items = await fetchAppNews(pb, language);
      setNewsItems(items);
      setNewsError(false);

      const lastSeen = await readNewsLastSeen(AsyncStorage);
      setNewsUnreadCount(countUnreadNews(items, lastSeen));
      if (markSeen) {
        const latest = getLatestNewsTimestamp(items);
        if (latest) await writeNewsLastSeen(AsyncStorage, latest);
        setNewsUnreadCount(0);
      }
    } catch (error) {
      if (!isNetworkError(error)) console.warn("loadNews error:", error);
      setNewsError(true);
    } finally {
      if (showLoading) setLoadingNews(false);
    }
  }, [language]);

  const openNews = () => {
    setNewsVisible(true);
    void loadNews(true, newsItems.length === 0);
  };

  const refreshNews = async () => {
    setRefreshingNews(true);
    try {
      await loadNews(true);
    } finally {
      setRefreshingNews(false);
    }
  };

  const openNewsLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(language === "ru" ? "Не удалось открыть ссылку" : "Could not open link");
    }
  };

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoadingNotifs(true);
    try {
      // 1. Get recent follows
      const followRecs = await pb.collection("follows").getList(1, 30, {
        filter: `following_id = "${user.id}"`,
        sort: "-created",
        requestKey: null,
      }).catch(() => ({ items: [] as any[] }));

      // 2. Get user's catch IDs (most recent 20) to filter likes/comments
      const myCatches = await pb.collection("catches").getList(1, 20, {
        filter: `user_id = "${user.id}"`,
        fields: "id",
        sort: "-created",
        requestKey: null,
      }).catch(() => ({ items: [] as any[] }));

      const myCatchIds: string[] = myCatches.items.map((c: any) => c.id);

      let likeRecs: { items: any[] } = { items: [] };
      let commentRecs: { items: any[] } = { items: [] };

      if (myCatchIds.length > 0) {
        const catchFilter = myCatchIds.map((id) => `catch_id = "${id}"`).join(" || ");
        [likeRecs, commentRecs] = await Promise.all([
          pb.collection("likes").getList(1, 30, {
            filter: `(${catchFilter}) && user_id != "${user.id}"`,
            sort: "-created",
            requestKey: null,
          }).catch(() => ({ items: [] as any[] })),
          pb.collection("comments").getList(1, 30, {
            filter: `(${catchFilter}) && user_id != "${user.id}"`,
            sort: "-created",
            requestKey: null,
          }).catch(() => ({ items: [] as any[] })),
        ]);
      }

      // 3. Fetch all actor users in one query
      const actorIds = [...new Set([
        ...followRecs.items.map((r: any) => r.follower_id),
        ...likeRecs.items.map((r: any) => r.user_id),
        ...commentRecs.items.map((r: any) => r.user_id),
      ].filter(Boolean))] as string[];

      const userMap: Record<string, { username: string; avatarUrl: string | null }> = {};
      if (actorIds.length > 0) {
        const users = await pb.collection("users").getFullList({
          filter: actorIds.map((id) => `id = "${id}"`).join(" || "),
          fields: "id,username,name,avatar",
          requestKey: null,
        }).catch(() => [] as any[]);
        for (const u of users) {
          userMap[u.id] = {
            username: u.username || u.name || "User",
            avatarUrl: u.avatar
              ? `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=100x100`
              : null,
          };
        }
      }

      // 4. Fetch catch thumbnails in one query
      const catchIds = [...new Set([
        ...likeRecs.items.map((r: any) => r.catch_id),
        ...commentRecs.items.map((r: any) => r.catch_id),
      ].filter(Boolean))] as string[];

      const catchMap: Record<string, string | null> = {};
      if (catchIds.length > 0) {
        const catches = await pb.collection("catches").getFullList({
          filter: catchIds.map((id) => `id = "${id}"`).join(" || "),
          fields: "id,image,collectionId",
          requestKey: null,
        }).catch(() => [] as any[]);
        for (const c of catches) {
          catchMap[c.id] = c.image
            ? `${pb.baseURL}/api/files/${c.collectionId}/${c.id}/${c.image}?thumb=100x100`
            : null;
        }
      }

      // 5. Build notification list
      const items: NotifItem[] = [];

      for (const r of followRecs.items) {
        const actor = userMap[r.follower_id];
        if (!actor) continue;
        items.push({ id: `follow-${r.id}`, type: "follow", actorId: r.follower_id, actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchId: null, catchImageUrl: null, createdAt: r.created });
      }
      for (const r of likeRecs.items) {
        const actor = userMap[r.user_id];
        if (!actor) continue;
        items.push({ id: `like-${r.id}`, type: "like", actorId: r.user_id, actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchId: r.catch_id, catchImageUrl: catchMap[r.catch_id] ?? null, createdAt: r.created });
      }
      for (const r of commentRecs.items) {
        const actor = userMap[r.user_id];
        if (!actor) continue;
        items.push({ id: `comment-${r.id}`, type: "comment", actorId: r.user_id, actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchId: r.catch_id, catchImageUrl: catchMap[r.catch_id] ?? null, createdAt: r.created });
      }

      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setNotifications(items);

      const lastSeen = await AsyncStorage.getItem(lastSeenNotifsKey);
      const count = lastSeen ? items.filter((n) => n.createdAt > lastSeen).length : items.length;
      setUnreadCount(count);
    } catch (e) {
      console.warn("loadNotifications error:", e);
    } finally {
      setLoadingNotifs(false);
    }
  }, [user]);

  const openNotifs = async () => {
    if (!requireAuth()) return;
    setNotifVisible(true);
    // Capture the prior visit so rows arrived since then render as unread,
    // then stamp this visit as the new baseline.
    const prev = await AsyncStorage.getItem(lastSeenNotifsKey);
    setNotifSeenBefore(prev);
    const now = new Date().toISOString();
    await AsyncStorage.setItem(lastSeenNotifsKey, now);
    setUnreadCount(0);
  };

  const refreshNotifs = async () => {
    setRefreshingNotifs(true);
    try {
      await loadNotifications();
    } finally {
      setRefreshingNotifs(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    getBlockedUserIds(user?.id).then(setBlockedUserIds).catch(() => setBlockedUserIds([]));
  }, [user?.id]);

  useEffect(() => {
    DeviceEventEmitter.emit("unreadNotifCountChanged", unreadCount);
  }, [unreadCount]);

  // ── Realtime notification subscriptions ───────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const pushNotif = (item: NotifItem, toastText: string) => {
      setNotifications((prev) => [item, ...prev]);
      setUnreadCount((c) => c + 1);
      Toast.show({ type: "success", text1: toastText, position: "top", visibilityTime: 3500 });
    };

    const fetchActor = async (userId: string) => {
      try {
        const u = await pb.collection("users").getOne(userId, { fields: "id,username,name,avatar", requestKey: null });
        return {
          username: u.username || u.name || "User",
          avatarUrl: u.avatar ? `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=100x100` : null,
        };
      } catch { return null; }
    };

    pb.collection("follows").subscribe("*", async (e) => {
      if (e.action !== "create") return;
      if (e.record.following_id !== user.id) return;
      const actor = await fetchActor(e.record.follower_id);
      if (!actor) return;
      pushNotif(
        { id: `follow-${e.record.id}`, type: "follow", actorId: e.record.follower_id, actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchId: null, catchImageUrl: null, createdAt: e.record.created },
        `${actor.username} followed you`,
      );
    }, { requestKey: null } as any).catch(() => {});

    pb.collection("likes").subscribe("*", async (e) => {
      if (e.action !== "create") return;
      if (e.record.user_id === user.id) return;
      try {
        const catch_ = await pb.collection("catches").getOne(e.record.catch_id, { fields: "id,user_id,image,collectionId", requestKey: null });
        if (catch_.user_id !== user.id) return;
        const actor = await fetchActor(e.record.user_id);
        if (!actor) return;
        const catchImageUrl = catch_.image ? `${pb.baseURL}/api/files/${catch_.collectionId}/${catch_.id}/${catch_.image}?thumb=100x100` : null;
        pushNotif(
          { id: `like-${e.record.id}`, type: "like", actorId: e.record.user_id, actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchId: e.record.catch_id, catchImageUrl, createdAt: e.record.created },
          `${actor.username} liked your catch`,
        );
      } catch {}
    }, { requestKey: null } as any).catch(() => {});

    pb.collection("comments").subscribe("*", async (e) => {
      if (e.action !== "create") return;
      if (e.record.user_id === user.id) return;
      try {
        const catch_ = await pb.collection("catches").getOne(e.record.catch_id, { fields: "id,user_id,image,collectionId", requestKey: null });
        if (catch_.user_id !== user.id) return;
        const actor = await fetchActor(e.record.user_id);
        if (!actor) return;
        const catchImageUrl = catch_.image ? `${pb.baseURL}/api/files/${catch_.collectionId}/${catch_.id}/${catch_.image}?thumb=100x100` : null;
        pushNotif(
          { id: `comment-${e.record.id}`, type: "comment", actorId: e.record.user_id, actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchId: e.record.catch_id, catchImageUrl, createdAt: e.record.created },
          `${actor.username} commented on your catch`,
        );
      } catch {}
    }, { requestKey: null } as any).catch(() => {});

    return () => {
      pb.collection("follows").unsubscribe("*");
      pb.collection("likes").unsubscribe("*");
      pb.collection("comments").unsubscribe("*");
    };
  }, [user]);

  // Discover feed (fullscreen pager)
  const [discoverItems, setDiscoverItems] = useState<CatchItem[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverHasMore, setDiscoverHasMore] = useState(true);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [loadingMoreDiscover, setLoadingMoreDiscover] = useState(false);
  const likeInFlight = useRef<Set<string>>(new Set());
  const followInFlight = useRef<Set<string>>(new Set());
  const pendingOps = useRef<Map<string, number>>(new Map()); // "catchId:action" → timestamp
  const pendingCommentOps = useRef<Map<string, number>>(new Map()); // catchId → timestamp of optimistic increment

  // Following feed (list)
  const [myFollows, setMyFollows] = useState<any[]>([]);
  const [feedItems, setFeedItems] = useState<CatchItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // User profile modal
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [avatarPreviewVisible, setAvatarPreviewVisible] = useState(false);
  const selectedAvatarUri = selectedUser?.avatar
    ? `${pb.baseURL}/api/files/_pb_users_auth_/${selectedUser.id}/${selectedUser.avatar}`
    : selectedUser?.avatarUrl ?? null;
  const [userCatches, setUserCatches] = useState<CatchItem[]>([]);
  const [userCatchCount, setUserCatchCount] = useState(0);
  const [userFollowerCount, setUserFollowerCount] = useState(0);
  const [userFollowingCount, setUserFollowingCount] = useState(0);
  const [loadingUserCatches, setLoadingUserCatches] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [userFollowListModal, setUserFollowListModal] = useState<null | "followers" | "following">(null);
  const [userFollowListData, setUserFollowListData] = useState<any[]>([]);
  const [userFollowListLoading, setUserFollowListLoading] = useState(false);

  // Angler search modal
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInput = useRef<TextInput>(null);

  // Group chats
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Catch detail modal
  const [detailCatch, setDetailCatch] = useState<CatchDetail | null>(null);

  const syncCommentCountInLists = useCallback((catchId: string, count: number) => {
    const patch = (items: CatchItem[]) => {
      let changed = false;
      const next = items.map((c) => {
        if (c.id !== catchId || c._commentCount === count) return c;
        changed = true;
        return { ...c, _commentCount: count };
      });
      return changed ? next : items;
    };
    setDiscoverItems(patch);
    setFeedItems(patch);
    setUserCatches(patch);
  }, []);

  // ── Discover ──────────────────────────────────────────────────────────────

  const loadDiscover = useCallback(async (page: number) => {
    if (page === 1) setLoadingDiscover(true);
    else setLoadingMoreDiscover(true);
    try {
      const result = await pb.collection("catches").getList(page, PAGE_SIZE, {
        filter: "is_public = true",
        sort: "-created_at",
        requestKey: null,
      });
      const visibleItems = result.items.filter((item: any) => !blockedUserIdSet.has(item.user_id));
      const enriched = await enrichCatches(visibleItems, user?.id);
      setDiscoverItems((prev) => (page === 1 ? enriched : [...prev, ...enriched]));
      setDiscoverHasMore(page < result.totalPages);
      setDiscoverPage(page);
    } catch (e) {
      if (!isNetworkError(e)) console.warn("loadDiscover error:", e);
    } finally {
      setLoadingDiscover(false);
      setLoadingMoreDiscover(false);
    }
  }, [blockedUserIdSet, user?.id]);

  // ── PocketBase realtime like sync ────────────────────────────────────────

  useEffect(() => {
    pb.collection("likes").subscribe("*", (e) => {
      const catchId = e.record?.catch_id;
      if (!catchId) return;

      // Skip own optimistic actions to avoid double-counting
      if (e.record.user_id === user?.id) {
        const key = `${catchId}:${e.action}`;
        const ts = pendingOps.current.get(key);
        if (ts && Date.now() - ts < 5000) {
          pendingOps.current.delete(key);
          return;
        }
      }

      const isOwn = e.record.user_id === user?.id;
      const applyUpdate = (items: CatchItem[]) =>
        items.map((c) => {
          if (c.id !== catchId) return c;
          if (e.action === "create") return {
            ...c,
            _likeCount: c._likeCount + 1,
            _isLiked: isOwn ? true : c._isLiked,
            _likeId: isOwn ? e.record.id : c._likeId,
          };
          if (e.action === "delete") return {
            ...c,
            _likeCount: Math.max(0, c._likeCount - 1),
            _isLiked: isOwn ? false : c._isLiked,
            _likeId: isOwn ? null : c._likeId,
          };
          return c;
        });

      setDiscoverItems(applyUpdate);
      setFeedItems(applyUpdate);
      setUserCatches(applyUpdate);
    }, { requestKey: null } as any).catch(() => {});
    return () => { pb.collection("likes").unsubscribe("*"); };
  }, [user?.id]);

  // ── PocketBase realtime comment sync ────────────────────────────────────

  useEffect(() => {
    pb.collection("comments").subscribe("*", (e) => {
      const catchId = e.record?.catch_id;
      if (!catchId) return;
      if (e.action === "create") {
        const ts = pendingCommentOps.current.get(catchId);
        if (ts && Date.now() - ts < 5000) {
          pendingCommentOps.current.delete(catchId);
          return;
        }
        const patch = (items: CatchItem[]) =>
          items.map((c) => c.id === catchId ? { ...c, _commentCount: c._commentCount + 1 } : c);
        setDiscoverItems(patch);
        setFeedItems(patch);
        setUserCatches(patch);
      } else if (e.action === "delete") {
        const patch = (items: CatchItem[]) =>
          items.map((c) => c.id === catchId ? { ...c, _commentCount: Math.max(0, c._commentCount - 1) } : c);
        setDiscoverItems(patch);
        setFeedItems(patch);
        setUserCatches(patch);
      }
    }, { requestKey: null } as any).catch(() => {});
    return () => { pb.collection("comments").unsubscribe("*"); };
  }, [user?.id]);

  // ── Cross-tab comment sync (map → social) ───────────────────────────────

  useEffect(() => {
    const subCount = DeviceEventEmitter.addListener("commentCountSynced", ({ catchId, count }: { catchId: string; count: number }) => {
      syncCommentCountInLists(catchId, count);
    });
    return () => { subCount.remove(); };
  }, [syncCommentCountInLists]);

  // ── Verified badge granted (on subscription) — patch cached lists live ───

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("verifiedBadgeGranted", (userId: string) => {
      const patch = (items: CatchItem[]) =>
        items.map((c) =>
          c.user_id === userId && !c._badges.includes("verified")
            ? { ...c, _badges: [...c._badges, "verified" as BadgeId] }
            : c
        );
      setDiscoverItems(patch);
      setFeedItems(patch);
      setUserCatches(patch);
    });
    return () => { sub.remove(); };
  }, []);

  // ── PocketBase realtime user sync ────────────────────────────────────────

  useEffect(() => {
    pb.collection("users").subscribe("*", (e) => {
      const updatedUserId = e.record?.id;
      if (!updatedUserId) return;

      const avatarUrl = e.record.avatar
        ? `${pb.baseURL}/api/files/_pb_users_auth_/${updatedUserId}/${e.record.avatar}?thumb=200x200`
        : null;
      const username = e.record.username || e.record.name || "";
      const badges = parseBadges(e.record.badges);

      const patch = (items: CatchItem[]) =>
        items.map((item) =>
          item.user_id === updatedUserId
            ? { ...item, _username: username || item._username, _avatarUrl: avatarUrl, _badges: badges }
            : item
        );

      setDiscoverItems(patch);
      setFeedItems(patch);
      setUserCatches(patch);
      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === updatedUserId
            ? { ...item, username: username || item.username, avatar: e.record.avatar, avatarUrl }
            : item
        )
      );
      setSelectedUser((curr: any) =>
        curr?.id === updatedUserId
          ? { ...curr, username: username || curr.username, avatarUrl }
          : curr
      );
    }, { requestKey: null } as any).catch(() => {});
    return () => { pb.collection("users").unsubscribe("*"); };
  }, [user?.id]);

  // ── PocketBase realtime catch sync ───────────────────────────────────────

  useEffect(() => {
    pb.collection("catches").subscribe("*", (e) => {
      const catchId = e.record?.id;
      if (!catchId) return;

      if (e.action === "delete") {
        const remove = (items: CatchItem[]) => items.filter((c) => c.id !== catchId);
        setDiscoverItems(remove);
        setFeedItems(remove);
        setUserCatches(remove);
        setDetailCatch((curr) => (curr?.id === catchId ? null : curr));
        return;
      }

      if (e.action === "update") {
        const updated = e.record;
        if (updated.is_public === false) {
          const remove = (items: CatchItem[]) => items.filter((c) => c.id !== catchId);
          setDiscoverItems(remove);
          setFeedItems(remove);
          setUserCatches(remove);
          setDetailCatch((curr) => (curr?.id === catchId ? null : curr));
          return;
        }
        const patch = (items: CatchItem[]) =>
          items.map((c) => (c.id === catchId ? { ...c, ...updated, gear: updated.gear ?? updated.gear_id ?? updated.gearId ?? c.gear } : c));
        setDiscoverItems(patch);
        setFeedItems(patch);
        setUserCatches(patch);
        setDetailCatch((curr) => curr?.id === catchId
          ? { ...curr, ...updated, gear: updated.gear ?? updated.gear_id ?? updated.gearId ?? curr.gear }
          : curr);
      }
    }, { requestKey: null } as any).catch(() => {});
    return () => { pb.collection("catches").unsubscribe("*"); };
  }, [user?.id]);

  // ── Like (direct from card) ───────────────────────────────────────────────

  const toggleLike = async (item: CatchItem) => {
    if (!requireAuth()) return;
    if (!user || likeInFlight.current.has(item.id)) return;
    likeInFlight.current.add(item.id);

    const action = item._isLiked ? "delete" : "create";
    pendingOps.current.set(`${item.id}:${action}`, Date.now());

    const patch = (items: CatchItem[]) =>
      items.map((c) =>
        c.id === item.id
          ? {
              ...c,
              _isLiked: !c._isLiked,
              _likeCount: c._isLiked ? c._likeCount - 1 : c._likeCount + 1,
              _likeId: c._isLiked ? null : c._likeId,
            }
          : c
      );

    setDiscoverItems(patch);
    setFeedItems(patch);

    try {
      if (item._isLiked && item._likeId) {
        await pb.collection("likes").delete(item._likeId);
      } else {
        const record = await pb.collection("likes").create({ catch_id: item.id, user_id: user.id });
        const setId = (items: CatchItem[]) =>
          items.map((c) => (c.id === item.id ? { ...c, _likeId: record.id } : c));
        setDiscoverItems(setId);
        setFeedItems(setId);
        // Push is sent server-side (pb_hooks) in the recipient's saved language.
      }
    } catch {
      setDiscoverItems((prev) => prev.map((c) => (c.id === item.id ? item : c)));
      setFeedItems((prev) => prev.map((c) => (c.id === item.id ? item : c)));
      pendingOps.current.delete(`${item.id}:${action}`);
    } finally {
      likeInFlight.current.delete(item.id);
    }
  };

  // ── Catch detail modal ───────────────────────────────────────────────────

  const openDetail = (item: CatchItem) => setDetailCatch({
    id: item.id,
    userId: item.user_id,
    imageUrl: item.image_uri,
    extraPhotos: item.extraPhotos ?? [],
    species: item.species,
    description: item.description,
    length: item.length_cm != null ? String(item.length_cm) : item.length ?? "",
    weight: item.weight_kg != null ? String(item.weight_kg) : item.weight ?? "",
    date: item.created_at ?? item.date,
    gear: item.gear ?? item.gear_id ?? item.gearId ?? null,
    username: item._username,
    verified: item._badges.includes("verified"),
    avatarUrl: item._avatarUrl ?? undefined,
    lat: item.lat,
    lon: item.lon,
    isPublic: item.is_public ?? item.isPublic,
  });
  const openUserCatchDetail = (item: CatchItem) => {
    openDetail(item);
  };
  const closeDetail = () => setDetailCatch(null);

  const pruneBlockedUser = useCallback((blockedId: string) => {
    const remove = (items: CatchItem[]) => items.filter((item) => item.user_id !== blockedId);
    setDiscoverItems(remove);
    setFeedItems(remove);
    setUserCatches(remove);
    setSearchResults((prev) => prev.filter((item) => item.id !== blockedId));
    setNotifications((prev) => prev.filter((item) => item.actorId !== blockedId));
    setMyFollows((prev) => prev.filter((item) => item.following_id !== blockedId && item.follower_id !== blockedId));
    setDetailCatch((curr) => (curr?.userId === blockedId ? null : curr));
    setSelectedUser((curr: any) => (curr?.id === blockedId ? null : curr));
  }, []);

  const handleReportCatch = useCallback(async (catchId: string, reportedUserId?: string | null) => {
    if (!requireAuth() || !user) return;
    try {
      await reportContent({
        reporterId: user.id,
        reportedUserId,
        catchId,
        reason: "objectionable_content",
      });
      Alert.alert(t("reportSent"), t("reportSentMessage"));
    } catch (e) {
      console.warn("report catch error:", e);
      Alert.alert(t("error"), t("reportFailed"));
    }
  }, [requireAuth, t, user]);

  const handleReportComment = useCallback(async (commentId: string, reportedUserId?: string | null, catchId?: string | null) => {
    if (!requireAuth() || !user) return;
    try {
      await reportContent({
        reporterId: user.id,
        reportedUserId,
        catchId,
        commentId,
        reason: "abusive_comment",
      });
      Alert.alert(t("reportSent"), t("reportSentMessage"));
    } catch (e) {
      console.warn("report comment error:", e);
      Alert.alert(t("error"), t("reportFailed"));
    }
  }, [requireAuth, t, user]);

  const handleReportUser = useCallback(async (reportedUserId: string) => {
    if (!requireAuth() || !user || reportedUserId === user.id) return;
    try {
      await reportContent({
        reporterId: user.id,
        reportedUserId,
        reason: "abusive_user",
      });
      Alert.alert(t("reportSent"), t("reportSentMessage"));
    } catch (e) {
      console.warn("report user error:", e);
      Alert.alert(t("error"), t("reportFailed"));
    }
  }, [requireAuth, t, user]);


  const handleBlockUser = useCallback((blockedId: string) => {
    if (!requireAuth() || !user || blockedId === user.id) return;
    Alert.alert(t("blockUserConfirm"), t("blockUserMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("blockUser"),
        style: "destructive",
        onPress: async () => {
          setBlockedUserIds((prev) => prev.includes(blockedId) ? prev : [...prev, blockedId]);
          pruneBlockedUser(blockedId);
          try {
            void reportContent({
              reporterId: user.id,
              reportedUserId: blockedId,
              reason: "blocked_abusive_user",
              details: "User blocked from in-app moderation controls.",
            }).catch((e) => console.warn("block report error:", e));
            await blockUser(user.id, blockedId);
            Alert.alert(t("userBlocked"));
          } catch (e) {
            console.warn("block user error:", e);
            Alert.alert(t("error"), t("saveError"));
          }
        },
      },
    ]);
  }, [pruneBlockedUser, requireAuth, t, user]);

  // Tapping a notification jumps to the actor's profile (follow, like or comment)
  const handleNotifPress = (item: NotifItem) => {
    setNotifVisible(false);
    openUser({ id: item.actorId, username: item.actorUsername, name: "", avatarUrl: item.actorAvatarUrl, badges: [] });
  };

  const applyLikeToLists = (catchId: string, delta: number, isLiked: boolean, likeId: string | null) => {
    const patch = (items: CatchItem[]) => items.map((c) =>
      c.id === catchId
        ? { ...c, _likeCount: Math.max(0, c._likeCount + delta), _isLiked: isLiked, _likeId: likeId ?? c._likeId }
        : c
    );
    setDiscoverItems(patch);
    setFeedItems(patch);
    setUserCatches(patch);
  };

  const applyCommentToLists = (catchId: string) => {
    pendingCommentOps.current.set(catchId, Date.now());
    const patch = (items: CatchItem[]) =>
      items.map((c) => c.id === catchId ? { ...c, _commentCount: c._commentCount + 1 } : c);
    setDiscoverItems(patch);
    setFeedItems(patch);
    setUserCatches(patch);
  };

  // ── Following feed ────────────────────────────────────────────────────────

  const loadFollows = useCallback(async () => {
    if (!user) return;
    try {
      const records = await pb.collection("follows").getFullList({
        filter: `follower_id = "${user.id}"`,
        requestKey: null,
      });
      setMyFollows(records);
    } catch (e) { if (!isNetworkError(e)) console.warn("loadFollows error:", e); }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadDiscover(1);
      loadFollows();
      void loadNews();
    }, [loadDiscover, loadFollows, loadNews])
  );

  const loadFeed = useCallback(async () => {
    if (!user || myFollows.length === 0) { setFeedItems([]); return; }
    setLoadingFeed(true);
    try {
      const visibleFollows = myFollows.filter((f) => !blockedUserIdSet.has(f.following_id));
      if (visibleFollows.length === 0) {
        setFeedItems([]);
        return;
      }
      const filterStr = visibleFollows.map((f) => `user_id = "${f.following_id}"`).join(" || ");
      const records = await pb.collection("catches").getFullList({
        filter: `is_public = true && (${filterStr})`,
        sort: "-created_at",
        requestKey: null,
      });
      setFeedItems(await enrichCatches(records.filter((item: any) => !blockedUserIdSet.has(item.user_id)), user.id));
    } catch (e) { console.warn("loadFeed error:", e); }
    finally { setLoadingFeed(false); }
  }, [blockedUserIdSet, user, myFollows]);

  useEffect(() => {
    if (activeTab === "feed") loadFeed();
  }, [activeTab, myFollows, loadFeed]);

  // ── Angler search ─────────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const safe = q.trim().replace(/"/g, '\\"');
      const filter = safe ? `(username ~ "${safe}" || name ~ "${safe}")` : undefined;
      const result = await pb.collection("users").getList(1, 50, {
        filter,
        sort: "username",
        requestKey: null,
      });
      const users = result.items.filter((u: any) => u.id !== user?.id && !blockedUserIdSet.has(u.id));
      const usersWithCounts = await Promise.all(
        users.map(async (u: any) => ({
          ...u,
          _catchCount: await fetchPublicProfileCatchCount(u.id) ?? 0,
        }))
      );
      usersWithCounts.sort((a: any, b: any) => {
        const byCatches = (b._catchCount ?? 0) - (a._catchCount ?? 0);
        if (byCatches !== 0) return byCatches;
        return String(a.username ?? "").localeCompare(String(b.username ?? ""));
      });
      setSearchResults(usersWithCounts);
    } catch (e) {
      console.warn("search error:", e);
    } finally {
      setSearching(false);
    }
  }, [blockedUserIdSet, user]);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const result = await pb.collection("groups").getList(1, 100, {
        sort: "-updated",
        requestKey: null,
      });
      setGroups(result.items);
    } catch (e) {
      console.warn("load groups error:", e);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "groups") loadGroups();
  }, [activeTab, loadGroups]);

  const refreshGroups = async () => {
    setRefreshingGroups(true);
    try {
      await loadGroups();
    } finally {
      setRefreshingGroups(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !user) return;
    setCreatingGroup(true);
    try {
      const group = await pb.collection("groups").create({
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        creator_id: user.id,
      });
      await pb.collection("group_members").create({ group_id: group.id, user_id: user.id, status: "approved" }).catch(() => {});
      setCreateGroupVisible(false);
      setNewGroupName("");
      setNewGroupDesc("");
      setGroups((prev) => [group, ...prev]);
      setSelectedGroup(group);
    } catch (e) {
      console.warn("create group error:", e);
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      doSearch(q);
    }, 300);
  };

  const openSearch = () => {
    setSearchVisible(true);
    setSearchQuery("");
    doSearch("");
  };

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  // ── Follow / User profile ─────────────────────────────────────────────────

  const isFollowing = (targetId: string) => myFollows.some((f) => f.following_id === targetId);

  const toggleFollow = async (targetUser: any) => {
    if (!requireAuth()) return;
    if (!user) return;
    if (targetUser.id === user.id) return; // can't follow yourself
    if (followInFlight.current.has(targetUser.id)) return;
    followInFlight.current.add(targetUser.id);
    const existing = myFollows.find((f) => f.following_id === targetUser.id);
    if (existing) {
      try {
        await pb.collection("follows").delete(existing.id);
        setMyFollows((prev) => prev.filter((f) => f.id !== existing.id));
      } catch { console.warn("unfollow error"); }
      finally { followInFlight.current.delete(targetUser.id); }
    } else {
      try {
        const record = await pb.collection("follows").create({
          follower_id: user.id,
          following_id: targetUser.id,
        });
        setMyFollows((prev) => [...prev, record]);
        // Push is sent server-side (pb_hooks) in the recipient's saved language.
      } catch (e) { console.warn("follow error:", e); }
      finally { followInFlight.current.delete(targetUser.id); }
    }
  };

  const openUser = async (targetUser: any) => {
    if (blockedUserIdSet.has(targetUser.id)) {
      Alert.alert(t("userBlocked"));
      return;
    }
    setProfileMenuVisible(false);
    setUserFollowListModal(null);
    setUserFollowListData([]);
    setSelectedUser({
      ...targetUser,
      banner: targetUser.banner ?? null,
      avatar: targetUser.avatar ?? null,
      avatarUrl:
        targetUser.avatarUrl ??
        (targetUser.avatar
          ? `${pb.baseURL}/api/files/_pb_users_auth_/${targetUser.id}/${targetUser.avatar}?thumb=200x200`
          : null),
    });
    setUserCatches([]);
    setUserCatchCount(0);
    setUserFollowerCount(0);
    setUserFollowingCount(0);
    setLoadingUserCatches(true);
    try {
      const [fullUser, records, publicCatchCount, catchCountResult, followersResult, followingResult] = await Promise.all([
        pb.collection("users").getOne(targetUser.id, { requestKey: null }).catch(() => null),
        pb.collection("catches").getFullList({
          filter: `user_id = "${targetUser.id}" && is_public = true`,
          sort: "-created_at",
          requestKey: null,
        }).catch(() => [] as any[]),
        fetchPublicProfileCatchCount(targetUser.id),
        pb.collection("catches").getList(1, 1, {
          filter: `user_id = "${targetUser.id}"`,
          requestKey: null,
        }).catch(() => ({ totalItems: 0 })),
        pb.collection("follows").getList(1, 1, {
          filter: `following_id = "${targetUser.id}"`,
          requestKey: null,
        }).catch(() => ({ totalItems: 0 })),
        pb.collection("follows").getList(1, 1, {
          filter: `follower_id = "${targetUser.id}"`,
          requestKey: null,
        }).catch(() => ({ totalItems: 0 })),
      ]);
      if (fullUser) {
        setSelectedUser((prev: any) => {
          // Profile modal may have been closed while this fetch was in flight
          if (!prev) return prev;
          return {
            ...prev,
            name: fullUser.name ?? prev.name ?? "",
            username: fullUser.username ?? prev.username ?? "",
            badges: fullUser.badges,
            bio: fullUser.bio ?? "",
            created: fullUser.created ?? prev.created,
            city: fullUser.city ?? prev.city,
            banner: fullUser.banner ?? prev.banner ?? null,
            avatar: fullUser.avatar ?? prev.avatar ?? null,
            avatarUrl: fullUser.avatar
              ? `${pb.baseURL}/api/files/_pb_users_auth_/${fullUser.id}/${fullUser.avatar}?thumb=200x200`
              : prev.avatarUrl ?? null,
          };
        });
      }
      setUserCatches(await enrichCatches((records as any[]).filter((item: any) => !blockedUserIdSet.has(item.user_id)), user?.id));
      setUserCatchCount(publicCatchCount ?? (catchCountResult as any).totalItems ?? (records as any[]).length);
      setUserFollowerCount((followersResult as any).totalItems ?? 0);
      setUserFollowingCount((followingResult as any).totalItems ?? 0);
    } catch (e) { console.warn("openUser error:", e); }
    finally { setLoadingUserCatches(false); }
  };

  const openUserFollowList = async (type: "followers" | "following") => {
    if (!selectedUser?.id) return;
    setUserFollowListModal(type);
    setUserFollowListLoading(true);
    setUserFollowListData([]);
    try {
      const records = await pb.collection("follows").getFullList({
        filter: type === "followers"
          ? `following_id = "${selectedUser.id}"`
          : `follower_id = "${selectedUser.id}"`,
        requestKey: null,
      });
      const ids = records
        .map((r: any) => type === "followers" ? r.follower_id : r.following_id)
        .filter((id: string) => id && !blockedUserIdSet.has(id));
      const users = await Promise.all(
        ids.map((id: string) => pb.collection("users").getOne(id, { requestKey: null }).catch(() => null))
      );
      setUserFollowListData(users.filter(Boolean));
    } catch (e) {
      console.warn("user follow list error:", e);
    } finally {
      setUserFollowListLoading(false);
    }
  };

  useEffect(() => {
    if (!navUserId) return;
    pb.collection("users").getOne(navUserId, { requestKey: null })
      .then((u) => openUser(u))
      .catch(() => {});
  }, [navUserId]);

  useEffect(() => {
    if (openSearchParam === "1") openSearch();
  }, [openSearchParam]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const formatDate = (val: any) => {
    if (!val) return "";
    const num = Number(val);
    const d = !isNaN(num) && num > 0 ? new Date(num) : new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
  };

  const formatJoinedDate = (val: any) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    const date = d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { month: "long", year: "numeric" });
    return language === "ru" ? `С ${date}` : `Joined ${date}`;
  };

  // ── Feed card (Fishbrain-style) ───────────────────────────────────────────

  const renderFeedCard = ({ item }: { item: CatchItem }) => (
    <TouchableOpacity activeOpacity={0.95} onPress={() => openDetail(item)} style={styles.feedCard}>
      {/* Header: avatar + username + follow */}
      <View style={styles.feedCardHeader}>
        <TouchableOpacity
          style={styles.feedCardUser}
          onPress={() =>
            openUser({
              id: item.user_id,
              username: item._username,
              name: "",
              avatarUrl: item._avatarUrl,
              badges: item._badges,
            })
          }
        >
          <View style={styles.feedAvatar}>
            {item._avatarUrl ? (
              <ImageWithLoader source={{ uri: item._avatarUrl }} contentFit="cover" style={styles.feedAvatarImage} />
            ) : (
              <Ionicons name="person" size={22} color="#94a3b8" />
            )}
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.feedUsername}>{item._username}</Text>
              {item._badges.includes("verified") ? <VerifiedBadge size={13} /> : null}
            </View>
            <Text style={styles.feedDate}>{formatDate(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
        {user && item.user_id !== user.id && (
          <TouchableOpacity
            style={[styles.followBtn, isFollowing(item.user_id) && styles.followingBtn]}
            onPress={() => toggleFollow({ id: item.user_id, username: item._username })}
          >
            <Text style={[styles.followBtnText, isFollowing(item.user_id) && styles.followingBtnText]}>
              {isFollowing(item.user_id) ? t("followingBtn") : t("follow")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Photo(s) */}
      {(() => {
        const photos = [item.image_uri, ...(item.extraPhotos ?? [])].filter(Boolean) as string[];
        if (photos.length === 0) {
          return (
            <View style={styles.feedPhotoEmpty}>
              <Ionicons name="camera-outline" size={40} color="#1e3a5f" />
            </View>
          );
        }
        if (photos.length === 1) {
          return <ImageWithLoader source={{ uri: photos[0] }} style={styles.feedPhoto} contentFit="cover" />;
        }
        return <FeedPhotoCarousel photos={photos} />;
      })()}

      {/* Body */}
      <View style={styles.feedCardBody}>
        <Text style={styles.feedSpecies}>{getSpeciesLabel(item.species, language)}</Text>
        {item.gear ? (
          <View style={styles.feedGearRow}>
            {gearPhotos[item.gear] ? (
              <ExpoImage source={gearPhotos[item.gear]} style={styles.feedGearThumb} contentFit="contain" />
            ) : null}
            <Text style={styles.feedGearText}>{getGearLabel(item.gear, language)}</Text>
          </View>
        ) : null}
        {(item.length_cm || item.weight_kg) ? (
          <Text style={styles.feedMeta}>
            {item.length_cm ? `${item.length_cm} cm` : ""}
            {item.length_cm && item.weight_kg ? "  ·  " : ""}
            {item.weight_kg ? `${item.weight_kg} kg` : ""}
          </Text>
        ) : null}
        {item.description ? (
          <Text style={styles.feedDesc} numberOfLines={3}>{item.description}</Text>
        ) : null}

        {/* Like / comment row */}
        <View style={styles.feedActions}>
          <View style={styles.feedActionBtn}>
            <LikeButton isLiked={item._isLiked} onPress={() => toggleLike(item)} size={20} />
            <Text style={[styles.feedActionText, item._isLiked && { color: "#ffffff" }]}>{item._likeCount}</Text>
          </View>
          <TouchableOpacity style={styles.feedActionBtn} onPress={() => openDetail(item)}>
            <Ionicons name="chatbubble-outline" size={20} color="#64748b" />
            <Text style={styles.feedActionText}>{item._commentCount}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ── List card (following feed) ────────────────────────────────────────────

  const renderListCard = ({ item }: { item: CatchItem }) => (
    <TouchableOpacity style={styles.catchRow} onPress={() => openDetail(item)} activeOpacity={0.75}>
      {item.image_uri ? (
        <ImageWithLoader source={{ uri: pocketbaseThumbUrl(item.image_uri, "200x200")! }} style={styles.catchThumb} contentFit="cover" />
      ) : (
        <View style={[styles.catchThumb, styles.catchThumbEmpty]}>
          <Ionicons name="camera-outline" size={20} color="#334155" />
        </View>
      )}
      <View style={styles.catchInfo}>
        <View style={styles.catchAuthorRow}>
          <View style={styles.catchAuthorAvatar}>
            {item._avatarUrl ? (
              <ImageWithLoader source={{ uri: item._avatarUrl }} contentFit="cover" style={styles.catchAuthorAvatarImg} />
            ) : (
              <Ionicons name="person" size={14} color="#94a3b8" />
            )}
          </View>
          {item._username ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Text style={styles.catchUser}>{item._username}</Text>
                {item._badges.includes("verified") ? <VerifiedBadge size={12} /> : null}
              </View>
            ) : null}
        </View>
        <Text style={styles.catchSpecies}>{getSpeciesLabel(item.species, language)}</Text>
        {item.gear ? (
          <View style={styles.catchGearRow}>
            {gearPhotos[item.gear] ? (
              <ExpoImage source={gearPhotos[item.gear]} style={styles.catchGearThumb} contentFit="contain" />
            ) : null}
            <Text style={styles.catchGearText}>{getGearLabel(item.gear, language)}</Text>
          </View>
        ) : null}
        {item.description ? <Text style={styles.catchDesc} numberOfLines={1}>{item.description}</Text> : null}
        <Text style={styles.catchDate}>{formatDate(item.created_at)}</Text>
        <View style={styles.catchCounts}>
          <View style={styles.catchCountBtn}>
            <LikeButton isLiked={item._isLiked} onPress={() => toggleLike(item)} size={13} />
            <Text style={[styles.catchCountText, item._isLiked && { color: "#ffffff" }]}>{item._likeCount}</Text>
          </View>
          <TouchableOpacity onPress={() => openDetail(item)} style={styles.catchCountBtn}>
            <Ionicons name="chatbubble-outline" size={13} color="#64748b" />
            <Text style={styles.catchCountText}>{item._commentCount}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const notifLabel = (n: NotifItem) => {
    if (n.type === "follow") return language === "ru" ? "подписался на вас" : "followed you";
    if (n.type === "like") return language === "ru" ? "лайкнул ваш улов" : "liked your catch";
    return language === "ru" ? "прокомментировал ваш улов" : "commented on your catch";
  };

  const notifTimeAgo = (iso: string) => {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    const ru = language === "ru";
    if (sec < 60) return ru ? "только что" : "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return ru ? `${min} мин` : `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return ru ? `${hr} ч` : `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return ru ? `${day} дн` : `${day}d`;
    return new Date(iso).toLocaleDateString(ru ? "ru-RU" : "en-US", { month: "short", day: "numeric" });
  };

  const notifIcon = (type: NotifItem["type"]) => {
    if (type === "follow") return <Ionicons name="person-add" size={15} color="#38bdf8" />;
    if (type === "like") return <Ionicons name="heart" size={15} color="#f43f5e" />;
    return <Ionicons name="chatbubble" size={15} color="#a78bfa" />;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header row: title + news + notifications */}
      <View style={styles.socialHeader}>
        <Text style={styles.socialHeaderTitle}>{language === "ru" ? "Сообщество" : "Community"}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={openNews}
            accessibilityRole="button"
            accessibilityLabel={language === "ru" ? "Новости" : "News"}
          >
            <View>
              <Ionicons name="newspaper-outline" size={24} color="#e6eef8" />
              {newsUnreadCount > 0 ? (
                <View style={[styles.notifBadge, styles.newsBadge]}>
                  <Text style={styles.notifBadgeText}>{newsUnreadCount}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={openNotifs}
            accessibilityRole="button"
            accessibilityLabel={language === "ru" ? "Уведомления" : "Notifications"}
          >
            <View>
              <Ionicons name="notifications-outline" size={24} color="#e6eef8" />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs + search button */}
      <View style={styles.tabRow}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "discover" && styles.tabActive]}
            onPress={() => setActiveTab("discover")}
          >
            <Text style={[styles.tabText, activeTab === "discover" && styles.tabTextActive]}>
              {t("discover")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "feed" && styles.tabActive]}
            onPress={() => setActiveTab("feed")}
          >
            <Text style={[styles.tabText, activeTab === "feed" && styles.tabTextActive]}>
              {t("following")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "groups" && styles.tabActive]}
            onPress={() => setActiveTab("groups")}
          >
            <Text style={[styles.tabText, activeTab === "groups" && styles.tabTextActive]}>
              {language === "ru" ? "Чаты" : "Chats"}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.searchIconBtn} onPress={openSearch}>
          <Ionicons name="search" size={22} color="#e6eef8" />
        </TouchableOpacity>
      </View>

      {/* Discover fullscreen pager */}
      {activeTab === "discover" && (
        loadingDiscover ? (
          <ActivityIndicator color="#ffffff" style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            data={discoverItems}
            keyExtractor={(i) => i.id}
            renderItem={renderFeedCard}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.feedList}
            onEndReached={() => {
              if (!loadingMoreDiscover && discoverHasMore) loadDiscover(discoverPage + 1);
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadingMoreDiscover
                ? <ActivityIndicator color="#ffffff" style={{ marginVertical: 16 }} />
                : null
            }
            ListEmptyComponent={
              <View style={styles.centerMsg}>
                {!isOnline && <Ionicons name="cloud-offline-outline" size={44} color="#1e3a5f" />}
                <Text style={styles.centerText}>
                  {!isOnline
                    ? (language === "ru" ? "Нет сети. Лента недоступна без интернета" : "You're offline. The feed needs a connection")
                    : t("noPublicCatches")}
                </Text>
              </View>
            }
          />
        )
      )}

      {/* Following feed */}
      {activeTab === "feed" && (
        !user ? (
          <View style={styles.centerMsg}>
            <Ionicons name="people-outline" size={44} color="#1e3a5f" />
            <Text style={styles.centerText}>{t("signInToFollow")}</Text>
          </View>
        ) : loadingFeed ? (
          <ActivityIndicator color="#ffffff" style={{ marginTop: 48 }} />
        ) : feedItems.length === 0 ? (
          <View style={styles.centerMsg}>
            <Ionicons name={!isOnline ? "cloud-offline-outline" : "boat-outline"} size={44} color="#1e3a5f" />
            <Text style={styles.centerText}>
              {!isOnline
                ? (language === "ru" ? "Нет сети. Лента недоступна без интернета" : "You're offline. The feed needs a connection")
                : (myFollows.length === 0 ? t("followToSeeCatches") : t("noFollowingCatches"))}
            </Text>
          </View>
        ) : (
          <FlatList
            data={feedItems}
            keyExtractor={(i) => i.id}
            renderItem={renderListCard}
            contentContainerStyle={styles.listContent}
          />
        )
      )}

      {/* Group chats */}
      {activeTab === "groups" && (
        !user ? (
          <View style={styles.centerMsg}>
            <Ionicons name="chatbubbles-outline" size={44} color="#1e3a5f" />
            <Text style={styles.centerText}>
              {language === "ru" ? "Войдите, чтобы создавать чаты и общаться" : "Sign in to create chats and talk"}
            </Text>
          </View>
        ) : loadingGroups ? (
          <ActivityIndicator color="#ffffff" style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.groupListContent}
            refreshControl={<RefreshControl refreshing={refreshingGroups} onRefresh={refreshGroups} tintColor="#ffffff" />}
            ListHeaderComponent={
              <View style={styles.groupTabHeader}>
                {createGroupVisible ? (
                  <View style={styles.createGroupInline}>
                    <Text style={styles.createGroupTitle}>
                      {language === "ru" ? "Новый чат" : "New chat"}
                    </Text>
                    <TextInput
                      style={styles.createGroupInput}
                      placeholder={language === "ru" ? "Название *" : "Name *"}
                      placeholderTextColor="#475569"
                      value={newGroupName}
                      onChangeText={setNewGroupName}
                      maxLength={60}
                      keyboardAppearance="dark"
                    />
                    <TextInput
                      style={[styles.createGroupInput, { minHeight: 72, textAlignVertical: "top" }]}
                      placeholder={language === "ru" ? "Описание (необязательно)" : "Description (optional)"}
                      placeholderTextColor="#475569"
                      value={newGroupDesc}
                      onChangeText={setNewGroupDesc}
                      multiline
                      maxLength={200}
                      keyboardAppearance="dark"
                    />
                    <View style={styles.createGroupActions}>
                      <TouchableOpacity style={styles.createGroupCancel} onPress={() => { setCreateGroupVisible(false); setNewGroupName(""); setNewGroupDesc(""); }}>
                        <Text style={styles.createGroupCancelText}>{language === "ru" ? "Отмена" : "Cancel"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.createGroupConfirm, (!newGroupName.trim() || creatingGroup) && { opacity: 0.5 }]}
                        onPress={handleCreateGroup}
                        disabled={!newGroupName.trim() || creatingGroup}
                      >
                        {creatingGroup ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createGroupConfirmText}>{language === "ru" ? "Создать" : "Create"}</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.createGroupBtn} onPress={() => setCreateGroupVisible(true)}>
                    <Ionicons name="add" size={14} color="#0284c7" />
                    <Text style={styles.createGroupBtnText}>
                      {language === "ru" ? "Создать чат" : "Create chat"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.groupRow}
                activeOpacity={0.75}
                onPress={() => setSelectedGroup(item)}
              >
                <View style={styles.groupRowAvatar}>
                  {item.avatar ? (
                    <ImageWithLoader
                      source={{ uri: `${pb.baseURL}/api/files/groups/${item.id}/${item.avatar}?thumb=200x200` }}
                      contentFit="cover"
                      style={styles.groupRowAvatarImg}
                    />
                  ) : (
                    <Ionicons name="chatbubbles" size={22} color="#94a3b8" />
                  )}
                </View>
                <View style={styles.groupRowInfo}>
                  <Text style={styles.groupRowTitle} numberOfLines={1}>{item.name}</Text>
                  {item.description ? <Text style={styles.groupRowDesc} numberOfLines={1}>{item.description}</Text> : null}
                </View>
                {item.creator_id === user.id ? (
                  <Text style={styles.groupOwnerTag}>{language === "ru" ? "Ваш" : "Owner"}</Text>
                ) : null}
                <Ionicons name="chevron-forward" size={14} color="#334155" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.centerMsg}>
                <Ionicons name="chatbubbles-outline" size={44} color="#1e3a5f" />
                <Text style={styles.centerText}>
                  {language === "ru" ? "Пока нет чатов" : "No chats yet"}
                </Text>
              </View>
            }
          />
        )
      )}

      {/* User profile modal */}
      <Modal visible={!!selectedUser} animationType="slide" onRequestClose={() => { setProfileMenuVisible(false); setSelectedUser(null); }}>
        <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
          <FlatList
            data={loadingUserCatches ? [] : userCatches}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.catchRow} onPress={() => openUserCatchDetail(item)} activeOpacity={0.75}>
                {item.image_uri ? (
                  <ImageWithLoader source={{ uri: pocketbaseThumbUrl(item.image_uri, "200x200")! }} style={styles.catchThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.catchThumb, styles.catchThumbEmpty]}>
                    <Ionicons name="camera-outline" size={20} color="#334155" />
                  </View>
                )}
                <View style={styles.catchInfo}>
                  <View style={styles.catchAuthorRow}>
                    <View style={styles.catchAuthorAvatar}>
                      {item._avatarUrl ? (
                        <ImageWithLoader source={{ uri: item._avatarUrl }} contentFit="cover" style={styles.catchAuthorAvatarImg} />
                      ) : (
                        <Ionicons name="person" size={14} color="#94a3b8" />
                      )}
                    </View>
                    {item._username ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Text style={styles.catchUser}>{item._username}</Text>
                        {item._badges.includes("verified") ? <VerifiedBadge size={12} /> : null}
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.catchSpecies}>{getSpeciesLabel(item.species, language)}</Text>
                  {item.gear ? (
                    <View style={styles.catchGearRow}>
                      {gearPhotos[item.gear] ? (
                        <ExpoImage source={gearPhotos[item.gear]} style={styles.catchGearThumb} contentFit="contain" />
                      ) : null}
                      <Text style={styles.catchGearText}>{getGearLabel(item.gear, language)}</Text>
                    </View>
                  ) : null}
                  {item.description ? <Text style={styles.catchDesc} numberOfLines={1}>{item.description}</Text> : null}
                  <Text style={styles.catchDate}>{formatDate(item.created_at)}</Text>
                  <View style={styles.catchCounts}>
                    <View style={styles.catchCountBtn}>
<LikeButton isLiked={item._isLiked} onPress={() => toggleLike(item)} size={13} />
                      <Text style={[styles.catchCountText, item._isLiked && { color: "#ffffff" }]}>{item._likeCount}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openUserCatchDetail(item)} style={styles.catchCountBtn}>
                      <Ionicons name="chatbubble-outline" size={13} color="#64748b" />
                      <Text style={styles.catchCountText}>{item._commentCount}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              !loadingUserCatches ? (
                <Text style={styles.emptyText}>{t("noPublicCatches")}</Text>
              ) : null
            }
            ListHeaderComponent={
              <View>
                <View style={styles.upBannerContainer}>
                  <ImageWithLoader
                    source={selectedUser?.banner
                      ? { uri: `${pb.baseURL}/api/files/_pb_users_auth_/${selectedUser.id}/${selectedUser.banner}?thumb=1200x400` }
                      : require("../../assets/images/default-water-banner.png")}
                    contentFit="cover"
                    style={styles.upBannerImage}
                  />
                  <View style={[styles.upHeaderRow, { paddingTop: safeTop }]}>
                    <TouchableOpacity onPress={() => { setProfileMenuVisible(false); setSelectedUser(null); }} style={styles.upHeaderBtn} hitSlop={8}>
                      <Ionicons name="arrow-back" size={20} color="#e6eef8" />
                    </TouchableOpacity>
                    {selectedUser && selectedUser.id !== user?.id && (
                      <View>
                        <TouchableOpacity
                          onPress={() => setProfileMenuVisible((visible) => !visible)}
                          style={styles.upHeaderBtn}
                          hitSlop={8}
                          accessibilityLabel={language === "ru" ? "Действия с профилем" : "Profile actions"}
                        >
                          <Ionicons name="ellipsis-vertical" size={20} color="#e6eef8" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.upAvatarWrapper}>
                  <TouchableOpacity
                    style={styles.upAvatar}
                    onPress={() => setAvatarPreviewVisible(true)}
                    disabled={!selectedAvatarUri}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityLabel={language === "ru" ? "Открыть фото профиля" : "Open profile photo"}
                  >
                    {selectedUser?.avatarUrl ? (
                      <ImageWithLoader source={{ uri: selectedUser.avatarUrl }} contentFit="cover" style={styles.upAvatarImage} />
                    ) : (
                      <Ionicons name="person" size={44} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                </View>

                {/* Name + username */}
                {selectedUser?.name ? (
                  <Text style={styles.upName}>{selectedUser.name}</Text>
                ) : null}
                {selectedUser?.username ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 3 }}>
                    <Text style={styles.upUsername}>@{selectedUser.username}</Text>
                    {parseBadges(selectedUser?.badges).includes("verified") ? <VerifiedBadge size={14} /> : null}
                  </View>
                ) : null}
                {selectedUser?.city ? (
                  <View style={styles.upLocationRow}>
                    <Ionicons name="location-outline" size={13} color="#64748b" />
                    <Text style={styles.upLocationText}>{selectedUser.city}</Text>
                  </View>
                ) : null}
                {!!formatJoinedDate(selectedUser?.created) && (
                  <Text style={styles.upJoined}>{formatJoinedDate(selectedUser.created)}</Text>
                )}

                <BadgeChip badges={parseBadges(selectedUser?.badges)} language={language} />

                {selectedUser?.bio ? (
                  <View style={styles.upBioCard}>
                    <Text style={styles.upBio}>{selectedUser.bio}</Text>
                  </View>
                ) : null}

                {/* Stats row */}
                <View style={styles.upStatsRow}>
                  <View style={styles.upStatItem}>
                    <Text style={styles.upStatNum}>{userCatchCount}</Text>
                    <Text style={styles.upStatLabel}>{language === "ru" ? "Уловов" : "Catches"}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <TouchableOpacity style={styles.upStatItem} onPress={() => openUserFollowList("followers")}>
                    <Text style={styles.upStatNum}>{userFollowerCount}</Text>
                    <Text style={styles.upStatLabel}>{language === "ru" ? "Подписчики" : "Followers"}</Text>
                  </TouchableOpacity>
                  <View style={styles.statDivider} />
                  <TouchableOpacity style={styles.upStatItem} onPress={() => openUserFollowList("following")}>
                    <Text style={styles.upStatNum}>{userFollowingCount}</Text>
                    <Text style={styles.upStatLabel}>{language === "ru" ? "Подписки" : "Following"}</Text>
                  </TouchableOpacity>
                </View>

                {/* Follow action */}
                <View style={styles.upActionRow}>
                  {selectedUser && selectedUser.id !== user?.id && (
                    <TouchableOpacity
                      style={[styles.upActionBtn, isFollowing(selectedUser.id) && styles.upActionBtnFollowing]}
                      onPress={() => toggleFollow(selectedUser)}
                    >
                      <Text style={[styles.upActionBtnText, isFollowing(selectedUser.id) && styles.upActionBtnFollowingText]}>
                        {isFollowing(selectedUser.id) ? t("followingBtn") : t("follow")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Catches section header */}
                {loadingUserCatches ? (
                  <ActivityIndicator color="#ffffff" style={{ marginTop: 32, marginBottom: 16 }} />
                ) : (
                  <View style={styles.upCatchesHeader}>
                    <Text style={styles.upCatchesTitle}>{language === "ru" ? "Уловы" : "Catches"}</Text>
                  </View>
                )}
              </View>
            }
          />
          <CatchDetailModal
            catch={detailCatch}
            onClose={closeDetail}
            onLikeChange={applyLikeToLists}
            onCommentAdded={applyCommentToLists}
            onCommentCountSynced={syncCommentCountInLists}
            onReportCatch={handleReportCatch}
            onReportComment={handleReportComment}
            onBlockUser={handleBlockUser}
            blockedUserIds={blockedUserIds}
            onUserPress={(userId) => {
              closeDetail();
              const item = [...discoverItems, ...feedItems, ...userCatches].find((c) => c.user_id === userId);
              openUser({ id: userId, username: item?._username ?? "", name: "", avatarUrl: item?._avatarUrl ?? null, badges: item?._badges ?? [] });
            }}
          />
          <Modal
            visible={userFollowListModal !== null}
            animationType="slide"
            transparent={false}
            statusBarTranslucent
            onRequestClose={() => setUserFollowListModal(null)}
          >
            <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.followListModalContainer, { paddingTop: safeTop }]}>
              <View style={styles.followListModalHeader}>
                <Text style={styles.followListModalTitle}>
                  {userFollowListModal === "followers"
                    ? (language === "ru" ? "Подписчики" : "Followers")
                    : (language === "ru" ? "Подписки" : "Following")}
                </Text>
                <TouchableOpacity onPress={() => setUserFollowListModal(null)} style={styles.followListCloseBtn} hitSlop={8}>
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
              {userFollowListLoading ? (
                <ActivityIndicator color="#ffffff" style={{ marginTop: 40 }} />
              ) : (
                <FlatList
                  data={userFollowListData}
                  keyExtractor={(u) => u.id}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  ListEmptyComponent={
                    <Text style={styles.followListEmpty}>
                      {language === "ru" ? "Никого нет" : "Nobody here yet"}
                    </Text>
                  }
                  renderItem={({ item: u }) => (
                    <TouchableOpacity
                      style={styles.followListUserRow}
                      activeOpacity={0.75}
                      onPress={() => {
                        setUserFollowListModal(null);
                        openUser({
                          id: u.id,
                          username: u.username,
                          name: u.name,
                          badges: parseBadges(u.badges),
                          avatarUrl: u.avatar
                            ? `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=200x200`
                            : null,
                        });
                      }}
                    >
                      <View style={styles.followListAvatar}>
                        {u.avatar ? (
                          <ImageWithLoader
                            source={{ uri: `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=200x200` }}
                            style={styles.followListAvatarImg}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons name="person" size={20} color="#94a3b8" />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        {u.name ? <Text style={styles.followListUserName}>{u.name}</Text> : null}
                        {u.username ? <Text style={styles.followListUserHandle}>@{u.username}</Text> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#475569" />
                    </TouchableOpacity>
                  )}
                />
              )}
            </SafeAreaView>
          </Modal>
          <Modal
            visible={profileMenuVisible && !!selectedUser && selectedUser.id !== user?.id}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setProfileMenuVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.upMenuOverlay}
              onPress={() => setProfileMenuVisible(false)}
            >
              <View style={[styles.upDropdownMenu, { top: safeTop + 62 }]}>
                <TouchableOpacity
                  style={styles.upDropdownItem}
                  onPress={() => {
                    setProfileMenuVisible(false);
                    if (selectedUser?.id) handleReportUser(selectedUser.id);
                  }}
                >
                  <Ionicons name="flag-outline" size={15} color="#fbbf24" style={{ marginRight: 10 }} />
                  <Text style={styles.upDropdownItemText}>{t("reportUser")}</Text>
                </TouchableOpacity>
                <View style={styles.upDropdownDivider} />
                <TouchableOpacity
                  style={styles.upDropdownItem}
                  onPress={() => {
                    setProfileMenuVisible(false);
                    if (selectedUser?.id) handleBlockUser(selectedUser.id);
                  }}
                >
                  <Ionicons name="ban-outline" size={15} color="#f87171" style={{ marginRight: 10 }} />
                  <Text style={[styles.upDropdownItemText, { color: "#f87171" }]}>{t("blockUser")}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
          <AvatarPreviewModal
            visible={avatarPreviewVisible}
            uri={selectedAvatarUri}
            onClose={() => setAvatarPreviewVisible(false)}
          />
        </SafeAreaView>
      </Modal>

      <CatchDetailModal
        catch={selectedUser ? null : detailCatch}
        onClose={closeDetail}
        onLikeChange={applyLikeToLists}
        onCommentAdded={applyCommentToLists}
        onCommentCountSynced={syncCommentCountInLists}
        onReportCatch={handleReportCatch}
        onReportComment={handleReportComment}
        onBlockUser={handleBlockUser}
        blockedUserIds={blockedUserIds}
        onUserPress={(userId) => {
          closeDetail();
          const item = [...discoverItems, ...feedItems, ...userCatches].find((c) => c.user_id === userId);
          openUser({ id: userId, username: item?._username ?? "", name: "", avatarUrl: item?._avatarUrl ?? null, badges: item?._badges ?? [] });
        }}
      />

      {/* Search fullscreen modal */}
      <Modal visible={searchVisible} animationType="slide" onRequestClose={closeSearch}>
        <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.container, { paddingTop: safeTop }]}>
          <View style={styles.searchModalHeader}>
            <View style={styles.searchBarWrap}>
              <Ionicons name="search-outline" size={15} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                ref={searchInput}
                style={styles.searchBarInput}
                placeholder={t("searchPlaceholder")}
                placeholderTextColor="#475569"
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoCapitalize="none"
                autoFocus
                keyboardAppearance="dark"
                returnKeyType="search"
              />
              {searching && <ActivityIndicator size="small" color="#ffffff" style={{ marginLeft: 6 }} />}
            </View>
            <TouchableOpacity onPress={closeSearch} style={styles.searchCancelBtn} hitSlop={8}>
              <Text style={styles.searchCancelText}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>

          {/* Anglers list */}
          <FlatList
            data={searchResults}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.anglerRow}
                activeOpacity={0.75}
                onPress={() => { closeSearch(); openUser(item); }}
              >
                <View style={styles.feedAvatar}>
                  {item.avatarUrl || item.avatar ? (
                    <ImageWithLoader
                      source={{ uri: item.avatarUrl || `${pb.baseURL}/api/files/_pb_users_auth_/${item.id}/${item.avatar}?thumb=200x200` }}
                      contentFit="cover"
                      style={styles.feedAvatarImage}
                    />
                  ) : (
                    <Ionicons name="person" size={22} color="#94a3b8" />
                  )}
                </View>
                <View style={styles.anglerInfo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={styles.anglerUsername}>{item.username}</Text>
                    {parseBadges(item.badges).includes("verified") ? <VerifiedBadge size={13} /> : null}
                  </View>
                  <Text style={styles.anglerMeta}>
                    {language === "ru"
                      ? `${item._catchCount ?? 0} уловов`
                      : `${item._catchCount ?? 0} catches`}
                  </Text>
                </View>
                {user && item.id !== user.id && (
                  <TouchableOpacity
                    style={[styles.followBtn, isFollowing(item.id) && styles.followingBtn]}
                    onPress={() => toggleFollow(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.followBtnText, isFollowing(item.id) && styles.followingBtnText]}>
                      {isFollowing(item.id) ? t("followingBtn") : t("follow")}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={!searching ? <Text style={styles.emptyText}>{t("noUsersFound")}</Text> : null}
          />
        </SafeAreaView>
      </Modal>

      {/* Group detail modal */}
      {selectedGroup && (
        <GroupModal
          group={selectedGroup}
          currentUserId={user?.id}
          language={language}
          onClose={() => setSelectedGroup(null)}
          onDeleted={() => { setGroups(prev => prev.filter(g => g.id !== selectedGroup.id)); }}
          onChanged={(group) => {
            setSelectedGroup(group);
            setGroups((prev) => prev.map((g) => g.id === group.id ? group : g));
          }}
          onOpenUser={(targetUser) => {
            setSelectedGroup(null);
            openUser(targetUser);
          }}
        />
      )}

      <AppNewsModal
        visible={newsVisible}
        items={newsItems}
        language={language}
        loading={loadingNews}
        refreshing={refreshingNews}
        error={newsError}
        onClose={() => setNewsVisible(false)}
        onRefresh={refreshNews}
        onOpenLink={openNewsLink}
      />

      {/* Notifications modal */}
      <Modal visible={notifVisible} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setNotifVisible(false)}>
        <View style={styles.notifSheetContainer}>
          <View style={styles.notifSheet}>
            <View style={styles.notifSheetHeader}>
              <Text style={styles.notifSheetTitle}>{language === "ru" ? "Уведомления" : "Notifications"}</Text>
              <TouchableOpacity onPress={() => setNotifVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {loadingNotifs ? (
              <ActivityIndicator color="#fff" style={{ marginTop: 32 }} />
            ) : notifications.length === 0 ? (
              <View style={styles.notifEmpty}>
                <Ionicons name="notifications-off-outline" size={40} color="#1e3a5f" />
                <Text style={styles.notifEmptyText}>{language === "ru" ? "Уведомлений нет" : "No notifications yet"}</Text>
              </View>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(n) => n.id}
                contentContainerStyle={{ paddingBottom: 32 }}
                refreshControl={
                  <RefreshControl refreshing={refreshingNotifs} onRefresh={refreshNotifs} tintColor="#94a3b8" />
                }
                renderItem={({ item }) => {
                  const isUnread = notifSeenBefore ? item.createdAt > notifSeenBefore : false;
                  return (
                  <TouchableOpacity style={[styles.notifItem, isUnread && styles.notifItemUnread]} activeOpacity={0.6} onPress={() => handleNotifPress(item)}>
                    <View style={styles.notifAvatar}>
                      {item.actorAvatarUrl ? (
                        <ExpoImage source={{ uri: item.actorAvatarUrl }} style={styles.notifAvatarImg} cachePolicy="memory-disk" />
                      ) : (
                        <Ionicons name="person" size={20} color="#94a3b8" />
                      )}
                      <View style={styles.notifTypeIcon}>{notifIcon(item.type)}</View>
                    </View>
                    <View style={styles.notifItemBody}>
                      <Text style={styles.notifItemText}>
                        <Text style={styles.notifItemName}>{item.actorUsername}</Text>
                        {" "}{notifLabel(item)}
                      </Text>
                      <Text style={styles.notifItemTime}>{notifTimeAgo(item.createdAt)}</Text>
                    </View>
                    {item.catchImageUrl && (
                      <ExpoImage source={{ uri: item.catchImageUrl }} style={styles.notifCatchThumb} cachePolicy="memory-disk" />
                    )}
                    {isUnread ? (
                      <View style={styles.notifUnreadDot} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color="#334155" style={{ marginLeft: 6 }} />
                    )}
                  </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  tabRow: {
    flexDirection: "row", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
    paddingRight: 4,
  },
  tabs: {
    flex: 1,
    flexDirection: "row",
    marginHorizontal: 16,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, gap: 6,
  },
  searchIconBtn: {
    padding: 10,
    marginRight: 4,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#ffffff" },
  tabText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  tabTextActive: { color: "#ffffff" },
  badge: {
    backgroundColor: theme.colors.primaryDark, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  
  feedList: { paddingTop: 0, paddingBottom: 0 },
  feedCard: {
    backgroundColor: theme.colors.surface,
    marginBottom: 12,
    overflow: "hidden",
  },
  feedCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  feedCardUser: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  feedAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center",
  },
  feedAvatarImage: { width: 38, height: 38, borderRadius: 19 },
  feedAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  feedUsername: { color: "#ffffff", fontWeight: "600", fontSize: 14 },
  feedDate: { color: "#94a3b8", fontSize: 12, marginTop: 1 },
  feedPhoto: { width: "100%", height: 280 },
  feedDotRow: { position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  feedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  feedDotActive: { backgroundColor: "#ffffff", width: 16 },
  feedPhotoEmpty: {
    width: "100%", height: 200,
    backgroundColor: "#0b1a2e", alignItems: "center", justifyContent: "center",
  },
  feedCardBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  feedSpecies: { color: "#ffffff", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  feedGearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, alignSelf: "flex-start" },
  feedGearThumb: { width: 28, height: 28 },
  feedGearText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  feedMeta: { color: "#7ea8c9", fontSize: 13, marginBottom: 6 },
  feedDesc: { color: "#94a3b8", fontSize: 14, lineHeight: 20, marginBottom: 8 },
  feedActions: {
    flexDirection: "row", gap: 20,
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: "#1e293b",
    marginTop: 4,
  },
  feedActionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  feedActionText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },




  
  // List card (following feed)
  listContent: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 0 },
  catchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, marginBottom: 8,
  },
  catchThumb: { width: 72, height: 72, borderRadius: 8, marginRight: 12 },
  catchThumbEmpty: { backgroundColor: "#0b1a2e", alignItems: "center", justifyContent: "center" },
  catchInfo: { flex: 1 },
  catchAuthorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  catchAuthorAvatar: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center",
  },
  catchAuthorAvatarImg: { width: 22, height: 22, borderRadius: 11 },
  catchAuthorAvatarText: { color: "#ffffff", fontSize: 9, fontWeight: "700" },
  catchSpecies: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
  catchGearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, marginBottom: 2, alignSelf: "flex-start" },
  catchGearThumb: { width: 22, height: 22 },
  catchGearText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
  catchUser: { color: "#ffffff", fontSize: 12, marginTop: 1 },
  catchDesc: { color: "#94a3b8", fontSize: 13, marginTop: 3 },
  catchDate: { color: "#94a3b8", fontSize: 12, marginTop: 4 },
  catchCounts: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 12 },
  catchCountBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  catchCountText: { color: "#94a3b8", fontSize: 12 },

  // Comments sheet
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheetCard: {
    backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, maxHeight: "70%",
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: "#334155",
    alignSelf: "center", marginBottom: 16,
  },
  sheetTitle: { color: "#e6eef8", fontSize: 17, fontWeight: "700", marginBottom: 16 },
  commentsList: { maxHeight: 280 },
  commentItem: { marginBottom: 14 },
  commentUsername: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
  commentText: { color: "#cbd5e1", fontSize: 14, marginTop: 2 },
  commentInputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 10, paddingHorizontal: 12,
    marginTop: 12,
  },
  commentInput: { flex: 1, color: "#e6eef8", fontSize: 14, paddingVertical: 10 },

  // Misc
  centerMsg: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  centerText: { color: "#94a3b8", fontSize: 15, textAlign: "center", lineHeight: 22 },
  emptyText: { color: "#94a3b8", textAlign: "center", marginTop: 16, fontSize: 14 },
  followBtn: { backgroundColor: theme.colors.primaryDark, paddingHorizontal: 16, paddingVertical: 7, borderRadius: theme.radius.control },
  followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#334155" },
  followBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  followingBtnText: { color: "#94a3b8" },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  backBtn: { marginRight: 14, padding: 4 },
  avatarLg: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center",
  },
  avatarLgImage: { width: 52, height: 52, borderRadius: 26 },
  avatarLgText: { color: "#ffffff", fontWeight: "700", fontSize: 20 },
  modalUsername: { color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  modalFullName: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  modalBio: { color: "#94a3b8", fontSize: 13, marginTop: 6, lineHeight: 18 },
  modalBioBlock: { color: "#94a3b8", fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  statsRow: {
    flexDirection: "row", justifyContent: "center",
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#1e293b",
    marginHorizontal: 16, gap: 32,
  },
  statItem: { alignItems: "center", minWidth: 80 },
  statNumber: { color: "#e6eef8", fontSize: 22, fontWeight: "700" },
  statLabel: {
    color: "#94a3b8", fontSize: 12, marginTop: 2,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  statDivider: { width: 1, backgroundColor: "#1e293b" },

  // Search modal
  searchModalHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#1e293b", gap: 8,
  },
  searchBarWrap: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchBarInput: { flex: 1, color: "#e6eef8", fontSize: 15 },
  searchCancelBtn: { minHeight: 44, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  searchCancelText: { color: "#ffffff", fontSize: 15 },
  anglerRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 10,
    padding: 12, marginBottom: 8, gap: 12,
  },
  anglerInfo: { flex: 1 },
  anglerUsername: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  anglerMeta: { color: "#64748b", fontSize: 12, marginTop: 3 },
  anglerFullName: { color: "#94a3b8", fontSize: 13, marginTop: 2 },

  // ── Catch detail modal ───────────────────────────────────────────────────
  detailScreen: { flex: 1, backgroundColor: theme.colors.background },
  detailHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  detailClose: { padding: 4 },
  detailHeaderTitle: {
    color: "#e6eef8", fontSize: 17, fontWeight: "700",
    flex: 1, textAlign: "center", marginHorizontal: 8,
  },
  detailContent: { paddingBottom: 40 },
  detailUserRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  detailAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center",
  },
  detailAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  detailUserHandle: { color: "#94a3b8", fontSize: 13 },
  likeCommentRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 12, gap: 24,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  likeCount: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  likeCountActive: { color: "#ffffff" },
  commentCount: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  commentsSection: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  detailBody: { paddingHorizontal: 20, paddingTop: 16 },
  speciesText: { color: "#ffffff", fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  gearRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, alignSelf: "flex-start" },
  gearThumb: { width: 56, height: 56 },
  gearText: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  dateText: { color: "#94a3b8", fontSize: 14, marginTop: 4 },
  detailText: { color: "#cbd5e1", fontSize: 16, marginBottom: 4 },

  // Search tabs
  searchTabRow: {
    flexDirection: "row",
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
    marginHorizontal: 12, marginBottom: 4,
  },
  searchTabBtn: {
    flex: 1, alignItems: "center",
    paddingVertical: 10,
  },
  searchTabBtnActive: { borderBottomWidth: 2, borderBottomColor: "#ffffff" },
  searchTabText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  searchTabTextActive: { color: "#ffffff" },

  // Create group button (in list header)
  createGroupBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: 10,
    padding: 14, marginBottom: 8,
  },
  createGroupBtnText: { color: "#0284c7", fontSize: 15, fontWeight: "700" },

  // Create group sheet modal
  createGroupOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  createGroupSheet: {
    backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
    borderTopWidth: 1, borderColor: "#1e293b",
  },
  createGroupTitle: {
    color: "#e6eef8", fontSize: 18, fontWeight: "700", marginBottom: 16,
  },
  createGroupInput: {
    backgroundColor: theme.colors.surface, borderRadius: 10,
    color: "#e6eef8", fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 12,
  },
  createGroupActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  createGroupCancel: {
    flex: 1, backgroundColor: "#1e293b", borderRadius: 10,
    paddingVertical: 13, alignItems: "center",
  },
  createGroupCancelText: { color: "#94a3b8", fontWeight: "700", fontSize: 15 },
  createGroupConfirm: {
    flex: 1, backgroundColor: theme.colors.primaryDark, borderRadius: theme.radius.control,
    paddingVertical: 13, alignItems: "center",
  },
  createGroupConfirmText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  createGroupInline: { padding: 16 },
  groupListContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 100 },
  groupTabHeader: { marginBottom: 8 },
  groupRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: 12,
    padding: 12, marginBottom: 10,
  },
  groupRowAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  groupRowAvatarImg: { width: 48, height: 48, borderRadius: 24 },
  groupRowInfo: { flex: 1 },
  groupRowTitle: { color: "#e6eef8", fontSize: 15, fontWeight: "700" },
  groupRowDesc: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  groupOwnerTag: {
    color: "#38bdf8", fontSize: 11, fontWeight: "700",
    backgroundColor: "#082f49", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },

  // Leaderboard
  lbScroll: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 100 },
  lbGroup: {
    backgroundColor: theme.colors.surface, borderRadius: 14,
    marginBottom: 14, overflow: "hidden",
  },
  lbGroupHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
    backgroundColor: "#0a1929",
  },
  lbGroupTitle: { color: "#e6eef8", fontSize: 15, fontWeight: "700", flex: 1 },
  lbGroupCount: { color: "#94a3b8", fontSize: 12 },
  lbRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10, gap: 10,
    borderBottomWidth: 1, borderBottomColor: "#0d1f35",
  },
  lbRank: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  lbRankText: { fontSize: 18, fontWeight: "700" },
  lbThumb: { width: 48, height: 48, borderRadius: 8 },
  lbThumbEmpty: { backgroundColor: "#0f2236", alignItems: "center", justifyContent: "center" },
  lbInfo: { flex: 1 },
  lbUserRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  lbAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  lbAvatarEmpty: {},
  lbAvatarText: { color: "#ffffff", fontSize: 9, fontWeight: "700" },
  lbUsername: { color: "#ffffff", fontSize: 13 },
  lbWeight: { fontSize: 16, fontWeight: "700" },
  lbSpeciesPhoto: { width: 36, height: 36 },

  // ── Other-user profile modal ─────────────────────────────────────────────
  upBannerContainer: { height: 180, backgroundColor: theme.colors.surface, overflow: "hidden" },
  upBannerImage: { width: "100%", height: "100%" },
  upHeaderRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  upHeaderBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
  },
  upMenuOverlay: { flex: 1, backgroundColor: "transparent" },
  upDropdownMenu: {
    position: "absolute",
    right: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    minWidth: 190,
    zIndex: 100,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  upDropdownItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  upDropdownItemText: { color: "#cbd5e1", fontSize: 15, fontWeight: "600" },
  upDropdownDivider: { height: 1, backgroundColor: "#1e293b" },
  upAvatarWrapper: { alignItems: "center", marginTop: -44 },
  upAvatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 3, borderColor: "#0f172a" },
  upAvatarImage: { width: 88, height: 88, borderRadius: 44 },
  upAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 26 },
  upName: { color: "#e6eef8", fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 6 },
  upUsername: { color: "#ffffff", fontSize: 14, textAlign: "center" },
  upLocationRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 5 },
  upLocationText: { color: "#94a3b8", fontSize: 13, textAlign: "center" },
  upJoined: { color: "#64748b", fontSize: 12, textAlign: "center", marginTop: 5 },
  upBioCard: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    padding: 14,
  },
  upBio: { color: "#cbd5e1", fontSize: 13, lineHeight: 19, textAlign: "center" },
  upStatsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 10, marginHorizontal: 16, paddingVertical: 10 },
  upStatItem: { flex: 1, alignItems: "center" },
  upStatNum: { color: "#e6eef8", fontSize: 20, fontWeight: "700" },
  upStatLabel: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  upActionRow: { flexDirection: "row", alignItems: "center", marginTop: 6, marginHorizontal: 16 },
  upActionBtn: { flex: 1, backgroundColor: theme.colors.primaryDark, borderRadius: theme.radius.control, paddingVertical: 10, alignItems: "center" },
  upActionBtnFollowing: { backgroundColor: "#1e293b" },
  upActionBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  upActionBtnFollowingText: { color: "#94a3b8" },
  upCatchesHeader: { marginTop: 12, marginBottom: 8, marginHorizontal: 16 },
  upCatchesTitle: { color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  followListModalContainer: { flex: 1, backgroundColor: theme.colors.background },
  followListModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  followListModalTitle: { color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  followListCloseBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  followListEmpty: { color: "#94a3b8", textAlign: "center", marginTop: 40, fontSize: 15 },
  followListUserRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 12,
  },
  followListAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  followListAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  followListAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  followListUserName: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  followListUserHandle: { color: "#94a3b8", fontSize: 13, marginTop: 2 },

  socialHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  socialHeaderTitle: { color: "#e6eef8", fontSize: 22, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  notifBtn: { padding: 6, position: "relative" },
  notifBadge: { position: "absolute", top: -4, right: -4, backgroundColor: "#ef4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  newsBadge: { backgroundColor: theme.colors.primaryDark },
  notifBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  notifSheetContainer: { flex: 1, justifyContent: "flex-end" },
  notifSheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingBottom: 20 },
  notifSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  notifSheetTitle: { color: "#e6eef8", fontSize: 18, fontWeight: "700" },
  notifEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 12 },
  notifEmptyText: { color: "#475569", fontSize: 15 },
  notifItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: "#0f1f35" },
  notifItemUnread: { backgroundColor: "#15243c" },
  notifUnreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#38bdf8", marginLeft: 6 },
  notifAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center", position: "relative" },
  notifAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  notifTypeIcon: { position: "absolute", bottom: -2, right: -2, backgroundColor: theme.colors.background, borderRadius: 10, padding: 1 },
  notifItemBody: { flex: 1 },
  notifItemText: { color: "#cbd5e1", fontSize: 14, lineHeight: 20 },
  notifItemName: { color: "#e6eef8", fontWeight: "700" },
  notifItemTime: { color: "#94a3b8", fontSize: 12, marginTop: 3 },
  notifCatchThumb: { width: 44, height: 44, borderRadius: 8 },
});
