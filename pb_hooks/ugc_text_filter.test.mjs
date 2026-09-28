import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ugc_text_filter.pb.js", import.meta.url), "utf8");

function handlerBody(collection, event = "onRecordCreateRequest") {
  const pattern = new RegExp(`${event}\\(\\(e\\) => \\{([\\s\\S]*?)\\}, "${collection}"\\)`);
  const match = source.match(pattern);
  assert.ok(match, `expected a ${event} handler for ${collection}`);
  return match[1];
}

test("rod and reel names are filtered on catch writes", () => {
  for (const event of ["onRecordCreateRequest", "onRecordUpdateRequest"]) {
    const body = handlerBody("catches", event);
    assert.match(body, /\["description", "rod", "reel"\]/);
  }
});

test("saved rod and reel rows are filtered on write", () => {
  for (const event of ["onRecordCreateRequest", "onRecordUpdateRequest"]) {
    const body = handlerBody("tackle", event);
    assert.match(body, /\["name", "model", "manufacturer"\]/);
    assert.match(body, /throw new Error\("objectionable content"\)/);
  }
});

test("every handler still calls e.next() so a rejection never blocks the write path", () => {
  assert.doesNotMatch(source, /onRecord[A-Za-z]+Request\(\(e\) => \{[^}]*e\.next\(\);[^}]*\}\)/);
  assert.equal((source.match(/e\.next\(\);/g) ?? []).length, 8);
});
