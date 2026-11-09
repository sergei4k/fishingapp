import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("journal is hidden from the tab bar but remains reachable from the profile", () => {
  const layout = readFileSync(new URL("./_layout.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("./profile.tsx", import.meta.url), "utf8");

  assert.match(layout, /name="journal"[\s\S]*?tabBarButton: \(\) => null/);
  assert.match(profile, /router\.push\(['"]\/\(tabs\)\/journal['"]\)/);
});
