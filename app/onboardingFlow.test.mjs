import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rootLayout = fs.readFileSync(new URL("./_layout.tsx", import.meta.url), "utf8");
const authLayout = fs.readFileSync(new URL("./(auth)/_layout.tsx", import.meta.url), "utf8");
const authSource = fs.readFileSync(new URL("../lib/auth.tsx", import.meta.url), "utf8");
const appleHook = fs.readFileSync(new URL("../pb_hooks/apple_signin.pb.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../pb_migrations/1786731600_create_onboarding_preferences.js", import.meta.url), "utf8");
const settingsSource = fs.readFileSync(new URL("./(tabs)/settings.tsx", import.meta.url), "utf8");
const onboardingSource = fs.readFileSync(new URL("./(auth)/onboarding.tsx", import.meta.url), "utf8");

test("new email and Apple accounts are marked for onboarding", () => {
  assert.match(authSource, /onboarding_pending:\s*true/);
  assert.match(appleHook, /record\.set\("onboarding_pending",\s*true\)/);
});

test("protected routing keeps pending users inside the onboarding screen", () => {
  assert.match(rootLayout, /needsOnboarding\(user\)/);
  assert.match(rootLayout, /router\.replace\('\/(?:\(auth\)\/)?onboarding'/);
  assert.match(authLayout, /Stack\.Screen name="onboarding"/);
});

test("recommendation data is stored in an owner-only collection", () => {
  assert.match(migration, /name:\s*"user_onboarding_preferences"/);
  assert.match(migration, /collection\.fields\.add\(new RelationField/);
  assert.match(migration, /collection\.listRule = "user_id = @request\.auth\.id"/);
  assert.match(migration, /collection\.viewRule = "user_id = @request\.auth\.id"/);
  assert.match(migration, /collection\.updateRule = "user_id = @request\.auth\.id[^\"]*"/);
  assert.match(migration, /collection\.deleteRule = "user_id = @request\.auth\.id"/);
  assert.match(migration, /name:\s*"onboarding_pending"/);
});

test("profile location editing publishes the city without the country label", () => {
  assert.match(settingsSource, /const nextLocation = result\?\.city \?\? ""/);
});

test("finishing onboarding saves independent records concurrently", () => {
  assert.match(onboardingSource, /Promise\.allSettled\(\[saveUser\(\), savePreferences\(\)\]\)/);
});

test("first-time onboarding creates preferences without a preliminary lookup", () => {
  const createIndex = onboardingSource.indexOf("collection.create(payload)");
  const lookupIndex = onboardingSource.indexOf("collection.getFirstListItem");

  assert.notEqual(createIndex, -1);
  assert.notEqual(lookupIndex, -1);
  assert.ok(createIndex < lookupIndex);
});
