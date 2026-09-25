import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./add.tsx", import.meta.url), "utf8");

test("detects water with a Mapbox point-in-polygon query", () => {
  assert.match(source, /fetchMapboxWaterBody\(lat, lon, MAPBOX_ACCESS_TOKEN, controller\.signal\)/);
  assert.doesNotMatch(source, /fetchWaterBodyBoundaryAtPoint/);
});

test("reuses an existing named water body by Mapbox feature id", () => {
  assert.match(source, /filter: pb\.filter\("mapbox_id = \{:featureId\}", \{ featureId: feature\.featureId \}\)/);
  assert.match(source, /setWaterBody\(\{ id: existingWaterBody\.id, name: existingWaterBody\.name/);
});

test("reuses a stored water body before making another Mapbox request", () => {
  assert.match(source, /pb\.send<\{ id\?: string; name\?: string \}>\("\/water-bodies\/lookup"/);
  assert.match(source, /setWaterBody\(\{ id: resolved\.id, name: resolved\.name, isShorelineMatch: false \}\)/);
  assert.match(source, /const fallbackStoredMatch = matchWaterBody[\s\S]*?if \(fallbackStoredMatch\) \{[\s\S]*?setWaterBody\(fallbackStoredMatch\);[\s\S]*?return;/);
});

test("saves a new custom name against the detected Mapbox feature", () => {
  assert.match(source, /const pending = pendingWaterBody/);
  assert.match(source, /featureId: pending\.feature\.featureId/);
  assert.match(source, /accessToken: MAPBOX_ACCESS_TOKEN/);
  assert.match(source, /waterType: pending\.feature\.type/);
  assert.match(source, /\}\), 30000\);/);
});

test("automatically resolves a named marine region", () => {
  assert.match(source, /if \(feature\.isMarine\) \{/);
  assert.match(source, /resolveOfficialName: true/);
  assert.match(source, /if \(registered\.id && registered\.name\) \{/);
});

test("ignores stale water body detection results", () => {
  assert.match(source, /const requestId = \+\+waterBodyDetectionRequestRef\.current/);
  assert.match(source, /requestId !== waterBodyDetectionRequestRef\.current/);
  assert.match(source, /const requestKey = `water-body-name-\$\{requestId\}`/);
});

test("does not save a catch before its detected water body is named", () => {
  assert.match(source, /if \(detectingWater \|\| pendingWaterBody\)/);
  assert.match(source, /disabled=\{!readiness\.ready \|\| isUploading \|\| detectingWater \|\| !!pendingWaterBody\}/);
});

test("manual location picker shows catch markers and saved water body geometry", () => {
  assert.match(source, /id="location-picker-catches" shape=\{locationPickerCatchMarkers\}/);
  assert.match(source, /id="location-picker-water-bodies" shape=\{locationPickerWaterBodies\}/);
  assert.match(source, /pb\.collection\("catches"\)\.getFullList/);
  assert.match(source, /pb\.collection\("water_bodies"\)\.getFullList/);
});
