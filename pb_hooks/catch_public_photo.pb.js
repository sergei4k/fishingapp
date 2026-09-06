/// <reference path="../pb_data/types.d.ts" />

// This is the authoritative validation for direct API requests and older app
// versions. Private catches may omit a photo; public catches may not.
onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const visibility = require(`${__hooks}/catch_public_photo_utils.js`);
  if (!visibility.canPublishCatch(u.getRecordBool(e.record, "is_public"), u.getRecordString(e.record, "image"))) {
    throw new Error("a public catch requires a photo");
  }
  e.next();
}, "catches");

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const visibility = require(`${__hooks}/catch_public_photo_utils.js`);
  if (!visibility.canPublishCatch(u.getRecordBool(e.record, "is_public"), u.getRecordString(e.record, "image"))) {
    throw new Error("a public catch requires a photo");
  }
  e.next();
}, "catches");
