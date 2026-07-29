/// <reference path="../pb_data/types.d.ts" />

// Delete all account-owned data before PocketBase deletes the users record.
// This hook is intentionally attached to the built-in delete API, so the app
// still uses PocketBase's normal delete rule and session authentication.
onRecordDeleteRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const authenticatedUserId = u.authId(e);
  const targetUserId = u.getRecordString(e.record, "id");
  let isSuperuser = false;
  try {
    const requestInfo = typeof e.requestInfo === "function" ? e.requestInfo() : e.requestInfo;
    isSuperuser = !!requestInfo?.auth?.isSuperuser?.();
  } catch {}

  // Defense in depth: never let an authenticated user trigger cleanup for a
  // different account, even if the collection delete rule is changed later.
  // PocketBase superusers retain their administrative deletion capability.
  if (!isSuperuser && (!authenticatedUserId || authenticatedUserId !== targetUserId)) {
    throw new Error("forbidden");
  }

  const accountDeletion = require(`${__hooks}/account_deletion_utils.js`);
  accountDeletion.deleteAccountData(e.app, targetUserId);
  e.next();
}, "users");
