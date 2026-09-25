import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./CatchDetailModal.tsx", import.meta.url), "utf8");

test("tapping a catch photo opens a fullscreen viewer", () => {
  assert.match(source, /const \[fullscreenPhoto, setFullscreenPhoto\] = useState<string \| null>\(null\);/);
  assert.match(source, /<Pressable onPress=\{\(\) => setFullscreenPhoto\(uri\)\}/);
  assert.match(source, /<Modal visible=\{!!fullscreenPhoto\} transparent animationType="fade"/);
});

test("photo likes remain available from the dedicated like button", () => {
  assert.match(source, /<TouchableOpacity style=\{styles\.likeBtn\} onPress=\{toggleLike\}>/);
  assert.doesNotMatch(source, /const handlePhotoTap/);
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
