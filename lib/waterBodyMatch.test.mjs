import assert from "node:assert/strict";
import test from "node:test";

const { matchWaterBody } = await import("./waterBodyMatch.ts");

const lake = {
  id: "lake-1",
  name: "Test Lake",
  geometry: {
    type: "Polygon",
    coordinates: [[[37, 55], [37.01, 55], [37.01, 55.01], [37, 55.01], [37, 55]]],
  },
};

test("matches a catch inside a waterbody polygon", () => {
  assert.deepEqual(matchWaterBody([lake], 55.005, 37.005), {
    id: "lake-1",
    name: "Test Lake",
    isShorelineMatch: false,
  });
});

test("matches a catch within the shoreline tolerance", () => {
  assert.deepEqual(matchWaterBody([lake], 55.005, 36.9997), {
    id: "lake-1",
    name: "Test Lake",
    isShorelineMatch: true,
  });
});

test("does not match a catch beyond the shoreline tolerance", () => {
  assert.equal(matchWaterBody([lake], 55.005, 36.99), null);
});

test("matches a catch near a river centerline", () => {
  const river = {
    id: "river-1",
    name: "Test River",
    geometry: {
      type: "LineString",
      coordinates: [[37, 55], [37.01, 55]],
    },
  };

  assert.deepEqual(matchWaterBody([river], 55.0004, 37.005), {
    id: "river-1",
    name: "Test River",
    isShorelineMatch: true,
  });
});

test("matches a catch within the extended river tolerance", () => {
  const river = {
    id: "river-1",
    name: "Test River",
    geometry: {
      type: "LineString",
      coordinates: [[37, 55], [37.01, 55]],
    },
  };

  assert.deepEqual(matchWaterBody([river], 55.0008, 37.005), {
    id: "river-1",
    name: "Test River",
    isShorelineMatch: true,
  });
});
