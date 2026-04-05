import React, { createContext, useContext, useState } from 'react';

type AuthContextType = {
  user: any;
  session: any;
  loading: boolean;
  signUp: (email: string, password: string, meta?: { username?: string; name?: string }) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// TODO: Replace with real Supabase auth when ready
const MOCK_USER = {
  id: 'dev-user',
  email: 'dev@rybolov.app',
  user_metadata: { username: 'fisher', full_name: 'Dev User' },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>({ user: MOCK_USER });

  const signUp = async (_email: string, _password: string, _meta?: { username?: string; name?: string }) => {
    return { error: null };
  };

  const signIn = async (_email: string, _password: string) => {
    setSession({ user: MOCK_USER });
    return { error: null };
  };

  const signOut = async () => {
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{
      user: session?.user ?? null,
      session,
      loading: false,
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
