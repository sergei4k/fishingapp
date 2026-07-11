import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter, Modal, Platform, StatusBar, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import * as SystemUI from "expo-system-ui";
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "./auth";
import { pb } from "./pocketbase";
import { parseBadges } from "./badges";

// The entitlement identifier configured in the RevenueCat dashboard.
export const PRO_ENTITLEMENT = "pro";

// Public SDK keys per platform (RevenueCat → Project → API keys).
// Android is "goog_...", iOS is "appl_...". Set via EAS env / .env.
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

const IS_EXPO_GO = Constants.appOwnership === "expo";
const IOS_PAYMENTS_DISABLED = Platform.OS === "ios";
const API_KEY = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
const APP_DARK_BG = "#0f172a";

async function setAndroidPaywallChrome(): Promise<void> {
  if (Platform.OS !== "android") return;
  StatusBar.setBarStyle("light-content");
  StatusBar.setBackgroundColor(APP_DARK_BG, true);
  StatusBar.setTranslucent(true);
  try {
    await SystemUI.setBackgroundColorAsync(APP_DARK_BG);
  } catch {}
}

type PurchasesContextType = {
  ready: boolean;
  enabled: boolean;
  isPro: boolean;
  packages: PurchasesPackage[];
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
  presentPaywall: () => Promise<boolean>;
  manageSubscription: () => Promise<void>;
  refresh: () => Promise<void>;
};

const PurchasesContext = createContext<PurchasesContextType | undefined>(undefined);

let configured = false;

function hasProEntitlement(info: CustomerInfo | null): boolean {
  if (!info) return false;
  // Prefer the configured "pro" entitlement, but fall back to ANY active
  // subscription. We only sell Pro, so this keeps premium working even if the
  // product↔entitlement mapping in the RevenueCat dashboard is missing/lagging.
  if (info.entitlements.active[PRO_ENTITLEMENT]) return true;
  return (info.activeSubscriptions?.length ?? 0) > 0;
}

