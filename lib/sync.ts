import { pb } from './pocketbase';
import { getCatches, updateCatch, addCatch, CatchItem } from './storage';

export async function syncCatchesFromPB(userId: string): Promise<void> {
  const records = await pb.collection('catches').getFullList({
    filter: `user_id = "${userId}"`,
    requestKey: null,
  });

  const localCatches = await getCatches();
  const localMap = new Map(localCatches.map((c) => [c.id, c]));

  for (const record of records) {
    const imageUrl = record.image
      ? pb.files.getURL(record, record.image)
      : undefined;

    const existing = localMap.get(record.id);
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
      await updateCatch(record.id, {
        ...existing,
        isPublic: record.is_public ?? false,
        imageUrl: imageUrl ?? existing.imageUrl,
        gear: recordGear ?? existing.gear,
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
      };
      await addCatch(item);
    }
  }
}
