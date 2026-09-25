/// <reference path="../pb_data/types.d.ts" />

// Keeps each water body's marker anchored to the location of its FIRST catch
// instead of the imported geometry centroid ("average of all marks").
//
// When a catch with a water_body_id is created, updated, or deleted, the anchor
// is re-derived as the oldest catch for that water body and
// water_bodies.lat/lon is rewritten to that catch's coordinates. Every handler
// catches its own failures and always calls e.next() so anchoring can never
// fail the triggering catch write (see AGENTS.md).

onRecordAfterCreateSuccess((e) => {
  try {
    require(`${__hooks}/water_body_anchor_utils.js`).anchorWaterBody(e, e.record);
  } catch (err) {
    console.log("water body anchor error:", err);
  }
  e.next();
}, "catches");

onRecordAfterUpdateSuccess((e) => {
  try {
    require(`${__hooks}/water_body_anchor_utils.js`).anchorWaterBody(e, e.record);
  } catch (err) {
    console.log("water body anchor error:", err);
  }
  e.next();
}, "catches");

onRecordAfterDeleteSuccess((e) => {
  try {
    require(`${__hooks}/water_body_anchor_utils.js`).reanchorAfterDelete(e, e.record);
  } catch (err) {
    console.log("water body anchor error:", err);
  }
  e.next();
}, "catches");