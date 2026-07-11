/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/public/users/{userId}/catch-count", (e) => {
  const userId = e.request.pathValue("userId");
  if (!userId) {
    return e.json(400, { error: "missing userId" });
  }

  try {
    e.app.findRecordById("users", userId);
  } catch {
    return e.json(404, { error: "user not found" });
  }

  try {
    const safeUserId = String(userId).replace(/[^A-Za-z0-9_-]/g, "");
    const records = e.app.findRecordsByFilter("catches", `user_id = "${safeUserId}"`, "", 10000, 0);
    return e.json(200, { total: records.length });
  } catch (err) {
    console.log("[catch-count] failed:", err);
    return e.json(500, { error: "count failed" });
  }
});
