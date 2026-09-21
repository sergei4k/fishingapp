import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hook = readFileSync(new URL("./revenuecat.pb.js", import.meta.url), "utf8");
const utils = readFileSync(new URL("./notify_utils.js", import.meta.url), "utf8");

test("RevenueCat sends the admin email only for initial purchases", () => {
  assert.match(hook, /type === "INITIAL_PURCHASE"/);
  assert.match(hook, /notifyPremiumPurchase\(e, event, user\)/);
  assert.match(hook, /type === "INITIAL_PURCHASE" && !hasVerified/);
  assert.doesNotMatch(hook, /type === "RENEWAL"[^\n]*notifyPremiumPurchase/);
});

test("premium purchase email uses the existing admin mail recipient and escapes event data", () => {
  assert.match(utils, /function notifyPremiumPurchase\(e, event, userRecord\)/);
  assert.match(utils, /to: \[\{ address: ADMIN_EMAIL \}\]/);
  assert.match(utils, /escapeHtml\(productId\)/);
  assert.match(utils, /escapeHtml\(transactionId\)/);
});
