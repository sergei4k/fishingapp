import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./journaldesc.tsx", import.meta.url), "utf8");

test("journal descriptions cover every journal species", () => {
  const speciesSource = readFileSync(new URL("../lib/species.ts", import.meta.url), "utf8");
  const ids = [...speciesSource.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]).filter((id) => !["spongebob", "patrick"].includes(id));
  for (const id of ids) assert.match(source, new RegExp(`\\b${id}:`));
});

test("each description includes English and Russian fishing guidance", () => {
  assert.match(source, /type JournalDescription = \{ en: string; ru: string \}/);
  assert.match(source, /getJournalDescription/);
});

test("typical adult size covers every journal species", () => {
  assert.match(source, /const typicalAdultSizeCm/);
  assert.match(source, /getTypicalAdultSizeCm/);
  const speciesSource = readFileSync(new URL("../lib/species.ts", import.meta.url), "utf8");
  const ids = [...speciesSource.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]).filter((id) => !["spongebob", "patrick"].includes(id));
  for (const id of ids) assert.match(source, new RegExp(`\\b${id}: "\\d+–\\d+"`));
});
