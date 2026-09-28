import assert from "node:assert/strict";
import test from "node:test";

import {
  CATCH_FORM_STEP_COUNT,
  CATCH_FORM_TACKLE_STEP,
  getCatchFormReadiness,
  canAdvanceCatchFormStep,
  getResetCatchFormStep,
  canMakeCatchPublic,
} from "./catchFormFlow.ts";

test("the catch form has photo, details, and rod/reel stages", () => {
  assert.equal(CATCH_FORM_STEP_COUNT, 3);
});

test("the rod and reel stage is the last step and stays optional", () => {
  assert.equal(CATCH_FORM_TACKLE_STEP, CATCH_FORM_STEP_COUNT - 1);
  assert.equal(canAdvanceCatchFormStep(CATCH_FORM_TACKLE_STEP, { hasPhoto: true }), true);
});

test("adventure entries can advance without a photo", () => {
  assert.equal(canAdvanceCatchFormStep(0, { hasPhoto: false }), true);
  assert.equal(canAdvanceCatchFormStep(0, { hasPhoto: true }), true);
});

test("adventure entries are ready to save without a photo", () => {
  assert.deepEqual(getCatchFormReadiness({ hasPhoto: false }), {
    ready: true,
    missing: [],
  });
});

test("optional catch details do not block saving once a photo is selected", () => {
  assert.deepEqual(getCatchFormReadiness({ hasPhoto: true }), {
    ready: true,
    missing: [],
  });
});

test("an adventure entry without a photo can be made public", () => {
  assert.equal(canMakeCatchPublic({ hasPhoto: false }), true);
  assert.equal(canMakeCatchPublic({ hasPhoto: true }), true);
});

test("a completed catch resets the progressive form to the photo step", () => {
  assert.equal(getResetCatchFormStep(), 0);
});
