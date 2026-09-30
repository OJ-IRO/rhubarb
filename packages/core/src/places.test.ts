import assert from "node:assert/strict";
import { test } from "node:test";
import { homeFromClusters, placeFor, placeLabel } from "./places.js";

// Real shapes from Bee's /v1/conversations and /v1/locations/clusters.
test("a place is a landmark or a neighbourhood, never a street address", () => {
  assert.equal(placeLabel("2-1 Osakajo, Osaka, Chuo, Osaka, 540-0002, Japan, Osaka Castle Park, Honshu"), "Osaka Castle Park, Osaka");
  assert.equal(placeLabel("4-25 Matsu 1-Chōme, Osaka, Nishinari, Osaka, 557-0034, Japan, Honshu"), "Nishinari, Osaka");
  assert.equal(placeLabel("Minato-dori Street, Osaka, Minato, Osaka, Japan, Honshu"), "Minato, Osaka");
  assert.equal(placeLabel("1 Chome-1-10 Kaigandori, Minato Ward, Osaka, 552-0022, Japan, Tempozan Harbor Village"), "Tempozan Harbor Village, Minato Ward");
  assert.equal(placeLabel(null), null);
  for (const a of ["4-25 Matsu 1-Chōme, Osaka, Nishinari, Osaka, 557-0034, Japan, Honshu", "Minato-dori Street, Osaka, Minato, Osaka, Japan"]) {
    const label = placeLabel(a)!;
    assert.doesNotMatch(label, /\d|street|chōme/i, `no number or street in "${label}"`);
  }
});

test("nothing is named near home, the place with the longest dwell", () => {
  const home = homeFromClusters([
    { latitude: 34.6847, longitude: 135.5235, total_dwell_ms: 5_314_913, visit_count: 12 },
    { latitude: 34.64184, longitude: 135.49471, total_dwell_ms: 12_251_313, visit_count: 30 },
  ]);
  assert.deepEqual(home, { latitude: 34.64184, longitude: 135.49471 });
  const atHome = { address: "4-25 Matsu 1-Chōme, Osaka, Nishinari, Osaka, 557-0034, Japan, Honshu", latitude: 34.64183, longitude: 135.49472 };
  assert.equal(placeFor(atHome, home), null);
  const castle = { address: "2-1 Osakajo, Osaka, Chuo, Osaka, 540-0002, Japan, Osaka Castle Park, Honshu", latitude: 34.6845, longitude: 135.5234 };
  assert.equal(placeFor(castle, home), "Osaka Castle Park, Osaka");
});
