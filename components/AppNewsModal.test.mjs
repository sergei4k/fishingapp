import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(new URL("./AppNewsModal.tsx", import.meta.url), "utf8");
const socialSource = readFileSync(new URL("../app/(tabs)/social.tsx", import.meta.url), "utf8");

test("news is a separate accessible fullscreen modal", () => {
  assert.match(modalSource, /export default function AppNewsModal/);
  assert.match(modalSource, /presentationStyle="fullScreen"/);
  assert.match(modalSource, /SafeAreaView/);
  assert.match(modalSource, /accessibilityViewIsModal/);
  assert.match(modalSource, /accessibilityLabel=\{language === "ru" \? "Закрыть новости" : "Close news"\}/);
});

test("news header stays below the device status bar and notch", () => {
  assert.match(modalSource, /useSafeAreaInsets/);
  assert.match(modalSource, /const insets = useSafeAreaInsets\(\)/);
  assert.match(modalSource, /edges=\{\["left", "right", "bottom"\]\}/);
  assert.match(modalSource, /paddingTop:\s*Math\.max\(insets\.top,\s*theme\.spacing\.sm\)/);
});

test("news header only shows the close control", () => {
  assert.doesNotMatch(modalSource, /ru \? "Новости" : "News"/);
  assert.doesNotMatch(modalSource, /What’s new in StrikeFeed/);
  assert.match(modalSource, /header:\s*\{[^}]*justifyContent:\s*"flex-end"/);
});

test("news handles loading, errors, empty content, and pull to refresh", () => {
  assert.match(modalSource, /loading && items\.length === 0/);
  assert.match(modalSource, /error && items\.length === 0/);
  assert.match(modalSource, /items\.length === 0/);
  assert.match(modalSource, /RefreshControl/);
  assert.match(modalSource, /onRefresh/);
});

test("Social places News immediately before the notifications bell", () => {
  const newsIcon = socialSource.indexOf('name="newspaper-outline"');
  const bellIcon = socialSource.indexOf('name="notifications-outline"');

  assert.notEqual(newsIcon, -1);
  assert.notEqual(bellIcon, -1);
  assert.ok(newsIcon < bellIcon);
  assert.match(socialSource, /<AppNewsModal/);
  assert.match(socialSource, /fetchAppNews\(pb, language/);
  assert.match(socialSource, /writeNewsLastSeen\(AsyncStorage/);
  assert.match(socialSource, /useFocusEffect\([\s\S]*?void loadNews\(\)/);
});
