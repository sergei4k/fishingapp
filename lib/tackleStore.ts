import AsyncStorage from "@react-native-async-storage/async-storage";

import { isNetworkError, pb } from "./pocketbase";
import {
  buildTackleDraft,
  findMatchingTackleItem,
  mergeTackleItems,
  type TackleDraft,
  type TackleItem,
  type TackleKind,
} from "./tackle";

const TACKLE_KEY = "tackle_library";

type TackleCache = Record<string, TackleItem[]>;

async function readCache(): Promise<TackleCache> {
  try {
    const raw = await AsyncStorage.getItem(TACKLE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TackleCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn("readCache error:", err);
    return {};
  }
}

async function writeCache(cache: TackleCache): Promise<void> {
  try {
    await AsyncStorage.setItem(TACKLE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn("writeCache error:", err);
  }
}

async function getCachedTackle(userId: string): Promise<TackleItem[]> {
  const cache = await readCache();
  return Array.isArray(cache[userId]) ? cache[userId] : [];
}

async function setCachedTackle(userId: string, items: TackleItem[]): Promise<void> {
  const cache = await readCache();
  cache[userId] = items;
  await writeCache(cache);
}

function toTackleItem(record: any): TackleItem | null {
  if (!record?.id) return null;
  const kind: TackleKind = record.kind === "reel" ? "reel" : "rod";
  const draft = buildTackleDraft(kind, {
    name: record.name,
    model: record.model,
    manufacturer: record.manufacturer,
  });
  return draft ? { id: record.id, ...draft } : null;
}

async function fetchServerTackle(userId: string): Promise<TackleItem[]> {
  const records = await pb.collection("tackle").getFullList({
    filter: pb.filter("user_id = {:userId}", { userId }),
    fields: "id,kind,name,model,manufacturer",
    requestKey: null,
  });
  return records
    .map(toTackleItem)
    .filter((item): item is TackleItem => item !== null);
}

/**
 * Upload rods and reels created while offline, swapping their temporary local id
 * for the PocketBase id. Failures are ignored: the rows stay pending and the next
 * load retries them.
 */
async function pushPendingTackle(userId: string): Promise<void> {
  const local = await getCachedTackle(userId);
  const pending = local.filter((item) => item.pendingSync);
  if (pending.length === 0) return;

  let items = local;
  for (const item of pending) {
    try {
      const record = await pb.collection("tackle").create({
        user_id: userId,
        kind: item.kind,
        name: item.name,
        model: item.model,
        manufacturer: item.manufacturer,
      });
      items = items.map((current) =>
        current.id === item.id ? { id: record.id, kind: current.kind, name: current.name, model: current.model, manufacturer: current.manufacturer } : current,
      );
      await setCachedTackle(userId, items);
    } catch (e) {
      console.warn("pushPendingTackle: skipping", item.id, e);
      if (isNetworkError(e)) return;
    }
  }
}

/**
 * Read the owner's rods and reels. Returns the local cache when the network is
 * unavailable so the picker still opens offline.
 */
export async function loadTackleItems(userId: string): Promise<TackleItem[]> {
  if (!userId) return [];
  const cached = await getCachedTackle(userId);
  try {
    await pushPendingTackle(userId);
    const serverItems = await fetchServerTackle(userId);
    const merged = mergeTackleItems(serverItems, await getCachedTackle(userId));
    await setCachedTackle(userId, merged);
    return merged;
  } catch (e) {
    console.warn("loadTackleItems failed, using local copy:", e);
    return cached;
  }
}

/**
 * Save a rod or reel and select it. Reuses an identical saved row instead of
 * creating a duplicate. The local write happens first so the picker updates even
 * when the request fails.
 */
export async function createTackleItem(userId: string, draft: TackleDraft): Promise<TackleItem> {
  const local = await getCachedTackle(userId);
  const existing = findMatchingTackleItem(local, draft);
  if (existing) return existing;

  const localItem: TackleItem = { id: `local_${Date.now()}`, ...draft, pendingSync: true };
  await setCachedTackle(userId, [...local, localItem]);

  try {
    const record = await pb.collection("tackle").create({
      user_id: userId,
      kind: draft.kind,
      name: draft.name,
      model: draft.model,
      manufacturer: draft.manufacturer,
    });
    const saved: TackleItem = { id: record.id, kind: draft.kind, name: draft.name, model: draft.model, manufacturer: draft.manufacturer };
    const current = await getCachedTackle(userId);
    await setCachedTackle(userId, current.map((item) => (item.id === localItem.id ? saved : item)));
    return saved;
  } catch (e) {
    console.warn("createTackleItem failed, kept for a later retry:", e);
    return localItem;
  }
}
