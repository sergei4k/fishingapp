import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { pb } from './pocketbase';
import { pushPendingCatches } from './sync';

// NetInfo is a native module. If the app binary hasn't been rebuilt since it was
// added, requiring/using it can fail — so load it defensively and degrade to
// "assume online" rather than crashing the whole app (which would strip the
// provider tree and surface as unrelated errors like "useLanguage outside
// LanguageProvider").
let NetInfo: any = null;
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch (e) {
  console.warn('NetInfo unavailable (needs a native rebuild):', e);
}

type NetworkContextType = {
  // true when we have a usable internet connection. Starts optimistic (true) so
  // we never flash "offline" on a cold start before NetInfo reports in.
  isOnline: boolean;
};

const NetworkContext = createContext<NetworkContextType>({ isOnline: true });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const wasOnline = useRef(true);

  useEffect(() => {
    if (!NetInfo?.addEventListener) return;
    let unsubscribe = () => {};
    try {
      unsubscribe = NetInfo.addEventListener((state: any) => {
        // Treat only an explicit "no" as offline; `isInternetReachable` is null
        // while it's still probing, and we don't want to flag offline on that.
        const online =
          state.isConnected !== false && state.isInternetReachable !== false;
        setIsOnline(online);

        // Just came back online — flush any catches saved while offline.
        if (online && !wasOnline.current) {
          const userId = pb.authStore.record?.id;
          if (userId) pushPendingCatches(userId).catch(() => {});
        }
        wasOnline.current = online;
      });
    } catch (e) {
      console.warn('NetInfo subscribe failed:', e);
    }
    return () => {
      try { unsubscribe(); } catch {}
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
