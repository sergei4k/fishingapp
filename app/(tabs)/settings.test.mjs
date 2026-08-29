import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");

test("settings avatar shows an edit affordance", () => {
  assert.match(source, /<View style=\{styles\.avatarEditBadge\} pointerEvents="none">/);
  assert.match(source, /<Ionicons name="pencil" size=\{14\}/);
  assert.match(source, /avatarEditBadge:\s*\{/);
});

test("settings does not add a second bottom safe-area inset above the tab bar", () => {
  assert.match(source, /<SafeAreaView style=\{styles\.container\} edges=\{\["top", "left", "right"\]\}>/);
});
