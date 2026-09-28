export type TackleKind = "rod" | "reel";

export type TackleField = "name" | "model" | "manufacturer";

export type TackleDraft = {
  kind: TackleKind;
  name: string;
  model: string;
  manufacturer: string;
};

export type TackleItem = TackleDraft & {
  id: string;
  /** Local-only row that has not reached PocketBase yet. */
  pendingSync?: boolean;
};

export const TACKLE_KINDS: TackleKind[] = ["rod", "reel"];

export const TACKLE_KIND_ICON: Record<TackleKind, string> = {
  rod: "git-commit-outline",
  reel: "sync-outline",
};

export const TACKLE_FIELDS: TackleField[] = ["name", "model", "manufacturer"];

/** Matches the PocketBase text field max so a long paste cannot fail the create. */
export const MAX_TACKLE_TEXT_LENGTH = 120;

export function emptyTackleDraft(kind: TackleKind = "rod"): TackleDraft {
  return { kind, name: "", model: "", manufacturer: "" };
}

export function normalizeTackleText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTackleField(value: string | null | undefined): string {
  return normalizeTackleText(value).slice(0, MAX_TACKLE_TEXT_LENGTH);
}

export function getMissingTackleFields(draft: TackleDraft): TackleField[] {
  return TACKLE_FIELDS.filter((field) => !normalizeTackleField(draft[field]));
}

export function isTackleDraftComplete(draft: TackleDraft): boolean {
  return getMissingTackleFields(draft).length === 0;
}

/**
 * Build a storable draft, or null when name, model, or manufacturer is missing.
 * All three are required so a saved item is always identifiable in the picker.
 */
export function buildTackleDraft(
  kind: TackleKind,
  input: Partial<Record<TackleField, string>>,
): TackleDraft | null {
  const draft: TackleDraft = {
    kind,
    name: normalizeTackleField(input.name),
    model: normalizeTackleField(input.model),
    manufacturer: normalizeTackleField(input.manufacturer),
  };
  return isTackleDraftComplete(draft) ? draft : null;
}

function matchesTackleText(a: string, b: string): boolean {
  return normalizeTackleText(a).toLowerCase() === normalizeTackleText(b).toLowerCase();
}

export function isSameTackleItem(a: TackleDraft, b: TackleDraft): boolean {
  return a.kind === b.kind && TACKLE_FIELDS.every((field) => matchesTackleText(a[field], b[field]));
}

/** Reuses an already saved rod/reel so re-entering the same tackle keeps one row. */
export function findMatchingTackleItem(items: TackleItem[], draft: TackleDraft): TackleItem | null {
  return items.find((item) => isSameTackleItem(item, draft)) ?? null;
}

export function getTackleItemsByKind(items: TackleItem[], kind: TackleKind): TackleItem[] {
  return items
    .filter((item) => item.kind === kind)
    .sort((a, b) => normalizeTackleText(a.name).localeCompare(normalizeTackleText(b.name)));
}

/**
 * Server rows win, but rows created while offline are kept so a rod saved without
 * a connection is not dropped by the next refresh.
 */
export function mergeTackleItems(serverItems: TackleItem[], localItems: TackleItem[]): TackleItem[] {
  const serverIds = new Set(serverItems.map((item) => item.id));
  return [...serverItems, ...localItems.filter((item) => item.pendingSync && !serverIds.has(item.id))];
}

export function getTackleSubtitle(item: TackleDraft): string {
  return `${normalizeTackleText(item.manufacturer)} · ${normalizeTackleText(item.model)}`;
}

/**
 * The snapshot stored on a catch. Tackle rows are private to their owner, so the
 * catch keeps the full label rather than an id nobody else could resolve. Ordered
 * manufacturer, name, model, with repeats dropped, and capped to the catch
 * column width so a long entry cannot fail the save.
 */
export function getTackleCatchLabel(item: TackleItem | null | undefined): string {
  if (!item) return "";
  const parts: string[] = [];
  for (const value of [item.manufacturer, item.name, item.model]) {
    const text = normalizeTackleField(value);
    if (!text || parts.some((part) => part.toLowerCase() === text.toLowerCase())) continue;
    parts.push(text);
  }
  return parts.join(" · ").slice(0, MAX_TACKLE_TEXT_LENGTH);
}

export function getTackleKindLabel(kind: TackleKind, language: "ru" | "en" = "ru"): string {
  if (kind === "rod") return language === "ru" ? "Удилище" : "Rod";
  return language === "ru" ? "Катушка" : "Reel";
}

export function getTackleSectionLabel(language: "ru" | "en" = "ru"): string {
  return language === "ru" ? "Снасти" : "Rod & reel";
}

export function getTackleFieldLabel(field: TackleField, language: "ru" | "en" = "ru"): string {
  if (field === "name") return language === "ru" ? "Название" : "Name";
  if (field === "model") return language === "ru" ? "Модель" : "Model";
  return language === "ru" ? "Производитель" : "Manufacturer";
}
