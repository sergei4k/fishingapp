import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const optionSource = fs.readFileSync(new URL("./SelectableOption.tsx", import.meta.url), "utf8");
const onboardingSource = fs.readFileSync(new URL("../../app/(auth)/onboarding.tsx", import.meta.url), "utf8");

test("unselected choices hug their text and selected choices expand for the checkmark", () => {
  assert.match(optionSource, /marginLeft:\s*CHECK_ICON_GAP \* progress/);
  assert.match(optionSource, /checkIcon:\s*\{/);
  assert.doesNotMatch(optionSource, /gap:\s*8/);
  assert.doesNotMatch(optionSource, /checkIconHidden/);
  assert.doesNotMatch(optionSource, /selectionMarker|selectionFill/);
  assert.doesNotMatch(optionSource, /components\/AppText/);
  assert.match(optionSource, /Text[\s\S]*from "react-native"/);
  assert.match(optionSource, /numberOfLines=\{3\}/);
  assert.match(optionSource, /styles\.label/);
  assert.doesNotMatch(optionSource, /label:\s*\{[\s\S]*?flex:\s*1,/);
  assert.doesNotMatch(optionSource, /style=\{\(\{ pressed \}\)/);
  assert.doesNotMatch(onboardingSource, /goalIcons|styleIcons|icon=\{/);
});

test("the selected checkmark animates when it enters and exits", () => {
  assert.match(optionSource, /from "react-native-reanimated"/);
  assert.match(optionSource, /<Animated\.View/);
  assert.match(optionSource, /useSharedValue\(selected \? 1 : 0\)/);
  assert.match(optionSource, /withTiming\(selected \? 1 : 0/);
  assert.match(optionSource, /width:\s*CHECK_ICON_WIDTH \* progress/);
});

test("chip resize animation is local and cannot affect the next onboarding screen", () => {
  assert.match(optionSource, /cancelAnimation\(selectionProgress\)/);
  assert.match(optionSource, /style=\{\[styles\.checkIcon, checkIconStyle\]\}/);
  assert.doesNotMatch(optionSource, /LayoutAnimation|AnimatedPressable|layout=|LinearTransition|entering=|exiting=/);
});

test("the onboarding question uses the native text renderer", () => {
  assert.match(onboardingSource, /Text,\s*View[\s\S]*from "react-native"/);
});

test("the reusable option supports both selection roles while onboarding uses multi-choice styles", () => {
  assert.match(optionSource, /mode === "single" \? "radio" : "checkbox"/);
  assert.doesNotMatch(onboardingSource, /mode="single"/);
});

test("the onboarding header starts with the question instead of a brand eyebrow", () => {
  assert.doesNotMatch(onboardingSource, />STRIKEFEED<|styles\.kicker/);
});

test("the continue button keeps its horizontal layout in the native app", () => {
  assert.doesNotMatch(onboardingSource, /style=\{\(\{ pressed \}\) => \[screenStyles\.continueButton/);
  assert.match(onboardingSource, /style=\{\[screenStyles\.continueButton/);
});

test("onboarding starts with fishing styles and ends with an optional avatar", () => {
  assert.doesNotMatch(onboardingSource, /What brings you to StrikeFeed|Log my catches|setPrimaryGoal|const goals/);
  assert.match(onboardingSource, /step === 0[\s\S]*What kind of fishing do you enjoy/);
  assert.match(onboardingSource, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(onboardingSource, /formData\.append\("avatar"/);
  assert.match(onboardingSource, /MAX_AVATAR_SIZE_BYTES/);
  assert.match(onboardingSource, /ALLOWED_AVATAR_MIME_TYPES/);
  assert.match(onboardingSource, /step === 2 \? finishOnboarding : continueFromStep/);
});

test("the location step clearly discloses that the city is public", () => {
  assert.match(onboardingSource, /your city will be public on your profile/);
  assert.match(onboardingSource, /ваш город будет виден всем в профиле/);
});

test("the location step does not show a separate privacy note", () => {
  assert.doesNotMatch(onboardingSource, /Region and coordinates are used only for recommendations/);
  assert.doesNotMatch(onboardingSource, /styles\.privacyNote|screenStyles\.privacyNote/);
});

test("location search results render as bordered full-width rows without map icons", () => {
  assert.doesNotMatch(onboardingSource, /name="location-outline"/);
  assert.match(onboardingSource, /results:\s*\{[^}]*flexDirection:\s*"column"/);
  assert.match(onboardingSource, /results:\s*\{[^}]*gap:\s*8/);
  assert.match(onboardingSource, /resultRow:\s*\{[^}]*width:\s*"100%"/);
  assert.match(onboardingSource, /<View style=\{\[screenStyles\.resultCard, pressed && screenStyles\.resultPressed\]\}>/);
  assert.match(onboardingSource, /resultCard:\s*\{[^}]*borderWidth:\s*1/);
  assert.match(onboardingSource, /resultCard:\s*\{[^}]*borderColor:\s*theme\.colors\.border/);
  assert.match(onboardingSource, /resultCard:\s*\{[^}]*borderRadius:\s*theme\.radius\.control/);
  assert.doesNotMatch(onboardingSource, /resultCard:\s*\{[^}]*borderBottomWidth/);
});
