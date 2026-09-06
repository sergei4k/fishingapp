import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./GroupModal.tsx", import.meta.url), "utf8");

test("chat details are hidden while reading messages and shown in chat settings", () => {
  assert.match(source, /\{editing \? \(/);
  assert.match(source, /style=\{styles\.settingsChatInfo\}/);
  assert.match(source, /style=\{styles\.settingsAvatar\}/);
});
