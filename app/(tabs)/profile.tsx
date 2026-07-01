import { getSpeciesLabel } from "@/lib/species";
import { getGearLabel } from "@/lib/gear";
import gearPhotos from "@/lib/gearPhotos";
import { useLanguage } from "@/lib/language";
import BadgeChip from "@/components/BadgeChip";
import { parseBadges } from "@/lib/badges";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { getCatches, deleteCatch, updateCatch, CatchItem } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import CatchDetailModal, { EditableFields } from "@/components/CatchDetailModal";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Image as ExpoImage } from "expo-image";
import ImageWithLoader from "@/components/ImageWithLoader";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
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
  const [loadingCatches, setLoadingCatches] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCatch, setSelectedCatch] = useState<CatchWithExtras | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followListModal, setFollowListModal] = useState<null | "followers" | "following">(null);
  const [followListData, setFollowListData] = useState<any[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterSpecies, setFilterSpecies] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const availableSpecies = useMemo(
    () => [...new Set(catches.map((c) => c.species).filter(Boolean))] as string[],
    [catches]
  );

  const displayedCatches = useMemo(() => {
    const filtered = filterSpecies ? catches.filter((c) => c.species === filterSpecies) : catches;
    return [...filtered].sort((a, b) => {
      const da = new Date(a.date ?? 0).getTime();
      const db = new Date(b.date ?? 0).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });
  }, [catches, filterSpecies, sortOrder]);

  const load = async (_opts: { force?: boolean } = {}) => {
    try {
      const items = await getCatches();
      setCatches(items as CatchWithExtras[]);
    } catch (e) {
      console.error("load error:", e);
    } finally {
      setLoadingCatches(false);
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

  const openFollowList = async (type: "followers" | "following") => {
    if (!user) return;
    setFollowListModal(type);
    setFollowListLoading(true);
    setFollowListData([]);
    try {
      if (type === "followers") {
        const records = await pb.collection("follows").getFullList({
          filter: `following_id = "${user.id}"`,
          requestKey: null,
        });
        const ids = records.map((r: any) => r.follower_id).filter(Boolean);
        const users = await Promise.all(
          ids.map((id: string) => pb.collection("users").getOne(id, { requestKey: null }).catch(() => null))
        );
        setFollowListData(users.filter(Boolean));
      } else {
        const records = await pb.collection("follows").getFullList({
          filter: `follower_id = "${user.id}"`,
          requestKey: null,
        });
        const ids = records.map((r: any) => r.following_id).filter(Boolean);
        const users = await Promise.all(
          ids.map((id: string) => pb.collection("users").getOne(id, { requestKey: null }).catch(() => null))
        );
        setFollowListData(users.filter(Boolean));
      }
    } catch (e) {
      console.error("Follow list error:", e);
    } finally {
      setFollowListLoading(false);
    }
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
            <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" />
          )}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  const bannerUri = catches.find((c) => c.image || c.imageUrl);
  const bannerSource = bannerUri ? { uri: bannerUri.image ?? bannerUri.imageUrl } : null;

  const profileHeader = user ? (
    <View style={styles.profileHeaderContainer}>
      {/* Banner */}
      <View style={styles.bannerContainer}>
        {bannerSource ? (
          <ImageWithLoader source={bannerSource} contentFit="cover" style={styles.bannerImage} />
        ) : (
          <View style={styles.bannerPlaceholder} />
        )}
        <TouchableOpacity onPress={() => router.push('/(tabs)/settings')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={22} color="#e6eef8" />
        </TouchableOpacity>
      </View>

      {/* Avatar overlapping banner */}
      <View style={styles.avatarWrapper}>
        <View style={styles.profileAvatar}>
          {user.avatar ? (
            <ImageWithLoader
              source={{ uri: `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}?thumb=200x200` }}
              contentFit="cover"
              style={styles.profileAvatarImage}
            />
          ) : (
            <Text style={styles.profileAvatarText}>
              {(user.name || user.username || "?").slice(0, 2).toUpperCase()}
            </Text>
          )}
        </View>
      </View>

      {/* Name / username */}
      {user.name ? <Text style={styles.profileName}>{user.name}</Text> : null}
      {user.username ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <Text style={styles.profileUsername}>
            {user.username}
            {user.location ? `  ${user.location}` : ""}
          </Text>
          {parseBadges(user.badges).includes("verified") ? <VerifiedBadge size={14} /> : null}
        </View>
      ) : null}
      <BadgeChip badges={parseBadges(user.badges)} language={language} />
      {user.bio ? (
        <View style={styles.profileBioCard}>
          <Text style={styles.profileBio}>{user.bio}</Text>
        </View>
      ) : null}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{catches.length}</Text>
          <Text style={styles.statLabel}>{language === "ru" ? "Уловов" : "Catches"}</Text>
        </View>
        <View style={styles.statDivider} />
        <TouchableOpacity style={styles.statItem} onPress={() => openFollowList("followers")}>
          <Text style={styles.statNum}>{followerCount}</Text>
          <Text style={styles.statLabel}>{language === "ru" ? "Подписчики" : "Followers"}</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity style={styles.statItem} onPress={() => openFollowList("following")}>
          <Text style={styles.statNum}>{followingCount}</Text>
          <Text style={styles.statLabel}>{language === "ru" ? "Подписки" : "Following"}</Text>
        </TouchableOpacity>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/settings')}>
          <Text style={styles.actionBtnText}>{language === "ru" ? "Редактировать" : "Edit"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/social?openSearch=1')}>
          <Text style={styles.actionBtnText}>{language === "ru" ? "Найти друзей" : "Find friends"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => {
          const handle = user?.username ? `@${user.username}` : "someone";
          Share.share({
            message: language === "ru"
              ? `Я на StrikeFeed! Найди меня там — ${handle} 🎣\nhttps://play.google.com/store/apps/details?id=com.strikefeed.myapp&utm_source=na_Med`
              : `I'm on StrikeFeed! Find me there — ${handle} 🎣\nhttps://play.google.com/store/apps/details?id=com.strikefeed.myapp&utm_source=na_Med`,
          });
        }}>
          <Text style={styles.actionBtnText}>{language === "ru" ? "Поделиться" : "Share"}</Text>
        </TouchableOpacity>
      </View>

      {/* Catches section header */}
      <View style={styles.catchesSectionHeader}>
        <View style={styles.catchesSectionTitle}>
          <Text style={styles.catchesSectionTitleText}>{language === "ru" ? "Уловы" : "Catches"}</Text>
          {(filterSpecies || sortOrder !== "newest") && (
            <View style={styles.filterActiveDot} />
          )}
        </View>
        <View style={styles.catchesSectionIcons}>
          <TouchableOpacity onPress={() => setShowFilters((v) => !v)} hitSlop={8}>
            <Ionicons name="options-outline" size={18} color={showFilters ? "#ffffff" : "#94a3b8"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          {/* Sort row */}
          <View style={styles.filterSortRow}>
            <TouchableOpacity
              style={[styles.sortBtn, sortOrder === "newest" && styles.sortBtnActive]}
              onPress={() => setSortOrder("newest")}
            >
              <Ionicons name="arrow-down-outline" size={12} color={sortOrder === "newest" ? "#fff" : "#94a3b8"} />
              <Text style={[styles.sortBtnText, sortOrder === "newest" && styles.sortBtnTextActive]}>
                {language === "ru" ? "Новые" : "Newest"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortBtn, sortOrder === "oldest" && styles.sortBtnActive]}
              onPress={() => setSortOrder("oldest")}
            >
              <Ionicons name="arrow-up-outline" size={12} color={sortOrder === "oldest" ? "#fff" : "#94a3b8"} />
              <Text style={[styles.sortBtnText, sortOrder === "oldest" && styles.sortBtnTextActive]}>
                {language === "ru" ? "Старые" : "Oldest"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Species pills */}
          {availableSpecies.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.speciesPillsContent}>
              <TouchableOpacity
                style={[styles.speciesPill, !filterSpecies && styles.speciesPillActive]}
                onPress={() => setFilterSpecies(null)}
              >
                <Text style={[styles.speciesPillText, !filterSpecies && styles.speciesPillTextActive]}>
                  {language === "ru" ? "Все" : "All"}
                </Text>
              </TouchableOpacity>
              {availableSpecies.map((sp) => (
                <TouchableOpacity
                  key={sp}
                  style={[styles.speciesPill, filterSpecies === sp && styles.speciesPillActive]}
                  onPress={() => setFilterSpecies(filterSpecies === sp ? null : sp)}
                >
                  <Text style={[styles.speciesPillText, filterSpecies === sp && styles.speciesPillTextActive]}>
                    {getSpeciesLabel(sp, language)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <FlatList
        data={displayedCatches}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListHeaderComponent={profileHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        ListEmptyComponent={
          loadingCatches ? null : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>{t("noCatchesYet")}</Text>
              <Text style={styles.emptyBadge}>{t("profileEmptyBadge")}</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push("/(tabs)/add")}>
                <Text style={styles.emptyBtnText}>{t("addFirstCatch")}</Text>
              </TouchableOpacity>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 140 }}
      />

      <Modal
        visible={followListModal !== null}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => setFollowListModal(null)}
      >
        <SafeAreaView style={styles.followModalContainer}>
          <View style={styles.followModalHeader}>
            <Text style={styles.followModalTitle}>
              {followListModal === "followers"
                ? (language === "ru" ? "Подписчики" : "Followers")
                : (language === "ru" ? "Подписки" : "Following")}
            </Text>
            <TouchableOpacity onPress={() => setFollowListModal(null)} hitSlop={8}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          {followListLoading ? (
            <ActivityIndicator color="#ffffff" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={followListData}
              keyExtractor={(u) => u.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              ListEmptyComponent={
                <Text style={styles.followModalEmpty}>
                  {language === "ru" ? "Никого нет" : "Nobody here yet"}
                </Text>
              }
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={styles.followUserRow}
                  activeOpacity={0.75}
                  onPress={() => { setFollowListModal(null); router.push({ pathname: "/(tabs)/social", params: { userId: u.id } }); }}
                >
                  <View style={styles.followAvatar}>
                    {u.avatar ? (
                      <ImageWithLoader
                        source={{ uri: `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=200x200` }}
                        style={styles.followAvatarImg}
                        contentFit="cover"
                      />
                    ) : (
                      <Text style={styles.followAvatarText}>
                        {(u.name || u.username || "?").slice(0, 2).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    {u.name ? <Text style={styles.followUserName}>{u.name}</Text> : null}
                    {u.username ? <Text style={styles.followUserHandle}>@{u.username}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#475569" />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

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
          verified: parseBadges(user?.badges).includes("verified"),
          avatarUrl: user?.avatar
            ? `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}?thumb=200x200`
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
  container: { flex: 1, backgroundColor: "#0f172a" },
  title: { color: "#e6eef8", fontSize: 18, marginBottom: 4 },

  // ── New profile header ──────────────────────────────────────────────────────
  profileHeaderContainer: { marginBottom: 12 },
  bannerContainer: {
    height: 140,
    backgroundColor: "#071023",
    overflow: "hidden",
  },
  bannerImage: { width: "100%", height: "100%" },
  bannerPlaceholder: { flex: 1, backgroundColor: "#0a1929" },
  settingsBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 1,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
  },
  avatarWrapper: { alignItems: "center", marginTop: -44 },
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#0f172a",
  },
  profileAvatarImage: { width: 88, height: 88, borderRadius: 44 },
  profileAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 26 },
  profileName: { color: "#e6eef8", fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 10 },
  profileUsername: { color: "#94a3b8", fontSize: 14, textAlign: "center", marginTop: 3 },
  profileBioCard: { marginHorizontal: 16, marginTop: 12, paddingHorizontal: 2 },
  profileBio: { color: "#cbd5e1", fontSize: 14, lineHeight: 22 },

  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    marginHorizontal: 16,
    paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: "center" },
  statNum: { color: "#e6eef8", fontSize: 20, fontWeight: "700" },
  statLabel: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: "#1e293b" },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginHorizontal: 16,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionBtnText: { color: "#e6eef8", fontSize: 13, fontWeight: "600" },

  featureTilesRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginHorizontal: 16,
  },
  featureTile: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  featureTileNum: { color: "#e6eef8", fontSize: 14, fontWeight: "700" },
  featureTileLabel: { color: "#94a3b8", fontSize: 11, textAlign: "center" },

  catchesSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  catchesSectionTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  catchesSectionTitleText: { color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  catchesSectionIcons: { flexDirection: "row", gap: 16 },
  filterActiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#ffffff" },

  filterPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  filterSortRow: { flexDirection: "row", gap: 8 },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1e293b",
  },
  sortBtnActive: { backgroundColor: "#1d4ed8" },
  sortBtnText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  sortBtnTextActive: { color: "#fff" },
  speciesPillsContent: { gap: 8, paddingVertical: 2 },
  speciesPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#1e293b",
  },
  speciesPillActive: { backgroundColor: "#1d4ed8" },
  speciesPillText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  speciesPillTextActive: { color: "#fff" },

  // ── Legacy / kept for catch list items ─────────────────────────────────────
  profileInfo: { flex: 1 },
  profileStats: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 4 },
  profileCatchCount: { color: "#ffffff", fontSize: 13 },
  profileStatDivider: { color: "#64748b", fontSize: 13 },
  profileStatItem: { color: "#ffffff", fontSize: 13 },
  profileStatNum: { fontWeight: "700" },
  empty: { color: "#94a3b8", textAlign: "center", padding: 24 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#071023",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 10,
  },
  thumb: { width: 72, height: 72, borderRadius: 8, marginRight: 12 },
  info: { flex: 1 },
  species: { color: "#ffffff", fontWeight: "600" },
  gearRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, alignSelf: "flex-start" },
  gearThumb: { width: 36, height: 36 },
  gear: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  detailGearRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4, marginBottom: 8, alignSelf: "flex-start" },
  detailGearThumb: { width: 56, height: 56 },
  detailGear: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
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
  dotActive: { backgroundColor: "#ffffff", width: 16 },
  detailBody: { paddingHorizontal: 20, paddingTop: 16 },
  detailUserRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  detailAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  detailAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  detailAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  detailUserName: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  detailUserHandle: { color: "#94a3b8", fontSize: 13 },
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
  likeCount: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  likeCountActive: { color: "#ffffff" },
  commentCount: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  commentsSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  commentItem: { marginBottom: 10 },
  commentUsername: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
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
  },
  publicLabel: { color: "#e6eef8", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  publicSub: { color: "#94a3b8", fontSize: 12 },
  editPickerRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#071023", borderRadius: 10, padding: 12, marginBottom: 10, gap: 12 },
  editPickerThumb: { width: 44, height: 44 },
  editPickerLabel: { color: "#94a3b8", fontSize: 12, marginBottom: 2 },
  editPickerValue: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  pickerModal: { flex: 1, backgroundColor: "#071023" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  pickerTitle: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  pickerSearch: { flexDirection: "row", alignItems: "center", backgroundColor: "#0f2236", borderRadius: 10, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8 },
  pickerSearchInput: { flex: 1, color: "#e6eef8", fontSize: 15, padding: 0 },
  pickerItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 16, borderBottomColor: "#0b1220", borderBottomWidth: 1, gap: 12 },
  pickerItemImg: { width: 52, height: 52, flexShrink: 0 },
  pickerItemImgPlaceholder: { width: 52, height: 52, borderRadius: 8, backgroundColor: "#0f2236", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pickerItemText: { color: "#e6eef8", fontSize: 16 },
  pickerItemSub: { color: "#94a3b8", fontSize: 13, fontStyle: "italic", marginTop: 3 },

  followModalContainer: { flex: 1, backgroundColor: "#071023" },
  followModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  followModalTitle: { color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  followModalEmpty: { color: "#94a3b8", textAlign: "center", marginTop: 40, fontSize: 15 },
  followUserRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#0b1220",
    gap: 12,
  },
  followAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  followAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  followAvatarText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  followUserName: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  followUserHandle: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  emptyTitle: {
    color: "#e6eef8",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyBadge: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  emptyBtn: {
    backgroundColor: "#0c4a6e",
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  emptyBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
