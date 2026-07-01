import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
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
const API_KEY = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;

type PurchasesContextType = {
  ready: boolean;
  enabled: boolean;
  isPro: boolean;
  packages: PurchasesPackage[];
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
  presentPaywall: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

const PurchasesContext = createContext<PurchasesContextType | undefined>(undefined);

let configured = false;

function hasProEntitlement(info: CustomerInfo | null): boolean {
  return !!info?.entitlements.active[PRO_ENTITLEMENT];
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
  try {
    await pb.collection("users").update(rec.id, { badges: next });
    pb.authStore.save(pb.authStore.token, { ...rec, badges: next });
  } catch (e) {
    console.warn("[purchases] verified badge grant failed:", e);
  }
}

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [entitled, setEntitled] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const loggedInUserRef = useRef<string | null>(null);

  // Premium = an active RevenueCat entitlement OR the "verified" badge
  // (manually granted, e.g. admin/partner accounts). The badge is the marker.
  const hasVerifiedBadge = parseBadges(user?.badges).includes("verified");
  const isPro = entitled || hasVerifiedBadge;

  const disabled = IS_EXPO_GO || !API_KEY;

  // Configure the SDK once.
  useEffect(() => {
    if (disabled || configured) {
      if (disabled) setReady(true);
      return;
    }
    try {
      Purchases.configure({ apiKey: API_KEY });
      configured = true;
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
      return hasProEntitlement(customerInfo);
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
    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: PRO_ENTITLEMENT,
      });
      await refresh();
      return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
    } catch (e) {
      console.warn("[purchases] presentPaywall failed:", e);
      return false;
    }
  }, [disabled, refresh]);

  return (
    <PurchasesContext.Provider
      value={{ ready, enabled: !disabled, isPro, packages, purchase, restore, presentPaywall, refresh }}
    >
      {children}
    </PurchasesContext.Provider>
  );
}

export function usePurchases() {
  const context = useContext(PurchasesContext);
  if (!context) throw new Error("usePurchases must be used within PurchasesProvider");
  return context;
}
