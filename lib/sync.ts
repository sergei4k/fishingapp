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

    if (existing) {
      // Keep local image path, sync public status and imageUrl from PocketBase
      await updateCatch(record.id, {
        ...existing,
        isPublic: record.is_public ?? false,
        imageUrl: imageUrl ?? existing.imageUrl,
      });
    } else {
      // Catch exists on server but not locally — add it
      const item: CatchItem = {
        id: record.id,
        species: record.species ?? undefined,
        description: record.description ?? '',
        length: record.length_cm != null ? String(record.length_cm) : '',
        weight: record.weight_kg != null ? String(record.weight_kg) : '',
        lat: record.lat ?? null,
        lon: record.lon ?? null,
        date: record.created_at
          ? new Date(record.created_at).toISOString()
          : new Date().toISOString(),
        isPublic: record.is_public ?? false,
        imageUrl,
      };
      await addCatch(item);
    }
  }
}
