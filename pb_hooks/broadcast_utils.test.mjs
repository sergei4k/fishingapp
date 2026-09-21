import assert from "node:assert/strict";
import test from "node:test";

import { validateBroadcastPayload } from "./broadcast_utils.js";

test("accepts a complete Russian-only broadcast payload", () => {
  assert.deepEqual(validateBroadcastPayload({
    key: "hunting-expo-2026-09-07",
    audience: "ru",
    title_ru: "Выставка «Охота и рыболовство на Руси»",
    body_ru: "10-13 сентября, Москва. Откройте новости StrikeFeed для деталей.",
    send: true,
  }), {
    value: {
      key: "hunting-expo-2026-09-07",
      audience: "ru",
      titleRu: "Выставка «Охота и рыболовство на Руси»",
      bodyRu: "10-13 сентября, Москва. Откройте новости StrikeFeed для деталей.",
      titleEn: "",
      bodyEn: "",
      send: true,
    },
  });
});

test("requires explicit sending confirmation", () => {
  assert.deepEqual(validateBroadcastPayload({
    key: "hunting-expo-2026-09-07",
    audience: "ru",
    title_ru: "Title",
    body_ru: "Body",
  }), { error: "send must be true" });
});

test("rejects unsafe audiences, blank copy, and oversized messages", () => {
  assert.deepEqual(validateBroadcastPayload({
    key: "test",
    audience: "everyone",
    title_ru: "Title",
    body_ru: "Body",
    send: true,
  }), { error: "invalid audience" });

  assert.deepEqual(validateBroadcastPayload({
    key: "test",
    audience: "ru",
    title_ru: "  ",
    body_ru: "Body",
    send: true,
  }), { error: "missing Russian copy" });

  assert.deepEqual(validateBroadcastPayload({
    key: "test",
    audience: "ru",
    title_ru: "Title",
    body_ru: "x".repeat(501),
    send: true,
  }), { error: "Russian body is too long" });
});
