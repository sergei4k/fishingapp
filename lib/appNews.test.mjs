import assert from "node:assert/strict";
import test from "node:test";

import {
  countUnreadNews,
  fetchAppNews,
  getLatestNewsTimestamp,
  readNewsLastSeen,
  normalizeAppNewsRecord,
  sanitizeNewsUrl,
  writeNewsLastSeen,
} from "./appNews.ts";

const now = new Date("2026-08-15T12:00:00.000Z");

function publishedRecord(overrides = {}) {
  return {
    id: "news12345678901",
    collectionId: "appnews12345678",
    status: "published",
    content_type: "update",
    title_en: "New catch flow",
    title_ru: "Новая форма улова",
    body_en: "Adding catches is now faster.",
    body_ru: "Теперь добавлять улов быстрее.",
    cover: "cover.webp",
    cta_label_en: "Learn more",
    cta_label_ru: "Подробнее",
    cta_url: "https://strikefeed.tech/news/catch-flow",
    publish_at: "2026-08-15T10:00:00.000Z",
    expires_at: "",
    ...overrides,
  };
}

test("normalizes localized published news and builds its cover URL", () => {
  const item = normalizeAppNewsRecord(publishedRecord(), "ru", "https://strikefeed.tech", now);

  assert.deepEqual(item, {
    id: "news12345678901",
    type: "update",
    title: "Новая форма улова",
    body: "Теперь добавлять улов быстрее.",
    coverUrl: "https://strikefeed.tech/api/files/appnews12345678/news12345678901/cover.webp?thumb=1200x800",
    ctaLabel: "Подробнее",
    ctaUrl: "https://strikefeed.tech/news/catch-flow",
    publishedAt: "2026-08-15T10:00:00.000Z",
  });
});

test("Russian news falls back to required English copy", () => {
  const item = normalizeAppNewsRecord(publishedRecord({ title_ru: "", body_ru: "", cta_label_ru: "" }), "ru", "https://strikefeed.tech", now);

  assert.equal(item?.title, "New catch flow");
  assert.equal(item?.body, "Adding catches is now faster.");
  assert.equal(item?.ctaLabel, "Learn more");
});

test("draft, future, expired, and malformed records are rejected", () => {
  assert.equal(normalizeAppNewsRecord(publishedRecord({ status: "draft" }), "en", "https://strikefeed.tech", now), null);
  assert.equal(normalizeAppNewsRecord(publishedRecord({ publish_at: "2026-08-16T10:00:00.000Z" }), "en", "https://strikefeed.tech", now), null);
  assert.equal(normalizeAppNewsRecord(publishedRecord({ expires_at: "2026-08-15T09:00:00.000Z" }), "en", "https://strikefeed.tech", now), null);
  assert.equal(normalizeAppNewsRecord(publishedRecord({ title_en: "" }), "en", "https://strikefeed.tech", now), null);
});

test("only HTTPS CTA links are retained", () => {
  assert.equal(sanitizeNewsUrl("https://apps.apple.com/app/example"), "https://apps.apple.com/app/example");
  assert.equal(sanitizeNewsUrl("http://strikefeed.tech"), null);
  assert.equal(sanitizeNewsUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeNewsUrl("not a url"), null);
});

test("fetching news validates records and requests newest published posts", async () => {
  let request;
  const client = {
    baseURL: "https://strikefeed.tech",
    collection(name) {
      assert.equal(name, "app_news");
      return {
        async getList(page, perPage, options) {
          request = { page, perPage, options };
          return { items: [publishedRecord(), publishedRecord({ id: "draft1234567890", status: "draft" })] };
        },
      };
    },
  };

  const items = await fetchAppNews(client, "en", now);

  assert.equal(items.length, 1);
  assert.deepEqual(request, {
    page: 1,
    perPage: 50,
    options: { sort: "-publish_at", requestKey: null },
  });
});

test("unread count compares publication timestamps and is capped", () => {
  const items = Array.from({ length: 120 }, (_, index) => ({
    ...normalizeAppNewsRecord(publishedRecord({ id: `news${String(index).padStart(11, "0")}` }), "en", "https://strikefeed.tech", now),
    publishedAt: new Date(now.getTime() - index * 1000).toISOString(),
  }));

  assert.equal(countUnreadNews(items, null), 99);
  assert.equal(countUnreadNews(items, new Date(now.getTime() - 5000).toISOString()), 5);
  assert.equal(getLatestNewsTimestamp(items), now.toISOString());
});

test("last-seen news time persists only valid timestamps", async () => {
  const values = new Map();
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
  };

  await writeNewsLastSeen(storage, "2026-08-15T10:00:00.000Z");
  assert.equal(await readNewsLastSeen(storage), "2026-08-15T10:00:00.000Z");

  values.set("app_news_last_seen_at", "invalid");
  assert.equal(await readNewsLastSeen(storage), null);
});
