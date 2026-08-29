import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("./1786827000_create_app_news.js", import.meta.url),
  "utf8",
);

test("app news exposes only currently published records", () => {
  assert.match(migration, /name:\s*"app_news"/);
  assert.match(migration, /const publishedRule = 'status = "published" && publish_at <= @now && \(expires_at = "" \|\| expires_at > @now\)'/);
  assert.match(migration, /listRule:\s*publishedRule/);
  assert.match(migration, /viewRule:\s*publishedRule/);
});

test("app clients cannot create, update, or delete news", () => {
  assert.match(migration, /createRule:\s*null/);
  assert.match(migration, /updateRule:\s*null/);
  assert.match(migration, /deleteRule:\s*null/);
});

test("news content is bounded and images are restricted", () => {
  assert.match(migration, /name:\s*"title_en"[\s\S]*max:\s*160/);
  assert.match(migration, /name:\s*"body_en"[\s\S]*max:\s*12000/);
  assert.match(migration, /name:\s*"cover"[\s\S]*maxSize:\s*5242880/);
  assert.match(migration, /mimeTypes:\s*\["image\/jpeg", "image\/png", "image\/webp"\]/);
});
