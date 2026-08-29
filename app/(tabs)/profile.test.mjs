import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./profile.tsx", import.meta.url), "utf8");

test("profile uses a larger circular avatar", () => {
  assert.match(source, /profileAvatar:\s*\{[\s\S]*?width:\s*120,[\s\S]*?height:\s*120,[\s\S]*?borderRadius:\s*60,/);
});
