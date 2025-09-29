import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStorage, ref as storageRef, deleteObject } from "firebase/storage";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { firestore } from "./firebase";

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
  // optional fields present in Firestore: lat, lon, geohash, imageUrl, storagePath, userId
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
 * Get a single catch from local storage first, then Firestore as fallback.
 */
export async function getCatch(id: string): Promise<CatchItem | null> {
  try {
    const local = await getCatches();
    const found = local.find((c) => c.id === id);
    if (found) return found;

    // fallback to Firestore
    const docRef = doc(firestore, "catches", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    return mapFirestoreToCatch(snap.id, data);
  } catch (err) {
    console.error("getCatch error:", err);
    return null;
  }
}

/**
 * Update a catch locally and in Firestore (if a doc exists).
 * Keeps fields: description, length, weight, species, image, extraPhotos, date
 */
export async function updateCatch(id: string, p0: { description: string; length: number | undefined; weight: number | undefined; }, item: CatchItem): Promise<void> {
  try {
    // Update local AsyncStorage
    const list = await getCatches();
    const idx = list.findIndex((c) => c.id === item.id);
    if (idx !== -1) {
      list[idx] = item;
    } else {
      list.unshift(item);
    }
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(list));

    // Try update Firestore document if it exists
    const docRef = doc(firestore, "catches", item.id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const payload: any = {
        description: item.description ?? "",
        length: item.length ?? null,
        weight: item.weight ?? null,
        species: item.species ?? null,
        updatedAt: serverTimestamp(),
      };
      // If imageUrl/storagePath present in the Firestore doc, preserve them (don't overwrite with local image field)
      await updateDoc(docRef, payload);
    }
  } catch (err) {
    console.error("updateCatch error:", err);
    throw err;
  }
}

/**
 * Delete catch locally and attempt to delete Firestore doc + storage file if present.
 */
export async function deleteCatch(id: string): Promise<void> {
  try {
    // remove local
    const list = await getCatches();
    const filtered = list.filter((c) => c.id !== id);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(filtered));

    // remove firestore doc if exists
    const docRef = doc(firestore, "catches", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data() as any;
    // if storagePath stored, try delete storage object
    if (data?.storagePath) {
      try {
        const storage = getStorage();
        const sRef = storageRef(storage, data.storagePath);
        await deleteObject(sRef);
      } catch (e) {
        // ignore storage deletion errors but log
        console.warn("deleteCatch: failed to delete storage object:", e);
      }
    }

    // delete firestore doc
    await deleteDoc(docRef);
  } catch (err) {
    console.error("deleteCatch error:", err);
    throw err;
  }
}

/**
 * Helper: map Firestore document data to CatchItem used by UI
 */
function mapFirestoreToCatch(id: string, data: any): CatchItem {
  const createdAt = data?.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString();
  return {
    id,
    image: data.imageUrl ?? data.image ?? "",
    extraPhotos: data.extraPhotos ?? [],
    description: data.description ?? "",
    length: data.length != null ? String(data.length) : "",
    weight: data.weight != null ? String(data.weight) : "",
    species: data.species ?? "",
    date: createdAt,
    // attach raw firestore fields for advanced use
    lat: data.lat ?? null,
    lon: data.lon ?? null,
    geohash: data.geohash ?? null,
    imageUrl: data.imageUrl ?? null,
    storagePath: data.storagePath ?? null,
    userId: data.userId ?? null,
  } as CatchItem;
}

/**
 * OPTIONAL helper: fetch recent Firestore catches
 */
export async function fetchRecentFirestoreCatches(limitCount = 20): Promise<CatchItem[]> {
  try {
    const q = query(collection(firestore, "catches"), orderBy("createdAt", "desc"), limit(limitCount));
    const snaps = await getDocs(q);
    const results: CatchItem[] = [];
    snaps.forEach((d) => {
      const data = d.data();
      results.push(mapFirestoreToCatch(d.id, data));
    });
    return results;
  } catch (err) {
    console.error("fetchRecentFirestoreCatches error:", err);
    return [];
  }
}