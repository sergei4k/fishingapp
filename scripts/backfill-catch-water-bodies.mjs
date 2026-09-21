import "dotenv/config";
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || process.env.EXPO_PUBLIC_POCKETBASE_URL || "https://strikefeed.tech";
const EMAIL = process.env.PB_SUPERUSER_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD are required");
}

const { matchWaterBody } = await import("../lib/waterBodyMatch.ts");
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(EMAIL, PASSWORD);

const [waterBodies, catches] = await Promise.all([
  pb.collection("water_bodies").getFullList({ fields: "id,name,geometry" }),
  pb.collection("catches").getFullList({ fields: "id,lat,lon,water_body_id,water_body_name" }),
]);

const candidates = waterBodies
  .filter((waterBody) => waterBody.name && waterBody.geometry)
  .map((waterBody) => ({ id: waterBody.id, name: waterBody.name, geometry: waterBody.geometry }));
const pending = catches.filter((catchItem) =>
  catchItem.lat != null
  && catchItem.lon != null
  && !catchItem.water_body_id
  && !catchItem.water_body_name,
);

let mapped = 0;
let nextIndex = 0;

async function worker() {
  while (nextIndex < pending.length) {
    const catchItem = pending[nextIndex];
    nextIndex += 1;
    const match = matchWaterBody(candidates, Number(catchItem.lat), Number(catchItem.lon));
    if (!match?.id) continue;
    await pb.collection("catches").update(catchItem.id, {
      water_body_id: match.id,
      water_body_name: match.name,
    });
    mapped += 1;
  }
}

await Promise.all(Array.from({ length: 8 }, worker));
console.log(`Catch waterbody backfill: ${pending.length} eligible, ${mapped} mapped`);
