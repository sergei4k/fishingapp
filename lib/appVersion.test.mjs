import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiresUpdate, updateStoreUrl } from './appVersion.ts';

test('requires only older versions to update using numeric comparison', () => {
  assert.equal(requiresUpdate('1.4.1', '1.4.2'), true);
  assert.equal(requiresUpdate('1.4.2', '1.4.2'), false);
  assert.equal(requiresUpdate('1.10.0', '1.9.0'), false);
  assert.equal(requiresUpdate('1.9.0', '2.0.0'), true);
  assert.equal(requiresUpdate('1.4.1', ' 1.4.2 '), true);
});

test('invalid or unavailable versions do not lock users out', () => {
  for (const value of [null, undefined, '', 'garbage', '1.2', '1.2.x']) {
    assert.equal(requiresUpdate('1.4.2', value), false);
    assert.equal(requiresUpdate(value, '1.4.2'), false);
  }
});

test('uses platform stores and skips web', () => {
  assert.match(updateStoreUrl('ios'), /apps.apple.com/);
  assert.match(updateStoreUrl('android'), /play.google.com/);
  assert.equal(updateStoreUrl('web'), null);
});
