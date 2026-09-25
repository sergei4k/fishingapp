// Shared helpers for pb_hooks/water_body_anchor.pb.js.
//
// A water body's lat/lon is its on-map marker position. OSM imports fill it
// with the geometry centroid ("average of all marks"); the app should show the
// marker at the location of the FIRST catch instead. These helpers re-derive
// the anchor as the oldest catch (by PB `created`, then `id`) that references
// the water body and rewrite water_bodies.lat/lon to that catch's coordinates.
// Lat/lon is only touched when at least one catch with finite coordinates
// exists, so untouched bodies keep their imported centroid placeholder.

const hasPosition = (record) => {
  try {
    const lat = record.getFloat("lat");
    const lon = record.getFloat("lon");
    return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
  } catch (_) {
    return false;
  }
};

const earliestCatchFor = (app, waterBodyId) => {
  try {
    return app.findRecordsByFilter("catches", "water_body_id = {:id}", "+created,+id", 1, 0, { id: waterBodyId })[0] || null;
  } catch (_) {
    return null;
  }
};

// Anchors the water body referenced by a saved catch to the FIRST catch's
// location. Returns true when the water body record was modified.
function anchorWaterBody(e, catchRecord) {
  let waterBodyId;
  try {
    waterBodyId = catchRecord.getString("water_body_id");
  } catch (_) {
    return false;
  }
  if (!waterBodyId) return false;

  const earliest = earliestCatchFor(e.app, waterBodyId);
  if (!earliest || !hasPosition(earliest)) return false;
  const anchorLat = earliest.getFloat("lat");
  const anchorLon = earliest.getFloat("lon");

  let waterBody;
  try {
    waterBody = e.app.findRecordById("water_bodies", waterBodyId);
  } catch (_) {
    return false;
  }
  if (!waterBody) return false;

  if (Math.abs(waterBody.getFloat("lat") - anchorLat) < 1e-7
    && Math.abs(waterBody.getFloat("lon") - anchorLon) < 1e-7) {
    return false;
  }

  waterBody.set("lat", anchorLat);
  waterBody.set("lon", anchorLon);
  e.app.save(waterBody);
  return true;
}

// Re-derives the anchor after a catch is deleted so removing the oldest catch
// moves the marker to the next oldest catch. Bodies with no remaining catches
// keep their current position.
function reanchorAfterDelete(e, deletedRecord) {
  let waterBodyId;
  try {
    waterBodyId = deletedRecord.getString("water_body_id");
  } catch (_) {
    return false;
  }
  if (!waterBodyId) return false;

  const earliest = earliestCatchFor(e.app, waterBodyId);
  if (!earliest || !hasPosition(earliest)) return false;
  const anchorLat = earliest.getFloat("lat");
  const anchorLon = earliest.getFloat("lon");

  let waterBody;
  try {
    waterBody = e.app.findRecordById("water_bodies", waterBodyId);
  } catch (_) {
    return false;
  }
  if (!waterBody) return false;

  if (Math.abs(waterBody.getFloat("lat") - anchorLat) < 1e-7
    && Math.abs(waterBody.getFloat("lon") - anchorLon) < 1e-7) {
    return false;
  }

  waterBody.set("lat", anchorLat);
  waterBody.set("lon", anchorLon);
  e.app.save(waterBody);
  return true;
}

module.exports = {
  anchorWaterBody,
  reanchorAfterDelete,
  earliestCatchFor,
  hasPosition,
};