import assert from "node:assert/strict";
import { test } from "node:test";
import { directAsk, goalLanguages, isBareAddress, stage1Detect } from "./detect.js";

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

test("asking Bee directly is the strongest signal, never noise", () => {
  const r = stage1Detect("Hey Bee, can you give me a history lesson on ferris wheels?");
  assert.equal(r.matched, true);
  assert.equal(r.kind, "intent");
  assert.deepEqual(r.cues, ["hey-bee"]);
  assert.equal(r.ask, "can you give me a history lesson on ferris wheels");
  // the ways speech recognition spells it
  assert.equal(directAsk("hey B teach me how the osaka loop line works"), "teach me how the osaka loop line works");
  assert.equal(directAsk("Hey, be. How do I order at a ramen counter"), "How do I order at a ramen counter");
  assert.equal(directAsk("okay so hey bee what is a torii gate"), "what is a torii gate");
});

test("ordinary sentences that start like an address are left alone", () => {
  assert.equal(directAsk("be careful on the stairs"), null);
  assert.equal(directAsk("okay but that was the best ramen"), null);
  assert.equal(directAsk("hey bear come here"), null);
  assert.equal(directAsk("they believe it was built in 1997"), null);
});

test("a bare address waits for the next line", () => {
  assert.equal(isBareAddress("Hey Bee."), true);
  assert.equal(isBareAddress("hey bee, what is"), false);
  assert.equal(isBareAddress("hey you"), false);
});

test("a line in a language they are learning counts, even with no English cue", () => {
  const hints = { languages: goalLanguages(["conversational Japanese for daily life in Japan"]) };
  assert.deepEqual(hints.languages, ["japanese"]);
  assert.equal(stage1Detect("すみません、これをください", hints).kind, "exposure");
  assert.equal(stage1Detect("すみません、これをください", hints).matched, true);
  // not a goal: no signal
  assert.equal(stage1Detect("すみません、これをください").matched, false);
  // too short to be a real exchange
  assert.equal(stage1Detect("うん", hints).matched, false);
});

test("'hey Rhubarb' works too, however the recogniser spells it", () => {
  assert.equal(directAsk("Hey Rhubarb, teach me how to order at a konbini"), "teach me how to order at a konbini");
  assert.equal(directAsk("hey rue barb what is the history of osaka castle"), "what is the history of osaka castle");
  assert.equal(directAsk("okay ruby barb explain keigo to me"), "explain keigo to me");
  assert.equal(isBareAddress("Hey, Rhubarb."), true);
  assert.equal(directAsk("I love rhubarb pie"), null);
});
