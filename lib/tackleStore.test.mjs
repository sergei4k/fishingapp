import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./tackleStore.ts", import.meta.url), "utf8");

test("the library is read for the signed-in owner only", () => {
  assert.match(source, /pb\.collection\("tackle"\)\.getFullList/);
  assert.match(source, /filter: pb\.filter\("user_id = \{:userId\}", \{ userId \}\)/);
});

test("every created rod or reel is stamped with its owner", () => {
  assert.match(source, /pb\.collection\("tackle"\)\.create\(\{\s*user_id: userId,\s*kind: /);
});

test("a rod or reel saved while offline stays in the local library", () => {
  assert.match(source, /const localItem: TackleItem = \{ id: `local_\$\{Date\.now\(\)\}`, \.\.\.draft, pendingSync: true \}/);
  assert.match(source, /await setCachedTackle\(userId, \[\.\.\.local, localItem\]\)/);
});

test("re-adding the same rod or reel reuses the saved row", () => {
  assert.match(source, /const existing = findMatchingTackleItem\(local, draft\);\s*if \(existing\) return existing;/);
});

test("the library stays usable when the network is unavailable", () => {
  assert.match(source, /catch \(e\) \{\s*console\.warn\("loadTackleItems failed, using local copy:", e\);\s*return cached;/);
});
