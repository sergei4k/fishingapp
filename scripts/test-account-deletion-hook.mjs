import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { deleteAccountData } = require("../pb_hooks/account_deletion_utils.js");

const userId = "account-under-test";
const deleted = [];
const queries = [];

const recordsByCollection = {
  catches: [{ id: "catch-1" }],
  comments: [{ id: "comment-1" }],
  likes: [{ id: "like-1" }],
  follows: [{ id: "follow-1" }],
  group_messages: [{ id: "message-1" }],
  group_members: [{ id: "member-1" }],
  groups: [{ id: "group-1" }],
  spots: [{ id: "spot-1" }],
  feedback: [{ id: "feedback-1" }],
  user_push_tokens: [{ id: "token-1" }],
  user_blocks: [{ id: "block-1" }],
  content_reports: [{ id: "report-1" }],
};

const app = {
  findRecordsByFilter(collection, filter, sort, limit, offset, params) {
    queries.push({ collection, filter, sort, limit, offset, params });
    return recordsByCollection[collection] ?? [];
  },
  delete(record) {
    deleted.push(record.id);
  },
};

deleteAccountData(app, userId);

assert.equal(queries.length, 17, "every account-owned data path is queried");
assert.ok(
  queries.every((query) => query.params?.userId === userId || query.params?.groupId === "group-1"),
  "all identifiers are bound as query parameters",
);
assert.deepEqual(
  new Set(deleted),
  new Set([
    "catch-1", "comment-1", "like-1", "follow-1", "message-1", "member-1",
    "group-1", "spot-1", "feedback-1", "token-1", "block-1", "report-1",
  ]),
  "all dependent records are deleted",
);
assert.ok(
  queries.findIndex((query) => query.collection === "content_reports") <
    queries.findIndex((query) => query.collection === "catches"),
  "reports are deleted before the content they reference",
);

console.log("account deletion hook checks passed");
