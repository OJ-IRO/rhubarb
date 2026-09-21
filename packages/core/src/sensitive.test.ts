import assert from "node:assert/strict";
import { test } from "node:test";
import { sensitiveReason } from "./sensitive.js";

test("a personal disclosure is left alone; the same subject as a subject is not", () => {
  assert.equal(sensitiveReason("my doctor put me on medication for it last month"), "health");
  assert.equal(sensitiveReason("i've been seeing a therapist since march"), "health");
  assert.equal(sensitiveReason("i wonder how antidepressants actually work in the brain"), null, "curiosity about a subject is learning");
  assert.equal(sensitiveReason("what does a biopsy actually test for"), null);
});

test("someone in crisis is never turned into a lesson", () => {
  assert.equal(sensitiveReason("honestly some days i just want to die"), "crisis");
  assert.equal(sensitiveReason("they'd be better off without me"), "crisis");
  assert.equal(sensitiveReason("i could kill for a coffee right now"), null, "a figure of speech is not a crisis");
});

test("secrets read aloud are dropped", () => {
  assert.equal(sensitiveReason("the wifi password is rhubarb crumble twenty six"), "secret");
  assert.equal(sensitiveReason("my card number is 4111 1111 1111 1111"), "secret");
  assert.equal(sensitiveReason("social is 123-45-6789"), "secret");
  assert.equal(sensitiveReason("i need to get better at managing passwords"), null, "wanting to learn about passwords is fine");
  assert.equal(sensitiveReason("the rollout stalled for four minutes on tuesday"), null);
});

test("the wearer's own legal and intimate matters are left alone", () => {
  assert.equal(sensitiveReason("i got a dui back in college"), "legal");
  assert.equal(sensitiveReason("we're getting a divorce and i don't know how to tell the kids"), "intimate");
  assert.equal(sensitiveReason("how does probation work in california"), null);
  assert.equal(sensitiveReason("i need to get better at negotiating my salary"), null);
});
