import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const tabsSource = readFileSync(new URL("./_layout.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../../lib/auth.tsx", import.meta.url), "utf8");

test("map catch filters cross-fade instead of replacing the marker source", () => {
  assert.match(source, /const CATCH_VIEW_FADE = \{ duration: 240, delay: 0 \}/);
  assert.match(source, /const switchMapView = \(nextView: "public" \| "mine"\)/);
  assert.match(source, /iconOpacityTransition: CATCH_VIEW_FADE/);
  assert.match(source, /circleOpacityTransition: CATCH_VIEW_FADE/);
});

test("map catch filter uses an animated sliding thumb", () => {
  assert.match(source, /const mapViewSlider = useRef\(new Animated\.Value\(0\)\)\.current/);
  assert.match(source, /Animated\.timing\(mapViewSlider, \{/);
  assert.match(source, /toValue: nextView === "mine" \? 1 : 0/);
  assert.match(source, /<Animated\.View\s+pointerEvents="none"\s+style=\{\[\s*styles\.viewToggleThumb,/);
  assert.match(source, /transform: \[\{ translateX: mapViewSlider\.interpolate/);
});

test("only newly created accounts without catches see the first-catch welcome", () => {
  assert.match(source, /const WELCOME_CARD_STORAGE_PREFIX = "@welcome_add_catch_pending:"/);
  assert.match(source, /const pending = await AsyncStorage\.getItem\(`\$\{WELCOME_CARD_STORAGE_PREFIX\}\$\{user\.id\}`\)/);
  assert.match(source, /getCatches\(\),/);
  assert.match(source, /pb\.collection\("catches"\)\.getList\(1, 1,/);
  assert.match(source, /const hasCatches = catches\.length > 0 \|\| remoteCatches\.totalItems > 0;/);
  assert.match(source, /setShowWelcomeCard\(!hasCatches\)/);
  assert.match(source, /AsyncStorage\.removeItem\(`\$\{WELCOME_CARD_STORAGE_PREFIX\}\$\{user\.id\}`\)/);
  assert.match(source, /Add your first catch/);
  assert.match(source, /Добавь свой первый улов/);
  assert.match(source, /Добро пожаловать/);
  assert.match(source, /router\.push\("\/\(tabs\)\/add"\)/);
});

test("account creation enables the welcome once before signing the user in", () => {
  assert.match(authSource, /const WELCOME_CARD_STORAGE_PREFIX = '@welcome_add_catch_pending:';/);
  assert.match(authSource, /AsyncStorage\.setItem\(`\$\{WELCOME_CARD_STORAGE_PREFIX\}\$\{createdUser\.id\}`, 'true'\)\.catch\(\(\) => \{\}\);/);
  assert.match(authSource, /AsyncStorage\.setItem[\s\S]*?await pb\.collection\('users'\)\.authWithPassword\(email, password\);/);
});

test("welcome card moves map controls clear of the card", () => {
  assert.match(source, /showWelcomeCard && styles\.controlsWithWelcome/);
  assert.match(source, /controlsWithWelcome:\s*\{\s*bottom: 244,/);
});

test("welcome card is a full-screen first-run experience", () => {
  assert.match(source, /<View style=\{styles\.welcomeBackdrop\} pointerEvents="auto" \/>/);
  assert.match(source, /style=\{\[styles\.welcomeCard, \{ top: 0, bottom: 0 \}\]\}/);
  assert.match(source, /welcomeBackdrop:\s*\{\s*\.\.\.StyleSheet\.absoluteFillObject,/);
  assert.match(source, /welcomeCard:\s*\{[\s\S]*?left: 0,[\s\S]*?right: 0,/);
  assert.match(source, /welcomeBackgroundImage:\s*\{\s*\.\.\.StyleSheet\.absoluteFillObject,/);
  assert.match(source, /welcomeCardContent:\s*\{[\s\S]*?alignItems: "center",[\s\S]*?justifyContent: "center",/);
});

test("welcome card guides the user to the Add Catch tab without an in-card button", () => {
  assert.match(source, /source=\{require\("\.\.\/\.\.\/assets\/images\/default-water-banner\.png"\)\}/);
  assert.match(source, /style=\{styles\.welcomeCardContent\}/);
  assert.match(source, /Добро пожаловать/);
  assert.match(source, /Добавь свой первый улов/);
  assert.match(source, /Click Add Catch/);
  assert.match(source, /Нажми «Добавить»/);
  assert.match(source, /name="arrow-down"/);
  assert.match(source, /style=\{\[styles\.welcomeAddCatchGuide,/);
  assert.match(source, /Animated\.loop\([\s\S]*?welcomeGuideOffset/);
  assert.match(source, /firstCatchOnboardingAddPressed/, "The guide should disappear once the user selects Add Catch.");
  assert.match(tabsSource, /route\.name === 'add'\) DeviceEventEmitter\.emit\('firstCatchOnboardingAddPressed'\)/);
  assert.doesNotMatch(source, /welcomeCardButton|welcomeCardButtonText|openAddCatch/);
});

test("welcome card title uses the app display font", () => {
  assert.match(source, /welcomeCardTitle:\s*\{[\s\S]*?fontFamily: theme\.fonts\.displayBold/);
});

test("welcome card body has comfortable multi-line spacing", () => {
  assert.match(source, /welcomeCardMessage:\s*\{[\s\S]*?fontSize:\s*17,[\s\S]*?lineHeight:\s*24,/);
});
