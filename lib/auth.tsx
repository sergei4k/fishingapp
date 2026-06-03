import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
      if (meta?.username) {
        const existing = await pb.collection('users').getList(1, 1, {
          filter: `username = "${meta.username.toLowerCase()}"`,
        });
        if (existing.totalItems > 0) {
          return { error: { message: 'USERNAME_TAKEN' } };
        }
      }
      const emailExists = await pb.collection('users').getList(1, 1, {
        filter: `email = "${email.trim().toLowerCase()}"`,
      });
      if (emailExists.totalItems > 0) {
        return { error: { message: 'EMAIL_TAKEN' } };
      }
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name: meta?.name ?? '',
        username: meta?.username?.toLowerCase() ?? '',
      });
      // Auto sign in after register
      await pb.collection('users').authWithPassword(email, password);
      return { error: null };
    } catch (e: any) {
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      return { error: { message: e?.response?.message ?? e?.message ?? 'Registration failed' } };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password);
      return { error: null };
    } catch (e: any) {
      if (isNetworkError(e)) return { error: { message: 'OFFLINE' } };
      if (e?.status === 400) return { error: { message: 'WRONG_PASSWORD' } };
      return { error: { message: e?.response?.message ?? e?.message ?? 'Login failed' } };
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
