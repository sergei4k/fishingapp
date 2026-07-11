import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Local CatchItem shape used by the app UI
 */
export type CatchItem = {
  id: string;
  image?: string;
  extraPhotos?: string[];
  description?: string;
  length?: string;
  weight?: string;
  species?: string;
  date: string; // ISO string
  lat?: number | null;
  lon?: number | null;
  geohash?: string | null;
  [k: string]: any;
};

const LOCAL_KEY = "catches";

/**
 * Read local catches from AsyncStorage
 */
export async function getCatches(): Promise<CatchItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CatchItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("getCatches error:", err);
    return [];
  }
}

/**
 * Get a single catch from local storage
 */
export async function getCatch(id: string): Promise<CatchItem | null> {
  try {
    const local = await getCatches();
    const found = local.find((c) => c.id === id);
    return found ?? null;
  } catch (err) {
    console.error("getCatch error:", err);
    return null;
  }
}

/**
 * Add or update a catch locally
 */
export async function updateCatch(id: string, item: CatchItem): Promise<void> {
  try {
    const list = await getCatches();
    const idx = list.findIndex((c) => c.id === id);
    if (idx !== -1) {
      list[idx] = item;
    } else {
      list.unshift(item);
    }
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("updateCatch error:", err);
    throw err;
  }
}

/**
 * Add a new catch locally
 */
export async function addCatch(item: CatchItem): Promise<void> {
  try {
    const list = await getCatches();
    const idx = list.findIndex((c) => c.id === item.id);
    if (idx !== -1) list[idx] = item;
    else list.unshift(item);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("addCatch error:", err);
    throw err;
  }
}

/**
 * Replace local catches atomically.
 */
export async function replaceCatches(items: CatchItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("replaceCatches error:", err);
    throw err;
  }
}

/**
 * Wipe all local catches (call on sign-out or before syncing a new user)
 */
export async function clearCatches(): Promise<void> {
  await AsyncStorage.removeItem(LOCAL_KEY);
}

/**
 * Delete catch locally
 */
export async function deleteCatch(id: string): Promise<void> {
  try {
    const list = await getCatches();
    const filtered = list.filter((c) => c.id !== id);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error("deleteCatch error:", err);
    throw err;
  }
}
