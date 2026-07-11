// Shared helpers for notification hooks.
//
// IMPORTANT: PocketBase runs each hook handler in an isolated goja runtime that
// does NOT share scope with the top level of the .pb.js file. Functions defined
// at the top of a hook file are therefore "not defined" inside the handlers.
// The fix is to keep the reusable logic here and pull it in with require()
// *inside* each handler (see notifications.pb.js).

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

function sendExpoPush(token, title, body, data) {
  try {
    const response = $http.send({
      method: "POST",
      url: "https://exp.host/--/api/v2/push/send",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        sound: "default",
        title: title,
        body: body,
        data: data,
      }),
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      console.log("Expo push failed", response.statusCode, response.raw);
      return false;
    }

    try {
      const json = JSON.parse(response.raw || "{}");
      const payload = Array.isArray(json.data) ? json.data[0] : json.data;
      if (payload && payload.status === "error") {
        console.log("Expo push rejected", payload.message || payload.details || "unknown error");
        return false;
      }
    } catch {}

    return true;
  } catch (error) {
    console.log("Expo push request failed", error);
    return false;
  }
}

function recordFilePresent(record, key) {
  try {
    const value = record.get(key);
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  } catch {
    try {
      return !!getRecordString(record, key);
    } catch {
      return false;
    }
  }
}

function uniquePushTokens(tokens) {
  const seen = {};
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = String(tokens[i] || "").trim();
    if (!token || seen[token]) continue;
    seen[token] = true;
    result.push(token);
  }
  return result;
}

function getUserPushTokens(e, userId, fallbackUserRecord) {
  const tokens = [];
  if (!userId) return tokens;

  try {
    const safeUserId = String(userId).replace(/[^A-Za-z0-9_-]/g, "");
    const records = e.app.findRecordsByFilter(
      "user_push_tokens",
      `user_id = "${safeUserId}"`,
      "-updated",
      50,
      0,
    );
    for (let i = 0; i < records.length; i++) {
      const token = getRecordString(records[i], "token");
      if (token) tokens.push(token);
    }
  } catch (err) {
    console.log("[push-tokens] user_push_tokens lookup failed:", err);
  }

  if (fallbackUserRecord) {
    const fallback = getRecordString(fallbackUserRecord, "pushToken");
    if (fallback) tokens.push(fallback);
  }

  return uniquePushTokens(tokens);
}

function sendExpoPushToUser(e, userId, userRecord, title, body, data) {
  const tokens = getUserPushTokens(e, userId, userRecord);
  if (tokens.length === 0) return { sent: 0, failed: 0, noToken: 1 };

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (sendExpoPush(tokens[i], title, body, data)) sent += 1;
    else failed += 1;
  }
  return { sent: sent, failed: failed, noToken: 0 };
}

function getNotificationCopy(language, type, actorName) {
  const isRussian = language === "ru";
  if (type === "like") {
    return isRussian
      ? { title: "Новый лайк", body: `${actorName} поставил лайк вашему улову` }
      : { title: "New like", body: `${actorName} liked your catch` };
  }

  if (type === "comment") {
    return isRussian
      ? { title: "Новый комментарий", body: `${actorName} прокомментировал ваш улов` }
      : { title: "New comment", body: `${actorName} commented on your catch` };
  }

  return isRussian
    ? { title: "Новый подписчик", body: `${actorName} подписался на вас` }
    : { title: "New follower", body: `${actorName} started following you` };
}

function notifyCatchOwner(e, label) {
  const record = e.record;
  const catchId = getRecordString(record, "catch_id");
  const actorId = getRecordString(record, "user_id");
  if (!catchId || !actorId) {
    return;
  }

  let catchRecord;
  try {
    catchRecord = e.app.findRecordById("catches", catchId);
  } catch {
    return;
  }

  const ownerId = getRecordString(catchRecord, "user_id");
  if (!ownerId || ownerId === actorId) {
    return;
  }

  let ownerRecord;
  try {
    ownerRecord = e.app.findRecordById("users", ownerId);
  } catch {
    return;
  }

  const language = getRecordString(ownerRecord, "language") || "en";

  let actorName = "Someone";
  try {
    const actorRecord = e.app.findRecordById("users", actorId);
    actorName = getRecordString(actorRecord, "username") || getRecordString(actorRecord, "name") || "Someone";
  } catch {}

  const copy = getNotificationCopy(language, label, actorName);

  sendExpoPushToUser(e, ownerId, ownerRecord, copy.title, copy.body, {
    catchId: catchId,
    type: label,
    language: language,
  });
}

function notifyFollowedUser(e) {
  const record = e.record;
  const followerId = getRecordString(record, "follower_id");
  const followingId = getRecordString(record, "following_id");
  if (!followerId || !followingId || followerId === followingId) {
    return;
  }

  let targetRecord;
  try {
    targetRecord = e.app.findRecordById("users", followingId);
  } catch {
    return;
  }

  const language = getRecordString(targetRecord, "language") || "en";

  let followerName = "Someone";
  try {
    const followerRecord = e.app.findRecordById("users", followerId);
    followerName = getRecordString(followerRecord, "username") || getRecordString(followerRecord, "name") || "Someone";
  } catch {}

  const copy = getNotificationCopy(language, "follow", followerName);

  sendExpoPushToUser(e, followingId, targetRecord, copy.title, copy.body, {
    followerId: followerId,
    followingId: followingId,
    type: "follow",
    language: language,
  });
}

const ADMIN_EMAIL = "serg.ivnv05@gmail.com";

