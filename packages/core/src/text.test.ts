import assert from "node:assert/strict";
import { test } from "node:test";
import { textContainment, textSimilarity } from "./bee.js";
import { matchesSkillTerms } from "./detect.js";

const NOTE =
  "So a rolling deployment swaps the pods a few at a time instead of all at once, and each new pod has to pass its readiness check before it gets any traffic, so there is never a moment with nothing running, and if a pod never becomes ready the rollout just stalls instead of breaking anything.";

test("a short ambient chunk of a long voice note is recognised as its echo", () => {
  const chunk = "each new pod has to pass its readiness check before it gets any traffic";
  assert.ok(textSimilarity(NOTE, chunk) < 0.6, "Jaccard misses it, which is the bug this replaces");
  assert.ok(textContainment(NOTE, chunk) >= 0.6);
  assert.equal(textContainment(chunk, NOTE), textContainment(NOTE, chunk), "order does not matter");
});

test("the echo survives the speech recogniser hearing it a little differently", () => {
  assert.ok(textContainment(NOTE, "each new pod has to pass it's readiness check before it get any traffic") >= 0.6);
});

test("unrelated speech in the same two minutes is not mistaken for an echo", () => {
  assert.ok(textContainment(NOTE, "can you grab oat milk on the way home tonight") < 0.6);
  assert.equal(textContainment(NOTE, ""), 0);
});

test("skill terms match whole words and phrases, not fragments of other words", () => {
  const terms = ["api", "rolling deployment", "pod", "c++"];
  assert.deepEqual(matchesSkillTerms("the capital of France is on the podium", terms), []);
  assert.deepEqual(matchesSkillTerms("we hit the API twice during the rolling   deployment", terms), ["api", "rolling deployment"]);
  assert.deepEqual(matchesSkillTerms("one pod, then the next.", terms), ["pod"]);
  assert.deepEqual(matchesSkillTerms("rewrote it in C++ last year", terms), ["c++"]);
  assert.deepEqual(matchesSkillTerms("ok", ["ok"]), [], "terms of two characters or fewer are ignored");
});
