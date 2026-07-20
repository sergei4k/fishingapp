import AsyncStorage from "@react-native-async-storage/async-storage";
import { pb } from "./pocketbase";

const blockedUsersKey = (userId: string) => `@fishingapp:blocked_users:${userId}`;

export async function getBlockedUserIds(userId?: string | null): Promise<string[]> {
  if (!userId) return [];
  try {
    const local = await AsyncStorage.getItem(blockedUsersKey(userId));
    const localIds = local ? JSON.parse(local) : [];
    const ids = new Set(Array.isArray(localIds) ? localIds.filter((id) => typeof id === "string") : []);

    try {
      const remote = await pb.collection("user_blocks").getFullList({
        filter: `blocker_id = "${userId}"`,
        fields: "blocked_id",
        requestKey: null,
      });
      for (const record of remote) {
        if (record.blocked_id) ids.add(record.blocked_id);
      }
    } catch {}

    const result = [...ids];
    await AsyncStorage.setItem(blockedUsersKey(userId), JSON.stringify(result));
    return result;
  } catch {
    return [];
  }
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (!blockerId || !blockedId || blockerId === blockedId) return;

  let localIds: unknown = [];
  try {
    const local = await AsyncStorage.getItem(blockedUsersKey(blockerId));
    localIds = local ? JSON.parse(local) : [];
  } catch {}

  const current = new Set(Array.isArray(localIds) ? localIds.filter((id) => typeof id === "string") : []);
  current.add(blockedId);
  await AsyncStorage.setItem(blockedUsersKey(blockerId), JSON.stringify([...current]));

  void (async () => {
    try {
      const existing = await pb.collection("user_blocks").getList(1, 1, {
        filter: `blocker_id = "${blockerId}" && blocked_id = "${blockedId}"`,
        requestKey: null,
      });
      if (existing.totalItems === 0) {
        await pb.collection("user_blocks").create({
          blocker_id: blockerId,
          blocked_id: blockedId,
        }, { requestKey: null });
      }
    } catch {}
  })();
}

export async function unblockUser(blockerId: string, blockedId: string) {
  if (!blockerId || !blockedId) return;

  let localIds: unknown = [];
  try {
    const local = await AsyncStorage.getItem(blockedUsersKey(blockerId));
    localIds = local ? JSON.parse(local) : [];
  } catch {}

  const current = new Set(Array.isArray(localIds) ? localIds.filter((id) => typeof id === "string") : []);
  current.delete(blockedId);
  await AsyncStorage.setItem(blockedUsersKey(blockerId), JSON.stringify([...current]));

  void (async () => {
    try {
      const records = await pb.collection("user_blocks").getFullList({
        filter: `blocker_id = "${blockerId}" && blocked_id = "${blockedId}"`,
        fields: "id",
        requestKey: null,
      });
      await Promise.all(records.map((record) => pb.collection("user_blocks").delete(record.id, { requestKey: null })));
    } catch {}
  })();
}

export async function reportContent(input: {
  reporterId: string;
  reportedUserId?: string | null;
  catchId?: string | null;
  commentId?: string | null;
  reason: string;
  details?: string;
}) {
  const payload: Record<string, string> = {
    reporter_id: input.reporterId,
    reason: input.reason,
    details: input.details ?? "",
    status: "open",
  };
  if (input.reportedUserId) payload.reported_user_id = input.reportedUserId;
  if (input.catchId) payload.catch_id = input.catchId;
  if (input.commentId) payload.comment_id = input.commentId;

  await pb.collection("content_reports").create(payload, { requestKey: null });
}
