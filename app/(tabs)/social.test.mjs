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

test("other-user profiles mirror the overlapping-avatar identity layout", () => {
  assert.match(source, /<View style=\{styles\.upIdentityRow\}>[\s\S]*?<TouchableOpacity[\s\S]*?<View style=\{styles\.upIdentity\}>/);
  assert.match(source, /upIdentityRow: \{ flexDirection: "row", alignItems: "flex-start"/);
  assert.match(source, /upAvatar: \{ width: 96, height: 96/);
  assert.match(source, /selectedUser\?\.name && selectedUser\?\.username \? <Text style=\{styles\.upIdentityDot\}>•<\/Text> : null/);
});

test("other-user banner fades into the profile background", () => {
  assert.match(source, /<LinearGradient id="other-profile-banner-fade"/);
  assert.match(source, /stopOpacity="0"/);
  assert.match(source, /stopOpacity="0\.9"/);
  assert.match(source, /upBannerFade: \{ position: "absolute", bottom: 0/);
});

test("other-user catch details use the same root modal as feed catches", () => {
  assert.equal((source.match(/<CatchDetailModal/g) ?? []).length, 1);
  assert.match(source, /<CatchDetailModal\s*catch=\{detailCatch\}\s*onClose=\{closeDetail\}\s*onShowOnMap=\{closeOverlaysForMap\}/);
  assert.match(source, /const \[pendingUserCatch, setPendingUserCatch\] = useState<CatchItem \| null>\(null\);/);
  assert.match(source, /const openUserCatchDetail = \(item: CatchItem\) => \{\s*setPendingUserCatch\(item\);[\s\S]*?setSelectedUser\(null\);/);
  assert.match(source, /if \(!pendingUserCatch \|\| selectedUser\) return;[\s\S]*?setDetailCatch\(toCatchDetail\(pendingUserCatch\)\)/);
});
