// Push/email notification hooks.
//
// Helper functions live in ./notify_utils.js and are pulled in with require()
// *inside* each handler. This is required because PocketBase executes every hook
// handler in an isolated goja runtime that does not share scope with the file
// top level, so helpers defined here at the top level would be "not defined"
// inside the handlers (which previously threw ReferenceError and made the
// triggering request fail with a 400 even though the record was already saved).
//
// Every handler wraps its work in try/catch and always calls e.next(), so a
// notification failure can never break the create/update request itself.

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/notify_utils.js`).notifyCatchOwner(e, "like");
  } catch (err) {
    console.log("like notification error:", err);
  }
  e.next();
}, "likes");

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/notify_utils.js`).notifyCatchOwner(e, "comment");
  } catch (err) {
    console.log("comment notification error:", err);
  }
  e.next();
}, "comments");

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/notify_utils.js`).notifyFollowedUser(e);
  } catch (err) {
    console.log("follow notification error:", err);
  }
  e.next();
}, "follows");

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/notify_utils.js`).notifyGroupMessage(e);
  } catch (err) {
    console.log("group message notification error:", err);
  }
  e.next();
}, "group_messages");

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/notify_utils.js`).notifyNewUser(e);
  } catch (err) {
    console.log("new-user admin alert error:", err);
  }
  e.next();
}, "users");

onRecordAfterUpdateSuccess((e) => {
  try {
    require(`${__hooks}/notify_utils.js`).notifyBadgeChange(e);
  } catch (err) {
    console.log("badge notification error:", err);
  }
  e.next();
}, "users");
