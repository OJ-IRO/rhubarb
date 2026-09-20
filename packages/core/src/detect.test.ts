import assert from "node:assert/strict";
import { test } from "node:test";
import { stage1Detect } from "./detect.js";

// Speech recognition gives no question marks and drops apostrophes, so these read the way Bee sends them.
const kind = (text: string) => {
  const r = stage1Detect(text);
  return r.matched ? r.kind : null;
};

test("stated intent to learn is caught, with or without apostrophes", () => {
  assert.equal(kind("i really need to get better at negotiating my salary"), "intent");
  assert.equal(kind("honestly im learning japanese before the tokyo trip"), "intent");
  assert.equal(kind("I should brush up on my SQL before the interview"), "intent");
});

test("intent outranks the question it is wrapped in", () => {
  assert.equal(kind("how do i even start i want to learn kubernetes properly"), "intent");
});

test("not understanding something said to you is a struggle", () => {
  assert.equal(kind("i had no idea what she meant by liquidation preference"), "struggle");
  assert.equal(kind("that whole term sheet conversation went over my head"), "struggle");
});

test("wondering out loud is a question, even with no question mark", () => {
  assert.equal(kind("i wonder how honeybees actually make honey"), "question");
  assert.equal(kind("why are airplane windows always round"), "question");
  assert.deepEqual(stage1Detect("why are airplane windows always round").cues, ["interrogative-start"]);
});

test("hedging on a fact is a gap", () => {
  assert.equal(kind("the capital of australia i think its sydney"), "gap");
  assert.equal(kind("it was 1954 or something like that dont quote me"), "gap");
});

test("small talk, short fragments and assistant commands are ignored", () => {
  assert.equal(kind("can you pass me the oat milk please"), null);
  assert.equal(kind("what is that"), null, "under four words is too little to act on");
  assert.equal(kind("hey siri what is the weather like tomorrow"), null);
  assert.equal(kind("Alexa, how many ounces are in a cup"), null);
});
