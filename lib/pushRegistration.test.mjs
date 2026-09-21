import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("./auth.tsx", import.meta.url), "utf8");
const notificationsSource = readFileSync(new URL("./notifications.ts", import.meta.url), "utf8");
const entitlementsSource = readFileSync(
  new URL("../ios/Rybolov/Rybolov.entitlements", import.meta.url),
  "utf8",
);
const configSource = readFileSync(new URL("../app.config.js", import.meta.url), "utf8");

test("retries push token registration when the app returns to the foreground", () => {
  const activeHandler = authSource.match(
    /state === ['"]active['"][\s\S]{0,500}syncPushTokenForUser\(userId\)/,
  );

  assert.ok(activeHandler, "foreground handling should retry push token registration");
});

test("keeps the legacy user token update independent from device-token storage", () => {
  const deviceSaveEnd = notificationsSource.indexOf(
    'failed to save device token:',
  );
  const legacySave = notificationsSource.indexOf(
    'pb.collection("users").update(userId, { pushToken: token })',
  );

  assert.ok(deviceSaveEnd >= 0, "device-token failures should be logged separately");
  assert.ok(legacySave > deviceSaveEnd, "legacy token save should run after device-token failures");
});

test("keeps system notifications hidden in-app and clears delivered alerts on activation", () => {
  assert.match(notificationsSource, /const foregrounded = AppState\.currentState === "active"/);
  assert.match(notificationsSource, /shouldShowBanner:\s*!foregrounded/);
  assert.match(notificationsSource, /shouldShowList:\s*!foregrounded/);
  assert.match(notificationsSource, /dismissAllNotificationsAsync\(\)/);
});

test("uses production APNs for the iOS app", () => {
  assert.match(configSource, /"aps-environment":\s*["']production["']/);
  assert.match(entitlementsSource, /<key>aps-environment<\/key>\s*<string>production<\/string>/);
});
