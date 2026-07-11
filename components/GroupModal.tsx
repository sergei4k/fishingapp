import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { theme } from '../lib/theme';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { File, Paths } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { pb } from "@/lib/pocketbase";
import { parseBadges } from "@/lib/badges";
import { VerifiedBadge } from "@/components/VerifiedBadge";

type MemberStatus = "approved" | "pending";

type Member = {
  id: string;
  user_id: string;
  status: MemberStatus;
  muted: boolean;
  username: string;
  avatarUrl: string | null;
  verified: boolean;
};

type ChatMessage = {
  id: string;
  group_id: string;
  user_id: string;
  username?: string;
  text: string;
  image?: string;
  created?: string;
  _localUri?: string;
  _pending?: boolean;
};

type Props = {
  group: any;
  currentUserId?: string;
  language: string;
  onClose: () => void;
  onDeleted: () => void;
  onChanged?: (group: any) => void;
  onOpenUser?: (user: any) => void;
};

export default function GroupModal({ group, currentUserId, language, onClose, onDeleted, onChanged, onOpenUser }: Props) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesUnavailable, setMessagesUnavailable] = useState(false);
  const [acting, setActing] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [membersVisible, setMembersVisible] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name ?? "");
  const [editDesc, setEditDesc] = useState(group.description ?? "");
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [liveGroup, setLiveGroup] = useState(group);
  const [saving, setSaving] = useState(false);

  const ru = language === "ru";
  const isCreator = currentUserId === liveGroup.creator_id;
  const approvedMembers = useMemo(() => members.filter((m) => m.status === "approved"), [members]);
  const pendingMembers = useMemo(() => members.filter((m) => m.status === "pending"), [members]);
  const memberCount = useMemo(() => {
    const ids = new Set(approvedMembers.map((m) => m.user_id).filter(Boolean));
    if (liveGroup.creator_id) ids.add(liveGroup.creator_id);
    return ids.size;
  }, [approvedMembers, liveGroup.creator_id]);
  const myMemberRecord = useMemo(
    () => members.find((m) => m.user_id === currentUserId) ?? null,
    [members, currentUserId],
  );
  const canChat = isCreator || myMemberRecord?.status === "approved";
  const hasPendingRequest = myMemberRecord?.status === "pending";
  const isMuted = !!myMemberRecord?.muted;

  const avatarUrl = editAvatarUri
    ?? (liveGroup.avatar ? `${pb.baseURL}/api/files/groups/${liveGroup.id}/${liveGroup.avatar}?thumb=300x300` : null);

  const enrichMembers = useCallback(async (records: any[]) => {
    const userIds = [...new Set(records.map((m) => m.user_id).filter(Boolean))] as string[];
    const userMap: Record<string, any> = {};
    if (userIds.length > 0) {
      try {
        const users = await pb.collection("users").getFullList({
          filter: userIds.map((id) => `id = "${id}"`).join(" || "),
          requestKey: null,
        });
        for (const u of users) userMap[u.id] = u;
      } catch (e) {
        console.warn("GroupModal user fetch error:", e);
      }
    }

    return records.map((m: any) => {
      const u = userMap[m.user_id];
      return {
        id: m.id,
        user_id: m.user_id,
        status: (m.status === "pending" ? "pending" : "approved") as MemberStatus,
        muted: !!m.muted,
        username: u?.username || u?.name || m.user_id,
        avatarUrl: u?.avatar ? `${pb.baseURL}/api/files/_pb_users_auth_/${u.id}/${u.avatar}?thumb=120x120` : null,
        verified: parseBadges(u?.badges).includes("verified"),
      };
    });
  }, []);

  const loadMembers = useCallback(async () => {
    try {
      const records = await pb.collection("group_members").getFullList({
        filter: `group_id = "${liveGroup.id}"`,
        sort: "created",
        requestKey: null,
      });
      setMembers(await enrichMembers(records));
    } catch (e) {
      console.warn("GroupModal load members error:", e);
    }
  }, [enrichMembers, liveGroup.id]);

  const loadMessages = useCallback(async () => {
    if (!canChat) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    setMessagesUnavailable(false);
    try {
      const records = await pb.collection("group_messages").getFullList({
        filter: `group_id = "${liveGroup.id}"`,
        sort: "created",
        requestKey: null,
      });
      setMessages(records as unknown as ChatMessage[]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    } catch (e: any) {
      if (e?.status === 404) {
        setMessagesUnavailable(true);
      } else {
        console.warn("GroupModal load messages error:", e);
      }
    } finally {
      setLoadingMessages(false);
    }
  }, [canChat, liveGroup.id]);

  const load = useCallback(async () => {
    setLoading(true);
    await loadMembers();
    setLoading(false);
  }, [loadMembers]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (!canChat) return;
    pb.collection("group_messages").subscribe("*", (event) => {
      if (event.record?.group_id !== liveGroup.id) return;
      if (event.action === "create") {
        setMessages((prev) => prev.some((m) => m.id === event.record.id) ? prev : [...prev, event.record as unknown as ChatMessage]);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
      if (event.action === "delete") {
        setMessages((prev) => prev.filter((m) => m.id !== event.record.id));
      }
    }, { requestKey: null } as any).catch(() => {});
    return () => { pb.collection("group_messages").unsubscribe("*"); };
  }, [canChat, liveGroup.id]);

  const handleRequestJoin = async () => {
    if (!currentUserId || acting || myMemberRecord) return;
    setActing(true);
    try {
      const record = await pb.collection("group_members").create({
        group_id: liveGroup.id,
        user_id: currentUserId,
        status: "pending",
      });
      const enriched = await enrichMembers([record]);
      setMembers((prev) => [...prev, ...enriched]);
    } catch (e) {
      console.warn("join request error:", e);
      Alert.alert(ru ? "Ошибка" : "Error", ru ? "Не удалось отправить запрос" : "Could not send request");
    } finally {
      setActing(false);
    }
  };

  const handleLeave = async () => {
    if (!myMemberRecord || acting) return;
    setActing(true);
    try {
      await pb.collection("group_members").delete(myMemberRecord.id);
      setMembers((prev) => prev.filter((m) => m.id !== myMemberRecord.id));
      setSettingsVisible(false);
    } catch (e) {
      console.warn("leave group error:", e);
    } finally {
      setActing(false);
    }
  };

  const handleToggleMute = async () => {
    if (!currentUserId || acting) return;
    setActing(true);
    try {
      if (myMemberRecord) {
        const record = await pb.collection("group_members").update(myMemberRecord.id, { muted: !isMuted });
        const enriched = await enrichMembers([record]);
        setMembers((prev) => prev.map((m) => m.id === myMemberRecord.id ? enriched[0] : m));
      } else if (isCreator) {
        const record = await pb.collection("group_members").create({
          group_id: liveGroup.id,
          user_id: currentUserId,
          status: "approved",
          muted: true,
        });
        const enriched = await enrichMembers([record]);
        setMembers((prev) => [...prev, ...enriched]);
      }
    } catch (e) {
      console.warn("mute group error:", e);
      Alert.alert(ru ? "Ошибка" : "Error", ru ? "Не удалось изменить уведомления" : "Could not update notifications");
    } finally {
      setActing(false);
    }
  };

  const handleApprove = async (member: Member) => {
    if (!isCreator || acting) return;
    setActing(true);
    try {
      const record = await pb.collection("group_members").update(member.id, { status: "approved" });
      const enriched = await enrichMembers([record]);
      setMembers((prev) => prev.map((m) => m.id === member.id ? enriched[0] : m));
    } catch (e) {
      console.warn("approve member error:", e);
      Alert.alert(ru ? "Ошибка" : "Error", ru ? "Не удалось одобрить запрос" : "Could not approve request");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async (member: Member) => {
    if (!isCreator || acting) return;
    setActing(true);
    try {
      await pb.collection("group_members").delete(member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (e) {
      console.warn("reject member error:", e);
    } finally {
      setActing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      ru ? "Удалить чат" : "Delete chat",
      ru ? "Это действие необратимо." : "This cannot be undone.",
      [
        { text: ru ? "Отмена" : "Cancel", style: "cancel" },
        {
          text: ru ? "Удалить" : "Delete",
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
    if (!result.canceled && result.assets?.[0]) setEditAvatarUri(result.assets[0].uri);
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
      onChanged?.(updated);
      setEditing(false);
      setEditAvatarUri(null);
    } catch (e) {
      console.warn("save group error:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMessage = (message: ChatMessage) => {
    if (message.user_id !== currentUserId) return;
    Alert.alert(
      ru ? "Удалить сообщение" : "Delete message",
      ru ? "Это действие необратимо." : "This cannot be undone.",
      [
        { text: ru ? "Отмена" : "Cancel", style: "cancel" },
        {
          text: ru ? "Удалить" : "Delete",
          style: "destructive",
          onPress: async () => {
            setMessages((prev) => prev.filter((m) => m.id !== message.id));
            try {
              await pb.collection("group_messages").delete(message.id, { requestKey: null });
            } catch (e) {
              console.warn("delete group message error:", e);
              setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
              Alert.alert(ru ? "Ошибка" : "Error", ru ? "Не удалось удалить сообщение" : "Could not delete message");
            }
          },
        },
      ]
    );
  };

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || !currentUserId || !canChat || acting) return;
    if (messagesUnavailable) {
      Alert.alert(
        ru ? "Чат ещё не настроен" : "Chat is not configured yet",
        ru ? "Нужно добавить коллекцию сообщений на сервере." : "The messages collection needs to be added on the server.",
      );
      return;
    }
    setActing(true);
    try {
      const created = await pb.collection("group_messages").create({
        group_id: liveGroup.id,
        user_id: currentUserId,
        username: pb.authStore.record?.username || pb.authStore.record?.name || "",
        text,
      });
      setMessages((prev) => prev.some((m) => m.id === created.id) ? prev : [...prev, created as unknown as ChatMessage]);
      setMessageText("");
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      console.warn("send group message error:", e);
      Alert.alert(ru ? "Ошибка" : "Error", ru ? "Не удалось отправить сообщение" : "Could not send message");
    } finally {
      setActing(false);
    }
  };

  const handleSendPhoto = async () => {
    if (!currentUserId || !canChat || acting) return;
    if (messagesUnavailable) {
      Alert.alert(
        ru ? "Чат ещё не настроен" : "Chat is not configured yet",
        ru ? "Нужно добавить коллекцию сообщений на сервере." : "The messages collection needs to be added on the server.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || "image/jpeg";
    const ext = (mime.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const caption = messageText.trim();
    const username = pb.authStore.record?.username || pb.authStore.record?.name || "";

    // Warm the image cache, then show it in the chat immediately (optimistic)
    // so the photo is visible before the upload confirms.
    await ExpoImage.prefetch(asset.uri).catch(() => {});
    const tempId = `temp_${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId, group_id: liveGroup.id, user_id: currentUserId,
      username, text: caption, _localUri: asset.uri, _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setMessageText("");
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    setActing(true);
    try {
      const form = new FormData();
      form.append("group_id", liveGroup.id);
      form.append("user_id", currentUserId);
      form.append("username", username);
      form.append("text", caption);
      form.append("image", { uri: asset.uri, name: `chat.${ext}`, type: mime } as any);
      const created = await pb.collection("group_messages").create(form, { requestKey: null });
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === created.id) ? withoutTemp : [...withoutTemp, created as unknown as ChatMessage];
      });
    } catch (e) {
      console.warn("send group photo error:", e);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMessageText(caption);
      Alert.alert(ru ? "Ошибка" : "Error", ru ? "Не удалось отправить фото" : "Could not send photo");
    } finally {
      setActing(false);
    }
  };

  const messageImageUrl = (message: ChatMessage, thumb = true) =>
    message._localUri
      ? message._localUri
      : `${pb.baseURL}/api/files/group_messages/${message.id}/${message.image}${thumb ? "?thumb=600x600" : ""}`;

  const openFullscreen = (message: ChatMessage) => {
    if (!message._localUri && !message.image) return;
    setFullscreenImage(messageImageUrl(message, false));
  };

  const promptSaveImage = (message: ChatMessage) => {
    if (!message.image) return;
    Alert.alert(
      ru ? "Фото" : "Photo",
      undefined,
      [
        { text: ru ? "Сохранить в галерею" : "Save to phone", onPress: () => handleSaveImage(message) },
        { text: ru ? "Отмена" : "Cancel", style: "cancel" },
      ],
    );
  };

  const handleOpenMember = (member: Member) => {
    if (!onOpenUser) return;
    setMembersVisible(false);
    setSettingsVisible(false);
    onOpenUser({
      id: member.user_id,
      username: member.username,
      name: "",
      avatarUrl: member.avatarUrl,
      badges: member.verified ? ["verified"] : [],
    });
  };

  const handleSaveImage = async (message: ChatMessage) => {
    if (!message.image || savingImage) return;
    setSavingImage(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          ru ? "Нет доступа" : "No access",
          ru ? "Разрешите доступ к фото, чтобы сохранить изображение." : "Allow photo access to save the image.",
        );
        return;
      }
      const url = messageImageUrl(message, false);
      const dest = new File(Paths.cache, message.image);
      if (dest.exists) dest.delete();
      const downloaded = await File.downloadFileAsync(url, dest);
      await MediaLibrary.saveToLibraryAsync(downloaded.uri);
      Alert.alert(ru ? "Сохранено" : "Saved", ru ? "Фото сохранено в галерею." : "Photo saved to your gallery.");
    } catch (e) {
      console.warn("save group image error:", e);
      Alert.alert(ru ? "Ошибка" : "Error", ru ? "Не удалось сохранить фото" : "Could not save photo");
    } finally {
      setSavingImage(false);
    }
  };

  const renderMember = (item: Member, pending = false) => (
    <TouchableOpacity
      style={styles.memberRow}
      activeOpacity={onOpenUser && !pending ? 0.75 : 1}
      onPress={onOpenUser && !pending ? () => handleOpenMember(item) : undefined}
    >
      <View style={styles.memberAvatar}>
        {item.avatarUrl ? (
          <ExpoImage source={{ uri: item.avatarUrl }} contentFit="cover" style={styles.memberAvatarImg} />
        ) : (
          <Ionicons name="person" size={18} color="#94a3b8" />
        )}
      </View>
      <View style={styles.memberNameWrap}>
        <View style={styles.memberNameLine}>
          <Text style={styles.memberUsername} numberOfLines={1}>{item.username}</Text>
          {item.verified ? <VerifiedBadge size={13} /> : null}
        </View>
        {item.user_id === liveGroup.creator_id ? (
          <Text style={styles.memberRole}>{ru ? "Создатель" : "Creator"}</Text>
        ) : null}
      </View>
      {pending && isCreator ? (
        <View style={styles.requestActions}>
          <TouchableOpacity onPress={() => handleApprove(item)} style={styles.approveBtn}>
            <Ionicons name="checkmark" size={16} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleReject(item)} style={styles.rejectBtn}>
            <Ionicons name="close" size={16} color="#fca5a5" />
          </TouchableOpacity>
        </View>
      ) : onOpenUser ? (
        <Ionicons name="chevron-forward" size={18} color="#64748b" />
      ) : null}
    </TouchableOpacity>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#e6eef8" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {editing ? (ru ? "Редактировать" : "Edit chat") : liveGroup.name}
          </Text>
          {!editing ? (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.headerBtn}>
                <Ionicons name="settings-outline" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : null}
          {editing ? (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => { setEditing(false); setEditName(liveGroup.name); setEditDesc(liveGroup.description ?? ""); setEditAvatarUri(null); }} style={styles.headerBtn}>
                <Text style={styles.cancelText}>{ru ? "Отмена" : "Cancel"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerBtn}>
                <Text style={[styles.saveText, saving && { opacity: 0.5 }]}>{ru ? "Сохранить" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.groupBlock}>
          <TouchableOpacity onPress={editing ? handlePickAvatar : undefined} style={styles.avatarWrap} activeOpacity={editing ? 0.7 : 1}>
            {avatarUrl ? (
              <ExpoImage source={{ uri: avatarUrl }} contentFit="cover" style={styles.avatar} />
            ) : (
              <Ionicons name="chatbubbles" size={32} color="#94a3b8" />
            )}
            {editing ? (
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera-outline" size={11} color="#fff" />
              </View>
            ) : null}
          </TouchableOpacity>

          <View style={styles.groupMeta}>
            {editing ? (
              <>
                <TextInput
                  style={styles.editNameInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder={ru ? "Название чата" : "Chat name"}
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

        {!isCreator && currentUserId && !editing && !canChat ? (
          <View style={styles.joinRow}>
            {hasPendingRequest ? (
              <TouchableOpacity style={[styles.joinBtn, styles.pendingBtn]} onPress={handleLeave} disabled={acting}>
                <Text style={styles.pendingBtnText}>{ru ? "Запрос отправлен" : "Request sent"}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.joinBtn} onPress={handleRequestJoin} disabled={acting}>
                <Text style={styles.joinBtnText}>{ru ? "Запросить вход" : "Request to join"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color="#ffffff" style={{ marginTop: 32 }} />
        ) : canChat ? (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              ListHeaderComponent={
                <View>
                  {isCreator && pendingMembers.length > 0 ? (
                    <View style={styles.requestsBlock}>
                      <Text style={styles.sectionTitle}>{ru ? "Запросы на вход" : "Join requests"}</Text>
                      {pendingMembers.map((m) => <View key={m.id}>{renderMember(m, true)}</View>)}
                    </View>
                  ) : null}
                  <Text style={styles.sectionTitle}>{ru ? "Чат" : "Chat"}</Text>
                  {loadingMessages ? <ActivityIndicator color="#ffffff" style={{ marginVertical: 16 }} /> : null}
                  {messagesUnavailable ? (
                    <Text style={styles.emptyText}>
                      {ru ? "Чат ещё не настроен на сервере" : "Chat is not configured on the server yet"}
                    </Text>
                  ) : null}
                </View>
              }
              ListEmptyComponent={!loadingMessages && !messagesUnavailable ? (
                <Text style={styles.emptyText}>{ru ? "Сообщений пока нет" : "No messages yet"}</Text>
              ) : null}
              renderItem={({ item }) => {
                const mine = item.user_id === currentUserId;
                const hasImage = !!(item._localUri || item.image);
                return (
                  <View style={[styles.messageRow, mine && styles.messageRowMine]}>
                    <TouchableOpacity
                      activeOpacity={mine ? 0.7 : 1}
                      onLongPress={mine && !item._pending ? () => handleDeleteMessage(item) : undefined}
                      delayLongPress={350}
                      style={[
                        styles.messageBubble,
                        mine ? styles.messageBubbleMine : styles.messageBubbleOther,
                        hasImage ? styles.messageBubbleImage : null,
                      ]}
                    >
                      {!mine ? <Text style={[styles.messageAuthor, hasImage && styles.messagePad]}>{item.username || (ru ? "Участник" : "Member")}</Text> : null}
                      {hasImage ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={item._pending ? undefined : () => openFullscreen(item)}
                          onLongPress={item._pending ? undefined : () => (mine ? handleDeleteMessage(item) : promptSaveImage(item))}
                          delayLongPress={350}
                        >
                          <ExpoImage
                            source={{ uri: messageImageUrl(item) }}
                            contentFit="cover"
                            style={[styles.messageImage, item._pending && { opacity: 0.6 }]}
                          />
                          {item._pending ? (
                            <View style={styles.messageImageSpinner}><ActivityIndicator color="#ffffff" /></View>
                          ) : null}
                        </TouchableOpacity>
                      ) : null}
                      {item.text ? <Text style={[styles.messageText, hasImage && styles.messagePad]}>{item.text}</Text> : null}
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
            <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 8) }]}>
              <TouchableOpacity onPress={handleSendPhoto} disabled={acting} style={styles.attachBtn}>
                <Ionicons name="image-outline" size={22} color={acting ? "#475569" : "#94a3b8"} />
              </TouchableOpacity>
              <TextInput
                style={styles.messageInput}
                value={messageText}
                onChangeText={setMessageText}
                placeholder={ru ? "Сообщение..." : "Message..."}
                placeholderTextColor="#475569"
                multiline
                keyboardAppearance="dark"
              />
              <TouchableOpacity onPress={handleSend} disabled={!messageText.trim() || acting} style={styles.sendBtn}>
                <Ionicons name="send-outline" size={18} color={messageText.trim() ? "#ffffff" : "#64748b"} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <FlatList
            data={approvedMembers}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.membersList}
            ListHeaderComponent={<Text style={styles.sectionTitle}>{ru ? "Участники" : "Members"}</Text>}
            renderItem={({ item }) => renderMember(item)}
            ListEmptyComponent={<Text style={styles.emptyText}>{ru ? "Пока нет участников" : "No members yet"}</Text>}
          />
        )}
      </KeyboardAvoidingView>

      <Modal visible={!!fullscreenImage} transparent animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
        <TouchableOpacity activeOpacity={1} style={styles.fullscreenBackdrop} onPress={() => setFullscreenImage(null)}>
          {fullscreenImage ? (
            <ExpoImage source={{ uri: fullscreenImage }} contentFit="contain" style={styles.fullscreenImage} />
          ) : null}
          <TouchableOpacity style={[styles.fullscreenClose, { top: insets.top + 12 }]} onPress={() => setFullscreenImage(null)}>
            <Ionicons name="close" size={30} color="#ffffff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.settingsBackdrop} onPress={() => setSettingsVisible(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.settingsSheet, { paddingBottom: Math.max(insets.bottom + 18, 28) }]}
            onPress={() => {}}
          >
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>{ru ? "Настройки чата" : "Chat settings"}</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)} style={styles.settingsCloseBtn}>
                <Ionicons name="close" size={22} color="#e6eef8" />
              </TouchableOpacity>
            </View>

            {canChat ? (
              <TouchableOpacity style={styles.settingsActionRow} onPress={handleToggleMute} disabled={acting}>
                <View style={styles.settingsActionIcon}>
                  <Ionicons name={isMuted ? "notifications-off-outline" : "notifications-outline"} size={20} color="#e6eef8" />
                </View>
                <View style={styles.settingsActionTextWrap}>
                  <Text style={styles.settingsActionTitle}>
                    {isMuted ? (ru ? "Включить уведомления" : "Unmute chat") : (ru ? "Отключить уведомления" : "Mute chat")}
                  </Text>
                  <Text style={styles.settingsActionSub}>
                    {isMuted
                      ? (ru ? "Новые сообщения снова будут приходить." : "New message notifications will come back.")
                      : (ru ? "Новые сообщения не будут присылать push." : "New messages will not send push notifications.")}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.settingsActionRow} onPress={() => { setSettingsVisible(false); setMembersVisible(true); }}>
              <View style={styles.settingsActionIcon}>
                <Ionicons name="people-outline" size={20} color="#e6eef8" />
              </View>
              <View style={styles.settingsActionTextWrap}>
                <Text style={styles.settingsActionTitle}>{ru ? "Участники" : "Members"}</Text>
                <Text style={styles.settingsActionSub}>
                  {memberCount} {ru ? "участников" : "members"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>

            {isCreator ? (
              <>
                <TouchableOpacity style={styles.settingsActionRow} onPress={() => { setSettingsVisible(false); setEditing(true); }}>
                  <View style={styles.settingsActionIcon}>
                    <Ionicons name="pencil-outline" size={20} color="#e6eef8" />
                  </View>
                  <View style={styles.settingsActionTextWrap}>
                    <Text style={styles.settingsActionTitle}>{ru ? "Редактировать чат" : "Edit chat"}</Text>
                    <Text style={styles.settingsActionSub}>{ru ? "Название, описание и фото." : "Name, description, and photo."}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsActionRow} onPress={() => { setSettingsVisible(false); handleDelete(); }}>
                  <View style={styles.settingsActionIcon}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </View>
                  <View style={styles.settingsActionTextWrap}>
                    <Text style={[styles.settingsActionTitle, styles.settingsDangerText]}>{ru ? "Удалить чат" : "Delete chat"}</Text>
                    <Text style={styles.settingsActionSub}>{ru ? "Это действие необратимо." : "This cannot be undone."}</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : null}

            {!isCreator && myMemberRecord ? (
              <TouchableOpacity style={styles.settingsActionRow} onPress={handleLeave} disabled={acting}>
                <View style={styles.settingsActionIcon}>
                  <Ionicons name="exit-outline" size={20} color={canChat ? "#ef4444" : "#e6eef8"} />
                </View>
                <View style={styles.settingsActionTextWrap}>
                  <Text style={[styles.settingsActionTitle, canChat && styles.settingsDangerText]}>
                    {canChat ? (ru ? "Выйти из чата" : "Leave chat") : (ru ? "Отменить запрос" : "Cancel request")}
                  </Text>
                  <Text style={styles.settingsActionSub}>
                    {canChat
                      ? (ru ? "Вы больше не будете видеть сообщения." : "You will no longer see messages.")
                      : (ru ? "Запрос на вход будет удалён." : "Your join request will be removed.")}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={membersVisible} animationType="slide" onRequestClose={() => setMembersVisible(false)}>
        <View style={[styles.membersModalContainer, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setMembersVisible(false)} style={styles.backBtn} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color="#e6eef8" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{ru ? "Участники" : "Members"}</Text>
            <View style={styles.headerActions} />
          </View>
          <FlatList
            data={approvedMembers}
            keyExtractor={(i) => i.id}
            contentContainerStyle={[styles.membersList, { paddingBottom: Math.max(insets.bottom + 24, 48) }]}
            renderItem={({ item }) => renderMember(item)}
            ListEmptyComponent={<Text style={styles.emptyText}>{ru ? "Пока нет участников" : "No members yet"}</Text>}
          />
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
    gap: 10,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: 4 },
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
    backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center",
    overflow: "visible",
  },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.colors.primaryDark, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#0f172a",
  },
  groupMeta: { flex: 1 },
  groupDesc: { color: "#94a3b8", fontSize: 14, lineHeight: 20, marginBottom: 6 },
  memberCountText: { color: "#94a3b8", fontSize: 13 },
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
    backgroundColor: theme.colors.primaryDark, borderRadius: theme.radius.control,
    paddingVertical: 11, alignItems: "center",
  },
  leaveBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#334155" },
  pendingBtn: { backgroundColor: "#1e293b" },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  leaveBtnText: { color: "#94a3b8", fontWeight: "700" },
  pendingBtnText: { color: "#cbd5e1", fontWeight: "700" },
  membersList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  membersModalContainer: { flex: 1, backgroundColor: theme.colors.background },
  sectionTitle: { color: "#94a3b8", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  requestsBlock: { marginBottom: 16 },
  memberRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.colors.surface, borderRadius: 10,
    padding: 12, marginBottom: 8, gap: 12,
  },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#0f3460", alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  memberAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  memberNameWrap: { flex: 1 },
  memberNameLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  memberUsername: { color: "#e6eef8", fontSize: 15, fontWeight: "600", flexShrink: 1 },
  memberRole: { color: "#64748b", fontSize: 11, marginTop: 2 },
  requestActions: { flexDirection: "row", gap: 8 },
  approveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.primaryDark, alignItems: "center", justifyContent: "center" },
  rejectBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center" },
  messagesList: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 16 },
  messageRow: { flexDirection: "row", marginBottom: 8 },
  messageRowMine: { justifyContent: "flex-end" },
  messageBubble: { maxWidth: "82%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  messageBubbleMine: { backgroundColor: theme.colors.primaryDark, borderBottomRightRadius: 4 },
  messageBubbleOther: { backgroundColor: "#1e293b", borderBottomLeftRadius: 4 },
  messageAuthor: { color: "#94a3b8", fontSize: 11, fontWeight: "700", marginBottom: 3 },
  messageText: { color: "#e6eef8", fontSize: 14, lineHeight: 19 },
  messageBubbleImage: { padding: 0, overflow: "hidden" },
  messageImage: { width: 220, height: 220 },
  messageImageSpinner: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  messagePad: { paddingHorizontal: 12, paddingVertical: 8 },
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: "#1e293b",
    backgroundColor: theme.colors.background,
  },
  messageInput: {
    flex: 1, minHeight: 42, maxHeight: 110,
    backgroundColor: theme.colors.surface, borderRadius: 14,
    color: "#e6eef8", fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center",
  },
  attachBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
  },
  emptyText: { color: "#94a3b8", textAlign: "center", marginTop: 16 },
  fullscreenBackdrop: { flex: 1, backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  fullscreenImage: { width: "100%", height: "100%" },
  fullscreenClose: { position: "absolute", right: 16, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  settingsBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.72)", justifyContent: "flex-end" },
  settingsSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: "#1e293b",
  },
  settingsHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  settingsTitle: { flex: 1, color: "#e6eef8", fontSize: 17, fontWeight: "800" },
  settingsCloseBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  settingsActionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  settingsActionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface },
  settingsActionTextWrap: { flex: 1 },
  settingsActionTitle: { color: "#e6eef8", fontSize: 15, fontWeight: "700" },
  settingsActionSub: { color: "#94a3b8", fontSize: 12, lineHeight: 17, marginTop: 2 },
  settingsDangerText: { color: "#fca5a5" },
});
