import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./species.ts", import.meta.url), "utf8");
const photoSource = readFileSync(new URL("./speciesPhotos.ts", import.meta.url), "utf8");

test("species picker excludes Ballerus ballerus", () => {
  assert.doesNotMatch(source, /Ballerus ballerus/i);
});

test("species picker excludes Coregonus albula", () => {
  assert.doesNotMatch(source, /Coregonus albula/i);
});

test("species picker excludes Coregonus nasus", () => {
  assert.doesNotMatch(source, /Coregonus nasus/i);
});

test("species picker excludes Vimba vimba", () => {
  assert.doesNotMatch(source, /Vimba vimba/i);
});

test("species picker excludes Stenodus leucichthys", () => {
  assert.doesNotMatch(source, /Stenodus leucichthys/i);
});

test("every selectable species has a fish photo", () => {
  const speciesIds = [...source.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);

  for (const id of speciesIds) {
    assert.match(photoSource, new RegExp(`\\b${id}:`));
  }
});

test("photo-specific species names are translated accurately", () => {
  assert.match(source, /labelRu: "Пёстрый толстолобик",\s+labelEn: "Bighead Carp",\s+scientificName: "Hypophthalmichthys nobilis"/);
  assert.match(source, /labelRu: "Озёрный сиг",\s+labelEn: "Lake Whitefish",\s+scientificName: "Coregonus clupeaformis"/);
  assert.match(source, /labelRu: "Сибирский таймень",\s+labelEn: "Siberian Taimen"/);
  assert.match(source, /labelRu: "Судак канадский",\s+labelEn: "Walleye"/);
  assert.match(source, /labelRu: "Белоглазка",\s+labelEn: "White-Eye Bream",\s+scientificName: "Ballerus sapa"/);
});

test("saltwater easter eggs use the SpongeBob and Patrick photos", () => {
  assert.match(source, /id: "spongebob",\s+labelRu: "Спанч Боб",\s+labelEn: "Spongebob",\s+scientificName: "Porifera",\s+habitat: "saltwater"/);
  assert.match(source, /id: "patrick",\s+labelRu: "Патрик",\s+labelEn: "Patrick",\s+scientificName: "Asteroidea",\s+habitat: "saltwater"/);
  assert.match(photoSource, /spongebob:\s+require\("\.\.\/assets\/fishicons\/spongebob\.png"\)/);
  assert.match(photoSource, /patrick:\s+require\("\.\.\/assets\/fishicons\/starfish\.png"\)/);
});

test("saltwater easter eggs sort to the bottom of the picker", () => {
  assert.match(source, /const easterEggIds = \["spongebob", "patrick"\];/);
  assert.match(source, /const aEasterEggIndex = easterEggIds\.indexOf\(a\.id\);/);
  assert.match(source, /const bEasterEggIndex = easterEggIds\.indexOf\(b\.id\);/);
  assert.match(source, /return aEasterEggIndex - bEasterEggIndex;/);
});