function notifyNewUser(e) {
  const username = getRecordString(e.record, "username") || getRecordString(e.record, "name") || "(no name)";
  const email = getRecordString(e.record, "email") || "(no email)";
  const message = new MailerMessage({
    from: {
      address: e.app.settings().meta.senderAddress,
      name: e.app.settings().meta.senderName,
    },
    to: [{ address: ADMIN_EMAIL }],
    subject: "New StrikeFeed user",
    html: `<p>New signup:</p><p><b>${username}</b> — ${email}</p>`,
  });
  e.app.newMailClient().send(message);
}

const BADGE_LABELS = {
  verified:   { emoji: "✓", ru: "Верифицирован", en: "Verified" },
  early_bird: { emoji: "🐦", ru: "Первопроходец", en: "Early Bird" },
  pro:        { emoji: "🏆", ru: "Про",           en: "Pro" },
  legend:     { emoji: "⭐", ru: "Легенда",        en: "Legend" },
  pioneer:    { emoji: "🚀", ru: "Пионер",         en: "Pioneer" },
  rybolov:    { emoji: "🎣", ru: "Рыболов",        en: "Angler" },
  developer:  { emoji: "👾", ru: "Разработчик",    en: "Developer" },
};

function notifyBadgeChange(e) {
  const newRaw = getRecordString(e.record, "badges") || "[]";
  let oldRaw = "[]";
  try { oldRaw = getRecordString(e.record.original(), "badges") || "[]"; } catch {}

  let newBadges = [];
  let oldBadges = [];
  try { newBadges = JSON.parse(newRaw); } catch {}
  try { oldBadges = JSON.parse(oldRaw); } catch {}

  if (!Array.isArray(newBadges) || !Array.isArray(oldBadges)) return;

  const added = newBadges.filter((b) => !oldBadges.includes(b));
  if (added.length === 0) return;

  const isRu = (getRecordString(e.record, "language") || "en") === "ru";

  for (const badgeId of added) {
    const info = BADGE_LABELS[badgeId];
    if (!info) continue;
    const title = isRu ? "🏅 Новый значок!" : "🏅 New badge!";
    const body = isRu
      ? `Вы получили значок ${info.emoji} ${info.ru}`
      : `You earned the ${info.emoji} ${info.en} badge`;
    sendExpoPushToUser(e, e.record.id, e.record, title, body, { type: "badge", badgeId });
  }
}

function notifyGroupMessage(e) {
  const record = e.record;
  const groupId = getRecordString(record, "group_id");
  const senderId = getRecordString(record, "user_id");
  if (!groupId || !senderId) {
    console.log("[group-notify] skipped: missing group or sender", groupId, senderId);
    return;
  }

  let groupRecord;
  try {
    groupRecord = e.app.findRecordById("groups", groupId);
  } catch {
    console.log("[group-notify] skipped: group not found", groupId);
    return;
  }

  const groupName = getRecordString(groupRecord, "name") || "Chat";
  const creatorId = getRecordString(groupRecord, "creator_id");

  let senderName = getRecordString(record, "username") || "Someone";
  try {
    const senderRecord = e.app.findRecordById("users", senderId);
    senderName = getRecordString(senderRecord, "username") || getRecordString(senderRecord, "name") || senderName;
  } catch {}

  const text = getRecordString(record, "text");
  const hasImage = recordFilePresent(record, "image");

  const recipients = {};
  if (creatorId) recipients[creatorId] = { muted: false };

  try {
    const safeGroupId = String(groupId).replace(/[^A-Za-z0-9_-]/g, "");
    const members = e.app.findRecordsByFilter(
      "group_members",
      `group_id = "${safeGroupId}" && status = "approved"`,
      "",
      500,
      0,
    );
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      const userId = getRecordString(member, "user_id");
      if (!userId) continue;
      recipients[userId] = { muted: getRecordBool(member, "muted") };
    }
  } catch (err) {
    console.log("group message member lookup failed:", err);
  }

  delete recipients[senderId];

  let sent = 0;
  let skippedMuted = 0;
  let skippedNoToken = 0;
  let failed = 0;
  for (const userId in recipients) {
    if (recipients[userId].muted) {
      skippedMuted += 1;
      continue;
    }

    let userRecord;
    try {
      userRecord = e.app.findRecordById("users", userId);
    } catch {
      continue;
    }

    const tokens = getUserPushTokens(e, userId, userRecord);
    if (tokens.length === 0) {
      skippedNoToken += 1;
      continue;
    }

    const language = getRecordString(userRecord, "language") || "en";
    const isRussian = language === "ru";
    const fallback = hasImage ? (isRussian ? "отправил фото" : "sent a photo") : (isRussian ? "Новое сообщение" : "New message");
    const body = `${senderName}: ${text || fallback}`;

    for (let i = 0; i < tokens.length; i++) {
      const ok = sendExpoPush(tokens[i], groupName, body, {
        type: "group_message",
        groupId: groupId,
        messageId: record.id,
        language: language,
      });
      if (ok) sent += 1;
      else failed += 1;
    }
  }

  console.log("[group-notify] message", record.id, "group=", groupId, "recipients=", Object.keys(recipients).length, "sent=", sent, "muted=", skippedMuted, "noToken=", skippedNoToken, "failed=", failed);
}

module.exports = {
  getRecordString,
  getRecordBool,
  recordFilePresent,
  getUserPushTokens,
  sendExpoPushToUser,
  sendExpoPush,
  getNotificationCopy,
  notifyCatchOwner,
  notifyFollowedUser,
  notifyNewUser,
  notifyBadgeChange,
  notifyGroupMessage,
  BADGE_LABELS,
  ADMIN_EMAIL,
};
