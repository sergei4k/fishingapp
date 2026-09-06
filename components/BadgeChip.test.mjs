import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chipSource = readFileSync(new URL("./BadgeChip.tsx", import.meta.url), "utf8");
const badgeSource = readFileSync(new URL("../lib/badges.ts", import.meta.url), "utf8");

test("badge chips use the app Ionicons pack instead of emoji text", () => {
  assert.match(chipSource, /import \{ Ionicons \} from "@expo\/vector-icons"/);
  assert.match(chipSource, /<Ionicons name=\{b\.icon\}/);
  assert.doesNotMatch(chipSource, /b\.emoji/);
  assert.doesNotMatch(badgeSource, /emoji:/);
});

test("every saved badge has an Ionicons name", () => {
  for (const icon of ["checkmark-circle", "sunny", "trophy", "star", "rocket", "fish", "code-slash"]) {
    assert.match(badgeSource, new RegExp(`icon: "${icon}"`));
  }
});

test("profile badge chips open an accessible explanation with the badge's earning criteria", () => {
  assert.match(chipSource, /TouchableOpacity/);
  assert.match(chipSource, /onPress=\{\(\) => setSelectedBadge\(id\)\}/);
  assert.match(chipSource, /accessibilityLabel=/);
  assert.match(chipSource, /<Modal/);
  assert.match(chipSource, /selectedBadge/);
  assert.match(badgeSource, /descriptionEn:/);
  assert.match(badgeSource, /Log your first catch/);
});

test("badge explanations use the Strikefeed product name", () => {
  assert.match(badgeSource, /Strikefeed/);
  assert.doesNotMatch(badgeSource, /Rybolov/);
});

test("the subscription badge is named Strikefeed Pro", () => {
  assert.match(badgeSource, /verified:[\s\S]*?labelEn: "Strikefeed Pro"/);
  assert.match(badgeSource, /verified:[\s\S]*?labelRu: "Strikefeed Pro"/);
});

test("badge explanation uses a top-right X close button", () => {
  assert.match(chipSource, /name="close"/);
  assert.match(chipSource, /style=\{styles\.closeButton\}/);
  assert.doesNotMatch(chipSource, /Got it/);
});
