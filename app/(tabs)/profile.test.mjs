import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./profile.tsx", import.meta.url), "utf8");

test("profile uses a larger circular avatar", () => {
  assert.match(source, /profileAvatar:\s*\{[\s\S]*?width:\s*120,[\s\S]*?height:\s*120,[\s\S]*?borderRadius:\s*60,/);
});

test("profile blocks publishing a catch without a photo", () => {
  assert.match(source, /canMakeCatchPublic/);
  assert.match(source, /Add a catch photo before making it public/);
});

test("profile loads catch details with the same resized server URL as social catches", () => {
  assert.match(source, /pocketbaseThumbUrl\(selectedCatch\.imageUrl \?\? selectedCatch\.pbImageUrl, "600x600"\) \?\? selectedCatch\.image \?\? null/);
  assert.match(source, /item\.imageUrl \?\? item\.pbImageUrl \?\? item\.image/);
});
