import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const tabsSource = readFileSync(new URL("./_layout.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../../lib/auth.tsx", import.meta.url), "utf8");

test("map catch filters cross-fade instead of replacing the marker source", () => {
  assert.match(source, /const CATCH_VIEW_FADE = \{ duration: 240, delay: 0 \}/);
  assert.match(source, /const switchMapView = \(nextView: "public" \| "mine"\)/);
  assert.match(source, /circleOpacityTransition: CATCH_VIEW_FADE/);
});

test("individual catch pins appear only at closer zoom levels", () => {
  assert.match(source, /const CATCH_PIN_MIN_ZOOM = 12;/);
  assert.match(source, /const \[showCatchPins, setShowCatchPins\] = useState\(false\);/);
  assert.match(source, /const \[catchLayersVisible, setCatchLayersVisible\] = useState\(false\);/);
  assert.match(source, /const shouldShowCatchPins = state\.properties\.zoom >= CATCH_PIN_MIN_ZOOM;/);
  assert.match(source, /visibility: !showHeatmap && catchLayersVisible \? "visible" : "none"/);
  assert.match(source, /setTimeout\(\(\) => setCatchLayersVisible\(false\), CATCH_VIEW_FADE\.duration\)/);
  assert.doesNotMatch(source, /mapLoaded/);
});

test("main map configures Mapbox Standard labels for the selected language", () => {
  assert.match(source, /mapStyleKey === "standard" \? <MapboxGL\.StyleImport id="basemap" existing config=\{\{ language \}\} \/> : null/);
});

test("water body markers use geometry centers", () => {
  assert.match(source, /function centerOfPolygon\(/);
  assert.match(source, /function midpointOnLines\(/);
  assert.match(source, /return midpointOnLines\(\[geometry\.coordinates\]\);/);
  assert.match(source, /const coordinate = midpointOnLines\(group\.lines\)/);
});

test("water body markers render above overlapping catch markers", () => {
  assert.ok(source.indexOf('id="water-body-markers"') > source.indexOf('id="catches"'));
});

test("water body markers show only a bold catch count", () => {
  assert.match(source, /id="water-body-catch-counts"[\s\S]*?textFont: \["DIN Offc Pro Bold", "Arial Unicode MS Bold"\]/);
  assert.match(source, /circleStrokeWidth: 2,/);
  assert.doesNotMatch(source, /id="water-body-marker-labels"/);
});

test("water body sheet uses white text and a white show-more button", () => {
  assert.match(source, /waterBodyLoadMore: \{[\s\S]*?backgroundColor: "#ffffff"/);
  assert.match(source, /waterBodyLoadMoreText: \{ color: "#0f2236"/);
  assert.match(source, /waterBodySheetLocationText: \{ color: "#ffffff"/);
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
  assert.match(source, /controlsWithWelcome:\s*\{\s*bottom: 224,/);
});

test("welcome card is a full-screen first-run experience", () => {
  assert.match(source, /<View style=\{styles\.welcomeBackdrop\} pointerEvents="auto" \/>/);
  assert.match(source, /style=\{\[styles\.welcomeCard, \{ top: 0, bottom: 0 \}\]\}/);
  assert.match(source, /welcomeBackdrop:\s*\{\s*position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,/);
  assert.match(source, /welcomeCard:\s*\{[\s\S]*?left: 0,[\s\S]*?right: 0,/);
  assert.match(source, /welcomeBackgroundImage:\s*\{\s*position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,/);
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

test("marker refresh does not depend on water body state", () => {
  assert.match(source, /refreshSpots\(\);\s*\}, \[refreshMarkers, refreshPublicMarkers, refreshSpots\]\)/);
  assert.match(source, /useEffect\(\(\) => \{\s*refreshWaterBodies\(\);\s*\}, \[refreshWaterBodies\]\);/);
});

test("individual catch pins include catches attached to a water body", () => {
  assert.match(source, /features: ownValid\.map\(ownFeature\),/);
  assert.match(source, /\.\.\.ownValid\.filter\(\(m\) => m\.is_public\)\.map\(ownFeature\),/);
  assert.doesNotMatch(source, /!m\.water_body_id/);
});

test("water body sheet shows loading feedback while catches are fetched", () => {
  assert.match(source, /const \[publicMarkersLoaded, setPublicMarkersLoaded\] = useState\(false\);/);
  assert.match(source, /!catchesLoaded \|\| \(mapView === "public" && !publicMarkersLoaded\)/);
  assert.match(source, /Loading catches/);
  assert.match(source, /<ImageWithLoader/);
});

test("water body thumbnails load in batches", () => {
  assert.match(source, /const WATER_BODY_CATCH_BATCH_SIZE = 9;/);
  assert.match(source, /waterBodySheetCatches\.slice\(0, visibleWaterBodyCatchCount\)/);
  assert.match(source, /setVisibleWaterBodyCatchCount\(\(count\) => count \+ WATER_BODY_CATCH_BATCH_SIZE\)/);
});

test("showing a catch on the map closes the water body sheet", () => {
  assert.match(source, /onShowOnMap=\{\(\) => \{[\s\S]*?setWaterBodyPreview\(null\);[\s\S]*?\}\}/);
});

test("water body previews use the coordinates of the marker that was tapped", () => {
  assert.match(source, /const \[lon, lat\] = feature\.geometry\.coordinates;/);
});

test("public map catch details provide the report menu with the catch owner", () => {
  assert.match(source, /author_user_id: m\.user_id,/);
  assert.match(source, /authorUserId: p\.author_user_id \?\? null,/);
  assert.match(source, /const handleReportCatch = useCallback\(async \(catchId: string, reportedUserId\?: string \| null\)/);
  assert.match(source, /onReportCatch=\{handleReportCatch\}/);
});

test("water body sheet does not show an inactive save control", () => {
  assert.doesNotMatch(source, /bookmark-outline/);
  assert.doesNotMatch(source, /waterbodySave/);
});

test("welcome card body has comfortable multi-line spacing", () => {
  assert.match(source, /welcomeCardMessage:\s*\{[\s\S]*?fontSize:\s*17,[\s\S]*?lineHeight:\s*24,/);
});

test("map catch pins pass the saved rod and reel into the catch detail modal", () => {
  assert.match(source, /rod: catchItem\.rod,\s*reel: catchItem\.reel,/);
});
