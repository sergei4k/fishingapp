import { AuthProvider, useAuth } from '@/lib/auth';
import { LanguageProvider } from '@/lib/language';
import { pb } from '@/lib/pocketbase';
import Constants from 'expo-constants';
import { useRouter, useSegments, Slot } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import '../global.css';

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb_ = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb_[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function UpdateRequired() {
  return (
    <View style={styles.updateScreen}>
      <Text style={styles.updateEmoji}>🎣</Text>
      <Text style={styles.updateTitle}>Требуется обновление</Text>
      <Text style={styles.updateSub}>Доступна новая версия StrikeFeed. Обновите приложение, чтобы продолжить.</Text>
      <TouchableOpacity
        style={styles.updateBtn}
        onPress={() => Linking.openURL('https://www.rustore.ru/catalog/app/com.rybolov.app')}
      >
        <Text style={styles.updateBtnText}>Обновить в RuStore</Text>
      </TouchableOpacity>
    </View>
  );
}

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
  const [updateRequired, setUpdateRequired] = useState(false);
  const [versionChecked, setVersionChecked] = useState(false);
  useProtectedRoute();

  useEffect(() => {
    (async () => {
      try {
        const record = await pb.collection('app_config').getFirstListItem('key = "min_version"', { requestKey: null });
        const minVersion = record.value as string;
        const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
        if (compareVersions(currentVersion, minVersion) < 0) {
          setUpdateRequired(true);
        }
      } catch {
        // if config fetch fails, let the user in
      } finally {
        setVersionChecked(true);
      }
    })();
  }, []);

  if (loading || !versionChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#60a5fa" />
      </View>
    );
  }

  if (updateRequired) {
    return <UpdateRequired />;
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

const styles = StyleSheet.create({
  updateScreen: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  updateEmoji: { fontSize: 64, marginBottom: 24 },
  updateTitle: { color: '#e6eef8', fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  updateSub: { color: '#64748b', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 36 },
  updateBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 32,
  },
  updateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
