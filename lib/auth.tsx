import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { pb, isNetworkError } from './pocketbase';
import { syncCatchesFromPB } from './sync';
import { clearCatches } from './storage';
import { syncPushTokenForUser } from './notifications';

type AuthContextType = {
  user: any;
  session: any;
  loading: boolean;
  signUp: (email: string, password: string, meta?: { username?: string; name?: string }) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
        syncCatchesFromPB(record.id).catch((e) =>
          console.warn('syncCatchesFromPB error:', e)
        );
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

  const signUp = async (email: string, password: string, meta?: { username?: string; name?: string }) => {
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

  const signInWithGoogle = async () => {
    try {
      let cancelFn: ((msg: string) => void) | null = null;
      const cancelPromise = new Promise<never>((_, reject) => {
        cancelFn = (msg) => reject(new Error(msg));
      });
      cancelPromise.catch(() => {});

      const authPromise = pb.collection('users').authWithOAuth2({
        provider: 'google',
        urlCallback: async (url: string) => {
          await WebBrowser.openBrowserAsync(url);
          // Browser closed — give SSE 3s to deliver result, then cancel
          setTimeout(() => cancelFn?.('BROWSER_CLOSED'), 3000);
        },
      });

      await Promise.race([authPromise, cancelPromise]);
      return { error: null };
    } catch (e: any) {
      console.warn('[Google OAuth error]', e?.status, e?.message, JSON.stringify(e?.response));
      if (e?.message === 'BROWSER_CLOSED') return { error: { message: 'CANCELLED' } };
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      if ((e as any)?.isAbort || e?.message?.includes('cancelled') || e?.message?.includes('manually cancelled')) return { error: { message: 'CANCELLED' } };
      return { error: { message: 'GOOGLE_FAILED' } };
    }
  };

  const signOut = async () => {
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
