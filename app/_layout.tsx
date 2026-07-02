import { AuthProvider, useAuth } from '@/lib/auth';
import { PurchasesProvider } from '@/lib/purchases';
import { LanguageProvider } from '@/lib/language';
import { pb } from '@/lib/pocketbase';
import '@/lib/mapbox';
import { clearDeliveredNotifications } from '@/lib/notifications';
import Toast, { BaseToastProps } from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter, usePathname, useRootNavigationState, Slot } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import '../global.css';

const toastConfig = {
  success: ({ text1 }: BaseToastProps) => (
    <View style={toastStyles.container}>
      <View style={toastStyles.accent} />
      <View style={toastStyles.iconBox}>
        <Ionicons name="checkmark" size={16} color="#4ade80" />
      </View>
      <Text style={toastStyles.text}>{text1}</Text>
    </View>
  ),
};

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
      <Image source={require('../assets/images/logo.png')} style={styles.updateLogo} />
      <Text style={styles.updateTitle}>Update required{'\n'}Требуется обновление</Text>
      <Text style={styles.updateSub}>
        A new version of StrikeFeed is available. Please update to continue.{'\n\n'}
        Доступна новая версия StrikeFeed. Обновите приложение, чтобы продолжить.
      </Text>
      <TouchableOpacity
        style={styles.updateBtn}
        onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=com.strikefeed.myapp')}
      >
        <Text style={styles.updateBtnText}>Update on Google Play</Text>
      </TouchableOpacity>
    </View>
  );
}

function needsUsernameSetup(user: any) {
  if (!user) return false;
  const u = user.username ?? '';
  return !u || /^users?\d+$/.test(u);
}

function useProtectedRoute() {
  const { session, loading, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key) return;
    if (loading) return;
    if (!pathname) return;

    const inAuthGroup = pathname.startsWith('/(auth)') || pathname.startsWith('/login') || pathname.startsWith('/register');
    const onSetupUsername = pathname.includes('setup-username');

    if (session) {
      // Signed in: finish username setup, then keep out of the auth screens.
      if (needsUsernameSetup(user)) {
        if (!onSetupUsername) router.replace('/(auth)/setup-username' as const as any);
      } else if (inAuthGroup) {
        router.replace('/(tabs)' as const as any);
      }
    } else {
      // Guest: free to browse the tabs. Only bounce off the setup screen.
      if (onSetupUsername) router.replace('/(tabs)' as const as any);
    }
  }, [session, loading, pathname, user?.username, navigationState?.key]);
}

function RootNavigator() {
  const { loading } = useAuth();
  const [updateRequired, setUpdateRequired] = useState(false);
  useProtectedRoute();

  useEffect(() => {
    clearDeliveredNotifications();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") clearDeliveredNotifications();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const record = await pb.collection('app_config').getFirstListItem('key = "min_version"', { requestKey: null });
        const minVersion = (record.value as string).trim();
        const currentVersion = Constants.expoConfig?.version ?? (Constants as any).manifest?.version ?? '0.0.0';
        if (compareVersions(currentVersion, minVersion) < 0) {
          setUpdateRequired(true);
        }
      } catch {
        // if config fetch fails, let the user in
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={require('../assets/images/logo.png')} style={{ width: 100, height: 100, resizeMode: 'contain', marginBottom: 24 }} />
        <ActivityIndicator size="small" color="#94a3b8" />
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
      <PurchasesProvider>
        <LanguageProvider>
            <RootNavigator />
            <Toast config={toastConfig} />
        </LanguageProvider>
      </PurchasesProvider>
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
  updateLogo: { width: 100, height: 100, resizeMode: 'contain', marginBottom: 24 },
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

const toastStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#071828',
    borderRadius: 14,
    marginHorizontal: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1a3a52',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    gap: 12,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#4ade80',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#052e16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
});
