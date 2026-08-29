import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./CatchDetailModal.tsx", import.meta.url), "utf8");

test("catch photos remain in the detail modal without opening a fullscreen viewer", () => {
  assert.doesNotMatch(source, /fullscreenPhotos/);
  assert.doesNotMatch(source, /openFullscreenPhoto/);
  assert.doesNotMatch(source, /Fullscreen photo viewer/);
});

test("double-tapping a catch photo animates a heart and only adds a missing like", () => {
  assert.match(source, /const handlePhotoTap/);
  assert.match(source, /const animatePhotoLike/);
  assert.match(source, /if \(!isLiked\) void createLike\(\)/);
  assert.match(source, /name="heart"/);
});
