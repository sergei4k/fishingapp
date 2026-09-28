import assert from "node:assert/strict";
import test from "node:test";

const { buildNamedWaterwayQuery, buildOverpassQuery, fetchMapboxWaterBody, fetchNamedWaterway, fetchWaterBodies, fetchWaterBodyBoundaryAtPoint } = await import("./waterBodies.ts");

test("builds an exact-name global waterway query", () => {
  assert.match(buildNamedWaterwayQuery("O'Brien River"), /\[\"name\"=\"O'Brien River\"\]/);
});

test("returns the full mapped geometry for a named river", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ elements: [
      { type: "way", id: 1, tags: { waterway: "river", name: "Long River" }, geometry: [{ lat: 55, lon: 37 }, { lat: 55.1, lon: 37.1 }] },
      { type: "way", id: 2, tags: { waterway: "river", name: "Long River" }, geometry: [{ lat: 55.1, lon: 37.1 }, { lat: 55.2, lon: 37.2 }] },
    ] }),
  });
  try {
    assert.deepEqual(await fetchNamedWaterway("Long River"), {
      type: "river",
      name: "Long River",
      geometry: { type: "MultiLineString", coordinates: [[[37, 55], [37.1, 55.1]], [[37.1, 55.1], [37.2, 55.2]]] },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses named waterway relation member geometry", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ elements: [{
      type: "relation",
      id: 9,
      tags: { type: "waterway", waterway: "river", name: "Named River" },
      members: [{
        type: "way",
        ref: 10,
        role: "main_stream",
        geometry: [{ lat: 55, lon: 37 }, { lat: 55.2, lon: 37.2 }],
      }],
    }] }),
  });
  try {
    assert.deepEqual(await fetchNamedWaterway("Named River"), {
      type: "river",
      name: "Named River",
      geometry: { type: "LineString", coordinates: [[37, 55], [37.2, 55.2]] },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("identifies a global Mapbox water feature without OSM geometry", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
    ok: true,
    json: async () => ({ features: [
      { id: 0, properties: { tilequery: { distance: 0, geometry: "polygon", layer: "water" } } },
      { id: 742, properties: { name: "Example Lake", class: "water", tilequery: { distance: 250, geometry: "point", layer: "natural_label" } } },
    ] }),
    };
  };

  try {
    assert.deepEqual(await fetchMapboxWaterBody(39, -120.05, "token"), {
      featureId: "natural_label:742",
      name: "Example Lake",
      type: "other",
      isMarine: false,
    });
    const query = new URL(requestedUrl).searchParams;
    assert.equal(query.get("layers"), "water,natural_label,landuse");
    assert.equal(query.get("radius"), "1000");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("classifies a named marine Mapbox feature", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ features: [
      { id: 0, properties: { class: "ocean", tilequery: { distance: 0, geometry: "polygon", layer: "water" } } },
      { id: 901, properties: { name: "Pacific Ocean", class: "ocean", tilequery: { distance: 500, geometry: "point", layer: "natural_label" } } },
    ] }),
  });

  try {
    assert.deepEqual(await fetchMapboxWaterBody(20, -150, "token"), {
      featureId: "natural_label:901",
      name: "Pacific Ocean",
      type: "ocean",
      isMarine: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the canonical Pacific Ocean region when Mapbox has no nearby label", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ features: [{
      id: 0,
      properties: { class: "water", tilequery: { distance: 0, geometry: "polygon", layer: "water" } },
    }] }),
  });

  try {
    assert.deepEqual(await fetchMapboxWaterBody(20, -150, "token"), {
      featureId: "marine:pacific-ocean",
      name: "Pacific Ocean",
      type: "ocean",
      isMarine: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses Long Island Sound for a nearby harbor polygon", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ features: [{
      id: 0,
      properties: { class: "harbor", tilequery: { distance: 0, geometry: "polygon", layer: "landuse" } },
    }] }),
  });

  try {
    assert.deepEqual(await fetchMapboxWaterBody(40.95, -73.06, "token"), {
      featureId: "marine:long-island-sound",
      name: "Long Island Sound",
      type: "sound",
      isMarine: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("marks an unlabeled Mapbox water polygon as unnamed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ features: [{
      id: 0,
      properties: { tilequery: { distance: 25, geometry: "polygon", layer: "water" } },
    }] }),
  });

  try {
    assert.deepEqual(await fetchMapboxWaterBody(39, -90.05, "token"), {
      featureId: "point:39.00000:-90.05000",
      name: null,
      type: "other",
      isMarine: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not detect water beyond the shoreline tolerance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ features: [{
      id: 0,
      properties: { tilequery: { distance: 101, geometry: "polygon", layer: "water" } },
    }] }),
  });

  try {
    assert.equal(await fetchMapboxWaterBody(39, -120.05, "token"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("separates fast area matching from waterways and multipolygon relations", () => {
  const bbox = [37, 55, 37.01, 55.01];
  assert.doesNotMatch(buildOverpassQuery(bbox), /waterway|relation/);
  assert.match(buildOverpassQuery(bbox, "boundaries"), /way\["natural"="water"\]/);
  assert.match(buildOverpassQuery(bbox, "boundaries"), /relation\["natural"="water"\]/);
  assert.match(buildOverpassQuery(bbox, "waterways"), /waterway/);
  assert.match(buildOverpassQuery(bbox, "relations"), /relation/);
});

test("stops a stalled Overpass request after the configured timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });

  try {
    await assert.rejects(
      fetchWaterBodies([37, 55, 37.01, 55.01], undefined, 1),
      /aborted/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves abort errors so callers do not start another lookup", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    fetchWaterBodies([37, 55, 37.01, 55.01], controller.signal),
    (error) => error instanceof Error && error.name === "AbortError",
  );
});

test("uses a populated mirror when another Overpass mirror returns empty data", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    const isFirstRequest = ++requestCount === 1;
    return {
      ok: true,
      json: async () => ({
        elements: isFirstRequest ? [] : [{
          type: "way",
          id: 91,
          tags: { natural: "water", water: "pond" },
          geometry: [
            { lat: 55, lon: 37 },
            { lat: 55, lon: 37.01 },
            { lat: 55.01, lon: 37.01 },
            { lat: 55, lon: 37 },
          ],
        }],
      }),
    };
  };

  try {
    const bodies = await fetchWaterBodies([37, 55, 37.01, 55.01]);
    assert.equal(bodies[0].id, "way_91");
    assert.equal(requestCount, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses inline member geometry for water multipolygon relations", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      elements: [{
        type: "relation",
        id: 42,
        tags: { natural: "water", name: "Relation Lake" },
        members: [{
          type: "way",
          ref: 7,
          role: "outer",
          geometry: [
            { lat: 55, lon: 37 },
            { lat: 55, lon: 37.01 },
            { lat: 55.01, lon: 37.01 },
            { lat: 55.01, lon: 37 },
            { lat: 55, lon: 37 },
          ],
        }],
      }],
    }),
  });

  try {
    const bodies = await fetchWaterBodies([37, 55, 37.01, 55.01], undefined, undefined, "relations");
    assert.deepEqual(bodies, [{
      id: "rel_42",
      type: "other",
      name: "Relation Lake",
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[37, 55], [37.01, 55], [37.01, 55.01], [37, 55.01], [37, 55]]]],
      },
      properties: { natural: "water", name: "Relation Lake" },
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("finds and returns the polygon containing a catch location", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      elements: [{
        type: "way",
        id: 72,
        tags: { natural: "water", water: "pond" },
        geometry: [
          { lat: 54.99, lon: 36.99 },
          { lat: 54.99, lon: 37.01 },
          { lat: 55.01, lon: 37.01 },
          { lat: 55.01, lon: 36.99 },
          { lat: 54.99, lon: 36.99 },
        ],
      }],
    }),
  });

  try {
    assert.deepEqual(await fetchWaterBodyBoundaryAtPoint(55, 37), {
      osmId: "way/72",
      type: "pond",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [36.99, 54.99],
          [37.01, 54.99],
          [37.01, 55.01],
          [36.99, 55.01],
          [36.99, 54.99],
        ]],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stitches relation way fragments into separate polygon rings", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ elements: [{
      type: "relation",
      id: 80,
      tags: { natural: "water" },
      members: [
        { type: "way", ref: 1, role: "outer", geometry: [{ lat: 55, lon: 37 }, { lat: 55, lon: 37.01 }, { lat: 55.01, lon: 37.01 }] },
        { type: "way", ref: 2, role: "outer", geometry: [{ lat: 55.01, lon: 37.01 }, { lat: 55.01, lon: 37 }, { lat: 55, lon: 37 }] },
        { type: "way", ref: 3, role: "outer", geometry: [{ lat: 56, lon: 38 }, { lat: 56, lon: 38.01 }, { lat: 56.01, lon: 38.01 }, { lat: 56.01, lon: 38 }, { lat: 56, lon: 38 }] },
      ],
    }] }),
  });

  try {
    const [body] = await fetchWaterBodies([37, 55, 38.01, 56.01], undefined, undefined, "relations");
    assert.equal(body.geometry.type, "MultiPolygon");
    assert.equal(body.geometry.coordinates.length, 2);
    assert.deepEqual(body.geometry.coordinates[0][0], [[37, 55], [37.01, 55], [37.01, 55.01], [37, 55.01], [37, 55]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
