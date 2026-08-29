import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pb, isNetworkError } from "./pocketbase";

type NotificationsModule = typeof import("expo-notifications");
let notificationsModule: NotificationsModule | null = null;
let notificationsConfigured = false;
const PUSH_NOTIFICATIONS_ENABLED_KEY = "@push_notifications_enabled";
const LAST_PUSH_TOKEN_KEY = "@last_push_token";

export async function getPushNotificationsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(PUSH_NOTIFICATIONS_ENABLED_KEY)) !== "false";
}

async function savePushNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (Constants.appOwnership === "expo") {
    return null;
  }

  if (!notificationsModule) {
    try {
      notificationsModule = require("expo-notifications") as NotificationsModule;
    } catch (error) {
      console.warn("expo-notifications native module is unavailable:", error);
      return null;
    }
  }

  if (!notificationsConfigured) {
    notificationsModule.setNotificationHandler({
      handleNotification: async () => {
        const foregrounded = AppState.currentState === "active";
        return {
          shouldPlaySound: !foregrounded,
          shouldSetBadge: true,
          shouldShowBanner: !foregrounded,
          shouldShowList: !foregrounded,
        };
      },
    });
    notificationsConfigured = true;
  }

  return notificationsModule;
}

async function getProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? null;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Constants.appOwnership === "expo") {
    console.warn("Expo Go does not support remote push notifications. Use a development build.");
    return null;
  }

  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;
  const badgePermissionMissing = Platform.OS === "ios" && !existingPermissions.ios?.allowsBadge;
  if (existingPermissions.status !== "granted" || badgePermissionMissing) {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("Push permission not granted");
    return null;
  }

  const projectId = await getProjectId();
  if (!projectId) {
    console.warn("Expo project ID not found");
    return null;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await AsyncStorage.setItem(LAST_PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    console.warn(
      "Failed to get Expo push token. Build a development client with expo-notifications installed.",
      e
    );
    return null;
  }
}

export async function disablePushNotificationsForUser(userId: string): Promise<void> {
  const token = await AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);

  if (token) {
    try {
      const record = await pb.collection("user_push_tokens").getFirstListItem(
        `user_id = "${userId}" && token = "${token.replace(/"/g, '\\"')}"`,
        { requestKey: null },
      );
      await pb.collection("user_push_tokens").delete(record.id, { requestKey: null });
    } catch (e: any) {
      if (e?.status !== 404) throw e;
    }

    // Clear the legacy fallback only when it belongs to this device. Other
    // registered devices continue to receive their own notifications.
    if (pb.authStore.record?.pushToken === token) {
      await pb.collection("users").update(userId, { pushToken: "" }, { requestKey: null });
      pb.authStore.save(pb.authStore.token, { ...pb.authStore.record, pushToken: "" });
    }
  }

  await savePushNotificationsEnabled(false);
}

export async function enablePushNotificationsForUser(userId: string): Promise<string | null> {
  await savePushNotificationsEnabled(true);
  return syncPushTokenForUser(userId);
}

export async function sendPushNotification(token: string, title: string, body: string): Promise<void> {
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default" }),
    });
    const json = await res.json().catch(() => null);
    if (json?.data?.status === "error") {
      console.warn("[push] Expo push error:", json.data.message, "token:", token?.slice(0, 20));
    } else {
      console.log("[push] sent ok to", token?.slice(0, 20));
    }
  } catch (e) {
    console.warn("[push] fetch failed:", e);
  }
}

async function clearRemoteBadgeCount(userId: string): Promise<void> {
  const token = await AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);
  if (!token) return;

  try {
    const record = await pb.collection("user_push_tokens").getFirstListItem(
      `user_id = "${userId}" && token = "${token.replace(/"/g, '\\"')}"`,
      { requestKey: null },
    );
    await pb.collection("user_push_tokens").update(record.id, { badge_count: 0 }, { requestKey: null });
  } catch (e: any) {
    if (e?.status !== 404 && !isNetworkError(e)) {
      console.warn("clearRemoteBadgeCount error:", e);
    }
  }
}

export async function clearDeliveredNotifications(userId?: string): Promise<void> {
  const Notifications = await getNotificationsModule();
  try {
    await Promise.all([
      Notifications
        ? Promise.all([
            Notifications.dismissAllNotificationsAsync(),
            Notifications.setBadgeCountAsync(0),
          ])
        : Promise.resolve(),
      userId ? clearRemoteBadgeCount(userId) : Promise.resolve(),
    ]);
  } catch (e) {
    console.warn("clearDeliveredNotifications error:", e);
  }
}

export async function syncPushTokenForUser(userId: string): Promise<string | null> {
  if (!(await getPushNotificationsEnabled())) return null;

  const token = await registerForPushNotificationsAsync();
  if (!token) {
    console.warn("[syncPushTokenForUser] no token obtained — permissions denied or native push is not configured");
    return null;
  }

  try {
    const platform = Platform.OS;
    try {
      const existing = await pb.collection("user_push_tokens").getFirstListItem(
        `user_id = "${userId}" && token = "${token.replace(/"/g, '\\"')}"`,
        { requestKey: null },
      );
      await pb.collection("user_push_tokens").update(existing.id, { platform, badge_count: 0 }, { requestKey: null });
    } catch (e: any) {
      if (e?.status === 404) {
        await pb.collection("user_push_tokens").create({ user_id: userId, token, platform, badge_count: 0 }, { requestKey: null });
      } else {
        throw e;
      }
    }

    // Legacy fallback for existing hooks/older builds. Multi-device delivery uses user_push_tokens.
    await pb.collection("users").update(userId, { pushToken: token });
    console.log("[syncPushTokenForUser] saved token for", userId);
  } catch (e: any) {
    if (!isNetworkError(e)) console.warn("[syncPushTokenForUser] failed to save token:", e?.status, e?.message);
  }

  return token;
}
