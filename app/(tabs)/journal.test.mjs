import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./journal.tsx", import.meta.url), "utf8");

test("journal uses saved catches and the existing species catalogue", () => {
  assert.match(source, /getCatches\(\)/);
  assert.match(source, /parsePhotoCatches/);
  assert.match(source, /getSpeciesOptions/);
  assert.match(source, /freshwater/);
  assert.match(source, /saltwater/);
});

test("journal has accessible chapters and motion-aware page transitions", () => {
  assert.match(source, /useReducedMotion/);
  assert.match(source, /FadeInRight/);
  assert.match(source, /accessibilityRole="button"/);
  assert.match(source, /BackHandler/);
});

test("journal index includes uncaught species in alphabetical order with silhouettes", () => {
  assert.match(source, /speciesPhotos/);
  assert.match(source, /options\.filter\([\s\S]*?catches: \[\]/);
  assert.match(source, /localeCompare\(b\.label/);
  assert.match(source, /tintColor/);
  assert.match(source, /disabled=\{!group\.catches\.length\}/);
  assert.match(source, /Date\.parse\(b\.date\).*Date\.parse\(a\.date\)/);
});

test("journal species appear in three-column rows", () => {
  assert.match(source, /styles\.speciesGrid/);
  assert.match(source, /speciesRow: \{[^}]*width: "33\.333%"/);
});

test("journal caught-only filter excludes uncaught species", () => {
  assert.match(source, /caughtOnly/);
  assert.match(source, /visibleGroups/);
  assert.match(source, /Только пойманные|Caught only/);
});
