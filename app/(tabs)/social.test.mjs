import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./social.tsx", import.meta.url), "utf8");

test("following feed loads catches one page at a time", () => {
  const loadFeed = source.match(/const loadFeed[\s\S]*?\n  \};/)?.[0] ?? "";

  assert.match(loadFeed, /getList\(page, PAGE_SIZE,/);
  assert.doesNotMatch(loadFeed, /getFullList\(/);
});

test("feed enrichment fetches dependent data concurrently", () => {
  assert.match(source, /const \[users, allLikes, allComments\] = await Promise\.all\(/);
});

test("unfollowing asks for confirmation before deleting the follow record", () => {
  const toggleFollow = source.match(/const toggleFollow = async \(targetUser: any\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";

  assert.match(toggleFollow, /Alert\.alert\(\s*t\("unfollowConfirmTitle"\),\s*t\("unfollowConfirmMessage"\)/);
  assert.match(toggleFollow, /text: t\("cancel"\),\s*style: "cancel"/);
  assert.match(toggleFollow, /text: t\("unfollow"\),\s*style: "destructive"/);
  assert.match(toggleFollow, /await pb\.collection\("follows"\)\.delete\(existing\.id\)/);
});
