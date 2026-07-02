/// <reference path="../pb_data/types.d.ts" />

// RevenueCat webhook → server-side source of truth for the "verified" badge
// (our premium marker). Runs with elevated privileges, so it can write the
// badges field even though clients are blocked from editing it directly.
//
// Setup:
//   1. Set env var REVENUECAT_WEBHOOK_SECRET on the PocketBase server.
//   2. RevenueCat → Project → Integrations → Webhooks:
//        URL:  https://strikefeed.tech/revenuecat-webhook
//        Authorization header: the same secret value.
//
// The client calls Purchases.logIn(user.id), so event.app_user_id == the
// PocketBase users record id.

const PRO_ENTITLEMENT = "pro";

// Events that mean the user currently has (or regained) access.
const GRANT_TYPES = [
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
];
// Access has actually ended. CANCELLATION only turns off auto-renew (access
// continues until EXPIRATION), so we don't revoke on it.
const REVOKE_TYPES = ["EXPIRATION"];

function parseBadges(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

routerAdd("POST", "/revenuecat-webhook", (e) => {
  const expected = $os.getenv("REVENUECAT_WEBHOOK_SECRET");

  let info;
  try {
    info = e.requestInfo();
  } catch (err) {
    console.log("[revenuecat] failed to read request:", err);
    return e.json(400, { error: "bad request" });
  }

  const auth = (info.headers && info.headers["authorization"]) || "";
  if (!expected) {
    console.log("[revenuecat] REVENUECAT_WEBHOOK_SECRET not set — ignoring event");
    return e.json(200, { ok: true, skipped: "no secret configured" });
  }
  if (auth !== expected) {
    return e.json(401, { error: "unauthorized" });
  }

  const event = (info.body && info.body.event) || null;
  if (!event || !event.type) {
    return e.json(200, { ok: true, skipped: "no event" });
  }

  const type = event.type;
  if (type === "TEST") {
    console.log("[revenuecat] test event received");
    return e.json(200, { ok: true });
  }

  // Only act on our Pro entitlement when the payload scopes it.
  const entIds = event.entitlement_ids;
  if (Array.isArray(entIds) && entIds.length > 0 && entIds.indexOf(PRO_ENTITLEMENT) === -1) {
    if (event.entitlement_id !== PRO_ENTITLEMENT) {
      return e.json(200, { ok: true, skipped: "other entitlement" });
    }
  }

  const grant = GRANT_TYPES.indexOf(type) !== -1;
  const revoke = REVOKE_TYPES.indexOf(type) !== -1;
  if (!grant && !revoke) {
    return e.json(200, { ok: true, skipped: type });
  }

  const userId = event.app_user_id || "";
  if (!userId || userId.indexOf("$RCAnonymousID:") === 0) {
    return e.json(200, { ok: true, skipped: "no app_user_id" });
  }

  let user;
  try {
    user = e.app.findRecordById("users", userId);
  } catch {
    return e.json(200, { ok: true, skipped: "unknown user" });
  }

  const badges = parseBadges((user.getString("badges") || "").trim());
  const hasVerified = badges.indexOf("verified") !== -1;

  if (grant) {
    if (hasVerified) return e.json(200, { ok: true, unchanged: true });
    badges.push("verified");
  } else {
    // revoke
    if (!hasVerified) return e.json(200, { ok: true, unchanged: true });
    // Never strip verification from admin/special accounts.
    if (badges.indexOf("developer") !== -1) {
      return e.json(200, { ok: true, protected: true });
    }
    badges.splice(badges.indexOf("verified"), 1);
  }

  try {
    user.set("badges", badges);
    e.app.save(user);
  } catch (err) {
    console.log("[revenuecat] failed to update badges:", err);
    return e.json(500, { error: "save failed" });
  }

  console.log("[revenuecat]", grant ? "granted" : "revoked", "verified for", userId, "(", type, ")");
  return e.json(200, { ok: true });
});
