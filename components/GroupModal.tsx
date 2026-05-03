import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { FontAwesome6 as FontAwesome } from "@expo/vector-icons";
import { pb } from "@/lib/pocketbase";

type Member = {
  id: string;
  user_id: string;
  username: string;
  avatarUrl: string | null;
};

type Props = {
  group: any;
  currentUserId?: string;
  language: string;
  onClose: () => void;
  onDeleted: () => void;
};

export default function GroupModal({ group, currentUserId, language, onClose, onDeleted }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [myMemberRecord, setMyMemberRecord] = useState<any>(null);
  const [acting, setActing] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name ?? "");
  const [editDesc, setEditDesc] = useState(group.description ?? "");
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [liveGroup, setLiveGroup] = useState(group);
  const [saving, setSaving] = useState(false);

  const isCreator = currentUserId === liveGroup.creator_id;
  const isMember = !!myMemberRecord;

  const avatarUrl = editAvatarUri
    ?? (liveGroup.avatar ? `${pb.baseURL}/api/files/groups/${liveGroup.id}/${liveGroup.avatar}` : null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const memberRecords = await pb.collection("group_members").getFullList({
        filter: `group_id = "${liveGroup.id}"`,
        requestKey: null,
      });
      setMemberCount(memberRecords.length);

      const enriched = await Promise.all(
        memberRecords.map(async (m: any) => {
          try {
            const u = await pb.collection("users").getOne(m.user_id, { requestKey: null });
            return {
              id: m.id,
              user_id: m.user_id,
              username: u.username || u.name || m.user_id,
              avatarUrl: u.avatar
                ? `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}`
                : null,
            } as Member;
          } catch {
            return { id: m.id, user_id: m.user_id, username: m.user_id, avatarUrl: null } as Member;
          }
        })
      );
      setMembers(enriched);
      if (currentUserId) {
        const mine = memberRecords.find((m: any) => m.user_id === currentUserId);
        setMyMemberRecord(mine ?? null);
      }
    } catch (e) {
      console.warn("GroupModal load error:", e);
    } finally {
      setLoading(false);
    }
  }, [liveGroup.id, currentUserId]);

  useEffect(() => { load(); }, [load]);

  const handleJoin = async () => {
    if (!currentUserId || acting) return;
    setActing(true);
    try {
      const record = await pb.collection("group_members").create({
        group_id: liveGroup.id,
        user_id: currentUserId,
      });
      setMyMemberRecord(record);
      setMemberCount(c => c + 1);
    } catch (e) {
      console.warn("join error:", e);
    } finally {
      setActing(false);
    }
  };

  const handleLeave = async () => {
    if (!myMemberRecord || acting) return;
    setActing(true);
    try {
      await pb.collection("group_members").delete(myMemberRecord.id);
      setMyMemberRecord(null);
      setMemberCount(c => Math.max(0, c - 1));
    } catch (e) {
      console.warn("leave error:", e);
    } finally {
      setActing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      language === "ru" ? "Удалить группу" : "Delete group",
      language === "ru" ? "Это действие необратимо." : "This cannot be undone.",
      [
        { text: language === "ru" ? "Отмена" : "Cancel", style: "cancel" },
        {
          text: language === "ru" ? "Удалить" : "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await pb.collection("groups").delete(liveGroup.id);
              onDeleted();
              onClose();
            } catch (e) {
              console.warn("delete group error:", e);
            }
          },
        },
      ]
    );
  };

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setEditAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", editName.trim());
      formData.append("description", editDesc.trim());
      if (editAvatarUri) {
        formData.append("avatar", { uri: editAvatarUri, name: "avatar.jpg", type: "image/jpeg" } as any);
      }
      const updated = await pb.collection("groups").update(liveGroup.id, formData);
      setLiveGroup(updated);
      setEditing(false);
      setEditAvatarUri(null);
    } catch (e) {
      console.warn("save group error:", e);
    } finally {
      setSaving(false);
    }
  };

  const ru = language === "ru";

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <FontAwesome name="arrow-left" size={20} color="#e6eef8" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {editing ? (ru ? "Редактировать" : "Edit group") : liveGroup.name}
          </Text>
          {isCreator && !editing && (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => setEditing(true)} style={styles.headerBtn}>
                <FontAwesome name="pen" size={15} color="#60a5fa" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
                <FontAwesome name="trash" size={15} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}
          {editing && (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => { setEditing(false); setEditName(liveGroup.name); setEditDesc(liveGroup.description ?? ""); setEditAvatarUri(null); }} style={styles.headerBtn}>
                <Text style={styles.cancelText}>{ru ? "Отмена" : "Cancel"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerBtn}>
                <Text style={[styles.saveText, saving && { opacity: 0.5 }]}>{ru ? "Сохранить" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Group identity block */}
        <View style={styles.groupBlock}>
          <TouchableOpacity onPress={editing ? handlePickAvatar : undefined} style={styles.avatarWrap} activeOpacity={editing ? 0.7 : 1}>
            {avatarUrl ? (
              <ExpoImage source={{ uri: avatarUrl }} contentFit="cover" style={styles.avatar} />
            ) : (
              <Text style={styles.avatarText}>{(editName || "G").slice(0, 2).toUpperCase()}</Text>
            )}
            {editing && (
              <View style={styles.avatarEditBadge}>
                <FontAwesome name="camera" size={11} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.groupMeta}>
            {editing ? (
              <>
                <TextInput
                  style={styles.editNameInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder={ru ? "Название группы" : "Group name"}
                  placeholderTextColor="#475569"
                  maxLength={60}
                />
                <TextInput
                  style={styles.editDescInput}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  placeholder={ru ? "Описание..." : "Description..."}
                  placeholderTextColor="#475569"
                  multiline
                  maxLength={200}
                />
              </>
            ) : (
              <>
                {liveGroup.description ? <Text style={styles.groupDesc}>{liveGroup.description}</Text> : null}
                <Text style={styles.memberCountText}>
                  {memberCount} {ru ? "участников" : "members"}
                </Text>
              </>
            )}
          </View>
        </View>

        {!isCreator && currentUserId && !editing && (
          <View style={styles.joinRow}>
            <TouchableOpacity
              style={[styles.joinBtn, isMember && styles.leaveBtn]}
              onPress={isMember ? handleLeave : handleJoin}
              disabled={acting}
            >
              <Text style={[styles.joinBtnText, isMember && styles.leaveBtnText]}>
                {isMember ? (ru ? "Выйти из группы" : "Leave group") : (ru ? "Вступить" : "Join")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Members */}
        {loading ? (
          <ActivityIndicator color="#60a5fa" style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.membersList}
            ListHeaderComponent={
              <Text style={styles.membersTitle}>{ru ? "Участники" : "Members"}</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  {item.avatarUrl ? (
                    <ExpoImage source={{ uri: item.avatarUrl }} contentFit="cover" style={styles.memberAvatarImg} />
                  ) : (
                    <Text style={styles.memberAvatarText}>
                      {item.username.slice(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={styles.memberUsername}>@{item.username}</Text>
                {item.user_id === liveGroup.creator_id && (
                  <View style={styles.creatorBadge}>
                    <Text style={styles.creatorBadgeText}>{ru ? "Создатель" : "Creator"}</Text>
                  </View>
                )}
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{ru ? "Пока нет участников" : "No members yet"}</Text>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
    gap: 10,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerTitle: { flex: 1, color: "#e6eef8", fontSize: 17, fontWeight: "700" },
  headerActions: { flexDirection: "row", gap: 4 },
  headerBtn: { padding: 8 },
  cancelText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
  saveText: { color: "#0284c7", fontSize: 14, fontWeight: "700" },

  groupBlock: {
    flexDirection: "row", alignItems: "flex-start",
    padding: 16, gap: 16,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  avatarWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center",
    overflow: "visible",
  },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarText: { color: "#60a5fa", fontWeight: "700", fontSize: 22 },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#0284c7", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#0f172a",
  },

  groupMeta: { flex: 1 },
  groupDesc: { color: "#94a3b8", fontSize: 14, lineHeight: 20, marginBottom: 6 },
  memberCountText: { color: "#475569", fontSize: 13 },

  editNameInput: {
    color: "#e6eef8", fontSize: 16, fontWeight: "700",
    borderBottomWidth: 1, borderBottomColor: "#334155",
    paddingVertical: 4, marginBottom: 8,
  },
  editDescInput: {
    color: "#e6eef8", fontSize: 14,
    borderBottomWidth: 1, borderBottomColor: "#334155",
    paddingVertical: 4, minHeight: 48, textAlignVertical: "top",
  },

  joinRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  joinBtn: {
    backgroundColor: "#0284c7", borderRadius: 10,
    paddingVertical: 11, alignItems: "center",
  },
  leaveBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#334155" },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  leaveBtnText: { color: "#64748b" },

  membersList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  membersTitle: { color: "#94a3b8", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  memberRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#071023", borderRadius: 10,
    padding: 12, marginBottom: 8, gap: 12,
  },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  memberAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  memberAvatarText: { color: "#60a5fa", fontWeight: "700", fontSize: 13 },
  memberUsername: { flex: 1, color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  creatorBadge: {
    backgroundColor: "#1e293b", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  creatorBadgeText: { color: "#60a5fa", fontSize: 11, fontWeight: "700" },
  emptyText: { color: "#475569", textAlign: "center", marginTop: 16 },
});
