import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hook = await readFile(new URL("./auto_follow_main_account.pb.js", import.meta.url), "utf8");

test("auto-follow hook runs after every new user is created", () => {
  assert.match(hook, /onRecordAfterCreateSuccess\(.*\},\s*"users"\);/s);
  assert.match(hook, /findRecordByFilter\(\s*"users",\s*"username = \{\:username\}"/s);
  assert.match(hook, /app\.save\(follow\)/);
});

test("auto-follow hook does not create a self-follow", () => {
  assert.match(hook, /if \(newUser\.id !== mainAccount\.id\)/);
});
