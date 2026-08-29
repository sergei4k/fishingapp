import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./AvatarPreviewModal.tsx", import.meta.url),
  "utf8",
);

test("avatar preview renders only when it has an image URI", () => {
  assert.match(source, /visible=\{visible && !!uri\}/);
  assert.match(source, /const imageUri = uri \?\? undefined/);
  assert.match(source, /source=\{\{ uri: imageUri \}\}/);
});

test("avatar preview provides an accessible close action", () => {
  assert.match(source, /accessibilityLabel="Close photo preview"/);
  assert.match(source, /onRequestClose=\{onClose\}/);
  assert.doesNotMatch(source, /style=\{StyleSheet\.absoluteFill\}/);
});

test("both profile views wire their avatar to the preview", () => {
  const profileSource = readFileSync(new URL("../app/(tabs)/profile.tsx", import.meta.url), "utf8");
  const socialSource = readFileSync(new URL("../app/(tabs)/social.tsx", import.meta.url), "utf8");

  assert.match(profileSource, /import AvatarPreviewModal from "@\/components\/AvatarPreviewModal"/);
  assert.match(profileSource, /<AvatarPreviewModal[\s\S]*?uri=\{ownAvatarUri\}/);
  assert.match(socialSource, /import AvatarPreviewModal from "@\/components\/AvatarPreviewModal"/);
  assert.match(socialSource, /<AvatarPreviewModal[\s\S]*?uri=\{selectedAvatarUri\}/);
  assert.match(socialSource, /<AvatarPreviewModal[\s\S]*?<\/SafeAreaView>\s*<\/Modal>\s*<CatchDetailModal/);
});
