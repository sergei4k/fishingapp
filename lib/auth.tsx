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

      // Sync once per user session
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
    try {
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name: meta?.name ?? '',
        username: meta?.username?.toLowerCase() ?? '',
      });
      await pb.collection('users').authWithPassword(email, password);
      return { error: null };
    } catch (e: any) {
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      const data = (e as any)?.response?.data;
      if (data?.email?.code === 'validation_not_unique') return { error: { message: 'EMAIL_TAKEN' } };
      if (data?.username?.code === 'validation_not_unique') return { error: { message: 'USERNAME_TAKEN' } };
      return { error: { message: e?.response?.message ?? e?.message ?? 'Registration failed' } };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password);
      return { error: null };
    } catch (e: any) {
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      return { error: { message: 'WRONG_PASSWORD' } };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const redirectUrl = 'fishingapp://oauth2';
      await pb.collection('users').authWithOAuth2({
        provider: 'google',
        urlCallback: async (url: string) => {
          const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
          if (result.type !== 'success') throw new Error('CANCELLED');
          return result.url;
        },
      });
      return { error: null };
    } catch (e: any) {
      if (e?.message === 'CANCELLED') return { error: { message: 'CANCELLED' } };
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      return { error: { message: 'WRONG_PASSWORD' } };
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
