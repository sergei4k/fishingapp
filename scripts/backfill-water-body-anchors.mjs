// One-time/periodic backfill: anchors water_bodies.lat/lon to the FIRST catch
// for each body, instead of the imported geometry centroid ("average of all
// marks"). Runs after the catch-anchor hooks (pb_hooks/water_body_anchor.pb.js)
// have been deployed, for bodies whose catches predate those hooks.
//
// Usage:
//   PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... node scripts/backfill-water-body-anchors.mjs
import "dotenv/config";
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || process.env.EXPO_PUBLIC_POCKETBASE_URL || "https://strikefeed.tech";
const EMAIL = process.env.PB_SUPERUSER_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD are required");
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(EMAIL, PASSWORD);

const hasPosition = (record) => {
  const lat = Number(record.lat);
  const lon = Number(record.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
};

const bodies = await pb.collection("water_bodies").getFullList({
  fields: "id,lat,lon",
  requestKey: null,
});

let anchored = 0;
let unchanged = 0;

async function worker() {
  while (bodies.length > 0) {
    const body = bodies.shift();
    const earliest = (
      await pb.collection("catches").getList(1, 1, {
        filter: pb.filter("water_body_id = {:id}", { id: body.id }),
        sort: "created,id",
        fields: "lat,lon",
        requestKey: null,
      })
    ).items[0];

    if (!earliest || !hasPosition(earliest)) {
      unchanged += 1;
      continue;
    }

    const anchorLat = Number(earliest.lat);
    const anchorLon = Number(earliest.lon);
    if (Math.abs(Number(body.lat) - anchorLat) < 1e-7 && Math.abs(Number(body.lon) - anchorLon) < 1e-7) {
      unchanged += 1;
      continue;
    }

    await pb.collection("water_bodies").update(body.id, {
      lat: anchorLat,
      lon: anchorLon,
    }, { requestKey: null });
    anchored += 1;
  }
}

await Promise.all(Array.from({ length: 8 }, worker));

console.log(`Water body anchors backfilled: ${anchored} anchored, ${unchanged} already correct`);