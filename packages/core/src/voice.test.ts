import assert from "node:assert/strict";
import { test } from "node:test";
import { lintProse } from "./voice.js";

const rules = (text: string) => lintProse(text).issues.map((i) => i.rule);

test("writing in the house voice passes clean", () => {
  const good =
    "Kubernetes came up three times this week, twice in standup and once when Maya walked you through Tuesday's rollout. Both times you nodded along and said you'd look it up later.\n\nYou have a sync with that team on Thursday. Twenty minutes before then would change how that meeting goes.";
  assert.deepEqual(lintProse(good), { ok: true, issues: [], score: 0 });
});

test("machine-sounding phrases are flagged", () => {
  const r = lintProse("Let's delve into how rolling deployments leverage readiness checks.");
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.rule === "banned-phrase" && i.detail === "delve"));
  assert.ok(r.issues.some((i) => i.rule === "banned-phrase" && i.detail === "leverage"));
});

test("a filler opener is flagged", () => {
  assert.ok(rules("Great! Here is how a rollout works.").includes("filler-opener"));
  assert.ok(!rules("Great care goes into each rollout, and it shows.").includes("filler-opener"), "the word alone is fine");
});

test("enthusiasm by punctuation is flagged past the first mark", () => {
  assert.ok(!rules("You passed level two!").includes("exclamation"));
  assert.ok(rules("You passed! Level two is yours! Keep going!").includes("exclamation"));
});

test("an em-dash chain inside one paragraph is flagged", () => {
  assert.ok(rules("The rollout stalled — nobody panicked — and then it finished.").includes("em-dash-chain"));
  assert.ok(!rules("The rollout stalled — and nobody panicked.\n\nIt finished a minute later — as it should.").includes("em-dash-chain"), "one per paragraph is allowed");
});

test("a paragraph dressed up as bullets is flagged, a short real list is not", () => {
  const bullets = ["Intro line", "- one", "- two", "- three", "- four", "Closing line"].join("\n");
  assert.ok(rules(bullets).includes("bullet-heavy"));
  assert.ok(!rules("Do this:\n- check readiness\n- watch the rollout").includes("bullet-heavy"));
});

test("the score grows with the number of problems and caps at ten", () => {
  assert.equal(lintProse("Certainly! Let's delve in! This is robust! 🎉🎉").score > 4, true);
  assert.equal(lintProse("delve leverage robust seamless utilize foster harness unlock elevate empower").score, 10);
});
