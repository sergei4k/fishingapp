/// <reference path="../pb_data/types.d.ts" />

const MAX_BROADCAST_TOKENS = 5000;

routerAdd("POST", "/api/strikefeed/admin/push-broadcast", (e) => {
  const info = e.requestInfo();
  const { validateBroadcastPayload } = require(`${__hooks}/broadcast_utils.js`);
  const validation = validateBroadcastPayload(info.body);
  if (validation.error) return e.json(400, { error: validation.error });

  const payload = validation.value;
  const existing = e.app.findRecordsByFilter(
    "push_broadcasts",
    `key = "${payload.key}"`,
    "",
    1,
    0,
  );
  if (existing.length > 0) return e.json(409, { error: "broadcast_already_sent" });

  const broadcastCollection = e.app.findCollectionByNameOrId("push_broadcasts");
  const broadcast = new Record(broadcastCollection);
  broadcast.set("key", payload.key);
  broadcast.set("audience", payload.audience);
  broadcast.set("status", "sending");
  broadcast.set("title_ru", payload.titleRu);
  broadcast.set("body_ru", payload.bodyRu);
  broadcast.set("title_en", payload.titleEn);
  broadcast.set("body_en", payload.bodyEn);
  e.app.save(broadcast);

  const tokenRecords = e.app.findRecordsByFilter(
    "user_push_tokens",
    'token != ""',
    "",
    MAX_BROADCAST_TOKENS + 1,
    0,
  );
  if (tokenRecords.length > MAX_BROADCAST_TOKENS) {
    broadcast.set("status", "failed");
    e.app.save(broadcast);
    return e.json(503, { error: "too_many_registered_devices" });
  }

  const notify = require(`${__hooks}/notify_utils.js`);
  const users = {};
  const sentTokens = {};
  let recipientCount = 0;
  let delivered = 0;
  let failed = 0;

  for (let index = 0; index < tokenRecords.length; index++) {
    const tokenRecord = tokenRecords[index];
    const token = notify.getRecordString(tokenRecord, "token");
    const userId = notify.getRecordString(tokenRecord, "user_id");
    if (!token || !userId || sentTokens[token]) continue;

    let user = users[userId];
    if (user === undefined) {
      try {
        user = e.app.findRecordById("users", userId);
      } catch {
        user = null;
      }
      users[userId] = user;
    }
    if (!user) continue;

    const isRussian = notify.getRecordString(user, "language") === "ru";
    if ((payload.audience === "ru" && !isRussian) || (payload.audience === "en" && isRussian)) continue;

    sentTokens[token] = true;
    recipientCount += 1;
    const title = isRussian ? payload.titleRu : payload.titleEn;
    const body = isRussian ? payload.bodyRu : payload.bodyEn;
    const nextBadgeCount = notify.getNextBadgeCount(notify.getRecordNumber(tokenRecord, "badge_count"));
    if (notify.sendExpoPush(token, title, body, { type: "broadcast", broadcastKey: payload.key }, nextBadgeCount)) {
      delivered += 1;
      try {
        tokenRecord.set("badge_count", nextBadgeCount);
        e.app.save(tokenRecord);
      } catch (error) {
        console.log("[push-broadcast] failed to save badge count:", error);
      }
    } else {
      failed += 1;
    }
  }

  broadcast.set("status", failed === 0 ? "sent" : "failed");
  broadcast.set("recipient_count", recipientCount);
  broadcast.set("delivered_count", delivered);
  broadcast.set("failed_count", failed);
  broadcast.set("sent_at", new Date().toISOString());
  e.app.save(broadcast);

  return e.json(200, { key: payload.key, recipientCount, delivered, failed });
}, $apis.requireSuperuserAuth(), $apis.bodyLimit(4096));
