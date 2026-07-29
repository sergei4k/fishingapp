// Account-deletion cleanup shared by the users delete-request hook.
//
// PocketBase runs this inside the same transaction as the parent account
// deletion. If any child record cannot be deleted, the entire request fails,
// leaving the account intact instead of partially deleting its data.

function deleteMatchingRecords(app, collection, filter, params) {
  const records = app.findRecordsByFilter(collection, filter, "", 0, 0, params);
  for (let i = 0; i < records.length; i++) {
    app.delete(records[i]);
  }
}

function deleteByUser(app, collection, field, userId) {
  deleteMatchingRecords(app, collection, `${field} = {:userId}`, { userId });
}

function deleteGroupAndItsContent(app, group) {
  const groupId = group.id;
  deleteMatchingRecords(app, "group_messages", "group_id = {:groupId}", { groupId });
  deleteMatchingRecords(app, "group_members", "group_id = {:groupId}", { groupId });
  app.delete(group);
}

function deleteAccountData(app, userId) {
  // Delete records that constrain the auth record first. `cascadeDelete` is
  // disabled for these required relations in the live schema.
  deleteByUser(app, "content_reports", "reporter_id", userId);
  deleteByUser(app, "content_reports", "reported_user_id", userId);
  deleteByUser(app, "user_blocks", "blocker_id", userId);
  deleteByUser(app, "user_blocks", "blocked_id", userId);

  // Delete data created by the account, including files attached to catches
  // and group messages. PocketBase removes record-owned files with the record.
  deleteByUser(app, "follows", "follower_id", userId);
  deleteByUser(app, "follows", "following_id", userId);
  deleteByUser(app, "catches", "user_id", userId);
  deleteByUser(app, "comments", "user_id", userId);
  deleteByUser(app, "likes", "user_id", userId);
  deleteByUser(app, "group_messages", "user_id", userId);
  deleteByUser(app, "group_members", "user_id", userId);
  deleteByUser(app, "spots", "user_id", userId);
  deleteByUser(app, "feedback", "user_id", userId);
  deleteByUser(app, "user_push_tokens", "user_id", userId);

  // A user-created group is account data. Remove its messages and memberships
  // before removing the group itself so it cannot leave orphaned content.
  const ownedGroups = app.findRecordsByFilter(
    "groups",
    "creator_id = {:userId}",
    "",
    0,
    0,
    { userId },
  );
  for (let i = 0; i < ownedGroups.length; i++) {
    deleteGroupAndItsContent(app, ownedGroups[i]);
  }
}

module.exports = { deleteAccountData };
