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

test("new saltwater species use their newly added fish icons", () => {
  assert.match(source, /id: "atlantic_wolffish",\s+labelRu: "Атлантическая зубатка",\s+labelEn: "Atlantic Wolffish",\s+scientificName: "Anarhichas lupus",\s+habitat: "saltwater"/);
  assert.match(source, /id: "atlantic_cod",\s+labelRu: "Атлантическая треска",\s+labelEn: "Atlantic Cod",\s+scientificName: "Gadus morhua",\s+habitat: "saltwater"/);
  assert.match(source, /id: "atlantic_herring",\s+labelRu: "Атлантическая сельдь",\s+labelEn: "Atlantic Herring",\s+scientificName: "Clupea harengus",\s+habitat: "saltwater"/);
  assert.match(source, /id: "coho_salmon",\s+labelRu: "Кижуч",\s+labelEn: "Coho Salmon",\s+scientificName: "Oncorhynchus kisutch",\s+habitat: "saltwater"/);
  assert.match(source, /id: "scorpionfish",\s+labelRu: "Скорпена",\s+labelEn: "Scorpionfish",\s+scientificName: "Scorpaena porcus",\s+habitat: "saltwater"/);

  assert.match(photoSource, /atlantic_wolffish:\s+require\("\.\.\/assets\/fishicons\/640x427-Wolffish-Atlantic\.jpg"\)/);
  assert.match(photoSource, /atlantic_cod:\s+require\("\.\.\/assets\/fishicons\/atlantic_cod\.png"\)/);
  assert.match(photoSource, /atlantic_herring:\s+require\("\.\.\/assets\/fishicons\/atlantic_herring\.png"\)/);
  assert.match(photoSource, /black_sea_bass:\s+require\("\.\.\/assets\/fishicons\/black_seabass\.png"\)/);
  assert.match(photoSource, /coho_salmon:\s+require\("\.\.\/assets\/fishicons\/coho_salmon\.png"\)/);
  assert.match(photoSource, /scorpionfish:\s+require\("\.\.\/assets\/fishicons\/Scorpena\.png"\)/);
});

test("picker icons use a wide enough frame for fish silhouettes", () => {
  const addSource = readFileSync(new URL("../app/(tabs)/add.tsx", import.meta.url), "utf8");
  const detailSource = readFileSync(new URL("../components/CatchDetailModal.tsx", import.meta.url), "utf8");

  assert.match(addSource, /modalItemImage: \{ width: 76, height: 56/);
  assert.match(detailSource, /pickerItemImg: \{ width: 76, height: 56/);
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
  assert.match(photoSource, /patrick:\s+require\("\.\.\/assets\/fishicons\/patrick\.png"\)/);
});

test("saltwater easter eggs sort to the bottom of the picker", () => {
  assert.match(source, /const easterEggIds = \["spongebob", "patrick"\];/);
  assert.match(source, /const aEasterEggIndex = easterEggIds\.indexOf\(a\.id\);/);
  assert.match(source, /const bEasterEggIndex = easterEggIds\.indexOf\(b\.id\);/);
  assert.match(source, /return aEasterEggIndex - bEasterEggIndex;/);
});
