import { AuthProvider, useAuth } from '@/lib/auth';
import { LanguageProvider } from '@/lib/language';
import { useRouter, useSegments, Slot } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import '../global.css';

function useProtectedRoute() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = (segments[0] as string) === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login' as const as any);
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)' as const as any);
    }
  }, [session, loading, segments]);
}

function RootNavigator() {
  const { loading } = useAuth();
  useProtectedRoute();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#60a5fa" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <RootNavigator />
      </LanguageProvider>
    </AuthProvider>
  );
}
