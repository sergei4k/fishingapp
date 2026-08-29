import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { pb, isNetworkError } from './pocketbase';
import { syncCatchesFromPB, pushPendingCatches } from './sync';
import { clearCatches } from './storage';
import { syncPushTokenForUser } from './notifications';

type AuthContextType = {
  user: any;
  session: any;
  loading: boolean;
  signUp: (email: string, password: string, meta?: { username?: string; name?: string; language?: "ru" | "en" }) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithYandex: () => Promise<{ error: any }>;
  signInWithApple: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const APPLE_SIGN_IN_TIMEOUT_MS = 30_000;
const OAUTH_SIGN_IN_TIMEOUT_MS = 120_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const syncedUserIdRef = useRef<string | null>(null);
  const syncedPushTokenUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      const record = pb.authStore.record ?? null;
      setUser(record);
      setLoading(false);

      if (record?.id && record.id !== syncedUserIdRef.current) {
        syncedUserIdRef.current = record.id;
        // Pull server catches, then push anything that was saved locally while
        // offline / unauthenticated so it actually reaches the backend.
        syncCatchesFromPB(record.id)
          .then(() => pushPendingCatches(record.id))
          .catch((e) => console.warn('catch sync error:', e));
      }

      if (record?.id && record.id !== syncedPushTokenUserIdRef.current) {
        syncedPushTokenUserIdRef.current = record.id;
        syncPushTokenForUser(record.id).catch((e) =>
          console.warn('syncPushTokenForUser error:', e)
        );
      }
    }, true);

    return () => unsub();
  }, []);

  // Keep the session alive: refresh the token on startup so it doesn't silently
  // expire and kick the user out (which used to also strand their unsynced
  // catches). Never log out on a network error — that just means we're offline.
  useEffect(() => {
    (async () => {
      if (pb.authStore.isValid && pb.authStore.record) {
        try {
          await pb.collection('users').authRefresh();
        } catch (e: any) {
          if (!isNetworkError(e) && (e?.status === 401 || e?.status === 403)) {
            pb.authStore.clear();
          }
        }
      }
    })();
  }, []);

  // When the app returns to the foreground, retry uploading any offline catches.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pb.authStore.record?.id) {
        pushPendingCatches(pb.authStore.record.id).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const signUp = async (email: string, password: string, meta?: { username?: string; name?: string; language?: "ru" | "en" }) => {
    // Drop realtime before the auth token changes to avoid PB 403
    // "current and previous request authorization don't match".
    pb.realtime.unsubscribe().catch(() => {});
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 20000)
    );
    timeout.catch(() => {});
    const createUser = () => Promise.race([
      pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name: meta?.name ?? '',
        username: meta?.username?.toLowerCase() ?? '',
        language: meta?.language ?? 'ru',
        onboarding_pending: true,
      }),
      timeout,
    ]);
    try {
      try {
        await createUser();
      } catch (e: any) {
        if (!isNetworkError(e)) throw e;
        await new Promise(r => setTimeout(r, 1000));
        await createUser();
      }
      await pb.collection('users').authWithPassword(email, password);
      return { error: null };
    } catch (e: any) {
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      if (e?.message === 'TIMEOUT') return { error: { message: 'OFFLINE' } };
      const data = (e as any)?.response?.data;
      if (data?.email?.code === 'validation_not_unique') return { error: { message: 'EMAIL_TAKEN' } };
      if (data?.username?.code === 'validation_not_unique') return { error: { message: 'USERNAME_TAKEN' } };
      const status = e?.status ?? e?.response?.status;
      const serverMsg = e?.response?.message ?? e?.message ?? '';
      return { error: { message: `ERR_${status ?? 'UNKNOWN'}: ${serverMsg}` } };
    }
  };

  const signIn = async (email: string, password: string) => {
    pb.realtime.unsubscribe().catch(() => {});
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 20000)
    );
    timeout.catch(() => {});
    const attempt = () => Promise.race([
      pb.collection('users').authWithPassword(email, password),
      timeout,
    ]);
    try {
      let lastNetworkErr: any = null;
      for (let i = 0; i < 3; i++) {
        try {
          await attempt();
          return { error: null };
        } catch (e: any) {
          if (!isNetworkError(e)) throw e;
          lastNetworkErr = e;
          await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        }
      }
      throw lastNetworkErr;
    } catch (e: any) {
      if (e?.message === 'TIMEOUT' || isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      return { error: { message: 'WRONG_PASSWORD' } };
    }
  };

  const signInWithOAuthProvider = async (provider: "google" | "yandex") => {
    pb.realtime.unsubscribe().catch(() => {});
    try {
      const authPromise = pb.collection('users').authWithOAuth2({
        provider,
        urlCallback: async (url: string) => {
          await WebBrowser.openBrowserAsync(url);
        },
      });

      // Android resolves openBrowserAsync as soon as Chrome Custom Tabs opens,
      // not after the user completes Google OAuth. PocketBase receives the
      // completed sign-in through its realtime callback, so it needs time to
      // wait for that result instead of treating the browser as closed.
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('OAUTH_TIMEOUT')), OAUTH_SIGN_IN_TIMEOUT_MS);
      });

      try {
        await Promise.race([authPromise, timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      return { error: null };
    } catch (e: any) {
      console.warn(`[${provider} OAuth error]`, e?.status, e?.message, JSON.stringify(e?.response));
      if (e?.message === 'OAUTH_TIMEOUT') return { error: { message: `${provider.toUpperCase()}_FAILED` } };
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      if ((e as any)?.isAbort || e?.message?.includes('cancelled') || e?.message?.includes('manually cancelled')) return { error: { message: 'CANCELLED' } };
      return { error: { message: `${provider.toUpperCase()}_FAILED` } };
    }
  };

  const signInWithGoogle = () => signInWithOAuthProvider("google");
  const signInWithYandex = () => signInWithOAuthProvider("yandex");

  // Native "Sign in with Apple". The device returns an authorization code, which
  // we hand to our pb_hook (POST /apple-signin). The hook verifies it with Apple
  // server-side and returns a PocketBase { token, record }; saving it into the
  // authStore updates React state via the onChange subscription above.
  const signInWithApple = async () => {
    pb.realtime.unsubscribe().catch(() => {});
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!cred.authorizationCode) return { error: { message: 'APPLE_FAILED' } };

      // fullName is only populated on the very first authorization — capture it.
      const fullName = cred.fullName
        ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(' ').trim()
        : '';

      // The native Apple sheet has already completed at this point. Always
      // bound the server exchange so the Continue button cannot leave the
      // screen in a permanent loading state when the network stalls.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), APPLE_SIGN_IN_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${pb.baseURL}/apple-signin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: cred.authorizationCode, fullName }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn('[Apple sign-in] backend rejected', res.status, detail);
        return { error: { message: 'APPLE_FAILED' } };
      }

      const data = await res.json();
      if (!data?.token || !data?.record) return { error: { message: 'APPLE_FAILED' } };
      pb.authStore.save(data.token, data.record);
      return { error: null };
    } catch (e: any) {
      // expo-apple-authentication throws ERR_REQUEST_CANCELED when the user backs out.
      if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') {
        return { error: { message: 'CANCELLED' } };
      }
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      console.warn('[Apple sign-in error]', e?.code, e?.message);
      return { error: { message: 'APPLE_FAILED' } };
    }
  };

  const signOut = async () => {
    pb.realtime.unsubscribe().catch(() => {});
    // Best-effort: get any offline catches onto the server before we wipe local
    // data, so a deliberate sign-out doesn't discard unsynced work.
    try {
      if (pb.authStore.record?.id) await pushPendingCatches(pb.authStore.record.id);
    } catch {}
    syncedUserIdRef.current = null;
    syncedPushTokenUserIdRef.current = null;
    await clearCatches();
    pb.authStore.clear();
  };

  return (
    <AuthContext.Provider value={{
      user,
      session: user ? { user } : null,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithYandex,
      signInWithApple,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

// Guard for actions that require an account. Returns true if signed in;
// otherwise routes a guest to the login screen and returns false.
// Usage: if (!requireAuth()) return;
export function useRequireAuth() {
  const { user } = useAuth();
  return useCallback((): boolean => {
    if (user) return true;
    router.push('/(auth)/login' as any);
    return false;
  }, [user]);
}
