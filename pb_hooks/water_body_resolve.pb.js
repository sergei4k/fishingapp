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
  const allowedTypes = ["lake", "pond", "reservoir", "river", "stream", "canal", "basin", "lagoon", "sea", "ocean", "bay", "sound", "gulf", "strait", "other"];

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

routerAdd("POST", "/water-bodies/manual", (e) => {
  const info = e.requestInfo();
  if (!info.auth) return e.json(401, { error: "unauthorized" });

  const body = info.body || {};
  const name = String(body.name || "").trim();
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const waterType = String(body.waterType || "other");
  const geometry = body.geometry || { type: "Point", coordinates: [longitude, latitude] };
  const allowedTypes = ["lake", "pond", "reservoir", "river", "stream", "canal", "basin", "lagoon", "sea", "ocean", "bay", "sound", "gulf", "strait", "other"];
  if (!name || name.length > 200
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !allowedTypes.includes(waterType)
    || !geometry || !["Point", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(geometry.type)
    || !Array.isArray(geometry.coordinates)) {
    return e.json(400, { error: "invalid_water_body" });
  }

  // A 0.0001-degree grid makes repeated submissions at the same pin reuse one record.
  const osmId = `manual:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
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
  waterBody.set("source", "user");
  waterBody.set("geometry", geometry);
  e.app.save(waterBody);
  return e.json(201, { id: waterBody.id, name: waterBody.getString("name") });
});

routerAdd("POST", "/water-bodies/mapbox", (e) => {
  const info = e.requestInfo();
  if (!info.auth) return e.json(401, { error: "unauthorized" });

  const canonicalMarineRegion = (latitude, longitude) => {
    if (latitude >= 40.9 && latitude <= 41.4 && longitude >= -74.1 && longitude <= -71.7) return { id: "long-island-sound", name: "Long Island Sound", type: "sound" };
    if (latitude >= 66) return { id: "arctic-ocean", name: "Arctic Ocean", type: "ocean" };
    if (latitude <= -60) return { id: "southern-ocean", name: "Southern Ocean", type: "ocean" };
    if (latitude >= -60 && latitude <= 30 && longitude >= 20 && longitude <= 147) return { id: "indian-ocean", name: "Indian Ocean", type: "ocean" };
    if (latitude >= -60 && latitude <= 66 && longitude >= -70 && longitude <= 25) return { id: "atlantic-ocean", name: "Atlantic Ocean", type: "ocean" };
    if (latitude >= -60 && latitude <= 66 && (longitude <= -100 || longitude >= 100)) return { id: "pacific-ocean", name: "Pacific Ocean", type: "ocean" };
    return null;
  };

  const body = info.body || {};
  const isSuperuser = info.auth.isSuperuser();
  const preferOfficialName = isSuperuser && body.preferOfficialName === true;
  const resolveOfficialName = body.resolveOfficialName === true;
  const dryRun = isSuperuser && body.dryRun === true;
  const featureId = String(body.featureId || "").trim();
  const accessToken = String(body.accessToken || "").trim();
  const name = String(body.name || "").trim();
  const waterBodyId = String(body.waterBodyId || "").trim();
  const waterType = String(body.waterType || "other");
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const allowedTypes = ["lake", "pond", "reservoir", "river", "stream", "canal", "basin", "lagoon", "sea", "ocean", "bay", "sound", "gulf", "strait", "other"];
  const isMarine = ["sea", "ocean", "bay", "sound", "gulf", "strait"].includes(waterType);
  const isPosition = (value) => Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
  const isPolygon = (value) => Array.isArray(value)
    && value.length > 0
    && value.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition));
  const pointInRing = (point, ring) => {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const x = ring[index][0];
      const y = ring[index][1];
      const previousX = ring[previous][0];
      const previousY = ring[previous][1];
      if ((y > point[1]) !== (previousY > point[1])
        && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x) {
        inside = !inside;
      }
    }
    return inside;
  };
  const pointInPolygon = (point, polygon) => Array.isArray(polygon)
    && polygon.length > 0
    && pointInRing(point, polygon[0])
    && !polygon.slice(1).some((ring) => pointInRing(point, ring));
  const distanceMeters = (left, right) => {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(right[1] - left[1]);
    const longitudeDelta = radians(right[0] - left[0]);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(longitudeDelta / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };
  const matchesStoredGeometry = (candidate) => {
    let geometry;
    try {
      const geometryModel = new DynamicModel({ type: "", coordinates: [] });
      candidate.unmarshalJSONField("geometry", geometryModel);
      geometry = JSON.parse(JSON.stringify(geometryModel));
    } catch (_) {
      return false;
    }
    const point = [longitude, latitude];
    if (geometry && geometry.type === "Point" && isPosition(geometry.coordinates)) {
      return distanceMeters(point, geometry.coordinates) <= 25;
    }
    if (geometry && geometry.type === "Polygon" && isPolygon(geometry.coordinates)) {
      return pointInPolygon(point, geometry.coordinates);
    }
    if (geometry && geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      return geometry.coordinates.some((polygon) => isPolygon(polygon) && pointInPolygon(point, polygon));
    }
    return false;
  };
  const geometryContainsPoint = (geometry, point) => {
    if (geometry?.type === "Polygon" && isPolygon(geometry.coordinates)) {
      return pointInPolygon(point, geometry.coordinates);
    }
    if (geometry?.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      return geometry.coordinates.some((polygon) => isPolygon(polygon) && pointInPolygon(point, polygon));
    }
    return false;
  };
  const geometryBounds = (geometry) => {
    const bounds = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
    const visit = (coordinates) => {
      if (isPosition(coordinates)) {
        bounds.minLon = Math.min(bounds.minLon, coordinates[0]);
        bounds.maxLon = Math.max(bounds.maxLon, coordinates[0]);
        bounds.minLat = Math.min(bounds.minLat, coordinates[1]);
        bounds.maxLat = Math.max(bounds.maxLat, coordinates[1]);
        return;
      }
      if (Array.isArray(coordinates)) coordinates.forEach(visit);
    };
    visit(geometry.coordinates);
    return Number.isFinite(bounds.minLat) ? bounds : null;
  };

  if (!featureId || featureId.length > 200 || !accessToken
    || !name || name.length > 200
    || !allowedTypes.includes(waterType)
    || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    return e.json(400, { error: "invalid_water_body" });
  }

  let mapboxResponse;
  try {
    const query = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${longitude},${latitude}.json`
      + `?layers=water%2Cnatural_label&radius=1000&limit=50&access_token=${encodeURIComponent(accessToken)}`;
    mapboxResponse = $http.send({ url: query, method: "GET", timeout: 10 });
  } catch (_) {
    return e.json(502, { error: "mapbox_unreachable" });
  }
  if (mapboxResponse.statusCode !== 200) return e.json(502, { error: "mapbox_rejected" });
  const mapboxFeatures = mapboxResponse.json && Array.isArray(mapboxResponse.json.features)
    ? mapboxResponse.json.features
    : [];
  const waterFeature = mapboxFeatures.find((feature) =>
    feature.properties?.tilequery?.layer === "water"
    && feature.properties?.tilequery?.geometry === "polygon"
    && Number(feature.properties?.tilequery?.distance) <= 100
  );
  const labelFeature = mapboxFeatures
    .filter((feature) => feature.id != null
      && feature.properties?.tilequery?.layer === "natural_label"
      && ["water", "river", "stream", "canal", "sea", "ocean", "bay", "sound", "gulf", "strait"].includes(String(feature.properties?.class || "")))
    .sort((left, right) => Number(left.properties?.tilequery?.distance) - Number(right.properties?.tilequery?.distance))[0];
  const canonicalRegion = !labelFeature?.properties?.name ? canonicalMarineRegion(latitude, longitude) : null;
  const canonicalFeatureId = canonicalRegion ? `marine:${canonicalRegion.id}` : "";
  const verifiedFeatureId = canonicalFeatureId || (labelFeature?.id != null
    ? `natural_label:${labelFeature.id}`
    : `point:${latitude.toFixed(5)}:${longitude.toFixed(5)}`);
  if (!waterFeature || verifiedFeatureId !== featureId
    || (canonicalRegion && (waterType !== canonicalRegion.type || name !== canonicalRegion.name))) {
    return e.json(400, { error: "invalid_mapbox_feature" });
  }

  const matched = e.app.findRecordsByFilter("water_bodies", "mapbox_id = {:featureId}", "", 1, 0, { featureId });
  if (matched.length > 0) {
    return e.json(200, { id: matched[0].id, name: matched[0].getString("name") });
  }

  let resolvedGeometry = null;
  let resolvedOsmId = canonicalRegion ? `marine:${canonicalRegion.id}` : "";
  let resolvedOfficialName = canonicalRegion?.name || "";
  const acceptResolved = (results) => {
    const resolved = results.find((result) =>
      ["way", "relation"].includes(String(result.osm_type || ""))
      && geometryContainsPoint(result.geojson, [longitude, latitude])
      && JSON.stringify(result.geojson).length <= 5_000_000
    );
    if (resolved) {
      resolvedGeometry = resolved.geojson;
      resolvedOsmId = `${resolved.osm_type}/${resolved.osm_id}`;
    }
  };
  try {
    const overpassQuery = `[out:json][timeout:15];is_in(${latitude},${longitude})->.areas;(`
      + 'area.areas["natural"~"^(water|bay|strait)$"];area.areas["place"~"^(sea|ocean)$"];area.areas["water"];area.areas["landuse"~"^(reservoir|basin)$"];);out tags;';
    const overpassResponse = $http.send({
      url: `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`,
      method: "GET",
      timeout: 20,
      headers: { "User-Agent": "StrikeFeed/1.0 water-body-resolver" },
    });
    const areas = overpassResponse.statusCode === 200 && Array.isArray(overpassResponse.json?.elements)
      ? overpassResponse.json.elements
      : [];
    areas.sort((left, right) => Number(left.tags?.sqkm || Infinity) - Number(right.tags?.sqkm || Infinity));
    const area = areas.find((candidate) => Number(candidate.id) >= 2_400_000_000);
    resolvedOfficialName = String(area?.tags?.name || "").trim();
    const areaId = Number(area?.id);
    const osmRef = areaId >= 3_600_000_000
      ? `R${areaId - 3_600_000_000}`
      : areaId >= 2_400_000_000
        ? `W${areaId - 2_400_000_000}`
            : "";
    if (osmRef) resolvedOsmId = osmRef.startsWith("R") ? `relation/${osmRef.slice(1)}` : `way/${osmRef.slice(1)}`;
    if (osmRef) {
      const nominatimResponse = $http.send({
        url: `https://nominatim.openstreetmap.org/lookup?osm_ids=${osmRef}&format=jsonv2&polygon_geojson=1`,
        method: "GET",
        timeout: 20,
        headers: { "User-Agent": "StrikeFeed/1.0 water-body-resolver" },
      });
      acceptResolved(nominatimResponse.statusCode === 200 && Array.isArray(nominatimResponse.json)
        ? nominatimResponse.json
        : []);
    }
  } catch (_) {
    // Fall through to a name-assisted lookup if coordinate resolution is unavailable.
  }
  if (!resolvedGeometry) try {
    const hasWaterType = /(море|водохранилищ|озер|пруд|reservoir|lake|sea|pond)/i.test(name);
    const searchName = hasWaterType ? name : /[А-Яа-яЁё]/.test(name) ? `${name} водохранилище` : `${name} reservoir`;
    const nominatimResponse = $http.send({
      url: "https://nominatim.openstreetmap.org/search"
        + `?q=${encodeURIComponent(searchName)}&format=jsonv2&polygon_geojson=1&limit=5`,
      method: "GET",
      timeout: 20,
      headers: { "User-Agent": "StrikeFeed/1.0 water-body-resolver" },
    });
    const results = nominatimResponse.statusCode === 200 && Array.isArray(nominatimResponse.json)
      ? nominatimResponse.json
      : [];
    acceptResolved(results);
  } catch (_) {
    // Keep the verified point fallback when a named polygon cannot be resolved.
  }
  if (preferOfficialName && (!resolvedGeometry || !resolvedOfficialName)) {
    return e.json(200, {});
  }
  if (resolveOfficialName && !resolvedOfficialName) return e.json(200, {});

  let waterBody = null;
  if (waterBodyId) {
    try {
      const candidate = e.app.findRecordById("water_bodies", waterBodyId);
      if (candidate.getString("name") === name
        && matchesStoredGeometry(candidate)
        && !candidate.getString("mapbox_id")) {
        waterBody = candidate;
      } else {
        return e.json(400, { error: "water_body_too_far" });
      }
    } catch (_) {
      return e.json(404, { error: "water_body_not_found" });
    }
  }

  if (!waterBody && resolvedGeometry) {
    if (!preferOfficialName) {
      const sameName = e.app.findRecordsByFilter("water_bodies", "name = {:name}", "", 50, 0, { name });
      waterBody = sameName.find((candidate) =>
        geometryContainsPoint(resolvedGeometry, [candidate.getFloat("lon"), candidate.getFloat("lat")])
      ) || null;
    }
  }
  if (!waterBody && resolvedOsmId) {
    const sameOsm = e.app.findRecordsByFilter("water_bodies", "osm_id = {:osmId}", "", 1, 0, { osmId: resolvedOsmId });
    waterBody = sameOsm[0] || null;
  }

  const savedName = (preferOfficialName || resolveOfficialName) && resolvedOfficialName ? resolvedOfficialName : name;
  if (dryRun && !waterBody) {
    return resolvedGeometry
      ? e.json(200, { name: savedName, osmId: resolvedOsmId, wouldCreate: true })
      : e.json(200, {});
  }

  if (!waterBody) {
    const collection = e.app.findCollectionByNameOrId("water_bodies");
    waterBody = new Record(collection);
    waterBody.set("osm_id", resolvedOsmId || `mapbox:${$security.randomString(24)}`);
    waterBody.set("region", "global");
    waterBody.set("source", "mapbox");
    waterBody.set("name", savedName);
    waterBody.set("water_type", waterType);
    waterBody.set("lat", latitude);
    waterBody.set("lon", longitude);
  }

  const geometry = resolvedGeometry || { type: "Point", coordinates: [longitude, latitude] };
  const bounds = geometryBounds(geometry);
  waterBody.set("geometry", geometry);
  if (bounds) {
    waterBody.set("min_lat", bounds.minLat);
    waterBody.set("max_lat", bounds.maxLat);
    waterBody.set("min_lon", bounds.minLon);
    waterBody.set("max_lon", bounds.maxLon);
  }

  if (!isMarine || !resolvedOsmId) waterBody.set("mapbox_id", featureId);
  try {
    e.app.save(waterBody);
  } catch (error) {
    const winner = e.app.findRecordsByFilter("water_bodies", "mapbox_id = {:featureId}", "", 1, 0, { featureId });
    if (winner.length > 0) return e.json(200, { id: winner[0].id, name: winner[0].getString("name") });
    throw error;
  }
  return e.json(waterBodyId ? 200 : 201, { id: waterBody.id, name: waterBody.getString("name") });
});

