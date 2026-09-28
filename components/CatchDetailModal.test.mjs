import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./CatchDetailModal.tsx", import.meta.url), "utf8");

test("a single tap on a catch photo opens a fullscreen viewer", () => {
  assert.match(source, /const \[fullscreenPhoto, setFullscreenPhoto\] = useState<string \| null>\(null\);/);
  assert.match(source, /photoTapTimeout\.current = setTimeout\(\(\) => \{\s*photoTapTimeout\.current = null;\s*setFullscreenPhoto\(uri\);\s*\}, 250\);/);
  assert.match(source, /<Pressable onPress=\{\(\) => handlePhotoTap\(uri\)\}/);
  assert.match(source, /<Modal visible=\{!!fullscreenPhoto\} transparent animationType="fade"/);
});

test("a double tap on a catch photo toggles its like", () => {
  assert.match(source, /if \(photoTapTimeout\.current\) \{\s*clearTimeout\(photoTapTimeout\.current\);\s*photoTapTimeout\.current = null;\s*toggleLike\(\);\s*return;\s*\}/);
  assert.match(source, /<TouchableOpacity style=\{styles\.likeBtn\} onPress=\{toggleLike\}>/);
});

test("show on map lets the parent dismiss its overlays before navigation", () => {
  assert.match(source, /onShowOnMap\?: \(\) => void/);
  assert.match(source, /onShowOnMap\?\.\(\);\s*onClose\(\);\s*InteractionManager\.runAfterInteractions\(\(\) => \{\s*router\.push/);
});

test("catch date is right-aligned in the author row", () => {
  assert.match(source, /<Text style=\{styles\.userDate\}>\{formatDate\(item\.date\)\}<\/Text>/);
  assert.match(source, /userDate: \{[^}]*marginLeft: "auto" as any \}/);
  assert.doesNotMatch(source, /styles\.detailDate/);
});

test("catch dates use abbreviated month names in English and Russian", () => {
  assert.match(source, /import \{ formatCatchDate \} from "@\/lib\/dateFormat"/);
  assert.match(source, /return formatCatchDate\(val, language\) \|\| t\("recently"\);/);
});

test("owners can add extra catch photos while editing", () => {
  assert.match(source, /import \* as ImagePicker from "expo-image-picker"/);
  assert.match(source, /const \[editExtraPhotos, setEditExtraPhotos\] = useState<string\[\]>\(\[\]\);/);
  assert.match(source, /allowsEditing: true/);
  assert.match(source, /editExtraPhotos\.length < 5/);
  assert.match(source, /extraPhotos: editExtraPhotos/);
});

test("owners can remove existing extra catch photos while editing", () => {
  assert.match(source, /const \[editExistingExtraPhotos, setEditExistingExtraPhotos\] = useState<string\[\]>\(\[\]\);/);
  assert.match(source, /setEditExistingExtraPhotos\(item\.extraPhotos \?\? \[\]\);/);
  assert.match(source, /existingExtraPhotos: editExistingExtraPhotos/);
  assert.match(source, /setEditExistingExtraPhotos\(\(current\) => current\.filter\(\(_, i\) => i !== index\)\)/);
});

test("owners can remove the primary catch photo while editing", () => {
  assert.match(source, /const \[editPrimaryPhotoRemoved, setEditPrimaryPhotoRemoved\] = useState\(false\);/);
  assert.match(source, /removePrimaryPhoto: editPrimaryPhotoRemoved/);
  assert.match(source, /onPress=\{\(\) => setEditPrimaryPhotoRemoved\(true\)\}/);
});

test("owners can choose a new catch location from the edit map", () => {
  assert.match(source, /import MapboxGL from "@rnmapbox\/maps"/);
  assert.match(source, /const \[editLocation, setEditLocation\] = useState<\{ lat: number; lon: number \} \| null>\(null\);/);
  assert.match(source, /<MapboxGL\.MapView/);
  assert.match(source, /location: editLocation/);
});

test("the active carousel photo shows its own catch details", () => {
  assert.match(source, /const activePhotoCatch = photoCatches\[photoIndex\];/);
  assert.match(source, /typeof item\?\.photoCatches === "string"/);
  assert.match(source, /const displayedSpecies = activePhotoCatch\?\.species \?\? item\?\.species;/);
  assert.match(source, /getSpeciesLabel\(displayedSpecies, language\)/);
  assert.match(source, /getGearLabel\(displayedGear, language\)/);
});

test("catch captions lead the detail view before species metadata", () => {
  assert.match(source, /\{item\?\.description \? <Text style=\{styles\.detailCaption\}>\{item\.description\}<\/Text> : null\}/);
  assert.match(source, /detailCaption: \{ color: "#ffffff", fontSize: 18/);
  assert.doesNotMatch(source, /detailCaption: \{[^}]*fontWeight/);
});

test("the active catch species uses its fishicon in the detail view", () => {
  assert.match(source, /speciesPhotos\[displayedSpecies\]/);
  assert.match(source, /style=\{styles\.detailSpeciesThumb\}/);
  assert.match(source, /detailSpeciesThumb: \{ width: 56, height: 56 \}/);
});

test("catches without coordinates show a withheld-location message instead of a map action", () => {
  assert.match(source, /item\?\.isPublic !== false && item\?\.lat != null && item\?\.lon != null/);
  assert.match(source, /The user chose not to share coordinates/);
  assert.match(source, /styles\.coordsWithheld/);
});

test("comments can be liked and keep their like counts in sync", () => {
  assert.match(source, /const toggleCommentLike = async \(comment: any\) =>/);
  assert.match(source, /pb\.collection\("comment_likes"\)\.create\(\{ comment_id: comment\.id, user_id: user\.id \}/);
  assert.match(source, /pb\.collection\("comment_likes"\)\.subscribe\("\*"/);
  assert.match(source, /onPress=\{\(\) => toggleCommentLike\(comment\)\}/);
  assert.match(source, /name=\{comment\._likeId \? "heart" : "heart-outline"\}/);
  assert.match(source, /name=\{isLiked \? "heart" : "heart-outline"\}/);
});

test("comments support threaded replies", () => {
  assert.match(source, /parent_id: replyToComment\?\.id \?\? ""/);
  assert.match(source, /setReplyToComment\(comment\)/);
  assert.match(source, /comments\.filter\(\(reply\) => reply\.parent_id === c\.id\)/);
  assert.match(source, /style=\{styles\.replyThread\}/);
});

test("the detail view shows the rod and reel saved on the catch", () => {
  assert.match(source, /import \{ getTackleKindLabel \} from "@\/lib\/tackle"/);
  assert.doesNotMatch(source, /TACKLE_KIND_ICON/);
  assert.match(source, /rod\?: string \| null;\s*reel\?: string \| null;/);
  assert.match(source, /const displayedTackle = \(\["rod", "reel"\] as const\)/);
  assert.match(source, /\{displayedTackle\.length > 0 && \(\s*<View style=\{styles\.tackleRow\}>/);
  assert.match(source, /<Text style=\{styles\.tackleLabel\}>\{getTackleKindLabel\(entry\.kind, language\)\}<\/Text>/);
  assert.match(source, /<Text style=\{styles\.tackleName\} numberOfLines=\{2\}>\{entry\.name\}<\/Text>/);
});

test("an empty rod or reel slot is left out of the detail view", () => {
  assert.match(source, /\.filter\(\(entry\) => entry\.name !== ""\)/);
});

test("comments still load when comment likes are unavailable", () => {
  assert.match(source, /pb\.collection\("comment_likes"\)\.getFullList\([\s\S]*?\.catch\(\(\) => \[\] as any\[\]\)/);
});
