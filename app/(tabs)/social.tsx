import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { getGearLabel } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import { getSpeciesLabel } from "@/lib/species";
import { useLanguage } from "@/lib/language";
import CatchDetailModal, { type CatchDetail } from "@/components/CatchDetailModal";
import BadgeChip from "@/components/BadgeChip";
import { parseBadges, BadgeId } from "@/lib/badges";
import GroupModal from "@/components/GroupModal";
import { FontAwesome6 as FontAwesome } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PAGE_SIZE = 15;

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



  const uniqueUserIds = [...new Set(items.map((c) => c.user_id))] as string[];
  const userMap: Record<string, { username: string; avatarUrl: string | null; badges: BadgeId[] }> = {};
  await Promise.all(
    uniqueUserIds.map(async (uid) => {
      try {
        const u = await pb.collection("users").getOne(uid, { requestKey: null });
        userMap[uid] = {
          username: u.username || u.name || "",
          avatarUrl: u.avatar
            ? `${pb.baseURL}/api/files/_pb_users_auth_/${uid}/${u.avatar}`
            : null,
          badges: parseBadges(u.badges),
        };
      } catch {
        userMap[uid] = { username: "", avatarUrl: null, badges: [] };
      }
    })
  );

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
        ? `${pb.baseURL}/api/files/${c.collectionId}/${c.id}/${c.image}`
        : c.image_uri ?? null,
    };
  });
}

