import assert from "node:assert/strict";
import test from "node:test";

import { formatEuropeanDate } from "./dateFormat.ts";

test("formats profile dates as day/month/year", () => {
  assert.equal(formatEuropeanDate(new Date(2026, 7, 14)), "14/08/2026");
});

test("returns an empty string for an invalid date", () => {
  assert.equal(formatEuropeanDate("not a date"), "");
});
