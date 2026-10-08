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

test("new public catches are inserted into live social lists", () => {
  assert.match(source, /if \(e\.action === "create"\) \{/);
  assert.match(source, /void enrichCatches\(\[created\], user\?\.id\)/);
  assert.match(source, /setDiscoverItems\(prependIfMissing\)/);
  assert.match(source, /setFeedItems\(prependIfMissing\)/);
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

test("other-user profile catches use a two-column photo-first grid", () => {
  const profileModal = source.slice(source.indexOf("{/* User profile modal */}"), source.indexOf("<CatchDetailModal"));

  assert.match(profileModal, /data=\{loadingUserCatches \? \[\] : userCatches\}/);
  assert.match(profileModal, /numColumns=\{2\}/);
  assert.match(profileModal, /columnWrapperStyle=\{styles\.userCatchGridRow\}/);
  assert.match(profileModal, /style=\{styles\.userCatchGridItem\}/);
  assert.match(profileModal, /style=\{styles\.userCatchGridPhoto\}/);
});

test("other-user profiles keep a back button above the scrolling catch grid", () => {
  const profileModal = source.slice(source.indexOf("{/* User profile modal */}"), source.indexOf("<CatchDetailModal"));

  assert.match(profileModal, /style=\{\[styles\.userProfileBackButton, \{ top: safeTop \}\]\}/);
  assert.match(profileModal, /accessibilityLabel=\{language === "ru" \? "Назад" : "Go back"\}/);
});

test("feed catch descriptions are not bold", () => {
  assert.doesNotMatch(source, /feedCaption: \{[^}]*fontWeight/);
});

test("the feed passes the saved rod and reel into the catch detail modal", () => {
  assert.match(source, /rod: item\.rod \?\? null,\s*reel: item\.reel \?\? null,/);
});

test("social feed cards show the rod and reel saved on a catch", () => {
  const card = source.slice(source.indexOf("const renderFeedCard"), source.indexOf("const renderListCard"));
  const listCard = source.slice(source.indexOf("const renderListCard"), source.indexOf("// ── Render"));

  assert.match(source, /import \{ getTackleKindLabel \} from "@\/lib\/tackle"/);
  assert.doesNotMatch(source, /TACKLE_KIND_ICON/);
  assert.match(card, /const activeTackle = \(\["rod", "reel"\] as const\)/);
  assert.match(card, /getTackleKindLabel\(entry\.kind, language\)/);
  assert.match(listCard, /const listedTackle = \(\["rod", "reel"\] as const\)/);
});

test("opening a social catch refreshes every detail shown in the profile modal", () => {
  const openDetail = source.match(/const openDetail = \(item: CatchItem\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";

  assert.match(openDetail, /pb\.collection\("catches"\)\.getOne\(item\.id/);
  assert.match(openDetail, /photo_catches: record\.photo_catches \?\? item\.photo_catches \?\? item\.photoCatches/);
  assert.match(openDetail, /rod: record\.rod \?\? item\.rod/);
  assert.match(openDetail, /reel: record\.reel \?\? item\.reel/);
  assert.match(openDetail, /gear: record\.gear \?\? item\.gear/);
});

test("swiping feed photos scrolls the carousel instead of opening the catch", () => {
  const card = source.slice(source.indexOf("const renderFeedCard"), source.indexOf("const renderListCard"));
  const section = source.slice(source.indexOf("function FeedPhotoSection"), source.indexOf("function toCatchDetail"));

  assert.match(card, /<View style=\{styles\.feedCard\}>/);
  assert.doesNotMatch(card, /<TouchableOpacity[^>]*style=\{styles\.feedCard\}/);
  assert.match(card, /<FeedPhotoSection item=\{item\} onPressPhoto=\{\(\) => openDetail\(item\)\}>/);
  assert.match(section, /<TouchableOpacity activeOpacity=\{0\.9\} onPress=\{onPressPhoto\}>\s*<ImageWithLoader source=\{\{ uri: photos\[0\] \}\}/);
  assert.match(section, /onPageChange=\{setActive\}/);
});

test("the feed carousel pages stay pressable inside the horizontal scroll view", () => {
  const carousel = source.slice(source.indexOf("function FeedPhotoCarousel"), source.indexOf("function FeedPhotoSection"));

  assert.match(carousel, /active: number;\s*onPageChange: \(index: number\) => void;\s*onPressPhoto\?: \(\) => void;/);
  assert.match(carousel, /<ScrollView\s+horizontal\s+pagingEnabled/);
  assert.match(carousel, /onPageChange\(Math\.round\(e\.nativeEvent\.contentOffset\.x \/ w\)\)/);
  assert.match(carousel, /<TouchableOpacity key=\{i\} activeOpacity=\{0\.9\} onPress=\{onPressPhoto\}>\s*<ImageWithLoader/);
  assert.match(carousel, /pointerEvents="none"/);
});

test("feed cards follow the showing photo for species, gear and measurements", () => {
  const card = source.slice(source.indexOf("const renderFeedCard"), source.indexOf("const renderListCard"));

  assert.match(source, /import \{ getPhotoCatchEntry \} from "@\/lib\/photoCatches"/);
  assert.match(card, /\{\(activeIndex\) => \{/);
  assert.match(card, /const activePhoto = getPhotoCatchEntry\(item\.photo_catches, activeIndex\);/);
  assert.match(card, /const activeSpecies = activePhoto\?\.species \|\| item\.species;/);
  assert.match(card, /const activeGear = activePhoto\?\.gear \|\| item\.gear;/);
  assert.match(card, /<Text style=\{styles\.feedSpecies\}>\{getSpeciesLabel\(activeSpecies, language\)\}<\/Text>/);
  assert.match(card, /<Text style=\{styles\.feedGearText\}>\{getGearLabel\(activeGear, language\)\}<\/Text>/);
  assert.doesNotMatch(card, /getCatchSpeciesLabel\(item\.photo_catches/);
});

test("the active photo index stays inside the photo strip", () => {
  const section = source.slice(source.indexOf("function FeedPhotoSection"), source.indexOf("function toCatchDetail"));

  assert.match(section, /const activeIndex = Math\.min\(active, Math\.max\(photos\.length - 1, 0\)\);/);
  assert.match(section, /\{children\(activeIndex\)\}/);
});
