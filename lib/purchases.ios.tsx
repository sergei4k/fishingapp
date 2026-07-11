import React, { createContext, useContext } from "react";

export const PRO_ENTITLEMENT = "pro";

type PurchasesContextType = {
  ready: boolean;
  enabled: boolean;
  isPro: boolean;
  packages: never[];
  purchase: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  presentPaywall: () => Promise<boolean>;
  manageSubscription: () => Promise<void>;
  refresh: () => Promise<void>;
};

const PurchasesContext = createContext<PurchasesContextType | undefined>(undefined);

const value: PurchasesContextType = {
  ready: true,
  enabled: false,
  isPro: true,
  packages: [],
  purchase: async () => false,
  restore: async () => false,
  presentPaywall: async () => false,
  manageSubscription: async () => {},
  refresh: async () => {},
};

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  return (
    <PurchasesContext.Provider value={value}>
      {children}
    </PurchasesContext.Provider>
  );
}

export function usePurchases() {
  const context = useContext(PurchasesContext);
  if (!context) throw new Error("usePurchases must be used within PurchasesProvider");
  return context;
}
