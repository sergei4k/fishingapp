import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");

test("map catch filters cross-fade instead of replacing the marker source", () => {
  assert.match(source, /const CATCH_VIEW_FADE = \{ duration: 240, delay: 0 \}/);
  assert.match(source, /const switchMapView = \(nextView: "public" \| "mine"\)/);
  assert.match(source, /iconOpacityTransition: CATCH_VIEW_FADE/);
  assert.match(source, /circleOpacityTransition: CATCH_VIEW_FADE/);
});

test("map catch filter uses an animated sliding thumb", () => {
  assert.match(source, /const mapViewSlider = useRef\(new Animated\.Value\(0\)\)\.current/);
  assert.match(source, /Animated\.timing\(mapViewSlider, \{/);
  assert.match(source, /toValue: nextView === "mine" \? 1 : 0/);
  assert.match(source, /<Animated\.View\s+pointerEvents="none"\s+style=\{\[\s*styles\.viewToggleThumb,/);
  assert.match(source, /transform: \[\{ translateX: mapViewSlider\.interpolate/);
});
