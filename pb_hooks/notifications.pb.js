function getRecordString(record, key) {
  try {
    return (record.getString(key) || "").trim();
  } catch {
    return "";
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
    }
  } catch (error) {
    console.log("Expo push request failed", error);
  }
}

function getNotificationCopy(language, type, actorName) {
  const isRussian = language === "ru";
  if (type === "like") {
    return isRussian
      ? {
          title: "Новый лайк",
          body: `${actorName} поставил лайк вашему улову`,
        }
      : {
          title: "New like",
          body: `${actorName} liked your catch`,
        };
  }

  if (type === "comment") {
    return isRussian
      ? {
          title: "Новый комментарий",
          body: `${actorName} прокомментировал ваш улов`,
        }
      : {
          title: "New comment",
          body: `${actorName} commented on your catch`,
        };
  }

  return isRussian
    ? {
        title: "Новый подписчик",
        body: `${actorName} подписался на вас`,
      }
    : {
        title: "New follower",
        body: `${actorName} started following you`,
      };
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

  const pushToken = getRecordString(ownerRecord, "pushToken");
  if (!pushToken) {
    return;
  }

  const language = getRecordString(ownerRecord, "language") || "en";

  let actorName = "Someone";
  try {
    const actorRecord = e.app.findRecordById("users", actorId);
    actorName = getRecordString(actorRecord, "username") || getRecordString(actorRecord, "name") || "Someone";
  } catch {}

  const copy = getNotificationCopy(language, label, actorName);

  sendExpoPush(pushToken, copy.title, copy.body, {
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

  const pushToken = getRecordString(targetRecord, "pushToken");
  if (!pushToken) {
    return;
  }

  const language = getRecordString(targetRecord, "language") || "en";

  let followerName = "Someone";
  try {
    const followerRecord = e.app.findRecordById("users", followerId);
    followerName = getRecordString(followerRecord, "username") || getRecordString(followerRecord, "name") || "Someone";
  } catch {}

  const copy = getNotificationCopy(language, "follow", followerName);

  sendExpoPush(pushToken, copy.title, copy.body, {
    followerId: followerId,
    followingId: followingId,
    type: "follow",
    language: language,
  });
}

onRecordAfterCreateSuccess((e) => {
  notifyCatchOwner(e, "like");
  e.next();
}, "likes");

onRecordAfterCreateSuccess((e) => {
  notifyCatchOwner(e, "comment");
  e.next();
}, "comments");

onRecordAfterCreateSuccess((e) => {
  notifyFollowedUser(e);
  e.next();
}, "follows");

const BADGE_LABELS = {
  verified:   { emoji: "✓", ru: "Верифицирован", en: "Verified" },
  early_bird: { emoji: "🐦", ru: "Первопроходец", en: "Early Bird" },
  pro:        { emoji: "🏆", ru: "Про",           en: "Pro" },
  legend:     { emoji: "⭐", ru: "Легенда",        en: "Legend" },
  pioneer:    { emoji: "🚀", ru: "Пионер",         en: "Pioneer" },
  rybolov:    { emoji: "🎣", ru: "Рыболов",        en: "Angler" },
  developer:  { emoji: "👾", ru: "Разработчик",    en: "Developer" },
};

onRecordAfterUpdateSuccess((e) => {
  try {
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

    const pushToken = getRecordString(e.record, "pushToken");
    if (!pushToken) return;

    const isRu = (getRecordString(e.record, "language") || "en") === "ru";

    for (const badgeId of added) {
      const info = BADGE_LABELS[badgeId];
      if (!info) continue;
      const title = isRu ? "🏅 Новый значок!" : "🏅 New badge!";
      const body = isRu
        ? `Вы получили значок ${info.emoji} ${info.ru}`
        : `You earned the ${info.emoji} ${info.en} badge`;
      sendExpoPush(pushToken, title, body, { type: "badge", badgeId });
    }
  } catch (err) {
    console.log("badge notification error:", err);
  }
  e.next();
}, "users");
