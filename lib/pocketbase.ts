import AsyncStorage from '@react-native-async-storage/async-storage';
import PocketBase, { AsyncAuthStore } from 'pocketbase';

const store = new AsyncAuthStore({
  save: async (serialized) => AsyncStorage.setItem('@pb_auth', serialized),
  initial: AsyncStorage.getItem('@pb_auth') as any,
  clear: async () => AsyncStorage.removeItem('@pb_auth'),
});

export const pb = new PocketBase(process.env.EXPO_PUBLIC_POCKETBASE_URL ?? 'https://strikefeed.tech', store);

export function isNetworkError(e: any): boolean {
  if (!e || e.isAbort) return false;
  if (e.status === 0) return true;
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('network request failed') || msg.includes('failed to fetch');
}
