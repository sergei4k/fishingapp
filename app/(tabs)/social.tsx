import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth";
import { sendPushNotification } from "@/lib/notifications";
import { pb } from "@/lib/pocketbase";
import { getGearLabel } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import speciesPhotos from "@/lib/speciesPhotos";
import { getSpeciesLabel } from "@/lib/species";
import { useLanguage } from "@/lib/language";
import CatchDetailModal, { type CatchDetail } from "@/components/CatchDetailModal";
import BadgeChip from "@/components/BadgeChip";
import { parseBadges, BadgeId } from "@/lib/badges";
import GroupModal from "@/components/GroupModal";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import ImageWithLoader from "@/components/ImageWithLoader";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PAGE_SIZE = 15;

function LikeButton({ isLiked, count, onPress, size = 20, style }: {
  isLiked: boolean; count: number; onPress: () => void; size?: number; style?: any;
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
        ? `${pb.baseURL}/api/files/_pb_users_auth_/${me.id}/${me.avatar}`
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
    };
  });
}

export default function Social() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { userId: navUserId, openSearch: openSearchParam } = useLocalSearchParams<{ userId?: string; openSearch?: string }>();

  const [activeTab, setActiveTab] = useState<"discover" | "feed" | "records">("discover");

  // ── Notifications ─────────────────────────────────────────────────────────
  type NotifItem = {
    id: string;
    type: "follow" | "like" | "comment";
    actorUsername: string;
    actorAvatarUrl: string | null;
    catchImageUrl: string | null;
    createdAt: string;
  };
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const lastSeenNotifsKey = "last_seen_notifs";

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
        items.push({ id: `follow-${r.id}`, type: "follow", actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchImageUrl: null, createdAt: r.created });
      }
      for (const r of likeRecs.items) {
        const actor = userMap[r.user_id];
        if (!actor) continue;
        items.push({ id: `like-${r.id}`, type: "like", actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchImageUrl: catchMap[r.catch_id] ?? null, createdAt: r.created });
      }
      for (const r of commentRecs.items) {
        const actor = userMap[r.user_id];
        if (!actor) continue;
        items.push({ id: `comment-${r.id}`, type: "comment", actorUsername: actor.username, actorAvatarUrl: actor.avatarUrl, catchImageUrl: catchMap[r.catch_id] ?? null, createdAt: r.created });
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
    setNotifVisible(true);
    const now = new Date().toISOString();
    await AsyncStorage.setItem(lastSeenNotifsKey, now);
    setUnreadCount(0);
  };

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

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
  const [userCatches, setUserCatches] = useState<CatchItem[]>([]);
  const [userFollowerCount, setUserFollowerCount] = useState(0);
  const [userFollowingCount, setUserFollowingCount] = useState(0);
  const [loadingUserCatches, setLoadingUserCatches] = useState(false);

  // Angler search modal
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInput = useRef<TextInput>(null);

  // Groups
  const [searchTab, setSearchTab] = useState<"anglers" | "groups">("anglers");
  const [groupResults, setGroupResults] = useState<any[]>([]);
  const [searchingGroups, setSearchingGroups] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Catch detail modal
  const [detailCatch, setDetailCatch] = useState<CatchDetail | null>(null);

  // Records / leaderboard
  type LeaderboardEntry = {
    catchId: string; species: string; length: number;
    username: string; name: string; avatarUrl: string | null;
    badges: BadgeId[]; imageUri: string | null; rank: number;
  };
  type LeaderboardGroup = { species: string; entries: LeaderboardEntry[] };
  const [leaderboard, setLeaderboard] = useState<LeaderboardGroup[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const leaderboardLoaded = useRef(false);

  const loadLeaderboard = async () => {
    setLoadingLeaderboard(true);
    try {
      const records = await pb.collection("catches").getFullList({
        filter: "is_public = true && length_cm > 0",
        sort: "-length_cm",
        requestKey: null,
      });
      const uniqueIds = [...new Set(records.map((r: any) => r.user_id).filter(Boolean))] as string[];
      const userMap: Record<string, { username: string; name: string; avatarUrl: string | null; badges: BadgeId[] }> = {};
      if (uniqueIds.length > 0) {
        try {
          const filter = uniqueIds.map((id) => `id = "${id}"`).join(" || ");
          const users = await pb.collection("users").getFullList({ filter, requestKey: null });
          for (const u of users) {
            userMap[u.id] = {
              username: u.username || u.name || "",
              name: u.name || "",
              avatarUrl: u.avatar ? `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=100x100` : null,
              badges: parseBadges(u.badges),
            };
          }
        } catch (e) { console.warn("loadLeaderboard: user fetch failed", e); }
      }
      const speciesMap = new Map<string, LeaderboardEntry[]>();
      for (const r of records as any[]) {
        const sp = r.species || "";
        if (!sp) continue;
        const u = userMap[r.user_id] ?? { username: "", name: "", avatarUrl: null, badges: [] };
        const entries = speciesMap.get(sp) ?? [];
        const length = parseFloat(r.length_cm);
        if (!length || length <= 0) continue;
        entries.push({
          catchId: r.id, species: sp, length,
          username: u.username, name: u.name, avatarUrl: u.avatarUrl,
          badges: u.badges,
          imageUri: r.image ? `${pb.baseURL}/api/files/${r.collectionId}/${r.id}/${r.image}?thumb=300x300` : null,
          rank: entries.length + 1,
        });
        speciesMap.set(sp, entries);
      }
      const groups: LeaderboardGroup[] = [];
      for (const [sp, entries] of speciesMap) {
        groups.push({ species: sp, entries });
      }
      groups.sort((a, b) => b.entries[0].length - a.entries[0].length);
      setLeaderboard(groups);
    } catch (e) { console.warn("leaderboard error:", e); }
    finally { setLoadingLeaderboard(false); }
  };

  useEffect(() => {
    if (activeTab === "records" && !leaderboardLoaded.current) {
      leaderboardLoaded.current = true;
      loadLeaderboard();
    }
  }, [activeTab]);

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
      const enriched = await enrichCatches(result.items, user?.id);
      setDiscoverItems((prev) => (page === 1 ? enriched : [...prev, ...enriched]));
      setDiscoverHasMore(page < result.totalPages);
      setDiscoverPage(page);
    } catch (e) {
      console.warn("loadDiscover error:", e);
    } finally {
      setLoadingDiscover(false);
      setLoadingMoreDiscover(false);
    }
  }, [user?.id]);

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
  }, []);

  // ── Cross-tab comment sync (map → social) ───────────────────────────────

  useEffect(() => {
    const subCount = DeviceEventEmitter.addListener("commentCountSynced", ({ catchId, count }: { catchId: string; count: number }) => {
      syncCommentCountInLists(catchId, count);
    });
    return () => { subCount.remove(); };
  }, [syncCommentCountInLists]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("catchWithLengthAdded", () => {
      leaderboardLoaded.current = false;
      if (activeTab === "records") {
        leaderboardLoaded.current = true;
        loadLeaderboard();
      }
    });
    return () => { sub.remove(); };
  }, [activeTab]);

  // ── PocketBase realtime user sync ────────────────────────────────────────

  useEffect(() => {
    pb.collection("users").subscribe("*", (e) => {
      const updatedUserId = e.record?.id;
      if (!updatedUserId) return;

      const avatarUrl = e.record.avatar
        ? `${pb.baseURL}/api/files/_pb_users_auth_/${updatedUserId}/${e.record.avatar}`
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
  }, []);

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
  }, []);

  // ── Like (direct from card) ───────────────────────────────────────────────

  const toggleLike = async (item: CatchItem) => {
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
        if (item.user_id && item.user_id !== user.id) {
          pb.collection("users").getOne(item.user_id, { fields: "pushToken", requestKey: null })
            .then((owner) => {
              if (owner.pushToken) {
                const senderName = user.username || user.name || "Someone";
                sendPushNotification(owner.pushToken, "New like", `${senderName} liked your catch`);
              }
            })
            .catch(() => {});
        }
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
  const closeDetail = () => setDetailCatch(null);

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
    } catch (e) { console.warn("loadFollows error:", e); }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadDiscover(1);
      loadFollows();
    }, [loadDiscover, loadFollows])
  );

  const loadFeed = useCallback(async () => {
    if (!user || myFollows.length === 0) { setFeedItems([]); return; }
    setLoadingFeed(true);
    try {
      const filterStr = myFollows.map((f) => `user_id = "${f.following_id}"`).join(" || ");
      const records = await pb.collection("catches").getFullList({
        filter: filterStr,
        sort: "-created_at",
        requestKey: null,
      });
      setFeedItems(await enrichCatches(records, user.id));
    } catch (e) { console.warn("loadFeed error:", e); }
    finally { setLoadingFeed(false); }
  }, [user, myFollows]);

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
      setSearchResults(result.items.filter((u: any) => u.id !== user?.id));
    } catch (e) {
      console.warn("search error:", e);
    } finally {
      setSearching(false);
    }
  }, [user]);

  const doGroupSearch = useCallback(async (q: string) => {
    setSearchingGroups(true);
    try {
      const opts: Record<string, any> = { sort: "-created", requestKey: null };
      if (q.trim()) opts.filter = `name ~ "${q.trim().replace(/"/g, '\\"')}"`;

      const result = await pb.collection("groups").getList(1, 50, opts);
      setGroupResults(result.items);
    } catch (e) {
      console.warn("group search error:", e);
    } finally {
      setSearchingGroups(false);
    }
  }, []);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !user) return;
    setCreatingGroup(true);
    try {
      const group = await pb.collection("groups").create({
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        creator_id: user.id,
      });
      await pb.collection("group_members").create({ group_id: group.id, user_id: user.id });
      setCreateGroupVisible(false);
      setNewGroupName("");
      setNewGroupDesc("");
      doGroupSearch(searchQuery);
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
      if (searchTab === "anglers") doSearch(q);
      else doGroupSearch(q);
    }, 300);
  };

  const openSearch = () => {
    setSearchVisible(true);
    setSearchQuery("");
    setSearchTab("anglers");
    doSearch("");
    doGroupSearch("");
  };

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchQuery("");
    setSearchResults([]);
    setGroupResults([]);
  };

  // ── Follow / User profile ─────────────────────────────────────────────────

  const isFollowing = (targetId: string) => myFollows.some((f) => f.following_id === targetId);

  const toggleFollow = async (targetUser: any) => {
    if (!user) return;
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
        pb.collection("users").getOne(targetUser.id, { fields: "pushToken", requestKey: null })
          .then((target) => {
            if (target.pushToken) {
              const senderName = user.username || user.name || "Someone";
              sendPushNotification(target.pushToken, "New follower", `${senderName} started following you`);
            } else {
              console.warn("[follow] target has no pushToken, skipping notification");
            }
          })
          .catch((e) => console.warn("[follow] failed to fetch target pushToken:", e?.status, e?.message));
      } catch (e) { console.warn("follow error:", e); }
      finally { followInFlight.current.delete(targetUser.id); }
    }
  };

  const openUser = async (targetUser: any) => {
    setSelectedUser({
      ...targetUser,
      avatarUrl:
        targetUser.avatarUrl ??
        (targetUser.avatar
          ? `${pb.baseURL}/api/files/_pb_users_auth_/${targetUser.id}/${targetUser.avatar}`
          : null),
    });
    setUserCatches([]);
    setUserFollowerCount(0);
    setUserFollowingCount(0);
    setLoadingUserCatches(true);
    try {
      const [fullUser, records, followersResult, followingResult] = await Promise.all([
        pb.collection("users").getOne(targetUser.id, { requestKey: null }).catch(() => null),
        pb.collection("catches").getFullList({
          filter: `user_id = "${targetUser.id}" && is_public = true`,
          sort: "-created_at",
          requestKey: null,
        }).catch(() => [] as any[]),
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
        setSelectedUser((prev: any) => ({
          ...prev,
          name: fullUser.name ?? prev.name ?? "",
          username: fullUser.username ?? prev.username ?? "",
          badges: fullUser.badges,
          bio: fullUser.bio ?? "",
          avatarUrl: fullUser.avatar
            ? `${pb.baseURL}/api/files/_pb_users_auth_/${fullUser.id}/${fullUser.avatar}`
            : prev.avatarUrl ?? null,
        }));
      }
      setUserCatches(await enrichCatches(records as any[], user?.id));
      setUserFollowerCount((followersResult as any).totalItems ?? 0);
      setUserFollowingCount((followingResult as any).totalItems ?? 0);
    } catch (e) { console.warn("openUser error:", e); }
    finally { setLoadingUserCatches(false); }
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

  const initials = (u: any) => (u?.name || u?.username || "?").slice(0, 2).toUpperCase();

  const formatDate = (val: any) => {
    if (!val) return "";
    const num = Number(val);
    const d = !isNaN(num) && num > 0 ? new Date(num) : new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
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
              <Text style={styles.feedAvatarText}>
                {(item._username || "?").slice(0, 2).toUpperCase()}
              </Text>
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

      {/* Photo */}
      {item.image_uri ? (
        <ImageWithLoader
          source={{ uri: item.image_uri }}
          style={styles.feedPhoto}
          contentFit="cover"
        />
      ) : (
        <View style={styles.feedPhotoEmpty}>
          <Ionicons name="camera-outline" size={40} color="#1e3a5f" />
        </View>
      )}

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
            <LikeButton isLiked={item._isLiked} count={item._likeCount} onPress={() => toggleLike(item)} size={20} />
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
        <ImageWithLoader source={{ uri: item.image_uri }} style={styles.catchThumb} contentFit="cover" />
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
              <Text style={styles.catchAuthorAvatarText}>
                {(item._username || "?").slice(0, 2).toUpperCase()}
              </Text>
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
            <LikeButton isLiked={item._isLiked} count={item._likeCount} onPress={() => toggleLike(item)} size={13} />
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

  const notifIcon = (type: NotifItem["type"]) => {
    if (type === "follow") return <Ionicons name="person-add" size={15} color="#38bdf8" />;
    if (type === "like") return <Ionicons name="heart" size={15} color="#f43f5e" />;
    return <Ionicons name="chatbubble" size={15} color="#a78bfa" />;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header row: title + notifications bell */}
      <View style={styles.socialHeader}>
        <Text style={styles.socialHeaderTitle}>{language === "ru" ? "Сообщество" : "Community"}</Text>
        <TouchableOpacity style={styles.notifBtn} onPress={openNotifs}>
          <Ionicons name="notifications-outline" size={24} color="#e6eef8" />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
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
            style={[styles.tab, activeTab === "records" && styles.tabActive]}
            onPress={() => setActiveTab("records")}
          >
            <Text style={[styles.tabText, activeTab === "records" && styles.tabTextActive]}>
              {language === "ru" ? "Рекорды" : "Records"}
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
                <Text style={styles.centerText}>{t("noPublicCatches")}</Text>
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
            <Ionicons name="boat-outline" size={44} color="#1e3a5f" />
            <Text style={styles.centerText}>
              {myFollows.length === 0 ? t("followToSeeCatches") : t("noFollowingCatches")}
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

      {/* Records / Leaderboard */}
      {activeTab === "records" && (
        loadingLeaderboard ? (
          <ActivityIndicator color="#ffffff" style={{ marginTop: 48 }} />
        ) : leaderboard.length === 0 ? (
          <View style={styles.centerMsg}>
            <Ionicons name="trophy-outline" size={44} color="#1e3a5f" />
            <Text style={styles.centerText}>
              {language === "ru" ? "Пока нет уловов с длиной" : "No catches with length yet"}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.lbScroll} showsVerticalScrollIndicator={false}>
            {leaderboard.map((group) => (
              <View key={group.species} style={styles.lbGroup}>
                <View style={styles.lbGroupHeader}>
                  {speciesPhotos[group.species] ? (
                    <ExpoImage source={speciesPhotos[group.species]} style={styles.lbSpeciesPhoto} contentFit="contain" />
                  ) : (
                    <Ionicons name="fish-outline" size={18} color="#ffffff" />
                  )}
                  <Text style={styles.lbGroupTitle}>{getSpeciesLabel(group.species, language)}</Text>
                  <Text style={styles.lbGroupCount}>
                    {group.entries.length} {language === "ru" ? "уловов" : "catches"}
                  </Text>
                </View>
                {group.entries.map((entry) => {
                  const rankColor = entry.rank === 1 ? "#f59e0b" : entry.rank === 2 ? "#94a3b8" : entry.rank === 3 ? "#b87333" : "#334155";
                  const rankBg   = entry.rank === 1 ? "#f59e0b22" : entry.rank === 2 ? "#94a3b822" : entry.rank === 3 ? "#b8733322" : "transparent";
                  return (
                    <TouchableOpacity
                      key={entry.catchId}
                      style={styles.lbRow}
                      activeOpacity={0.75}
                      onPress={() => setDetailCatch({
                        id: entry.catchId,
                        imageUrl: entry.imageUri,
                        species: entry.species,
                        length: String(entry.length),
                        username: entry.username,
                        name: entry.name,
                        verified: entry.badges.includes("verified"),
                        avatarUrl: entry.avatarUrl ?? undefined,
                      })}
                    >
                      {/* Rank badge */}
                      <View style={[styles.lbRank, { backgroundColor: rankBg }]}>
                        <Text style={[styles.lbRankText, { color: rankColor }]}>
                          {entry.rank <= 3 ? ["🥇","🥈","🥉"][entry.rank - 1] : `#${entry.rank}`}
                        </Text>
                      </View>

                      {/* Catch thumbnail */}
                      {entry.imageUri ? (
                        <ImageWithLoader source={{ uri: entry.imageUri }} style={styles.lbThumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.lbThumb, styles.lbThumbEmpty]}>
                          <Ionicons name="camera-outline" size={16} color="#334155" />
                        </View>
                      )}

                      {/* User info */}
                      <View style={styles.lbInfo}>
                        <View style={styles.lbUserRow}>
                          {entry.avatarUrl ? (
                            <ImageWithLoader source={{ uri: entry.avatarUrl }} style={styles.lbAvatar} contentFit="cover" />
                          ) : (
                            <View style={[styles.lbAvatar, styles.lbAvatarEmpty]}>
                              <Text style={styles.lbAvatarText}>
                                {(entry.name || entry.username || "?").slice(0, 2).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Text style={styles.lbUsername}>{entry.username}</Text>
                            {entry.badges.includes("verified") ? <VerifiedBadge size={12} /> : null}
                          </View>
                        </View>
                      </View>

                      {/* Length */}
                      <Text style={[styles.lbWeight, { color: rankColor }]}>
                        {Number.isFinite(entry.length) ? (entry.length % 1 === 0 ? entry.length : entry.length.toFixed(1)) : "?"} cm
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        )
      )}

      {/* User profile modal */}
      <Modal visible={!!selectedUser} animationType="slide" onRequestClose={() => setSelectedUser(null)}>
        <SafeAreaView style={styles.container}>
          <FlatList
            data={loadingUserCatches ? [] : userCatches}
            keyExtractor={(i) => i.id}
            renderItem={renderListCard}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              !loadingUserCatches ? (
                <Text style={styles.emptyText}>{t("noPublicCatches")}</Text>
              ) : null
            }
            ListHeaderComponent={
              <View>
                {/* Banner */}
                <View style={styles.upBanner}>
                  {userCatches[0]?.image_uri ? (
                    <ImageWithLoader source={{ uri: userCatches[0].image_uri }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <View style={{ flex: 1, backgroundColor: "#0a1929" }} />
                  )}
                  <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.upBackBtn}>
                    <Ionicons name="arrow-back" size={20} color="#e6eef8" />
                  </TouchableOpacity>
                </View>

                {/* Avatar overlapping banner */}
                <View style={styles.upAvatarWrapper}>
                  <View style={styles.upAvatar}>
                    {selectedUser?.avatarUrl ? (
                      <ImageWithLoader source={{ uri: selectedUser.avatarUrl }} contentFit="cover" style={styles.upAvatarImage} />
                    ) : (
                      <Text style={styles.upAvatarText}>{initials(selectedUser)}</Text>
                    )}
                  </View>
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

                <BadgeChip badges={parseBadges(selectedUser?.badges)} language={language} />

                {selectedUser?.bio ? (
                  <Text style={styles.upBio}>{selectedUser.bio}</Text>
                ) : null}

                {/* Stats row */}
                <View style={styles.upStatsRow}>
                  <View style={styles.upStatItem}>
                    <Text style={styles.upStatNum}>{userCatches.length}</Text>
                    <Text style={styles.upStatLabel}>{language === "ru" ? "Уловов" : "Catches"}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.upStatItem}>
                    <Text style={styles.upStatNum}>{userFollowerCount}</Text>
                    <Text style={styles.upStatLabel}>{language === "ru" ? "Подписчики" : "Followers"}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.upStatItem}>
                    <Text style={styles.upStatNum}>{userFollowingCount}</Text>
                    <Text style={styles.upStatLabel}>{language === "ru" ? "Подписки" : "Following"}</Text>
                  </View>
                </View>

                {/* Follow action */}
                <View style={styles.upActionRow}>
                  {selectedUser && (
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
        </SafeAreaView>
      </Modal>

      {/* Search fullscreen modal */}
      <Modal visible={searchVisible} animationType="slide" onRequestClose={closeSearch}>
        <SafeAreaView style={styles.container}>
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
              {(searching || searchingGroups) && <ActivityIndicator size="small" color="#ffffff" style={{ marginLeft: 6 }} />}
            </View>
            <TouchableOpacity onPress={closeSearch} style={styles.searchCancelBtn}>
              <Text style={styles.searchCancelText}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>

          {/* Tab switcher */}
          <View style={styles.searchTabRow}>
            <TouchableOpacity
              style={[styles.searchTabBtn, searchTab === "anglers" && styles.searchTabBtnActive]}
              onPress={() => { setSearchTab("anglers"); doSearch(searchQuery); }}
            >
              <Text style={[styles.searchTabText, searchTab === "anglers" && styles.searchTabTextActive]}>
                {language === "ru" ? "Рыбаки" : "Anglers"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.searchTabBtn, searchTab === "groups" && styles.searchTabBtnActive]}
              onPress={() => { setSearchTab("groups"); doGroupSearch(searchQuery); }}
            >
              <Text style={[styles.searchTabText, searchTab === "groups" && styles.searchTabTextActive]}>
                {language === "ru" ? "Группы" : "Groups"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Anglers list */}
          {searchTab === "anglers" && (
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
                        source={{ uri: item.avatarUrl || `${pb.baseURL}/api/files/_pb_users_auth_/${item.id}/${item.avatar}` }}
                        contentFit="cover"
                        style={styles.feedAvatarImage}
                      />
                    ) : (
                      <Text style={styles.feedAvatarText}>
                        {(item.username || item.name || "?").slice(0, 2).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.anglerInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={styles.anglerUsername}>{item.username}</Text>
                      {parseBadges(item.badges).includes("verified") ? <VerifiedBadge size={13} /> : null}
                    </View>
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
          )}

          {/* Groups tab */}
          {searchTab === "groups" && !createGroupVisible && (
            <FlatList
              data={groupResults}
              keyExtractor={(i) => i.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                user ? (
                  <TouchableOpacity style={styles.createGroupBtn} onPress={() => setCreateGroupVisible(true)}>
                    <Ionicons name="add" size={14} color="#0284c7" />
                    <Text style={styles.createGroupBtnText}>
                      {language === "ru" ? "Создать группу" : "Create group"}
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.anglerRow}
                  activeOpacity={0.75}
                  onPress={() => { closeSearch(); setSelectedGroup(item); }}
                >
                  <View style={styles.feedAvatar}>
                    {item.avatar ? (
                      <ImageWithLoader
                        source={{ uri: `${pb.baseURL}/api/files/groups/${item.id}/${item.avatar}` }}
                        contentFit="cover"
                        style={styles.feedAvatarImage}
                      />
                    ) : (
                      <Text style={styles.feedAvatarText}>{item.name.slice(0, 2).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.anglerInfo}>
                    <Text style={styles.anglerUsername}>{item.name}</Text>
                    {item.description ? <Text style={styles.anglerFullName} numberOfLines={1}>{item.description}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#334155" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={!searchingGroups ? (
                <Text style={styles.emptyText}>
                  {language === "ru" ? "Группы не найдены" : "No groups found"}
                </Text>
              ) : null}
            />
          )}

          {/* Inline create group form */}
          {searchTab === "groups" && createGroupVisible && (
            <View style={styles.createGroupInline}>
              <Text style={styles.createGroupTitle}>
                {language === "ru" ? "Новая группа" : "New group"}
              </Text>
              <TextInput
                style={styles.createGroupInput}
                placeholder={language === "ru" ? "Название *" : "Name *"}
                placeholderTextColor="#475569"
                value={newGroupName}
                onChangeText={setNewGroupName}
                maxLength={60}
                keyboardAppearance="dark"
                autoFocus
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
          )}
        </SafeAreaView>
      </Modal>

      {/* Group detail modal */}
      {selectedGroup && (
        <GroupModal
          group={selectedGroup}
          currentUserId={user?.id}
          language={language}
          onClose={() => setSelectedGroup(null)}
          onDeleted={() => { setGroupResults(prev => prev.filter(g => g.id !== selectedGroup.id)); }}
        />
      )}

      <CatchDetailModal
        catch={detailCatch}
        onClose={closeDetail}
        onLikeChange={applyLikeToLists}
        onCommentAdded={applyCommentToLists}
        onCommentCountSynced={syncCommentCountInLists}
      />

      {/* Notifications modal */}
      <Modal visible={notifVisible} animationType="slide" transparent onRequestClose={() => setNotifVisible(false)}>
        <View style={styles.notifOverlay}>
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
                renderItem={({ item }) => (
                  <View style={styles.notifItem}>
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
                      <Text style={styles.notifItemTime}>
                        {new Date(item.createdAt).toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { month: "short", day: "numeric" })}
                      </Text>
                    </View>
                    {item.catchImageUrl && (
                      <ExpoImage source={{ uri: item.catchImageUrl }} style={styles.notifCatchThumb} cachePolicy="memory-disk" />
                    )}
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },

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
    backgroundColor: "#0284c7", borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  
  feedList: { paddingTop: 8, paddingBottom: 100 },
  feedCard: {
    backgroundColor: "#071023",
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1e293b",
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
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  catchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#071023", borderRadius: 10, padding: 10, marginBottom: 8,
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
    backgroundColor: "#0f172a", borderTopLeftRadius: 20, borderTopRightRadius: 20,
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
    backgroundColor: "#071023", borderRadius: 10, paddingHorizontal: 12,
    marginTop: 12, borderWidth: 1, borderColor: "#1e293b",
  },
  commentInput: { flex: 1, color: "#e6eef8", fontSize: 14, paddingVertical: 10 },

  // Misc
  centerMsg: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  centerText: { color: "#94a3b8", fontSize: 15, textAlign: "center", lineHeight: 22 },
  emptyText: { color: "#94a3b8", textAlign: "center", marginTop: 16, fontSize: 14 },
  followBtn: { backgroundColor: "#0c4a6e", paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
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
    backgroundColor: "#071023", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: "#1e293b",
  },
  searchBarInput: { flex: 1, color: "#e6eef8", fontSize: 15 },
  searchCancelBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  searchCancelText: { color: "#ffffff", fontSize: 15 },
  anglerRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#071023", borderRadius: 10,
    padding: 12, marginBottom: 8, gap: 12,
  },
  anglerInfo: { flex: 1 },
  anglerUsername: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  anglerFullName: { color: "#94a3b8", fontSize: 13, marginTop: 2 },

  // ── Catch detail modal ───────────────────────────────────────────────────
  detailScreen: { flex: 1, backgroundColor: "#0f172a" },
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
    backgroundColor: "#071023", borderRadius: 10,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#1e293b",
  },
  createGroupBtnText: { color: "#0284c7", fontSize: 15, fontWeight: "700" },

  // Create group sheet modal
  createGroupOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  createGroupSheet: {
    backgroundColor: "#0f172a", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
    borderTopWidth: 1, borderColor: "#1e293b",
  },
  createGroupTitle: {
    color: "#e6eef8", fontSize: 18, fontWeight: "700", marginBottom: 16,
  },
  createGroupInput: {
    backgroundColor: "#071023", borderRadius: 10,
    borderWidth: 1, borderColor: "#1e293b",
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
    flex: 1, backgroundColor: "#0284c7", borderRadius: 10,
    paddingVertical: 13, alignItems: "center",
  },
  createGroupConfirmText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  createGroupInline: { padding: 16, flex: 1 },

  // Leaderboard
  lbScroll: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 100 },
  lbGroup: {
    backgroundColor: "#071023", borderRadius: 14,
    borderWidth: 1, borderColor: "#1e293b",
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
  upBanner: { height: 140, backgroundColor: "#071023", overflow: "hidden" },
  upBackBtn: { position: "absolute", top: 12, left: 12, zIndex: 1, padding: 6, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 20 },
  upAvatarWrapper: { alignItems: "center", marginTop: -44 },
  upAvatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 3, borderColor: "#0f172a" },
  upAvatarImage: { width: 88, height: 88, borderRadius: 44 },
  upAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 26 },
  upName: { color: "#e6eef8", fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 10 },
  upUsername: { color: "#ffffff", fontSize: 14, textAlign: "center" },
  upBio: { color: "#94a3b8", fontSize: 13, marginTop: 6, lineHeight: 18, textAlign: "center", paddingHorizontal: 24 },
  upStatsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 16, marginHorizontal: 16, backgroundColor: "#071023", borderRadius: 12, borderWidth: 1, borderColor: "#1e293b", paddingVertical: 14 },
  upStatItem: { flex: 1, alignItems: "center" },
  upStatNum: { color: "#e6eef8", fontSize: 20, fontWeight: "700" },
  upStatLabel: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  upActionRow: { flexDirection: "row", marginTop: 12, marginHorizontal: 16 },
  upActionBtn: { flex: 1, backgroundColor: "#0c4a6e", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  upActionBtnFollowing: { backgroundColor: "#1e293b" },
  upActionBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  upActionBtnFollowingText: { color: "#94a3b8" },
  upCatchesHeader: { marginTop: 20, marginBottom: 8, marginLeft: 4 },
  upCatchesTitle: { color: "#e6eef8", fontSize: 17, fontWeight: "700" },

  socialHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  socialHeaderTitle: { color: "#e6eef8", fontSize: 22, fontWeight: "700" },
  notifBtn: { padding: 6, position: "relative" },
  notifBadge: { position: "absolute", top: 2, right: 2, backgroundColor: "#ef4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  notifBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  notifOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  notifSheet: { backgroundColor: "#0f172a", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingBottom: 20 },
  notifSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  notifSheetTitle: { color: "#e6eef8", fontSize: 18, fontWeight: "700" },
  notifEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 12 },
  notifEmptyText: { color: "#475569", fontSize: 15 },
  notifItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: "#0f1f35" },
  notifAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center", position: "relative" },
  notifAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  notifTypeIcon: { position: "absolute", bottom: -2, right: -2, backgroundColor: "#0f172a", borderRadius: 10, padding: 1 },
  notifItemBody: { flex: 1 },
  notifItemText: { color: "#cbd5e1", fontSize: 14, lineHeight: 20 },
  notifItemName: { color: "#e6eef8", fontWeight: "700" },
  notifItemTime: { color: "#475569", fontSize: 12, marginTop: 2 },
  notifCatchThumb: { width: 44, height: 44, borderRadius: 8 },
});
