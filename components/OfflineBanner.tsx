import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { useNetwork } from '@/lib/network';
import { useLanguage } from '@/lib/language';

/**
 * Thin strip pinned to the top of the screen, shown only while offline. Makes it
 * unambiguous that online features (sync, feed, uploads) are paused and that
 * anything the user adds is stored on-device until they reconnect.
 */
export default function OfflineBanner() {
  const { isOnline } = useNetwork();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]} pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={15} color="#fbbf24" />
      <Text style={styles.text}>
        {language === 'ru'
          ? 'Нет сети — онлайн-функции недоступны. Уловы сохранятся на телефоне и загрузятся, когда появится интернет.'
          : "You're offline — online features are paused. Catches are saved on your phone and upload when you reconnect."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingBottom: 7,
    paddingHorizontal: 14,
    backgroundColor: '#1c1917',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3f3f46',
  },
  text: {
    color: '#e7c07b',
    fontSize: 12.5,
    fontWeight: '600',
    flexShrink: 1,
  },
});
