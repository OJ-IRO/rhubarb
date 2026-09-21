import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";
import { RhubarbDb } from "@rhubarb/core";
import { startApi } from "./api.js";
import { fieldShowsLevel } from "./pipeline/progress.js";
import { afterQuietHours } from "./pipeline/schedule.js";

test("field evidence: the judge's 1-based rung is compared against the 0-based level", () => {
  // Learner is on rung 2 (index 1).
  assert.equal(fieldShowsLevel(1, 1), false, "showing rung 1 must not pass rung 2");
  assert.equal(fieldShowsLevel(2, 1), true);
  assert.equal(fieldShowsLevel(3, 1), true);
  // Learner is on the first rung (index 0).
  assert.equal(fieldShowsLevel(1, 0), true);
  assert.equal(fieldShowsLevel(0, 0), false, "0 means the skill was not used");
  assert.equal(fieldShowsLevel(undefined, 0), false);
});

test("alarms that would land overnight wait for the morning", () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 21, h, m, 0, 0);
  assert.equal(afterQuietHours(at(14)).getTime(), at(14).getTime(), "daytime is left alone");
  assert.equal(afterQuietHours(at(21, 59)).getTime(), at(21, 59).getTime());
  assert.equal(afterQuietHours(at(3, 2)).getTime(), at(8, 30).getTime(), "the 3am reflection nudge moves to 8:30 the same day");
  assert.equal(afterQuietHours(at(23, 10)).getTime(), new Date(2026, 8, 22, 8, 30).getTime(), "late evening moves to the next morning");
});