routerAdd("POST", "/water-bodies/lookup", (e) => {
  const info = e.requestInfo();
  if (!info.auth) return e.json(401, { error: "unauthorized" });

  const body = info.body || {};
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    return e.json(400, { error: "invalid_location" });
  }

  const isPosition = (value) => Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
  const pointInRing = (point, ring) => {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const x = ring[index][0];
      const y = ring[index][1];
      const previousX = ring[previous][0];
      const previousY = ring[previous][1];
      if ((y > point[1]) !== (previousY > point[1])
        && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x) {
        inside = !inside;
      }
    }
    return inside;
  };
  const pointInPolygon = (point, polygon) => Array.isArray(polygon)
    && polygon.length > 0
    && polygon.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition))
    && pointInRing(point, polygon[0])
    && !polygon.slice(1).some((ring) => pointInRing(point, ring));
  const distanceMeters = (left, right) => {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(right[1] - left[1]);
    const longitudeDelta = radians(right[0] - left[0]);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(longitudeDelta / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };
  const near = 0.03;
  const nearby = e.app.findRecordsByFilter(
    "water_bodies",
    "lat >= {:minLat} && lat <= {:maxLat} && lon >= {:minLon} && lon <= {:maxLon}",
    "",
    200,
    0,
    { minLat: latitude - near, maxLat: latitude + near, minLon: longitude - near, maxLon: longitude + near },
  );
  const bounded = e.app.findRecordsByFilter(
    "water_bodies",
    "min_lat <= {:lat} && max_lat >= {:lat} && min_lon <= {:lon} && max_lon >= {:lon}",
    "",
    200,
    0,
    { lat: latitude, lon: longitude },
  );
  const candidatesById = {};
  nearby.concat(bounded).forEach((candidate) => { candidatesById[candidate.id] = candidate; });
  const candidates = Object.keys(candidatesById).map((id) => candidatesById[id]);
  const point = [longitude, latitude];
  const matched = candidates.find((candidate) => {
    let geometry;
    try {
      const geometryModel = new DynamicModel({ type: "", coordinates: [] });
      candidate.unmarshalJSONField("geometry", geometryModel);
      geometry = JSON.parse(JSON.stringify(geometryModel));
    } catch (_) {
      return false;
    }
    if (geometry?.type === "Point" && isPosition(geometry.coordinates)) {
      return distanceMeters(point, geometry.coordinates) <= 100;
    }
    if (geometry?.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
    if (geometry?.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
    }
    return false;
  });

  return matched
    ? e.json(200, { id: matched.id, name: matched.getString("name") })
    : e.json(200, {});
});
