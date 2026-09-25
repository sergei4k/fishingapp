import "dotenv/config";
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || process.env.EXPO_PUBLIC_POCKETBASE_URL || "https://strikefeed.tech";
const EMAIL = process.env.PB_SUPERUSER_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const apply = process.argv.includes("--apply");

if (!EMAIL || !PASSWORD || !MAPBOX_TOKEN) {
  throw new Error("PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD, and EXPO_PUBLIC_MAPBOX_TOKEN are required");
}

const { fetchMapboxWaterBody } = await import("../lib/waterBodies.ts");
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(EMAIL, PASSWORD);

const catches = await pb.collection("catches").getFullList({
  filter: 'water_body_id = ""',
  fields: "id,lat,lon",
});
const eligible = catches.filter((catchItem) =>
  catchItem.lat != null
  && catchItem.lon != null
  && Number.isFinite(Number(catchItem.lat))
  && Number.isFinite(Number(catchItem.lon)),
);
async function lookupMappedBody(latitude, longitude) {
  const result = await pb.send("/water-bodies/lookup", {
    method: "POST",
    body: { latitude, longitude },
    requestKey: null,
  });
  return result.id && result.name ? result : null;
}

async function resolveOfficialBody(latitude, longitude) {
  const feature = await fetchMapboxWaterBody(latitude, longitude, MAPBOX_TOKEN);
  if (!feature) return null;
  const result = await pb.send("/water-bodies/mapbox", {
    method: "POST",
    body: {
      featureId: feature.featureId,
      accessToken: MAPBOX_TOKEN,
      name: feature.name,
      waterType: feature.type,
      latitude,
      longitude,
      preferOfficialName: true,
      dryRun: !apply,
    },
    requestKey: null,
  });
  if (!result.name || (!result.id && !result.wouldCreate)) return null;
  return { id: result.id || null, name: result.name, osmId: result.osmId, isNew: !!result.wouldCreate };
}

let mapped = 0;
let unmatched = 0;
const newBodies = new Set();
const assignments = [];

for (const catchItem of eligible) {
  const latitude = Number(catchItem.lat);
  const longitude = Number(catchItem.lon);
  try {
    let body = await lookupMappedBody(latitude, longitude);
    if (!body) body = await resolveOfficialBody(latitude, longitude);
    if (!body) {
      unmatched += 1;
      continue;
    }
    if (body.isNew) newBodies.add(body.osmId || body.id);
    if (apply) {
      await pb.collection("catches").update(catchItem.id, {
        water_body_id: body.id,
        water_body_name: body.name,
      }, { requestKey: null });
    }
    assignments.push({ catchId: catchItem.id, waterBodyId: body.id, waterBodyName: body.name });
    mapped += 1;
  } catch (error) {
    console.warn(`Unable to resolve catch ${catchItem.id}:`, error instanceof Error ? error.message : error);
    unmatched += 1;
  }
}

console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", checked: eligible.length, mapped, newBodies: newBodies.size, unmatched, assignments }));
