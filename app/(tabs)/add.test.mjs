import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./add.tsx", import.meta.url), "utf8");

test("detects water with a Mapbox point-in-polygon query", () => {
  assert.match(source, /fetchMapboxWaterBody\(lat, lon, MAPBOX_ACCESS_TOKEN, controller\.signal\)/);
  assert.doesNotMatch(source, /fetchWaterBodyBoundaryAtPoint/);
});

test("reuses an existing named water body by Mapbox feature id", () => {
  assert.match(source, /filter: pb\.filter\("mapbox_id = \{:featureId\}", \{ featureId: feature\.featureId \}\)/);
  assert.match(source, /setWaterBody\(\{ id: existingWaterBody\.id, name: existingWaterBody\.name/);
});

test("reuses a stored water body before making another Mapbox request", () => {
  assert.match(source, /pb\.send<\{ id\?: string; name\?: string \}>\("\/water-bodies\/lookup"/);
  assert.match(source, /setWaterBody\(\{ id: resolved\.id, name: resolved\.name, isShorelineMatch: false \}\)/);
  assert.match(source, /const fallbackStoredMatch = matchWaterBody[\s\S]*?if \(fallbackStoredMatch\) \{[\s\S]*?setWaterBody\(fallbackStoredMatch\);[\s\S]*?return;/);
});

test("saves a new custom name against the detected Mapbox feature", () => {
  assert.match(source, /const pending = pendingWaterBody/);
  assert.match(source, /featureId: pending\.feature\.featureId/);
  assert.match(source, /accessToken: MAPBOX_ACCESS_TOKEN/);
  assert.match(source, /waterType: pending\.feature\.type/);
  assert.match(source, /\}\), 30000\);/);
});

test("automatically registers every named Mapbox water body", () => {
  assert.match(source, /if \(feature\.name\) \{/);
  assert.match(source, /resolveOfficialName: feature\.isMarine/);
  assert.match(source, /if \(registered\.id && registered\.name\) \{/);
});

test("prompts for a name only when Mapbox did not provide one", () => {
  assert.match(source, /if \(!feature\.name\) \{/);
  assert.match(source, /setWaterBodyNameModalVisible\(true\);/);
});

test("ignores stale water body detection results", () => {
  assert.match(source, /const requestId = \+\+waterBodyDetectionRequestRef\.current/);
  assert.match(source, /requestId !== waterBodyDetectionRequestRef\.current/);
  assert.match(source, /const requestKey = `water-body-name-\$\{requestId\}`/);
});

test("does not save a catch before its detected water body is named", () => {
  assert.match(source, /if \(detectingWater \|\| pendingWaterBody\)/);
  assert.match(source, /disabled=\{isUploading \|\| detectingWater \|\| !!pendingWaterBody\}/);
});

test("uses a text-first water body status without a water-drop icon", () => {
  assert.match(source, /styles\.waterBodyStatusLabel/);
  assert.doesNotMatch(source, /<Ionicons name=\{waterBody \? "water"/);
});

test("manual location picker shows catch markers and saved water body geometry", () => {
  assert.match(source, /styleURL="mapbox:\/\/styles\/mapbox\/streets-v12"[\s\S]*?localizeLabels=\{\{ locale: language \}\}/);
  assert.match(source, /id="location-picker-catches" shape=\{locationPickerCatchMarkers\}/);
  assert.match(source, /id="location-picker-water-bodies" shape=\{locationPickerWaterBodies\}/);
  assert.match(source, /pb\.collection\("catches"\)\.getFullList/);
  assert.match(source, /pb\.collection\("water_bodies"\)\.getFullList/);
});

test("uploads catch photos as Expo File blobs", () => {
  assert.match(source, /formData\.append\('image', new File\(uploadImage\)\)/);
  assert.match(source, /formData\.append\('images', new File\(uri\)\)/);
});

test("allows selecting multiple photos without requiring a primary catch photo", () => {
  assert.match(source, /allowsMultipleSelection: true/);
  assert.match(source, /pickPhotos\(6\)/);
  assert.match(source, /const \[primary, \.\.\.additional\] = pickedPhotos/);
  assert.doesNotMatch(source, /Add a catch photo before saving/);
});

test("shows every selected photo and allows removing each one before continuing", () => {
  assert.match(source, /contentContainerStyle=\{styles\.photoSelectionGrid\}/);
  assert.match(source, /\[image, \.\.\.extraPhotos\]\.filter\(Boolean\)\.map\(\(uri, index\) =>/);
  assert.match(source, /onPress=\{\(\) => removeTripPhoto\(index\)\}/);
  assert.match(source, /accessibilityLabel=\{language === "ru" \? "Удалить фото" : "Remove photo"\}/);
});

test("lets each trip photo keep its own catch details", () => {
  assert.match(source, /const \[activePhotoIndex, setActivePhotoIndex\] = useState\(0\)/);
  assert.match(source, /const \[photoCatches, setPhotoCatches\] = useState<PhotoCatchDetails\[\]>\(\[\]\)/);
  assert.match(source, /horizontal pagingEnabled/);
  assert.match(source, /onMomentumScrollEnd=\{\(event\) => selectPhoto/);
  assert.match(source, /formData\.append\('photo_catches', JSON\.stringify\(savedPhotoCatches\)\)/);
});

test("the rod and reel step is the last stage of the catch form", () => {
  assert.match(source, /import \{ CATCH_FORM_STEP_COUNT, CATCH_FORM_TACKLE_STEP, getResetCatchFormStep \}/);
  assert.match(source, /currentStep === CATCH_FORM_TACKLE_STEP/);
});

test("the rod and reel step starts with both slots empty", () => {
  assert.match(source, /const \[selectedRodId, setSelectedRodId\] = useState<string \| null>\(null\)/);
  assert.match(source, /const \[selectedReelId, setSelectedReelId\] = useState<string \| null>\(null\)/);
  assert.match(source, /const \[tackleItems, setTackleItems\] = useState<TackleItem\[\]>\(\[\]\)/);
});

test("both slots are rendered from the same kind list", () => {
  assert.match(source, /\{\(\["rod", "reel"\] as TackleKind\[\]\)\.map\(\(kind\) => \{/);
  assert.match(source, /const kindItems = kind === "rod" \? savedRods : savedReels;/);
  assert.match(source, /const kindSelectedId = kind === "rod" \? selectedRodId : selectedReelId;/);
});

test("loads the saved tackle library when the step opens", () => {
  assert.match(source, /if \(currentStep !== CATCH_FORM_TACKLE_STEP\) return;/);
  assert.match(source, /const items = await loadTackleItems\(user\.id\)/);
});

test("a new rod or reel requires a name, model, and manufacturer", () => {
  assert.match(source, /\{TACKLE_FIELDS\.map\(\(field\) => \(/);
  assert.match(source, /const draft = buildTackleDraft\(tackleDraftKind, tackleDraft\);\s*if \(!draft\) return;/);
  assert.match(source, /disabled=\{missingTackleFields\.length > 0 \|\| savingTackle\}/);
});

test("a saved rod or reel is stored for reuse and selected right away", () => {
  assert.match(source, /const saved = await createTackleItem\(user\.id, draft\)/);
  assert.match(source, /selectTackle\(saved\.kind, saved\.id\)/);
  assert.match(source, /onPress=\{\(\) => openTackleDraft\(kind\)\}/);
});

test("the chosen rod and reel are saved on the catch and can be cleared", () => {
  assert.match(source, /const rodLabel = getTackleCatchLabel\(selectedRod\)/);
  assert.match(source, /const reelLabel = getTackleCatchLabel\(selectedReel\)/);
  assert.match(source, /if \(rodLabel\) formData\.append\('rod', rodLabel\)/);
  assert.match(source, /if \(reelLabel\) formData\.append\('reel', reelLabel\)/);
  assert.match(source, /rod: rodLabel \|\| undefined/);
  assert.match(source, /reel: reelLabel \|\| undefined/);
  assert.match(source, /onPress=\{\(\) => selectTackle\(kind, null\)\}/);
});

test("a saved catch clears the rod and reel slots", () => {
  assert.match(source, /setSelectedRodId\(null\);\s*setSelectedReelId\(null\);/);
});
