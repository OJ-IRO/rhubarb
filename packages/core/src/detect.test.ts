import assert from "node:assert/strict";
import { test } from "node:test";
import { directAsk, goalLanguages, isBareAddress, readingNote, readingNoteFor, stage1Detect } from "./detect.js";

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
  // a mixed line is still read for its English question, goal or not
  assert.equal(kind("why did the clerk say 結婚 when I asked about the passport"), "question");
});

test("'hey Rhubarb' works too, however the recogniser spells it", () => {
  assert.equal(directAsk("Hey Rhubarb, teach me how to order at a konbini"), "teach me how to order at a konbini");
  assert.equal(directAsk("hey rue barb what is the history of osaka castle"), "what is the history of osaka castle");
  assert.equal(directAsk("okay ruby barb explain keigo to me"), "explain keigo to me");
  assert.equal(isBareAddress("Hey, Rhubarb."), true);
  assert.equal(directAsk("I love rhubarb pie"), null);
});

test("an unreachable Claude is told apart from a bad answer, so moments are held and not binned", async () => {
  const { unavailableReason } = await import("./llm.js");
  const credit = Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), { status: 400 });
  assert.equal(unavailableReason(credit), "the Anthropic account is out of credit");
  assert.equal(unavailableReason(Object.assign(new Error("rate_limit_error"), { status: 429 })), "Claude is rate limiting us");
  assert.equal(unavailableReason(Object.assign(new Error("Overloaded"), { status: 529 })), "Claude is having trouble on Anthropic's side");
  assert.equal(unavailableReason(Object.assign(new Error("invalid x-api-key"), { status: 401 })), "the API key was refused");
  assert.equal(unavailableReason(new Error("model refused: sensitive")), null, "a refusal is about this item, not about Claude");
  assert.equal(unavailableReason(new Error("structured output failed schema validation twice")), null);
});

test("each call is priced from its model and token counts, and the daily budget stops calls before they are made", async () => {
  const { costOf, setSpendHooks, tracked, withPurpose, unavailableReason } = await import("./llm.js");
  // 100k in, 10k out on Opus 5: $0.50 + $0.25. Cached reads cost a tenth.
  assert.equal(costOf("claude-opus-5", { input: 100_000, output: 10_000, cacheWrite: 0, cacheRead: 0 }).toFixed(2), "0.75");
  assert.equal(costOf("claude-sonnet-5", { input: 0, output: 0, cacheWrite: 0, cacheRead: 1_000_000 }).toFixed(2), "0.20");

  const seen: Array<{ purpose: string; cost: number }> = [];
  let spent = 0;
  setSpendHooks({ record: (u) => { seen.push({ purpose: u.purpose, cost: u.cost }); spent += u.cost; }, spentToday: () => spent, budgetUsd: () => 1 });
  const fake = (input: number) => async () => ({ model: "claude-opus-5", usage: { input_tokens: input, output_tokens: 0 } });
  await withPurpose("lessons", () => tracked(fake(100_000))); // $0.50
  assert.deepEqual(seen, [{ purpose: "lessons", cost: 0.5 }]);
  await withPurpose("lessons", () => tracked(fake(100_000))); // $1.00: now at the budget
  let ran = false;
  await assert.rejects(withPurpose("lessons", () => tracked(async () => { ran = true; return {}; })), (e: Error) => /writing limit/.test(unavailableReason(e) ?? ""));
  assert.equal(ran, false, "the call is never made once the budget is spent");
  // sorting what was heard may run a little past it, so nothing is lost
  await withPurpose("sorting moments", () => tracked(fake(1000)));
  setSpendHooks({ record: () => {}, spentToday: () => 0, budgetUsd: () => null });
});

test("reading help is chosen per plan, and writing outside a plan follows the latest language plan", () => {
  const phone = { name: "Japanese phone calls for deliveries", domain: "Japanese", brief: "", reading: "none" as const, updatedAt: 2 };
  assert.match(readingNoteFor(phone), /romaji/);
  assert.match(readingNoteFor({ ...phone, reading: null }), /hiragana in parentheses/, "unset means some help");
  assert.equal(readingNoteFor({ name: "Salary negotiation", domain: null, brief: "", reading: null }), "", "not a language plan");
  const older = { ...phone, name: "Keigo at work", reading: "fluent" as const, updatedAt: 1 };
  assert.match(readingNote([older, phone]), /romaji/, "the most recently touched plan wins");
  assert.match(readingNote([], ["conversational Japanese"]), /hiragana/, "a goal alone gets some help");
  assert.equal(readingNote([], ["negotiate better"]), "");
});
