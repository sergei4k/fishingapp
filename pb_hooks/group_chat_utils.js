// Shared helpers for the group chat / membership authorization hooks.
//
// IMPORTANT: PocketBase runs each hook handler in an isolated goja runtime that
// does NOT share scope with the top level of the .pb.js file. Functions defined
// at the top of a hook file are therefore "not defined" inside the handlers and
// throw ReferenceError (which surfaces to the client as a 400 "Something went
// wrong while processing your request."). Keep the logic here and pull it in
// with require() *inside* each handler (see group_chat.pb.js).

function getRecordString(record, key) {
  try {
    return (record.getString(key) || "").trim();
  } catch {
    return "";
  }
}

function getRecordBool(record, key) {
  try {
    return !!record.getBool(key);
  } catch {
    return false;
  }
}

function authId(e) {
  try {
    if (e.auth && e.auth.id) return String(e.auth.id);
    try {
      if (e.auth) return String(e.auth.get("id") || "");
    } catch {}
    try {
      if (e.auth) return String(e.auth.getString("id") || "");
    } catch {}
    const info = typeof e.requestInfo === "function" ? e.requestInfo() : e.requestInfo;
    const auth = info && info.auth;
    if (!auth) return "";
    if (auth.id) return String(auth.id);
    try { return String(auth.get("id") || ""); } catch {}
    try { return String(auth.getString("id") || ""); } catch {}
  } catch {}
  return "";
}

function requestBodyString(e, key) {
  try {
    const info = typeof e.requestInfo === "function" ? e.requestInfo() : e.requestInfo;
    const body = info && info.body;
    if (!body) return "";
    const value = body[key];
    return value == null ? "" : String(value).trim();
  } catch {}
  return "";
}

function recordOrBodyString(e, key) {
  return getRecordString(e.record, key) || requestBodyString(e, key);
}

function findGroup(e, groupId) {
  if (!groupId) return null;
  try {
    return e.app.findRecordById("groups", groupId);
  } catch {
    return null;
  }
}

function isGroupCreator(e, groupId, userId) {
  const group = findGroup(e, groupId);
  return !!group && getRecordString(group, "creator_id") === userId;
}

function isApprovedMember(e, groupId, userId) {
  if (!groupId || !userId) return false;
  try {
    const safeGroupId = String(groupId).replace(/[^A-Za-z0-9_-]/g, "");
    const safeUserId = String(userId).replace(/[^A-Za-z0-9_-]/g, "");
    const records = e.app.findRecordsByFilter(
      "group_members",
      `group_id = "${safeGroupId}" && user_id = "${safeUserId}"`,
      "",
      1,
      0,
    );
    for (let i = 0; i < records.length; i++) {
      if (getRecordString(records[i], "status") !== "pending") {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.log("[group-chat] member lookup failed:", err);
    return false;
  }
}

function canAccessChat(e, groupId, userId) {
  return isGroupCreator(e, groupId, userId) || isApprovedMember(e, groupId, userId);
}

const BLOCKED_TERMS = [
  "fuck", "shit", "nigga", "niga", "cunt", "nigger", "faggot", "fag", "bitch", "asshole", "bastard", "whore", "slut",
  "хуй", "хуя", "хуем", "хуйня", "пизда", "пизды", "пиздец", "пизде", "ебать", "ебал", "ебаный", "ёбаный",
  "блядь", "бляди", "сука", "суки", "мудак", "мудаки", "пидор", "пидорас", "залупа", "ёб",
  "huy", "khuy", "hui", "pizda", "blyad", "bliad", "ebat", "ebal", "suka", "mudak", "pidor",
];

function hasObjectionableText(text) {
  const value = String(text || "").toLowerCase();
  return BLOCKED_TERMS.some((term) => value.includes(term));
}

module.exports = {
  getRecordString,
  getRecordBool,
  authId,
  requestBodyString,
  recordOrBodyString,
  findGroup,
  isGroupCreator,
  isApprovedMember,
  canAccessChat,
  hasObjectionableText,
};
