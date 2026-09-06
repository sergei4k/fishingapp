import assert from "node:assert/strict";
import test from "node:test";

import { canPublishCatch } from "./catch_public_photo_utils.js";

test("allows private catches without a photo", () => {
  assert.equal(canPublishCatch(false, ""), true);
});

test("allows public catches with a primary photo", () => {
  assert.equal(canPublishCatch(true, "catch.jpg"), true);
});

test("rejects public catches without a primary photo", () => {
  assert.equal(canPublishCatch(true, ""), false);
  assert.equal(canPublishCatch(true, "   "), false);
  assert.equal(canPublishCatch(true, null), false);
});
