import assert from "node:assert/strict";
import test from "node:test";

import {
  getPreferredStartRoute,
  getPublicCity,
  needsOnboarding,
  normalizeOnboardingPreferences,
} from "./onboarding.ts";

test("the primary onboarding goal selects the first destination", () => {
  assert.equal(getPreferredStartRoute("log_catches"), "/(tabs)/add");
  assert.equal(getPreferredStartRoute("discover_spots"), "/(tabs)");
  assert.equal(getPreferredStartRoute("follow_anglers"), "/(tabs)/social");
  assert.equal(getPreferredStartRoute("plan_trips"), "/(tabs)/weather");
});

test("only the selected city is suitable for the public profile", () => {
  assert.equal(getPublicCity({ city: "Brighton", region: "England", country: "United Kingdom" }), "Brighton");
  assert.equal(getPublicCity({ city: "  Москва  ", region: "Москва", country: "Россия" }), "Москва");
});

test("a selected Mapbox region remains visible on the public profile", () => {
  assert.equal(getPublicCity({ city: "", region: "California", country: "United States" }), "California");
});

test("onboarding preferences are allowlisted and deduplicated before storage", () => {
  assert.deepEqual(
    normalizeOnboardingPreferences({
      primaryGoal: "log_catches",
      fishingStyles: ["spinning", "feeder", "bobber", "float_feeder", "fly", "spinning", "invalid"],
      location: {
        city: "  Brighton  ",
        region: " England ",
        country: " United Kingdom ",
        longitude: -0.1372,
        latitude: 50.8225,
      },
    }),
    {
      primaryGoal: "log_catches",
      fishingStyles: ["spinning", "feeder", "bobber", "float_feeder", "fly"],
      preferredStartTab: "add",
      location: {
        city: "Brighton",
        region: "England",
        country: "United Kingdom",
        longitude: -0.1372,
        latitude: 50.8225,
      },
    },
  );
});

test("invalid coordinates and unknown values are discarded", () => {
  assert.deepEqual(
    normalizeOnboardingPreferences({
      primaryGoal: "unknown",
      fishingStyles: ["not-real"],
      location: { city: "Paris", longitude: 500, latitude: -100 },
    }),
    {
      primaryGoal: "discover_spots",
      fishingStyles: [],
      preferredStartTab: "index",
      location: {
        city: "Paris",
        region: "",
        country: "",
        longitude: null,
        latitude: null,
      },
    },
  );
});

test("only newly-created accounts marked pending are routed into onboarding", () => {
  assert.equal(needsOnboarding({ onboarding_pending: true }), true);
  assert.equal(needsOnboarding({ onboarding_pending: false }), false);
  assert.equal(needsOnboarding({}), false);
  assert.equal(needsOnboarding(null), false);
});
