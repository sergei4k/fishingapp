import AsyncStorage from '@react-native-async-storage/async-storage';
import PocketBase, { AsyncAuthStore } from 'pocketbase';

const store = new AsyncAuthStore({
  save: async (serialized) => AsyncStorage.setItem('@pb_auth', serialized),
  initial: AsyncStorage.getItem('@pb_auth') as any,
  clear: async () => AsyncStorage.removeItem('@pb_auth'),
});

export const pb = new PocketBase(process.env.EXPO_PUBLIC_POCKETBASE_URL ?? 'https://rybolov.duckdns.org', store);