function get(port: number, path: string, host?: string, origin?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (host) headers.Host = host;
    if (origin) headers.Origin = origin;
    const req = request({ host: "127.0.0.1", port, path, method: "GET", headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("the API shrugs off a malformed URL and refuses requests addressed to another host", async () => {
  const port = 45_000 + Math.floor(Math.random() * 5_000);
  const rejections: unknown[] = [];
  const onRejection = (r: unknown) => rejections.push(r);
  process.on("unhandledRejection", onRejection);

  const db = new RhubarbDb(":memory:");
  // Only the routes exercised here are touched, so the action handlers are never called.
  const server = startApi({ db, log: () => {}, actions: {} as never }, port);
  await new Promise((r) => setTimeout(r, 150));
  try {
    // "//" makes `new URL(req.url, base)` throw. It used to escape the handler and kill the process.
    assert.equal((await get(port, "//")).status, 400);
    const ok = await get(port, "/api/status");
    assert.equal(ok.status, 200, "and the server is still answering afterwards");
    assert.equal(JSON.parse(ok.body).skills, 0);
    assert.equal((await get(port, "/api/status", "evil.example.com")).status, 403, "DNS rebinding: wrong Host is refused");
    assert.equal((await get(port, "/api/status", `localhost:${port}`)).status, 200);
    assert.equal((await get(port, "/api/status", undefined, "https://evil.example.com")).status, 403, "a cross-site page is refused");
    assert.equal((await get(port, "/api/status", undefined, `http://127.0.0.1:${port}`)).status, 200, "the dashboard itself is allowed");
    assert.equal((await get(port, "/api/status", undefined, "http://localhost:5173")).status, 200, "so is the Vite dev server");
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(rejections, []);
  } finally {
    process.off("unhandledRejection", onRejection);
    server.close();
  }
});

// ---- which practice is a fresh voice note answering?

import { matchPractice, sweepPractice } from "./pipeline/practice.js";

function practiceAt(db: RhubarbDb, scheduledFor: number): number {
  return db.insertPractice({ skillId: null, lessonId: null, cardId: null, kind: "teachback", prompt: "Explain a rolling deployment.", rubric: null, marker: "w1", scheduledFor, beeTodoId: null });
}

test("a voice note answers a practice whose alarm has gone off, within the answer window", () => {
  const now = Date.now();
  const db = new RhubarbDb(":memory:");
  assert.equal(matchPractice(db, now), null, "nothing scheduled, nothing to answer");

  const future = practiceAt(db, now + 2 * 3600_000);
  assert.equal(matchPractice(db, now), null, "an alarm two hours away is not what they are answering");

  const due = practiceAt(db, now - 5 * 60_000);
  assert.equal(matchPractice(db, now)?.id, due);

  const nearly = practiceAt(db, now + 30_000);
  assert.ok([due, nearly].includes(matchPractice(db, now)!.id), "an alarm firing within the minute counts too");
  assert.notEqual(matchPractice(db, now)?.id, future);
});

test("a practice nobody answered expires, and stops matching", () => {
  const now = Date.now();
  const db = new RhubarbDb(":memory:");
  const stale = practiceAt(db, now - 7 * 3600_000);
  assert.equal(matchPractice(db, now), null, "seven hours on, a voice note is about something else");
  sweepPractice(db, now);
  assert.equal(db.getPractice(stale)?.status, "expired");

  const fired = practiceAt(db, now - 60_000);
  sweepPractice(db, now);
  assert.equal(db.getPractice(fired)?.status, "delivered");
});

test("an answered practice is not matched a second time", () => {
  const now = Date.now();
  const db = new RhubarbDb(":memory:");
  const id = practiceAt(db, now - 60_000);
  db.attachPracticeAnswer(id, "journal-1", "it swaps pods a few at a time");
  assert.equal(matchPractice(db, now), null);
});

// ---- setting a skill aside and bringing it back; forgetting things

function call(port: number, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = payload ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) } : {};
    const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : null }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test("a skill that was set aside can be brought back, and reports where Rhubarb stands on listening", async () => {
  const port = 45_000 + Math.floor(Math.random() * 5_000);
  const db = new RhubarbDb(":memory:");
  const id = db.insertSkill({ name: "Salary negotiation", domain: null, competentLooksLike: "names a number first", terms: ["salary"], priority: 80, brief: "You said you'd take whatever they offer." });
  const actions = { dismissSkill: async (sid: number) => db.updateSkill(sid, { status: "dismissed" }) } as never;
  const server = startApi({ db, log: () => {}, actions, listening: () => ({ state: "connected", lastHeardAt: 1234, since: 1000 }) }, port);
  await new Promise((r) => setTimeout(r, 150));
  try {
    assert.deepEqual((await call(port, "GET", "/api/status")).json.listening, { state: "connected", lastHeardAt: 1234, since: 1000 });

    assert.equal((await call(port, "POST", `/api/skills/${id}/dismiss`)).status, 200);
    assert.deepEqual((await call(port, "GET", "/api/skills")).json, [], "gone from the board");
    assert.deepEqual((await call(port, "GET", "/api/skills/dismissed")).json.map((s: { id: number }) => s.id), [id]);

    const back = await call(port, "POST", `/api/skills/${id}/restore`);
    assert.equal(back.json.status, "proposed");
    assert.equal((await call(port, "GET", "/api/skills")).json.length, 1);
    assert.equal((await call(port, "POST", "/api/skills/999/restore")).status, 404);
  } finally {
    server.close();
  }
});

test("privacy: moments and days can be forgotten, and erasing everything needs a deliberate second signal", async () => {
  const port = 45_000 + Math.floor(Math.random() * 5_000);
  const db = new RhubarbDb(":memory:");
  const at = new Date(2026, 8, 17, 14).toISOString();
  db.insertUtterance({ id: 1, conversationUuid: "c1", text: "i wonder how honeybees make honey", spokenAt: at, source: "stream" });
  db.insertUtterance({ id: 2, conversationUuid: "c1", text: "i need to get better at negotiating", spokenAt: at, source: "stream" });
  const ev = db.insertEvidence({ kind: "question", text: "i wonder how honeybees make honey", context: null, spokenAt: at, utteranceId: 1, conversationUuid: "c1", speakerLabel: null, source: "stream" });
  const server = startApi({ db, log: () => {}, actions: {} as never }, port);
  await new Promise((r) => setTimeout(r, 150));
  try {
    const first = await call(port, "GET", "/api/privacy");
    assert.equal(first.json.summary.utterances, 2);
    assert.equal(first.json.moments.length, 1);

    const afterOne = await call(port, "DELETE", `/api/privacy/moments/${ev}`);
    assert.equal(afterOne.json.summary.utterances, 1, "the reply is the fresh picture");
    assert.equal((await call(port, "DELETE", `/api/privacy/moments/${ev}`)).status, 404);

    assert.equal((await call(port, "DELETE", "/api/privacy/days/yesterday")).status, 400);

    assert.equal((await call(port, "DELETE", "/api/privacy/everything")).status, 400, "no body, no erase");
    assert.equal((await call(port, "DELETE", "/api/privacy/everything", { confirm: "yes" })).status, 400);
    assert.equal(db.privacySummary().utterances, 1, "nothing was erased by the refused requests");

    const wiped = await call(port, "DELETE", "/api/privacy/everything", { confirm: "erase everything" });
    assert.equal(wiped.status, 200);
    assert.equal(wiped.json.summary.utterances, 0);
  } finally {
    server.close();
  }
});


// ---- what may leave for a search engine

import { queryLeaksPrompt } from "./pipeline/research.js";

test("a web search may name the subject, but never repeat what the wearer said", () => {
  const shown = `## Skill\nKubernetes rolling deployments\n\n## Moments\n- "I really need to actually understand how our deploys work before Thursday."\n- "Wait, what does halfway through the pods actually mean?"`;

  assert.equal(queryLeaksPrompt("kubernetes rolling deployment readiness probe", shown), false);
  assert.equal(queryLeaksPrompt("Kubernetes rolling deployments maxUnavailable maxSurge explained", shown), false, "the skill's own name is a subject, not speech");

  assert.equal(queryLeaksPrompt("what does halfway through the pods actually mean", shown), true);
  assert.equal(queryLeaksPrompt("Understand how our deploys work before thursday!", shown), true, "case and punctuation don't hide it");
  assert.equal(queryLeaksPrompt("x ".repeat(80), shown), true, "and a query is never an essay");
});

// ---- guess before the answer; evidence as numbers only

test("a guess is recorded before the answer, a skip is recorded as a skip, and the research copy holds no speech", async () => {
  const port = 45_000 + Math.floor(Math.random() * 5_000);
  const db = new RhubarbDb(":memory:");
  const itemId = db.insertItem({ kind: "question", sourceText: "i wonder why airplane windows are round", utteranceId: null, conversationUuid: null, spokenAt: new Date().toISOString() });
  const cardA = db.insertCard({ itemId, title: "Why airplane windows are round", answerMd: "Square corners concentrate stress.", citations: [] });
  const cardB = db.insertCard({ itemId, title: "How honeybees make honey", answerMd: "Enzymes and fanning.", citations: [] });
  const judged: string[] = [];
  const actions = {
    judgeGuess: async (_c: unknown, guess: string) => {
      judged.push(guess);
      return { close: true, note: "That's the heart of it." };
    },
  } as never;
  const server = startApi({ db, log: () => {}, actions }, port);
  await new Promise((r) => setTimeout(r, 150));
  try {
    const guessed = await call(port, "POST", `/api/sparks/${cardA}/guess`, { text: "  something about pressure at the corners  " });
    assert.equal(guessed.json.guess, "something about pressure at the corners");
    assert.equal(guessed.json.guessClose, true);
    assert.deepEqual(judged, ["something about pressure at the corners"]);

    const skipped = await call(port, "POST", `/api/sparks/${cardB}/guess`, { text: "" });
    assert.equal(skipped.json.guess, "", "a skip is recorded, so the card is not asked again");
    assert.equal(skipped.json.guessClose, null);
    assert.equal(judged.length, 1, "no model call is spent on a skip");
    assert.equal((await call(port, "POST", "/api/sparks/999/guess", { text: "x" })).status, 404);

    const progress = (await call(port, "GET", "/api/progress")).json;
    assert.deepEqual(progress.guesses, { made: 1, close: 1, skipped: 1 });

    const copy = await call(port, "GET", "/api/progress/research-copy");
    assert.equal(copy.status, 200);
    const text = JSON.stringify(copy.json);
    assert.equal(/airplane|honey|pressure/i.test(text), false, "no question, answer or guess text in the research copy");
    assert.equal(copy.json.schema, 1);
  } finally {
    server.close();
  }
});
