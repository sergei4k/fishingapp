import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('fish loader uses an animated fish with a reduced-motion fallback', () => {
  const source = readFileSync(new URL('./FishLoader.tsx', import.meta.url), 'utf8');
  const animation = readFileSync(new URL('../assets/images/fish-swimming.gif', import.meta.url));
  assert.match(source, /fish-swimming\.gif/);
  assert.match(source, /isReduceMotionEnabled/);
  assert.match(source, /reduceMotionChanged/);
  assert.match(source, /accessibilityRole="progressbar"/);
  assert.equal(animation.subarray(0, 6).toString(), 'GIF89a');
});
