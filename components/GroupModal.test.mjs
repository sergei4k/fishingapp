import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./GroupModal.tsx", import.meta.url), "utf8");

test("chat details are hidden while reading messages and shown in chat settings", () => {
  assert.match(source, /\{editing \? \(/);
  assert.match(source, /style=\{styles\.settingsChatInfo\}/);
  assert.match(source, /style=\{styles\.settingsAvatar\}/);
});

test("group chat photos are normalized to JPEG before upload", () => {
  assert.match(source, /expo-image-manipulator/);
  assert.match(source, /ImageManipulator\.SaveFormat\.JPEG/);
  assert.match(source, /form\.append\("image", new File\(uploadUri\)\)/);
});

test("group chat realtime deletes still apply when PocketBase sends only the record id", () => {
  assert.match(source, /const eventGroupId = event\.record\?\.group_id/);
  assert.match(source, /if \(eventGroupId && eventGroupId !== liveGroup\.id\) return/);
  assert.match(source, /event\.action === "delete"[\s\S]*event\.record\.id/);
});

test("group chat realtime updates replace the existing message", () => {
  assert.match(source, /event\.action === "update"/);
  assert.match(source, /m\.id === event\.record\.id \? event\.record/);
});
