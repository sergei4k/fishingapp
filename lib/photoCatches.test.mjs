import assert from "node:assert/strict";
import test from "node:test";

import { getPhotoCatchEntry, parsePhotoCatches } from "./photoCatches.ts";

test("photo catches parse from an already decoded array", () => {
  const entries = [{ species: "pike", gear: "spinning" }, { species: "perch" }];
  assert.deepEqual(parsePhotoCatches(entries), entries);
});

test("photo catches parse from a JSON string", () => {
  assert.deepEqual(parsePhotoCatches('[{"species":"pike","gear":"spinning"}]'), [{ species: "pike", gear: "spinning" }]);
});

test("missing or malformed photo catches parse to an empty list", () => {
  assert.deepEqual(parsePhotoCatches(null), []);
  assert.deepEqual(parsePhotoCatches(undefined), []);
  assert.deepEqual(parsePhotoCatches("not json"), []);
  assert.deepEqual(parsePhotoCatches('{"species":"pike"}'), []);
});

test("a photo entry is addressed by its position in the photo strip", () => {
  const raw = [{ species: "pike", gear: "spinning" }, { species: "perch", gear: "float" }];

  assert.deepEqual(getPhotoCatchEntry(raw, 0), { species: "pike", gear: "spinning" });
  assert.deepEqual(getPhotoCatchEntry(raw, 1), { species: "perch", gear: "float" });
  assert.equal(getPhotoCatchEntry('[{"species":"pike"}]', 0)?.species, "pike");
});

test("a photo index outside the catch has no entry", () => {
  const raw = [{ species: "pike" }];

  assert.equal(getPhotoCatchEntry(raw, 1), null);
  assert.equal(getPhotoCatchEntry(raw, -1), null);
  assert.equal(getPhotoCatchEntry(raw, 1.5), null);
  assert.equal(getPhotoCatchEntry(null, 0), null);
});
