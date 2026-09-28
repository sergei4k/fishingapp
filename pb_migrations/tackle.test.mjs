import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("./1790629200_create_tackle_and_rod_reel_to_catches.js", import.meta.url),
  "utf8",
);

test("tackle rows are private to their owner", () => {
  assert.match(migration, /name:\s*"tackle"/);
  assert.match(migration, /name:\s*"user_id"[\s\S]*cascadeDelete:\s*true[\s\S]*required:\s*true/);
  assert.match(migration, /tackle\.listRule = "user_id = @request\.auth\.id"/);
  assert.match(migration, /tackle\.viewRule = "user_id = @request\.auth\.id"/);
  assert.match(migration, /tackle\.deleteRule = "user_id = @request\.auth\.id"/);
  assert.match(migration, /@request\.body\.user_id = @request\.auth\.id/);
});

test("a rod or reel always carries a kind, name, model, and manufacturer", () => {
  assert.match(migration, /name:\s*"kind"[\s\S]*values:\s*\["rod", "reel"\][\s\S]*required:\s*true/);
  for (const field of ["name", "model", "manufacturer"]) {
    assert.match(migration, new RegExp(`name:\\s*"${field}", required: true, max: 120`));
  }
});

test("the library is listed per user and kind", () => {
  assert.match(migration, /CREATE INDEX `idx_tackle_user_kind` ON `tackle` \(`user_id`, `kind`\)/);
});

test("catches gain optional rod and reel name columns", () => {
  assert.match(migration, /if \(!catches\.fields\.getByName\("rod"\)\)/);
  assert.match(migration, /catches\.fields\.add\(new TextField\(\{ name: "rod", max: 120 \}\)\)/);
  assert.match(migration, /if \(!catches\.fields\.getByName\("reel"\)\)/);
  assert.match(migration, /catches\.fields\.add\(new TextField\(\{ name: "reel", max: 120 \}\)\)/);
});

test("reverting removes the catch columns and the collection", () => {
  assert.match(migration, /catches\.fields\.removeByName\("rod"\)/);
  assert.match(migration, /catches\.fields\.removeByName\("reel"\)/);
  assert.match(migration, /const tackle = app\.findCollectionByNameOrId\("tackle"\);\s*return app\.delete\(tackle\);/);
});
