/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const userId = u.authId(e);
  if (!userId) throw new Error("forbidden");
  e.record.set("user_id", userId);
  e.next();
}, "user_push_tokens");

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const userId = u.authId(e);
  if (!userId) throw new Error("forbidden");

  let original = null;
  try {
    original = e.record.original();
  } catch {}

  const originalUserId = original ? u.getRecordString(original, "user_id") : "";
  if (!original || originalUserId !== userId) throw new Error("forbidden");

  e.record.set("user_id", originalUserId);
  e.next();
}, "user_push_tokens");
