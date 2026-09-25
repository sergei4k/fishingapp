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

test("profile blocks publishing a catch without a photo", () => {
  assert.match(source, /canMakeCatchPublic/);
  assert.match(source, /Add a catch photo before making it public/);
});

test("profile loads catch details with the same resized server URL as social catches", () => {
  assert.match(source, /pocketbaseThumbUrl\(selectedCatch\.imageUrl \?\? selectedCatch\.pbImageUrl, "600x600"\) \?\? selectedCatch\.image \?\? null/);
  assert.match(source, /item\.imageUrl \?\? item\.pbImageUrl \?\? item\.image/);
});
