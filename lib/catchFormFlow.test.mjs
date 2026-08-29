import assert from "node:assert/strict";
import test from "node:test";

import {
  CATCH_FORM_STEP_COUNT,
  getCatchFormReadiness,
  canAdvanceCatchFormStep,
  getResetCatchFormStep,
} from "./catchFormFlow.ts";

test("the catch form has exactly a photo stage and a details stage", () => {
  assert.equal(CATCH_FORM_STEP_COUNT, 2);
});

test("photo is required before the catch form can advance", () => {
  assert.equal(canAdvanceCatchFormStep(0, { hasPhoto: false }), false);
  assert.equal(canAdvanceCatchFormStep(0, { hasPhoto: true }), true);
});

test("readiness identifies the required photo before saving", () => {
  assert.deepEqual(getCatchFormReadiness({ hasPhoto: false }), {
    ready: false,
    missing: ["photo"],
  });
});

test("optional catch details do not block saving once a photo is selected", () => {
  assert.deepEqual(getCatchFormReadiness({ hasPhoto: true }), {
    ready: true,
    missing: [],
  });
});

test("a completed catch resets the progressive form to the photo step", () => {
  assert.equal(getResetCatchFormStep(), 0);
});
