import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TACKLE_TEXT_LENGTH,
  TACKLE_FIELDS,
  buildTackleDraft,
  emptyTackleDraft,
  findMatchingTackleItem,
  getMissingTackleFields,
  getTackleCatchLabel,
  getTackleItemsByKind,
  getTackleSubtitle,
  isTackleDraftComplete,
  isSameTackleItem,
  mergeTackleItems,
} from "./tackle.ts";

const rod = { id: "rod1", kind: "rod", name: "Tessera 300", model: "Tessera 300", manufacturer: "Flagman" };
const reel = { id: "reel1", kind: "reel", name: "Magellan 3000", model: "Magellan", manufacturer: "Flagman" };

test("a tackle item requires name, model, and manufacturer", () => {
  assert.deepEqual(TACKLE_FIELDS, ["name", "model", "manufacturer"]);
  assert.deepEqual(getMissingTackleFields({ kind: "rod", name: "", model: "Tessera", manufacturer: "Flagman" }), ["name"]);
  assert.deepEqual(getMissingTackleFields({ kind: "rod", name: "Bitan", model: "", manufacturer: "" }), ["model", "manufacturer"]);
  assert.deepEqual(getMissingTackleFields(rod), []);
});

test("an empty draft is incomplete for both slots", () => {
  assert.equal(isTackleDraftComplete(emptyTackleDraft("rod")), false);
  assert.equal(isTackleDraftComplete(emptyTackleDraft("reel")), false);
});

test("drafts are trimmed and whitespace is collapsed before saving", () => {
  const draft = buildTackleDraft("rod", { name: "  Bitan  ", model: "B-530", manufacturer: "Flagman  Spool" });
  assert.deepEqual(draft, { kind: "rod", name: "Bitan", model: "B-530", manufacturer: "Flagman Spool" });
});

test("an incomplete draft cannot be saved", () => {
  assert.equal(buildTackleDraft("rod", { name: "Bitan", model: "B-530", manufacturer: "  " }), null);
});

test("draft text is clamped to the stored field length", () => {
  const draft = buildTackleDraft("reel", {
    name: "x".repeat(MAX_TACKLE_TEXT_LENGTH + 40),
    model: "m".repeat(MAX_TACKLE_TEXT_LENGTH + 40),
    manufacturer: "f".repeat(MAX_TACKLE_TEXT_LENGTH + 40),
  });
  assert.equal(draft?.name.length, MAX_TACKLE_TEXT_LENGTH);
  assert.equal(draft?.model.length, MAX_TACKLE_TEXT_LENGTH);
  assert.equal(draft?.manufacturer.length, MAX_TACKLE_TEXT_LENGTH);
});

test("the same rod saved twice is the same item regardless of case and spacing", () => {
  const retyped = { kind: "rod", name: "tessera   300", model: "TESSERA 300", manufacturer: " flagman " };
  assert.equal(isSameTackleItem(rod, retyped), true);
  assert.equal(findMatchingTackleItem([reel, rod], retyped)?.id, "rod1");
});

test("a rod and a reel never match each other", () => {
  const reelAsRod = { kind: "rod", name: rod.name, model: rod.model, manufacturer: rod.manufacturer };
  assert.equal(findMatchingTackleItem([reel], reelAsRod), null);
});

test("a different model of the same rod is a separate item", () => {
  const other = { kind: "rod", name: "Tessera 300", model: "Tessera 500", manufacturer: "Flagman" };
  assert.equal(findMatchingTackleItem([rod], other), null);
});

test("rods and reels are listed separately and sorted by name", () => {
  const secondRod = { id: "rod2", kind: "rod", name: "Bitan", model: "B-530", manufacturer: "Flagman" };
  assert.deepEqual(getTackleItemsByKind([rod, reel, secondRod], "rod").map((i) => i.id), ["rod2", "rod1"]);
  assert.deepEqual(getTackleItemsByKind([rod, reel, secondRod], "reel").map((i) => i.id), ["reel1"]);
});

test("an item subtitle shows manufacturer and model", () => {
  assert.equal(getTackleSubtitle(rod), "Flagman · Tessera 300");
});

test("a catch stores the full tackle label as manufacturer, name, then model", () => {
  const full = { id: "rod2", kind: "rod", name: "Tessera", model: "Tessera 300 2.7m", manufacturer: "Flagman" };
  assert.equal(getTackleCatchLabel(full), "Flagman · Tessera · Tessera 300 2.7m");
  assert.equal(getTackleCatchLabel(rod), "Flagman · Tessera 300");
  assert.equal(getTackleCatchLabel(null), "");
  assert.equal(getTackleCatchLabel(undefined), "");
});

test("a catch tackle label drops a repeated name and model", () => {
  const same = { id: "reel1", kind: "reel", name: "Magellan 3000", model: "magellan 3000", manufacturer: "Flagman" };
  assert.equal(getTackleCatchLabel(same), "Flagman · Magellan 3000");
});

test("a catch tackle label stays inside the catch column width", () => {
  const long = {
    id: "rod3",
    kind: "rod",
    name: "N".repeat(MAX_TACKLE_TEXT_LENGTH),
    model: "M".repeat(MAX_TACKLE_TEXT_LENGTH),
    manufacturer: "F".repeat(MAX_TACKLE_TEXT_LENGTH),
  };
  const label = getTackleCatchLabel(long);
  assert.ok(label.length <= MAX_TACKLE_TEXT_LENGTH, `expected at most ${MAX_TACKLE_TEXT_LENGTH} chars, got ${label.length}`);
});

test("a refresh keeps rods that were saved while offline", () => {
  const offlineRod = { id: "local_1", kind: "rod", name: "Bitan", model: "B-530", manufacturer: "Flagman", pendingSync: true };
  assert.deepEqual(mergeTackleItems([rod], [rod, offlineRod]).map((i) => i.id), ["rod1", "local_1"]);
});

test("a refresh drops local rows that are already on the server", () => {
  const staleLocalCopy = { id: "rod1", kind: "rod", name: "Tessera 300", model: "Tessera 300", manufacturer: "Flagman", pendingSync: true };
  assert.deepEqual(mergeTackleItems([rod], [staleLocalCopy]).map((i) => i.id), ["rod1"]);
});
