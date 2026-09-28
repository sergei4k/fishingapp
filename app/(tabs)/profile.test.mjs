import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./profile.tsx", import.meta.url), "utf8");

test("profile preserves its circular overlapping avatar", () => {
  assert.match(source, /profileAvatar:\s*\{[\s\S]*?width:\s*110,[\s\S]*?height:\s*110,[\s\S]*?borderRadius:\s*60,/);
});

test("profile identity is aligned beside the overlapping avatar", () => {
  assert.match(source, /<View style=\{styles\.profileIdentityRow\}>[\s\S]*?<TouchableOpacity[\s\S]*?<View style=\{styles\.profileIdentity\}>/);
  assert.match(source, /profileIdentityRow: \{ flexDirection: "row", alignItems: "flex-start"/);
  assert.match(source, /profileIdentity: \{ flex: 1, minWidth: 0,/);
});

test("profile name and username share one row with a conditional separator", () => {
  assert.match(source, /user\.name && user\.username \? <Text style=\{styles\.profileIdentityDot\}>•<\/Text> : null/);
  assert.match(source, /profileUsernameRow: \{ flexDirection: "row", alignItems: "center"/);
});

test("profile banner fades into the profile background", () => {
  assert.match(source, /<LinearGradient id="profile-banner-fade"/);
  assert.match(source, /stopOpacity="0"/);
  assert.match(source, /stopOpacity="0\.9"/);
  assert.match(source, /bannerFade: \{ position: "absolute", bottom: 0/);
});

test("re-encodes banner uploads as JPEG before sending them to PocketBase", () => {
  assert.match(source, /ImageManipulator\.SaveFormat\.JPEG/);
  assert.match(source, /const bannerUri = await prepareBanner\(asset\.uri\)/);
  assert.match(source, /formData\.append\("banner", new File\(bannerUri\)\)/);
});

test("profile allows publishing an adventure without a photo", () => {
  assert.doesNotMatch(source, /Add a catch photo before making it public/);
});

test("profile loads catch details with the same resized server URL as social catches", () => {
  assert.match(source, /pocketbaseThumbUrl\(selectedCatch\.imageUrl \?\? selectedCatch\.pbImageUrl, "600x600"\) \?\? selectedCatch\.image \?\? null/);
  assert.match(source, /item\.imageUrl \?\? item\.pbImageUrl \?\? item\.image/);
});

test("profile appends photos selected while editing a catch", () => {
  assert.match(source, /fields\.extraPhotos \?\? \[\]/);
  assert.match(source, /formData\.append\('images\+', new File\(uri\)\)/);
  assert.match(source, /extraPhotos = record\.images\.map\(\(filename: string\) => pb\.files\.getURL\(record, filename\)\)/);
});

test("profile removes extra photos deleted while editing a catch", () => {
  assert.match(source, /fields\.existingExtraPhotos/);
  assert.match(source, /formData\.append\('images-', filename\)/);
  assert.match(source, /existingExtraPhotoUrls\.has\(pb\.files\.getURL\(currentRecord, filename\)\)/);
});

test("profile clears the primary image when it is removed in the editor", () => {
  assert.match(source, /fields\.removePrimaryPhoto/);
  assert.match(source, /formData\.append\('image', ''\)/);
  assert.match(source, /imageUrl: fields\.removePrimaryPhoto \? undefined : selectedCatch\.imageUrl/);
});

test("profile persists edited catch coordinates and refreshes water body attribution", () => {
  assert.match(source, /fields\.location\?\.lat/);
  assert.match(source, /"\/water-bodies\/lookup"/);
  assert.match(source, /water_body_id: waterBodyId \?\? ''/);
  assert.match(source, /lat: fields\.location\?\.lat \?\? selectedCatch\.lat/);
});

test("profile catch descriptions are not bold", () => {
  assert.doesNotMatch(source, /desc: \{[^}]*fontWeight/);
});

test("profile passes the saved rod and reel into the catch detail modal", () => {
  assert.match(source, /rod: selectedCatch\.rod,\s*reel: selectedCatch\.reel,/);
});

test("profile catches use a two-column photo-first grid", () => {
  assert.match(source, /<FlatList\s+data=\{displayedCatches\}\s+numColumns=\{2\}/);
  assert.match(source, /columnWrapperStyle=\{styles\.catchGridRow\}/);
  assert.match(source, /style=\{styles\.catchGridItem\}/);
  assert.match(source, /style=\{styles\.catchGridPhoto\}/);
});
