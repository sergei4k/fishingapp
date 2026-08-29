export type AppNewsLanguage = "en" | "ru";
export type AppNewsType = "update" | "promotion" | "announcement";

export type AppNewsItem = {
  id: string;
  type: AppNewsType;
  title: string;
  body: string;
  coverUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  publishedAt: string;
};

type AppNewsClient = {
  baseURL: string;
  collection: (name: string) => {
    getList: (page: number, perPage: number, options: { sort: string; requestKey: null }) => Promise<{ items: unknown[] }>;
  };
};

type AppNewsStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

const APP_NEWS_TYPES = new Set<AppNewsType>(["update", "promotion", "announcement"]);
const LAST_SEEN_KEY = "app_news_last_seen_at";

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? value : null;
}

export function sanitizeNewsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeAppNewsRecord(
  value: unknown,
  language: AppNewsLanguage,
  baseURL: string,
  now = new Date(),
): AppNewsItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id, 64);
  const collectionId = cleanText(record.collectionId, 64);
  const type = cleanText(record.content_type, 32) as AppNewsType;
  const publishedAt = validTimestamp(record.publish_at);
  const expiresAt = validTimestamp(record.expires_at);
  const nowTime = now.getTime();

  if (
    record.status !== "published"
    || !id
    || !APP_NEWS_TYPES.has(type)
    || !publishedAt
    || new Date(publishedAt).getTime() > nowTime
    || (expiresAt && new Date(expiresAt).getTime() <= nowTime)
  ) return null;

  const titleEn = cleanText(record.title_en, 160);
  const bodyEn = cleanText(record.body_en, 12000);
  if (!titleEn || !bodyEn) return null;

  const title = language === "ru" ? cleanText(record.title_ru, 160) || titleEn : titleEn;
  const body = language === "ru" ? cleanText(record.body_ru, 12000) || bodyEn : bodyEn;
  const ctaUrl = sanitizeNewsUrl(record.cta_url);
  const ctaLabelEn = cleanText(record.cta_label_en, 80);
  const ctaLabel = ctaUrl
    ? (language === "ru" ? cleanText(record.cta_label_ru, 80) || ctaLabelEn : ctaLabelEn) || null
    : null;
  const cover = cleanText(record.cover, 255);
  const root = baseURL.replace(/\/$/, "");
  const coverUrl = cover && collectionId
    ? `${root}/api/files/${encodeURIComponent(collectionId)}/${encodeURIComponent(id)}/${encodeURIComponent(cover)}?thumb=1200x800`
    : null;

  return { id, type, title, body, coverUrl, ctaLabel, ctaUrl, publishedAt };
}

export async function fetchAppNews(
  client: AppNewsClient,
  language: AppNewsLanguage,
  now = new Date(),
): Promise<AppNewsItem[]> {
  const response = await client.collection("app_news").getList(1, 50, {
    sort: "-publish_at",
    requestKey: null,
  });

  return response.items
    .map((record) => normalizeAppNewsRecord(record, language, client.baseURL, now))
    .filter((item): item is AppNewsItem => item !== null);
}

export function countUnreadNews(items: AppNewsItem[], lastSeenAt: string | null): number {
  const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : Number.NEGATIVE_INFINITY;
  const safeLastSeenTime = Number.isFinite(lastSeenTime) ? lastSeenTime : Number.NEGATIVE_INFINITY;
  return Math.min(99, items.filter((item) => new Date(item.publishedAt).getTime() > safeLastSeenTime).length);
}

export function getLatestNewsTimestamp(items: AppNewsItem[]): string | null {
  if (items.length === 0) return null;
  return items.reduce((latest, item) => (
    new Date(item.publishedAt).getTime() > new Date(latest).getTime() ? item.publishedAt : latest
  ), items[0].publishedAt);
}

export async function readNewsLastSeen(storage: AppNewsStorage): Promise<string | null> {
  try {
    return validTimestamp(await storage.getItem(LAST_SEEN_KEY));
  } catch {
    return null;
  }
}

export async function writeNewsLastSeen(storage: AppNewsStorage, timestamp: string): Promise<void> {
  const safeTimestamp = validTimestamp(timestamp);
  if (!safeTimestamp) return;
  await storage.setItem(LAST_SEEN_KEY, safeTimestamp);
}
