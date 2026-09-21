import "dotenv/config";
import { readFile } from "node:fs/promises";
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || process.env.EXPO_PUBLIC_POCKETBASE_URL || "https://strikefeed.tech";
const EMAIL = process.env.PB_SUPERUSER_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;
const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const INPUT_FILE = process.env.OSM_DATA_FILE;
const REGION = "moscow_500km";
const GRID_ROWS = 6;
const GRID_COLUMNS = 8;
const MOSCOW = { lat: 55.751244, lon: 37.618423 };
const RADIUS_KM = 500;
const WATER_TILE = Number(process.env.WATER_TILE || 0);

const latitudeRadius = RADIUS_KM / 111.32;
const longitudeRadius = RADIUS_KM / (111.32 * Math.cos((MOSCOW.lat * Math.PI) / 180));
const BBOX = [
  MOSCOW.lat - latitudeRadius,
  MOSCOW.lon - longitudeRadius,
  MOSCOW.lat + latitudeRadius,
  MOSCOW.lon + longitudeRadius,
];

if (!EMAIL || !PASSWORD) {
  throw new Error("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD are required");
}

function buildQuery(bbox) {
  const queryBbox = bbox.join(",");
  return `[out:json][timeout:90];
(
   way["natural"="water"]["name"](${queryBbox});
   way["water"~"^(lake|pond|reservoir|basin|lagoon)$"]["name"](${queryBbox});
   way["waterway"~"^(river|stream|canal|riverbank)$"]["name"](${queryBbox});
 );
  out geom;`;
}

function waterType(tags = {}) {
  const value = tags["water:body"] || tags.water || tags.natural || tags.waterway;
  if (value === "lake") return "lake";
  if (value === "pond") return "pond";
  if (value === "reservoir") return "reservoir";
  if (value === "riverbank" || value === "river") return "river";
  if (value === "stream") return "stream";
  if (value === "canal") return "canal";
  return "other";
}

function center(element) {
  if (element.center) return [element.center.lat, element.center.lon];
  if (element.lat != null && element.lon != null) return [element.lat, element.lon];
  if (element.geometry?.length) {
    const coordinates = element.geometry;
    return [
      coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length,
      coordinates.reduce((sum, point) => sum + point.lon, 0) / coordinates.length,
    ];
  }
  return null;
}

function waterGeometry(element) {
  const coordinates = element.geometry?.map((point) => [point.lon, point.lat]);
  if (!coordinates || coordinates.length < 2) return null;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const isClosed = coordinates.length >= 4 && first[0] === last[0] && first[1] === last[1];
  return isClosed
    ? { type: "Polygon", coordinates: [coordinates] }
    : { type: "LineString", coordinates };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchCell(bbox) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "StrikeFeed-water-import/1.0",
        },
        body: new URLSearchParams({ data: buildQuery(bbox) }).toString(),
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) {
        const { elements = [] } = await response.json();
        return elements;
      }
      lastError = new Error(`Overpass request failed: ${response.status}`);
      if (response.status !== 429 && response.status !== 504) throw lastError;
    } catch (error) {
      lastError = error;
    }

    if (attempt < 3) await sleep(attempt * 15_000);
  }
  throw lastError;
}

const [south, west, north, east] = BBOX;
const latStep = (north - south) / GRID_ROWS;
const lonStep = (east - west) / GRID_COLUMNS;
const elementsById = new Map();
let elements;
if (INPUT_FILE) {
  const data = JSON.parse(await readFile(INPUT_FILE, "utf8"));
  elements = data.elements || [];
  console.log(`Using ${elements.length} water features from ${INPUT_FILE}...`);
} else {
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const cell = [
        south + row * latStep,
        west + column * lonStep,
        row === GRID_ROWS - 1 ? north : south + (row + 1) * latStep,
        column === GRID_COLUMNS - 1 ? east : west + (column + 1) * lonStep,
      ];
      const tile = row * GRID_COLUMNS + column + 1;
      if (WATER_TILE && tile !== WATER_TILE) continue;
      console.log(`Fetching Moscow water tile ${tile}/${GRID_ROWS * GRID_COLUMNS}...`);
      try {
        for (const element of await fetchCell(cell)) elementsById.set(`${element.type}/${element.id}`, element);
      } catch (error) {
        console.warn(`Skipping Moscow water tile ${tile}/${GRID_ROWS * GRID_COLUMNS}: ${error.message}`);
      }
      await sleep(2_000);
    }
  }
  elements = [...elementsById.values()];
}

const bodies = elements
  .map((element) => {
    const point = center(element);
    const geometry = waterGeometry(element);
    if (!point || !geometry) return null;
    const tags = element.tags || {};
    return {
      osm_id: `${element.type}/${element.id}`,
      name: tags.name || tags["name:ru"] || "",
      water_type: waterType(tags),
      lat: point[0],
      lon: point[1],
      region: REGION,
      source: "osm",
      geometry,
    };
  })
  .filter(Boolean);

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(EMAIL, PASSWORD);

let created = 0;
let updated = 0;
const existing = await pb.collection("water_bodies").getFullList({
  fields: "id,osm_id",
});
const existingByOsmId = new Map(existing.map((record) => [record.osm_id, record.id]));

let nextIndex = 0;
async function worker() {
  while (nextIndex < bodies.length) {
    const body = bodies[nextIndex];
    nextIndex += 1;
    const recordId = existingByOsmId.get(body.osm_id);
    if (recordId) {
      await pb.collection("water_bodies").update(recordId, body);
      updated += 1;
    } else {
      await pb.collection("water_bodies").create(body);
      created += 1;
    }
  }
}

await Promise.all(Array.from({ length: 8 }, worker));

console.log(`Moscow named water bodies imported: ${bodies.length} total, ${created} created, ${updated} updated`);