// The "verified" badge IS the premium marker: purchasing grants it. We only
// ever ADD it on entitlement — never auto-remove, so manually-verified/admin
// accounts keep premium and lapsed purchases don't silently strip the badge.
// (Downgrades on cancellation should be handled server-side via webhook.)
async function grantVerifiedBadge(): Promise<void> {
  const rec = pb.authStore.record;
  if (!rec?.id) return;
  const current = parseBadges(rec.badges);
  if (current.includes("verified")) return; // already granted
  const next = [...current, "verified"];
  // Reflect verified LOCALLY first so the checkmark appears immediately with no
  // refresh — pb.authStore.save fires authStore.onChange -> user state updates
  // synchronously, so profile/settings re-render right away.
  pb.authStore.save(pb.authStore.token, { ...rec, badges: next });
  // Broadcast so cached feed/profile lists patch this user's badges live too.
  DeviceEventEmitter.emit("verifiedBadgeGranted", rec.id);
  // Best-effort server write. The badges field is typically write-protected for
  // clients, so this may 403 — real persistence is the RevenueCat webhook's job.
  try {
    await pb.collection("users").update(rec.id, { badges: next });
  } catch (e) {
    console.warn("[purchases] verified badge server write failed (kept locally):", e);
  }
}

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [entitled, setEntitled] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const paywallResolverRef = useRef<((purchased: boolean) => void) | null>(null);
  const paywallPurchasedRef = useRef(false);
  const loggedInUserRef = useRef<string | null>(null);

  // Premium = an active RevenueCat entitlement OR the "verified" badge
  // (manually granted, e.g. admin/partner accounts). The badge is the marker.
  const hasVerifiedBadge = parseBadges(user?.badges).includes("verified");
  const isPro = IOS_PAYMENTS_DISABLED || entitled || hasVerifiedBadge;

  const disabled = IOS_PAYMENTS_DISABLED || IS_EXPO_GO || !API_KEY;

  // Configure the SDK once.
  useEffect(() => {
    if (disabled || configured) {
      if (disabled) setReady(true);
      return;
    }
    try {
      Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
      Purchases.configure({ apiKey: API_KEY });
      configured = true;
      console.log("[purchases] configured", Platform.OS, "key:", API_KEY.slice(0, 12));
      setReady(true);
    } catch (e) {
      console.warn("[purchases] configure failed:", e);
      setReady(true);
    }
  }, [disabled]);

  const applyInfo = useCallback((info: CustomerInfo | null) => {
    const pro = hasProEntitlement(info);
    setEntitled(pro);
    if (!disabled && pro) grantVerifiedBadge();
  }, [disabled]);

  const loadOfferings = useCallback(async () => {
    if (disabled) return;
    try {
      const offerings = await Purchases.getOfferings();
      setPackages(offerings.current?.availablePackages ?? []);
      console.log("[purchases] offering:", offerings.current?.identifier ?? "(none)",
        "packages:", offerings.current?.availablePackages?.length ?? 0);
    } catch (e) {
      console.warn("[purchases] getOfferings failed:", e);
    }
  }, [disabled]);

  const refresh = useCallback(async () => {
    if (disabled) return;
    try {
      const info = await Purchases.getCustomerInfo();
      applyInfo(info);
    } catch (e) {
      console.warn("[purchases] getCustomerInfo failed:", e);
    }
  }, [disabled, applyInfo]);

  // Tie RevenueCat identity to the signed-in account so entitlements follow
  // the user across devices and survive reinstalls.
  useEffect(() => {
    if (disabled || !ready) return;
    const uid = user?.id ?? null;
    if (uid === loggedInUserRef.current) return;
    loggedInUserRef.current = uid;
    (async () => {
      try {
        if (uid) {
          const { customerInfo } = await Purchases.logIn(uid);
          console.log("[purchases] logIn", uid, "active entitlements:",
            Object.keys(customerInfo.entitlements.active));
          applyInfo(customerInfo);
        } else {
          await Purchases.logOut().catch(() => {});
          setEntitled(false);
        }
        await loadOfferings();
      } catch (e) {
        console.warn("[purchases] identity sync failed:", e);
      }
    })();
  }, [disabled, ready, user?.id, applyInfo, loadOfferings]);

  // Live entitlement updates (e.g. renewals, purchases elsewhere).
  useEffect(() => {
    if (disabled || !ready) return;
    Purchases.addCustomerInfoUpdateListener(applyInfo);
    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(applyInfo);
      } catch {}
    };
  }, [disabled, ready, applyInfo]);

  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    if (disabled) return false;
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      applyInfo(customerInfo);
      // purchasePackage resolving without throwing == a completed purchase,
      // so grant premium directly (don't depend on entitlement propagation).
      setEntitled(true);
      await grantVerifiedBadge();
      return true;
    } catch (e: any) {
      if (!e?.userCancelled) console.warn("[purchases] purchase failed:", e);
      return false;
    }
  }, [disabled, applyInfo]);

  const restore = useCallback(async (): Promise<boolean> => {
    if (disabled) return false;
    try {
      const info = await Purchases.restorePurchases();
      applyInfo(info);
      return hasProEntitlement(info);
    } catch (e) {
      console.warn("[purchases] restore failed:", e);
      return false;
    }
  }, [disabled, applyInfo]);

  const presentPaywall = useCallback(async (): Promise<boolean> => {
    if (disabled) return false;
    const info = await Purchases.getCustomerInfo().catch(() => null);
    if (hasProEntitlement(info)) {
      applyInfo(info);
      return false;
    }
    if (paywallVisible) return false;
    paywallPurchasedRef.current = false;
    await setAndroidPaywallChrome();
    return new Promise<boolean>((resolve) => {
      paywallResolverRef.current = resolve;
      setPaywallVisible(true);
    });
  }, [disabled, applyInfo, paywallVisible]);

  const closePaywall = useCallback(async (purchased = paywallPurchasedRef.current) => {
    setPaywallVisible(false);
    paywallResolverRef.current?.(purchased);
    paywallResolverRef.current = null;
    await refresh();
  }, [refresh]);

  // Opens the store's native manage-subscriptions screen (Google Play / App
  // Store), where the user can cancel. In-app cancellation isn't permitted.
  const manageSubscription = useCallback(async (): Promise<void> => {
    if (disabled) return;
    try {
      await Purchases.showManageSubscriptions();
    } catch (e) {
      console.warn("[purchases] showManageSubscriptions failed:", e);
    }
  }, [disabled]);

  return (
    <PurchasesContext.Provider
      value={{ ready, enabled: !disabled, isPro, packages, purchase, restore, presentPaywall, manageSubscription, refresh }}
    >
      {children}
      <Modal
        visible={paywallVisible}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => closePaywall(false)}
      >
        <View style={[styles.paywallModal, { paddingTop: Platform.OS === "android" ? insets.top : 0 }]}>
          <RevenueCatUI.Paywall
            style={styles.paywall}
            onPurchaseCompleted={async ({ customerInfo }) => {
              paywallPurchasedRef.current = true;
              applyInfo(customerInfo);
              setEntitled(true);
              await grantVerifiedBadge();
              await closePaywall(true);
            }}
            onRestoreCompleted={async ({ customerInfo }) => {
              const restored = hasProEntitlement(customerInfo);
              paywallPurchasedRef.current = restored;
              applyInfo(customerInfo);
              if (restored) {
                setEntitled(true);
                await grantVerifiedBadge();
                await closePaywall(true);
              }
            }}
            onDismiss={() => closePaywall()}
          />
        </View>
      </Modal>
    </PurchasesContext.Provider>
  );
}

export function usePurchases() {
  const context = useContext(PurchasesContext);
  if (!context) throw new Error("usePurchases must be used within PurchasesProvider");
  return context;
}

const styles = StyleSheet.create({
  paywallModal: {
    flex: 1,
    backgroundColor: APP_DARK_BG,
  },
  paywall: {
    flex: 1,
    backgroundColor: APP_DARK_BG,
  },
});
