import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { pb } from './pocketbase';
import { syncCatchesFromPB } from './sync';

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
        username: meta?.username ?? '',
      });
      // Auto sign in after register
      await pb.collection('users').authWithPassword(email, password);
      return { error: null };
    } catch (e: any) {
      return { error: { message: e?.response?.message ?? e?.message ?? 'Registration failed' } };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password);
      return { error: null };
    } catch (e: any) {
      return { error: { message: e?.response?.message ?? e?.message ?? 'Login failed' } };
    }
  };

  const signOut = async () => {
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
