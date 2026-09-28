export type PhotoCatchEntry = {
  uri?: string | null;
  species?: string | null;
  gear?: string | null;
  length?: string | null;
  weight?: string | null;
};

export function parsePhotoCatches(raw: unknown): PhotoCatchEntry[] {
  if (Array.isArray(raw)) return raw as PhotoCatchEntry[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as PhotoCatchEntry[];
    } catch {}
  }
  return [];
}

export function getPhotoCatchEntry(raw: unknown, index: number): PhotoCatchEntry | null {
  if (!Number.isInteger(index) || index < 0) return null;
  return parsePhotoCatches(raw)[index] ?? null;
}
