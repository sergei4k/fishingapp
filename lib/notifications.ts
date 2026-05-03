import Constants from "expo-constants";
import { Platform } from "react-native";
import { pb } from "./pocketbase";

type NotificationsModule = typeof import("expo-notifications");
let notificationsModule: NotificationsModule | null = null;
let notificationsConfigured = false;

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
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
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

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
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
    return token;
  } catch (e) {
    console.warn(
      "Failed to get Expo push token. Build a development client with expo-notifications installed.",
      e
    );
    return null;
  }
}

export async function syncPushTokenForUser(userId: string): Promise<string | null> {
  const token = await registerForPushNotificationsAsync();
  if (!token) {
    try {
      await pb.collection("users").update(userId, { pushToken: null });
    } catch (e) {
      console.warn("Failed to clear push token:", e);
    }
    return null;
  }

  try {
    await pb.collection("users").update(userId, { pushToken: token });
  } catch (e) {
    console.warn("Failed to save push token:", e);
  }

  return token;
}
