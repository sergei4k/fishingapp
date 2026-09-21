import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hook = readFileSync(new URL("./admin_push_broadcast.pb.js", import.meta.url), "utf8");

test("broadcast route is superuser-only and has a strict request limit", () => {
  assert.match(hook, /routerAdd\("POST", "\/api\/strikefeed\/admin\/push-broadcast"/);
  assert.match(hook, /\$apis\.requireSuperuserAuth\(\)/);
  assert.match(hook, /\$apis\.bodyLimit\(4096\)/);
});

test("broadcast route validates input and blocks duplicate keys", () => {
  assert.match(hook, /validateBroadcastPayload\(info\.body\)/);
  assert.match(hook, /findRecordsByFilter\(\s*"push_broadcasts"/);
  assert.match(hook, /broadcast_already_sent/);
});

test("broadcast route labels Expo payloads and returns delivery totals", () => {
  assert.match(hook, /type: "broadcast"/);
  assert.match(hook, /broadcastKey: payload\.key/);
  assert.match(hook, /recipientCount/);
  assert.match(hook, /delivered/);
  assert.match(hook, /failed/);
});
