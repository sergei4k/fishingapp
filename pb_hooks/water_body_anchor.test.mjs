import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./water_body_anchor.pb.js", import.meta.url), "utf8");
const utils = readFileSync(new URL("./water_body_anchor_utils.js", import.meta.url), "utf8");

test("anchors the water body to the first catch after a catch save", () => {
  assert.match(source, /onRecordAfterCreateSuccess/);
  assert.match(source, /onRecordAfterUpdateSuccess/);
  assert.match(source, /require\(`\$\{__hooks\}\/water_body_anchor_utils\.js`\)\.anchorWaterBody\(e, e\.record\)/);
  assert.match(source, /e\.next\(\)/);
});

test("re-derives the anchor after the oldest catch is deleted", () => {
  assert.match(source, /onRecordAfterDeleteSuccess/);
  assert.match(source, /reanchorAfterDelete\(e, e\.record\)/);
});

test("anchor is the oldest catch, not the geometry centroid", () => {
  assert.match(utils, /findRecordsByFilter\("catches", "water_body_id = \{:id\}", "\+created,\+id", 1, 0/);
  assert.match(utils, /waterBody\.set\("lat", anchorLat\)/);
  assert.match(utils, /waterBody\.set\("lon", anchorLon\)/);
  assert.match(utils, /e\.app\.findRecordById\("water_bodies", waterBodyId\)/);
});

test("hooks never fail the triggering catch write", () => {
  assert.match(source, /try \{/);
  assert.match(source, /catch \(err\) \{\s*console\.log\("water body anchor error:", err\);\s*\}/);
 assert.match(source, /e\.next\(\);/);
});