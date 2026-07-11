import { pb, isNetworkError } from './pocketbase';
import { getCatches, replaceCatches, updateCatch, CatchItem } from './storage';

const isPocketBaseId = (id: string) => /^[a-z0-9]{15}$/.test(id);

export async function syncCatchesFromPB(userId: string): Promise<void> {
  // Read local data before touching anything
  const localCatches = await getCatches();
  const localMap = new Map(localCatches.map((c) => [c.id, c]));

  const records = await pb.collection('catches').getFullList({
    filter: `user_id = "${userId}"`,
    requestKey: null,
  });
  const serverIds = new Set(records.map((record: any) => record.id));
  const isPocketBaseId = (id: string) => /^[a-z0-9]{15}$/.test(id);

  // Re-read local storage after the network call. A user can add a catch while
  // startup sync is in flight; using only the pre-fetch snapshot can erase that
  // newly saved local catch.
  const latestLocalCatches = await getCatches();
  const latestLocalMap = new Map(latestLocalCatches.map((c) => [c.id, c]));
  const mergedLocalMap = new Map([...localMap, ...latestLocalMap]);
  const localOnlyCatches = latestLocalCatches.filter((catchItem) =>
    !serverIds.has(catchItem.id) && (catchItem.pendingSync || !isPocketBaseId(catchItem.id))
  );

  const syncedCatches: CatchItem[] = [];

  for (const record of records) {
    const imageUrl = record.image
      ? pb.files.getURL(record, record.image)
      : undefined;

    const serverExtraPhotos: string[] = Array.isArray(record.images)
      ? record.images.map((f: string) => pb.files.getURL(record, f))
      : [];

    const existing = mergedLocalMap.get(record.id);
    const recordGear = record.gear ?? null;
    const localGear = existing?.gear ?? null;

    if (existing && localGear && !recordGear) {
      try {
        await pb.collection("catches").update(record.id, { gear: localGear });
      } catch (e) {
        console.warn("Failed to backfill gear to PocketBase:", e);
      }
    }

    if (existing) {
      // Keep local image path, sync public status and imageUrl from PocketBase
      syncedCatches.push({
        ...existing,
        isPublic: record.is_public ?? false,
        imageUrl: imageUrl ?? existing.imageUrl,
        gear: recordGear ?? existing.gear,
        lat: record.lat ?? existing.lat ?? null,
        lon: record.lon ?? existing.lon ?? null,
        extraPhotos: serverExtraPhotos.length ? serverExtraPhotos : existing.extraPhotos,
        pendingSync: false,
      });
    } else {
      // Catch exists on server but not locally — add it
      const item: CatchItem = {
        id: record.id,
        species: record.species ?? undefined,
        description: record.description ?? '',
        length: record.length_cm != null ? String(record.length_cm) : '',
        weight: record.weight_kg != null ? String(record.weight_kg) : '',
        gear: recordGear ?? undefined,
        lat: record.lat ?? null,
        lon: record.lon ?? null,
        date: (() => {
          try {
            const raw = record.created_at;
            if (!raw) return new Date().toISOString();
            const num = Number(raw);
            if (!isNaN(num)) {
              // Normalize microseconds or nanoseconds down to milliseconds
              let ms = num;
              if (ms > 1e13) ms = Math.round(ms / 1000);
              if (ms > 1e13) ms = Math.round(ms / 1000);
              const d = new Date(ms);
              if (!isNaN(d.getTime())) return d.toISOString();
            }
            const d = new Date(raw);
            return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
          } catch {
            return new Date().toISOString();
          }
        })(),
        isPublic: record.is_public ?? false,
        imageUrl,
        extraPhotos: serverExtraPhotos,
        pendingSync: false,
      };
      syncedCatches.push(item);
    }
  }

  // Keep catches that were saved locally but never made it to PocketBase (for
  // example, server validation failed or the app was closed before retry logic).
  // Without this, login/startup sync wipes entries that the user just saw in
  // Profile/Map after saving.
  await replaceCatches([...localOnlyCatches, ...syncedCatches]);
}

/**
 * Number of catches saved on this device that haven't reached the server yet.
 */
export async function getPendingCatchCount(): Promise<number> {
  const local = await getCatches();
  return local.filter((c) => c.pendingSync && !isPocketBaseId(c.id)).length;
}

/**
 * Upload catches that were saved locally while offline / unauthenticated.
 * Safe to call repeatedly (on login, on reconnect, on app foreground): it only
 * touches rows still flagged pendingSync, and swaps their temporary local id for
 * the real PocketBase id on success while keeping the on-device image path.
 */
export async function pushPendingCatches(userId: string): Promise<void> {
  const local = await getCatches();
  const pending = local.filter((c) => c.pendingSync && !isPocketBaseId(c.id));
  if (pending.length === 0) return;

  for (const item of pending) {
    try {
      const formData = new FormData();
      formData.append('user_id', userId);
      formData.append('species', item.species ?? '');
      if (item.lat != null) formData.append('lat', String(item.lat));
      if (item.lon != null) formData.append('lon', String(item.lon));
      formData.append('description', item.description || '');
      formData.append('gear', item.gear ?? '');
      if (item.length) formData.append('length_cm', String(Number(item.length)));
      if (item.weight) formData.append('weight_kg', String(Number(item.weight)));
      const createdMs = new Date(item.date).getTime();
      formData.append('created_at', String(isNaN(createdMs) ? Date.now() : createdMs));
      formData.append('is_public', item.isPublic ? 'true' : 'false');

      if (item.image && !/^https?:/.test(item.image)) {
        formData.append('image', { uri: item.image, name: 'catch.jpg', type: 'image/jpeg' } as any);
      }
      (item.extraPhotos ?? []).forEach((uri: string, i: number) => {
        if (uri && !/^https?:/.test(uri)) {
          formData.append('images', { uri, name: `catch_extra_${i}.jpg`, type: 'image/jpeg' } as any);
        }
      });

      const record = await pb.collection('catches').create(formData);
      const pbImageUrl = record.image ? pb.files.getURL(record, record.image) : item.pbImageUrl;
      // Swap the temp local id for the real server id; keep local image path so it
      // still renders offline.
      await updateCatch(item.id, { ...item, id: record.id, pbImageUrl, pendingSync: false });
    } catch (e: any) {
      // Still offline — stop and let the next trigger retry the whole queue.
      if (isNetworkError(e)) return;
      // A real server rejection (validation/auth): don't let one bad row block the
      // rest; leave it pending and move on.
      console.warn('pushPendingCatches: skipping', item.id, e?.status, e?.message);
    }
  }
}
