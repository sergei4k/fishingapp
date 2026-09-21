/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/water-bodies/resolve", (e) => {
  const info = e.requestInfo();
  if (!info.auth) return e.json(401, { error: "unauthorized" });

  const body = info.body || {};
  const osmId = String(body.osmId || "");
  const name = String(body.name || "").trim();
  const waterType = String(body.waterType || "");
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const geometry = body.geometry;
  const allowedTypes = ["lake", "pond", "reservoir", "river", "stream", "canal", "basin", "lagoon", "other"];

  if (!/^(way|relation)\/\d+$/.test(osmId)
    || !name || name.length > 200
    || !allowedTypes.includes(waterType)
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !geometry || !["Polygon", "MultiPolygon", "LineString", "MultiLineString"].includes(geometry.type)
    || !Array.isArray(geometry.coordinates)
    || JSON.stringify(geometry).length > 5_000_000) {
    return e.json(400, { error: "invalid_water_body" });
  }

  const existing = e.app.findRecordsByFilter("water_bodies", "osm_id = {:osmId}", "", 1, 0, { osmId });
  if (existing.length > 0) return e.json(200, { id: existing[0].id, name: existing[0].getString("name") });

  const collection = e.app.findCollectionByNameOrId("water_bodies");
  const waterBody = new Record(collection);
  waterBody.set("osm_id", osmId);
  waterBody.set("name", name);
  waterBody.set("water_type", waterType);
  waterBody.set("lat", latitude);
  waterBody.set("lon", longitude);
  waterBody.set("region", "global");
  waterBody.set("source", "openstreetmap");
  waterBody.set("geometry", geometry);
  e.app.save(waterBody);
  return e.json(201, { id: waterBody.id, name: waterBody.getString("name") });
}, $apis.bodyLimit(5_500_000));
