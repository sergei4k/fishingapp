/// <reference path="../pb_data/types.d.ts" />

// Authorization hooks for group membership and group chat messages.
//
// Helper functions live in ./group_chat_utils.js and are pulled in with
// require() *inside* each handler. PocketBase executes every hook handler in an
// isolated goja runtime that does not share scope with the file top level, so
// helpers defined here at the top level would be "not defined" inside the
// handlers and throw ReferenceError (surfacing to the client as a 400
// "Something went wrong while processing your request.").

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const userId = u.authId(e);
  if (!userId || u.recordOrBodyString(e, "user_id") !== userId) {
    throw new Error("forbidden");
  }

  const groupId = u.recordOrBodyString(e, "group_id");
  e.record.set("status", u.isGroupCreator(e, groupId, userId) ? "approved" : "pending");
  e.next();
}, "group_members");

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const userId = u.authId(e);
  const groupId = u.getRecordString(e.record, "group_id");
  if (!userId) {
    throw new Error("forbidden");
  }

  if (u.isGroupCreator(e, groupId, userId)) {
    e.next();
    return;
  }

  let original = null;
  try {
    original = e.record.original();
  } catch {}

  const originalUserId = original ? u.getRecordString(original, "user_id") : "";
  const originalGroupId = original ? u.getRecordString(original, "group_id") : "";
  const originalStatus = original ? u.getRecordString(original, "status") : "";
  if (!original || originalUserId !== userId || u.getRecordString(e.record, "user_id") !== originalUserId) {
    throw new Error("forbidden");
  }

  e.record.set("group_id", originalGroupId);
  e.record.set("user_id", originalUserId);
  e.record.set("status", originalStatus);
  e.next();
}, "group_members");

onRecordDeleteRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const userId = u.authId(e);
  const groupId = u.getRecordString(e.record, "group_id");
  const memberUserId = u.getRecordString(e.record, "user_id");
  if (!userId || (memberUserId !== userId && !u.isGroupCreator(e, groupId, userId))) {
    throw new Error("forbidden");
  }
  e.next();
}, "group_members");

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const userId = u.authId(e);
  const groupId = u.recordOrBodyString(e, "group_id");
  const recordUserId = u.recordOrBodyString(e, "user_id");
  const allowed = !!userId && recordUserId === userId && u.canAccessChat(e, groupId, userId);
  console.log("[group-chat] message create", "authId=", userId, "recordUserId=", recordUserId, "groupId=", groupId, "allowed=", allowed);
  if (!allowed) {
    console.log("[group-chat] reject message create", {
      authId: userId,
      recordUserId: recordUserId,
      groupId: groupId,
      canAccess: userId ? u.canAccessChat(e, groupId, userId) : false,
    });
    throw new Error("forbidden");
  }

  if (u.hasObjectionableText(u.recordOrBodyString(e, "text"))) {
    console.log("[group-chat] reject objectionable message", { authId: userId, groupId: groupId });
    throw new Error("objectionable content");
  }

  const replyTo = u.recordOrBodyString(e, "reply_to");
  if (replyTo) {
    let originalMessage = null;
    try {
      originalMessage = e.app.findRecordById("group_messages", replyTo);
    } catch {}
    if (!originalMessage || u.getRecordString(originalMessage, "group_id") !== groupId) {
      console.log("[group-chat] reject invalid reply", {
        replyTo: replyTo,
        groupId: groupId,
        authId: userId,
      });
      throw new Error("invalid reply");
    }
  }

  e.next();
}, "group_messages");
