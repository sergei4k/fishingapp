import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./water_body_resolve.pb.js", import.meta.url), "utf8");

test("registers and reuses water bodies by Mapbox feature id", () => {
  assert.match(source, /routerAdd\("POST", "\/water-bodies\/mapbox"/);
  assert.match(source, /mapbox_id = \{:featureId\}/);
  assert.match(source, /waterBody\.set\("mapbox_id", featureId\)/);
});

test("only links an existing named water body that matches the queried point", () => {
  assert.match(source, /findRecordById\("water_bodies", waterBodyId\)/);
  assert.match(source, /distanceMeters\(point, geometry\.coordinates\) <= 25/);
  assert.match(source, /geometry\.type === "Polygon"/);
  assert.match(source, /geometry\.type === "MultiPolygon"/);
  assert.match(source, /matchesStoredGeometry\(candidate\)/);
  assert.match(source, /candidate\.getString\("name"\) === name/);
  assert.match(source, /!candidate\.getString\("mapbox_id"\)/);
});

test("verifies the claimed polygon with Mapbox before saving it", () => {
  assert.match(source, /layers=water%2Cnatural_label%2Clanduse&radius=1000&limit=50/);
  assert.match(source, /\$http\.send\(\{ url: query, method: "GET", timeout: 10 \}\)/);
  assert.match(source, /Array\.isArray\(mapboxResponse\.json\.features\)/);
  assert.match(source, /tilequery\?\.layer === "water"/);
  assert.match(source, /tilequery\?\.geometry === "polygon"/);
  assert.match(source, /\["harbor", "harbour", "port"\]/);
  assert.match(source, /Number\(feature\.properties\?\.tilequery\?\.distance\) <= 100/);
  assert.match(source, /verifiedFeatureId !== featureId/);
  assert.match(source, /resolvedGeometry \|\| \{ type: "Point", coordinates: \[longitude, latitude\] \}/);
});

test("maps a verified named polygon for future catches", () => {
  assert.match(source, /is_in\(\$\{latitude\},\$\{longitude\}\)/);
  assert.match(source, /overpass-api\.de\/api\/interpreter/);
  assert.match(source, /nominatim\.openstreetmap\.org\/lookup\?osm_ids=/);
  assert.match(source, /nominatim\.openstreetmap\.org\/search/);
  assert.match(source, /`\$\{name\} водохранилище`/);
  assert.match(source, /geometryContainsPoint\(result\.geojson, \[longitude, latitude\]\)/);
  assert.match(source, /resolvedOsmId = `\$\{resolved\.osm_type\}\/\$\{resolved\.osm_id\}`/);
  assert.match(source, /waterBody\.set\("min_lat", bounds\.minLat\)/);
  assert.match(source, /waterBody\.set\("max_lat", bounds\.maxLat\)/);
  assert.match(source, /waterBody\.set\("min_lon", bounds\.minLon\)/);
  assert.match(source, /waterBody\.set\("max_lon", bounds\.maxLon\)/);
});

test("resolves marine names without storing whole-ocean geometry", () => {
  assert.match(source, /const resolveOfficialName = body\.resolveOfficialName === true/);
  assert.match(source, /\["natural"~"\^\(water\|bay\|strait\)\$"\]/);
  assert.match(source, /\["place"~"\^\(sea\|ocean\)\$"\]/);
  assert.match(source, /const isMarine = \["sea", "ocean", "bay", "sound", "gulf", "strait"\]\.includes\(waterType\)/);
  assert.match(source, /if \(resolveOfficialName && !resolvedOfficialName\) return e\.json\(200, \{\}\)/);
});

test("accepts only a server-derived canonical marine region", () => {
  assert.match(source, /const canonicalMarineRegion = \(latitude, longitude\) =>/);
  assert.match(source, /`marine:\$\{canonicalRegion\.id\}`/);
  assert.match(source, /const verifiedFeatureId = canonicalFeatureId \|\|/);
});

test("recovers concurrent registration by returning the winning record", () => {
  assert.match(source, /catch \(error\)[\s\S]*?mapbox_id = \{:featureId\}/);
});

test("looks up mapped polygons without returning their geometry", () => {
  assert.match(source, /routerAdd\("POST", "\/water-bodies\/lookup"/);
  assert.match(source, /min_lat <= \{:lat\} && max_lat >= \{:lat\} && min_lon <= \{:lon\} && max_lon >= \{:lon\}/);
  assert.match(source, /geometry\?\.type === "Polygon"/);
  assert.match(source, /e\.json\(200, \{ id: matched\.id, name: matched\.getString\("name"\) \}\)/);
});
