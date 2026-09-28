import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./sync.ts", import.meta.url), "utf8");

test("pending catch uploads use Expo File blobs", () => {
  assert.match(source, /import \{ File \} from 'expo-file-system'/);
  assert.match(source, /formData\.append\('image', new File\(item\.image\)\)/);
  assert.match(source, /formData\.append\('images', new File\(uri\)\)/);
});

test("a catch saved offline still uploads its rod and reel", () => {
  assert.match(source, /if \(item\.rod\) formData\.append\('rod', item\.rod\)/);
  assert.match(source, /if \(item\.reel\) formData\.append\('reel', item\.reel\)/);
});

test("syncing keeps the rod and reel stored on the server", () => {
  assert.match(source, /rod: record\.rod \?\? existing\.rod/);
  assert.match(source, /reel: record\.reel \?\? existing\.reel/);
  assert.match(source, /rod: record\.rod \?\? undefined/);
  assert.match(source, /reel: record\.reel \?\? undefined/);
});

test("syncing backfills missing per-photo catch details to PocketBase", () => {
  assert.match(source, /existing && Array\.isArray\(existing\.photoCatches\) && existing\.photoCatches\.length && !record\.photo_catches/);
  assert.match(source, /pb\.collection\("catches"\)\.update\(record\.id, \{ photo_catches: existing\.photoCatches \}\)/);
});

test("syncing backfills rod and reel names to PocketBase", () => {
  assert.match(source, /existing && existing\.rod && !record\.rod/);
  assert.match(source, /pb\.collection\("catches"\)\.update\(record\.id, \{ rod: existing\.rod \}\)/);
  assert.match(source, /existing && existing\.reel && !record\.reel/);
  assert.match(source, /pb\.collection\("catches"\)\.update\(record\.id, \{ reel: existing\.reel \}\)/);
});
