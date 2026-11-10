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
  assert.match(source, /onPress=\{\(\) => setSelected\(group\.id\)\}/);
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

test("journal catch records open the catch detail modal", () => {
  assert.match(source, /CatchDetailModal/);
  assert.match(source, /toCatchDetail/);
  assert.match(source, /openDetail\(item\)/);
  assert.match(source, /catch=\{detailCatch\}/);
  assert.match(source, /onClose=\{closeDetail\}/);
});

test("journal supplies the full catch data to the detail modal", () => {
  assert.match(source, /imageUrl: imageUri\(item\)/);
  assert.match(source, /item\.imageUrl \?\? item\.pbImageUrl \?\? item\.image_uri \?\? item\.image/);
  assert.match(source, /extraPhotos: item\.extraPhotos/);
  assert.match(source, /waterBodyId: item\.water_body_id \?\? item\.waterBodyId/);
  assert.match(source, /isPublic: item\.is_public \?\? item\.isPublic/);
});

test("journal index does not render a top divider", () => {
  assert.doesNotMatch(source, /\) : \(\s*<>\s*<View style=\{styles\.rule\}/);
});

test("caught-species page shows its fish artwork beneath the species name", () => {
  assert.match(source, /selectedSpeciesArt/);
  assert.match(source, /source=\{selectedSpeciesArt\}/);
  assert.match(source, /style=\{styles\.selectedSpeciesArt\}/);
});

test("uncaught species can open their full-color species detail", () => {
  assert.match(source, /accessibilityHint=\{caught \? undefined/);
  assert.doesNotMatch(source, /disabled=\{!group\.catches\.length\}/);
  assert.match(source, /!selectedGroup\.catches\.length/);
});

test("species detail renders its journal reference blurb", () => {
  assert.match(source, /getJournalDescription/);
  assert.match(source, /selectedSpeciesDescription/);
  assert.match(source, /WHERE TO FIND IT · DIET · HOW TO FISH/);
});

test("species detail displays a typical adult length", () => {
  assert.match(source, /getTypicalAdultSizeCm/);
  assert.match(source, /Typical adult length/);
  assert.match(source, /styles\.fishstats/);
});
