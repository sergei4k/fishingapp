import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { filterGearOptions, getGearLabel, getGearPickerTab } from "./gear.ts";

test("gear picker tabs separate lures from bait", () => {
  const lures = filterGearOptions("en", "lure", "");
  const bait = filterGearOptions("en", "bait", "");

  assert.ok(lures.length > 0);
  assert.ok(bait.length > 0);
  assert.ok(lures.every((gear) => gear.category === "lure"));
  assert.ok(bait.every((gear) => gear.category === "bait"));
});

test("gear search is scoped to the active tab", () => {
  assert.deepEqual(filterGearOptions("en", "lure", "worm"), []);
  assert.deepEqual(filterGearOptions("en", "bait", "worm").map((gear) => gear.id), ["chervyak", "motyl"]);
});

test("gear picker opens on the selected gear category", () => {
  assert.equal(getGearPickerTab("spoon"), "lure");
  assert.equal(getGearPickerTab("chervyak"), "bait");
  assert.equal(getGearPickerTab(null), "lure");
});

test("removed gear stays out of the picker while replacement bait is available", () => {
  const lures = filterGearOptions("en", "lure", "");
  const bait = filterGearOptions("en", "bait", "");

  assert.equal(lures.some((gear) => gear.id === "jig"), false);
  assert.equal(bait.some((gear) => gear.id === "boyl"), false);
  assert.equal(getGearLabel("jig", "en"), "Jig");
  assert.equal(getGearLabel("boyl", "en"), "Boilie");
  assert.equal(bait.find((gear) => gear.id === "mertvaya")?.label, "Fish Chunks");
  assert.equal(bait.find((gear) => gear.id === "kascha")?.label, "Feeder Mix");
});

test("every selectable lure and bait has an image", () => {
  const photoMapSource = readFileSync(new URL("./gearPhotos.ts", import.meta.url), "utf8");
  const picturedIds = new Set([...photoMapSource.matchAll(/^\s*([a-z0-9_]+):\s+require/mg)].map((match) => match[1]));
  const selectableGear = [
    ...filterGearOptions("en", "lure", ""),
    ...filterGearOptions("en", "bait", ""),
  ];

  assert.deepEqual(selectableGear.filter((gear) => !picturedIds.has(gear.id)).map((gear) => gear.id), []);
});
