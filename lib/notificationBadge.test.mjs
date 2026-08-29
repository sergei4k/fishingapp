import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notificationsSource = readFileSync(
  new URL("../pb_hooks/notify_utils.js", import.meta.url),
  "utf8",
);

test("outbound Expo pushes include a bounded iOS app-icon badge count", () => {
  assert.match(notificationsSource, /function normalizeBadgeCount\(/);
  assert.match(notificationsSource, /function sendExpoPush\(token, title, body, data, badgeCount\)/);
  assert.match(notificationsSource, /badge:\s*normalizeBadgeCount\(badgeCount\)/);
});

test("each registered device keeps its own notification badge count", () => {
  assert.match(notificationsSource, /getUserPushTokenRecords/);
  assert.match(notificationsSource, /badge_count/);
  assert.match(notificationsSource, /getNextBadgeCount/);
});