export default function Social() {
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const [activeTab, setActiveTab] = useState<"discover" | "feed">("discover");

  // Discover feed (fullscreen pager)
  const [discoverItems, setDiscoverItems] = useState<CatchItem[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverHasMore, setDiscoverHasMore] = useState(true);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [loadingMoreDiscover, setLoadingMoreDiscover] = useState(false);
  const likeInFlight = useRef<Set<string>>(new Set());
  const pendingOps = useRef<Map<string, number>>(new Map()); // "catchId:action" → timestamp

  // Following feed (list)
  const [myFollows, setMyFollows] = useState<any[]>([]);
  const [feedItems, setFeedItems] = useState<CatchItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // User profile modal
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userCatches, setUserCatches] = useState<CatchItem[]>([]);
  const [userFollowerCount, setUserFollowerCount] = useState(0);
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
    let unsub: (() => void) | null = null;
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
    }, { requestKey: null } as any)
      .then((fn) => { unsub = fn; })
      .catch(() => {});
    return () => { unsub?.(); };
  }, [user?.id]);

  // ── PocketBase realtime user sync ────────────────────────────────────────

  useEffect(() => {
    let unsub: (() => void) | null = null;
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
    }, { requestKey: null } as any)
      .then((fn) => { unsub = fn; })
      .catch(() => {});
    return () => { unsub?.(); };
  }, []);

  // ── PocketBase realtime catch sync ───────────────────────────────────────

  useEffect(() => {
    let unsub: (() => void) | null = null;
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
    }, { requestKey: null } as any)
      .then((fn) => { unsub = fn; })
      .catch(() => {});
    return () => { unsub?.(); };
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
    avatarUrl: user?.avatar
                ? `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}`
                : undefined,
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
      const filter = q.trim() ? `(username ~ "${q}" || name ~ "${q}")` : undefined;
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
      if (q.trim()) opts.filter = `name ~ "${q}"`;
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
    const existing = myFollows.find((f) => f.following_id === targetUser.id);
    if (existing) {
      try {
        await pb.collection("follows").delete(existing.id);
        setMyFollows((prev) => prev.filter((f) => f.id !== existing.id));
      } catch (e) { console.warn("unfollow error:", e); }
    } else {
      try {
        const record = await pb.collection("follows").create({
          follower_id: user.id,
          following_id: targetUser.id,
        });
        setMyFollows((prev) => [...prev, record]);
      } catch (e) { console.warn("follow error:", e); }
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
    setLoadingUserCatches(true);
    try {
      const [fullUser, records, followersResult] = await Promise.all([
        pb.collection("users").getOne(targetUser.id, { requestKey: null }),
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
      setSelectedUser((prev: any) => ({
        ...prev,
        badges: fullUser.badges,
        bio: fullUser.bio ?? "",
      }));
      setUserCatches(await enrichCatches(records, user?.id));
      setUserFollowerCount(followersResult.totalItems);
    } catch (e) { console.warn("openUser error:", e); }
    finally { setLoadingUserCatches(false); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const initials = (u: any) => (u?.name || u?.username || "?").slice(0, 2).toUpperCase();

  const formatDate = (val: any) => {
    if (!val) return "";
    const d = new Date(val);
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
              <ExpoImage source={{ uri: item._avatarUrl }} contentFit="cover" style={styles.feedAvatarImage} />
            ) : (
              <Text style={styles.feedAvatarText}>
                {(item._username || "?").slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.feedUsername}>{item._username}</Text>
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
        <ExpoImage
          source={{ uri: item.image_uri }}
          style={styles.feedPhoto}
          contentFit="cover"
        />
      ) : (
        <View style={styles.feedPhotoEmpty}>
          <FontAwesome name="camera" size={40} color="#1e3a5f" />
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
          <TouchableOpacity style={styles.feedActionBtn} onPress={() => toggleLike(item)}>
            <FontAwesome
              name="thumbs-up"
              iconStyle={item._isLiked ? "solid" : "regular"}
              size={20}
              color={item._isLiked ? "#60a5fa" : "#64748b"}
            />
            <Text style={[styles.feedActionText, item._isLiked && { color: "#60a5fa" }]}>
              {item._likeCount}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.feedActionBtn} onPress={() => openDetail(item)}>
            <FontAwesome name="comment" iconStyle="regular" size={20} color="#64748b" />
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
        <ExpoImage source={{ uri: item.image_uri }} style={styles.catchThumb} contentFit="cover" />
      ) : (
        <View style={[styles.catchThumb, styles.catchThumbEmpty]}>
          <FontAwesome name="camera" size={20} color="#334155" />
        </View>
      )}
      <View style={styles.catchInfo}>
        <View style={styles.catchAuthorRow}>
          <View style={styles.catchAuthorAvatar}>
            {item._avatarUrl ? (
              <ExpoImage source={{ uri: item._avatarUrl }} contentFit="cover" style={styles.catchAuthorAvatarImg} />
            ) : (
              <Text style={styles.catchAuthorAvatarText}>
                {(item._username || "?").slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
          {item._username ? <Text style={styles.catchUser}>@{item._username}</Text> : null}
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
          <TouchableOpacity onPress={() => toggleLike(item)} style={styles.catchCountBtn}>
            <FontAwesome name="thumbs-up" iconStyle={item._isLiked ? "solid" : "regular"} size={13} color={item._isLiked ? "#60a5fa" : "#64748b"} />
            <Text style={[styles.catchCountText, item._isLiked && { color: "#60a5fa" }]}>{item._likeCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openDetail(item)} style={styles.catchCountBtn}>
            <FontAwesome name="comment" iconStyle="regular" size={13} color="#64748b" />
            <Text style={styles.catchCountText}>{item._commentCount}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
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
            {myFollows.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{myFollows.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.searchIconBtn} onPress={openSearch}>
          <FontAwesome name="magnifying-glass" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Discover fullscreen pager */}
      {activeTab === "discover" && (
        loadingDiscover ? (
          <ActivityIndicator color="#60a5fa" style={{ marginTop: 48 }} />
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
                ? <ActivityIndicator color="#60a5fa" style={{ marginVertical: 16 }} />
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
            <FontAwesome name="users" size={44} color="#1e3a5f" />
            <Text style={styles.centerText}>{t("signInToFollow")}</Text>
          </View>
        ) : loadingFeed ? (
          <ActivityIndicator color="#60a5fa" style={{ marginTop: 48 }} />
        ) : feedItems.length === 0 ? (
          <View style={styles.centerMsg}>
            <FontAwesome name="anchor" size={44} color="#1e3a5f" />
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

      {/* User profile modal */}
      <Modal visible={!!selectedUser} animationType="slide" onRequestClose={() => setSelectedUser(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.backBtn}>
              <FontAwesome name="arrow-left" size={20} color="#e6eef8" />
            </TouchableOpacity>
            <View style={styles.avatarLg}>
              {selectedUser?.avatarUrl ? (
                <ExpoImage source={{ uri: selectedUser.avatarUrl }} contentFit="cover" style={styles.avatarLgImage} />
              ) : (
                <Text style={styles.avatarLgText}>{initials(selectedUser)}</Text>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.modalUsername}>@{selectedUser?.username || selectedUser?.name}</Text>
              {selectedUser?.name && selectedUser?.username ? (
                <Text style={styles.modalFullName}>{selectedUser.name}</Text>
              ) : null}
              <BadgeChip badges={parseBadges(selectedUser?.badges)} language={language} />
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
          {selectedUser?.bio ? (
            <Text style={styles.modalBioBlock}>{selectedUser.bio}</Text>
          ) : null}
          {loadingUserCatches ? (
            <ActivityIndicator color="#60a5fa" style={{ marginTop: 48 }} />
          ) : (
            <FlatList
              data={userCatches}
              keyExtractor={(i) => i.id}
              renderItem={renderListCard}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.emptyText}>{t("noPublicCatches")}</Text>}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Search fullscreen modal */}
      <Modal visible={searchVisible} animationType="slide" onRequestClose={closeSearch}>
        <SafeAreaView style={styles.container}>
          <View style={styles.searchModalHeader}>
            <View style={styles.searchBarWrap}>
              <FontAwesome name="magnifying-glass" size={15} color="#64748b" style={{ marginRight: 8 }} />
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
              {(searching || searchingGroups) && <ActivityIndicator size="small" color="#60a5fa" style={{ marginLeft: 6 }} />}
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
                      <ExpoImage
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
                    <Text style={styles.anglerUsername}>@{item.username || item.name}</Text>
                    {item.name && item.username ? <Text style={styles.anglerFullName}>{item.name}</Text> : null}
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
                    <FontAwesome name="plus" size={14} color="#0284c7" />
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
                      <ExpoImage
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
                  <FontAwesome name="chevron-right" size={14} color="#334155" />
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
      />
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
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#60a5fa" },
  tabText: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  tabTextActive: { color: "#60a5fa" },
  badge: {
    backgroundColor: "#0284c7", borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  // Fishbrain-style feed card
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
  feedAvatarText: { color: "#60a5fa", fontWeight: "700", fontSize: 14 },
  feedUsername: { color: "#e6eef8", fontWeight: "600", fontSize: 14 },
  feedDate: { color: "#475569", fontSize: 12, marginTop: 1 },
  feedPhoto: { width: "100%", height: 280 },
  feedPhotoEmpty: {
    width: "100%", height: 200,
    backgroundColor: "#0b1a2e", alignItems: "center", justifyContent: "center",
  },
  feedCardBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  feedSpecies: { color: "#cfe8ff", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  feedGearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, alignSelf: "flex-start" },
  feedGearThumb: { width: 28, height: 28 },
  feedGearText: { color: "#60a5fa", fontSize: 14, fontWeight: "600" },
  feedMeta: { color: "#7ea8c9", fontSize: 13, marginBottom: 6 },
  feedDesc: { color: "#94a3b8", fontSize: 14, lineHeight: 20, marginBottom: 8 },
  feedActions: {
    flexDirection: "row", gap: 20,
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: "#1e293b",
    marginTop: 4,
  },
  feedActionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  feedActionText: { color: "#64748b", fontSize: 14, fontWeight: "600" },

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
  catchAuthorAvatarText: { color: "#60a5fa", fontSize: 9, fontWeight: "700" },
  catchSpecies: { color: "#cfe8ff", fontWeight: "600", fontSize: 15 },
  catchGearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, marginBottom: 2, alignSelf: "flex-start" },
  catchGearThumb: { width: 22, height: 22 },
  catchGearText: { color: "#60a5fa", fontSize: 13, fontWeight: "600" },
  catchUser: { color: "#0284c7", fontSize: 12, marginTop: 1 },
  catchDesc: { color: "#94a3b8", fontSize: 13, marginTop: 3 },
  catchDate: { color: "#475569", fontSize: 12, marginTop: 4 },
  catchCounts: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 12 },
  catchCountBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  catchCountText: { color: "#64748b", fontSize: 12 },

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
  commentUsername: { color: "#60a5fa", fontSize: 13, fontWeight: "600" },
  commentText: { color: "#cbd5e1", fontSize: 14, marginTop: 2 },
  commentInputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#071023", borderRadius: 10, paddingHorizontal: 12,
    marginTop: 12, borderWidth: 1, borderColor: "#1e293b",
  },
  commentInput: { flex: 1, color: "#e6eef8", fontSize: 14, paddingVertical: 10 },

  // Misc
  centerMsg: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  centerText: { color: "#475569", fontSize: 15, textAlign: "center", lineHeight: 22 },
  emptyText: { color: "#475569", textAlign: "center", marginTop: 16, fontSize: 14 },
  followBtn: { backgroundColor: "#0284c7", paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#334155" },
  followBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  followingBtnText: { color: "#64748b" },
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
  avatarLgText: { color: "#60a5fa", fontWeight: "700", fontSize: 20 },
  modalUsername: { color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  modalFullName: { color: "#64748b", fontSize: 13, marginTop: 2 },
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
    color: "#64748b", fontSize: 12, marginTop: 2,
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
  searchCancelText: { color: "#60a5fa", fontSize: 15 },
  anglerRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#071023", borderRadius: 10,
    padding: 12, marginBottom: 8, gap: 12,
  },
  anglerInfo: { flex: 1 },
  anglerUsername: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  anglerFullName: { color: "#64748b", fontSize: 13, marginTop: 2 },

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
  detailAvatarText: { color: "#60a5fa", fontWeight: "700", fontSize: 15 },
  detailUserHandle: { color: "#64748b", fontSize: 13 },
  likeCommentRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 12, gap: 24,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  likeCount: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  likeCountActive: { color: "#60a5fa" },
  commentCount: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  commentsSection: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  detailBody: { paddingHorizontal: 20, paddingTop: 16 },
  speciesText: { color: "#ffffff", fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  gearRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, alignSelf: "flex-start" },
  gearThumb: { width: 56, height: 56 },
  gearText: { color: "#60a5fa", fontSize: 18, fontWeight: "600" },
  dateText: { color: "#64748b", fontSize: 14, marginTop: 4 },
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
  searchTabBtnActive: { borderBottomWidth: 2, borderBottomColor: "#60a5fa" },
  searchTabText: { color: "#64748b", fontSize: 14, fontWeight: "600" },
  searchTabTextActive: { color: "#60a5fa" },

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
});
