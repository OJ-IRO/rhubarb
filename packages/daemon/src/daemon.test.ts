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

// ---- hosted mode: a token instead of the localhost-only rule

function raw(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { ...headers, ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(Buffer.byteLength(body)) } : {}) } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("hosted mode: nothing but the login page opens without the token; a cookie or bearer opens everything", async () => {
  const port = 45_000 + Math.floor(Math.random() * 5_000);
  const db = new RhubarbDb(":memory:");
  const token = "a-long-random-access-token-1234";
  const server = startApi({ db, log: () => {}, actions: {} as never }, port, { accessToken: token, where: "a test server" });
  await new Promise((r) => setTimeout(r, 150));
  try {
    // a foreign Host is fine now: the token is the gate
    assert.equal((await raw(port, "GET", "/api/status", { Host: "rhubarb.example.com" })).status, 401);
    assert.equal((await raw(port, "GET", "/")).status, 303, "the app itself redirects to the login page");
    assert.equal((await raw(port, "GET", "/login")).status, 200);

    const wrong = await raw(port, "POST", "/login", {}, "token=nope");
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers["set-cookie"], undefined);

    const ok = await raw(port, "POST", "/login", {}, `token=${encodeURIComponent(token)}`);
    assert.equal(ok.status, 303);
    const cookie = String(ok.headers["set-cookie"]).split(";")[0];
    assert.match(String(ok.headers["set-cookie"]), /HttpOnly/);

    const withCookie = await raw(port, "GET", "/api/status", { Cookie: cookie, Host: "rhubarb.example.com" });
    assert.equal(withCookie.status, 200);
    assert.deepEqual(JSON.parse(withCookie.body).hosted, { where: "a test server" }, "the privacy page can say where the data lives");

    assert.equal((await raw(port, "GET", "/api/status", { Authorization: `Bearer ${token}` })).status, 200, "scripts and the agent skill use a bearer");
    assert.equal((await raw(port, "GET", "/api/status", { Authorization: "Bearer wrong" })).status, 401);
    assert.equal((await raw(port, "GET", "/logout", { Cookie: cookie })).status, 303);
  } finally {
    server.close();
  }
});

// ---- asks to Bee, and the nightly sweep

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askIn, handleUtterance } from "./pipeline/capture.js";
import { runSweep } from "./pipeline/sweep.js";

function freshDb(): RhubarbDb {
  return new RhubarbDb(join(mkdtempSync(join(tmpdir(), "rhubarb-test-")), "t.db"));
}

test("'hey Bee, ...' becomes a moment and is handed to the ask handler, not dropped", () => {
  const db = freshDb();
  const asks: string[] = [];
  const deps = { db, log: () => {}, onJournalReady: () => {}, onAsk: (_e: unknown, ask: string) => asks.push(ask) };
  handleUtterance(deps, "c1", { id: 1, text: "Hey Bee, can you give me a history lesson on ferris wheels?", spoken_at: "2026-09-27T05:00:00.000Z" });
  assert.deepEqual(asks, ["can you give me a history lesson on ferris wheels"]);
  const e = db.evidenceByUtterance(1)!;
  assert.equal(e.kind, "intent");
  assert.equal(e.route, "skill");
  // Siri is still someone else's assistant
  handleUtterance(deps, "c1", { id: 2, text: "hey siri what is the weather like tomorrow", spoken_at: "2026-09-27T05:00:10.000Z" });
  assert.equal(db.evidenceByUtterance(2), null);
  db.close();
});

test("a bare 'Hey Bee.' takes the next line as the ask", () => {
  const db = freshDb();
  const asks: string[] = [];
  const deps = { db, log: () => {}, onJournalReady: () => {}, onAsk: (_e: unknown, ask: string) => asks.push(ask) };
  handleUtterance(deps, "c1", { id: 10, text: "Hey Bee.", spoken_at: "2026-09-27T05:00:00.000Z" });
  handleUtterance(deps, "c1", { id: 11, text: "Tell me the history of this ferris wheel.", spoken_at: "2026-09-27T05:00:04.000Z" });
  assert.deepEqual(asks, ["Tell me the history of this ferris wheel"]);
  // a minute later is a different sentence, not the ask
  assert.equal(askIn(db, "c1", { id: 12, text: "Tell me more about it", spoken_at: "2026-09-27T05:01:30.000Z" }), null);
  db.close();
});

test("the sweep matches lines already heard live and only adds what the stream missed", async () => {
  const db = freshDb();
  const deps = { db, log: () => {}, onJournalReady: () => {} };
  handleUtterance(deps, "live-uuid", { id: 3520110070, text: "Why are you in Osaka?", spoken_at: "2026-09-27T11:07:49.000Z" });
  const at = Date.parse("2026-09-27T11:07:49.000Z");
  const bee = {
    changes: async () => ({ facts: [], conversations: [10763793], dailies: [], journals: [], todos: [], next_cursor: "v1-2", since: 0, until: 0, updated: true }),
    // Bee's shape: wrapped, epoch-ms timestamps, new ids, "Unknown" speakers
    getConversation: async () => ({
      conversation: {
        id: 10763793,
        start_time: at - 30_000,
        end_time: at + 600_000,
        transcriptions: [
          {
            realtime: false,
            utterances: [
              { id: 3520133419, text: "Why are you in Osaka?", spoken_at: at, speaker: "Unknown" },
              { id: 3520133500, text: "I wonder how they keep the ferris wheel balanced in the wind", spoken_at: at + 120_000, speaker: "Unknown" },
            ],
          },
        ],
      },
      timezone: "Asia/Tokyo",
    }),
  };
  const out = await runSweep({ ...deps, bee: bee as never });
  assert.deepEqual({ matched: out.matched, added: out.utterances }, { matched: 1, added: 1 });
  assert.equal(db.privacySummary().utterances, 2, "the Osaka line is not stored twice");
  const recovered = db.evidenceByUtterance(3520133500)!;
  assert.equal(recovered.conversationUuid, "live-uuid", "a recovered line joins the live conversation it belongs to");
  assert.equal(recovered.speakerLabel, null, "'Unknown' is not a speaker label");
  assert.equal(db.getKv("changes_cursor"), "v1-2");
  db.close();
});

test("correcting a misheard moment changes what every later lesson reads, and a rewrite hides the old lesson", () => {
  const db = freshDb();
  const deps = { db, log: () => {}, onJournalReady: () => {}, onAsk: () => {} };
  handleUtterance(deps, "c9", { id: 900, text: "Hey Rhubarb, I'm on the Old Southfield ferris wheel, teach me its history", spoken_at: "2026-09-27T05:00:00.000Z" });
  const e = db.evidenceByUtterance(900)!;
  const fixed = db.editMoment(e.id, { text: "Hey Rhubarb, I'm on the Osaka ferris wheel, teach me its history", context: "you: I'm on the Osaka ferris wheel." })!;
  assert.match(fixed.text, /Osaka/);
  assert.equal(fixed.context, "you: I'm on the Osaka ferris wheel.");
  assert.ok(fixed.editedAt);
  assert.match(db.windowAroundUtterance(900)!.find((u) => u.id === 900)!.text, /Osaka/, "the stored line is corrected too");

  const skillId = db.insertSkill({ name: "Ferris wheels", domain: null, competentLooksLike: "", terms: [], priority: 90, brief: "", kind: "topic", origin: "asked" });
  const lesson = { skillId, levelIdx: 0, style: "story" as const, bodyMd: "", deck: { title: "", subtitle: "", minutes: 5, slides: [] }, quiz: { questions: [] }, beats: [], citations: [] };
  const old = db.insertLesson(lesson);
  const fresh = db.insertLesson(lesson);
  db.replaceOlderLessons(skillId, 0, fresh);
  assert.deepEqual(db.lessonsForSkill(skillId).map((l) => l.id), [fresh]);
  assert.equal(db.currentLesson(skillId, 0)!.id, fresh);
  assert.equal(db.getLesson(old)!.status, "replaced", "the old lesson is kept, not deleted");
  db.close();
});

test("moments binned as noise because Claude was unreachable go back in the queue; real verdicts stay", () => {
  const db = freshDb();
  const mk = (id: number) => db.insertEvidence({ kind: "question", text: `line ${id}`, context: null, spokenAt: "2026-09-28T05:00:00.000Z", utteranceId: id, conversationUuid: "c", speakerLabel: null, source: "stream" });
  const lost = mk(1);
  const judged = mk(2);
  const asked = mk(3);
  db.classifyEvidence(lost, { kind: "question", route: "noise", topic: null, confidence: 0 });
  db.classifyEvidence(judged, { kind: "question", route: "noise", topic: "small talk", confidence: 0.7 });
  db.classifyEvidence(asked, { kind: "intent", route: "skill", topic: "ferris wheels", confidence: 1 });
  assert.equal(db.requeueUnjudged(), 1);
  assert.equal(db.evidenceById(lost)!.stage, "detected");
  assert.equal(db.evidenceById(judged)!.route, "noise");
  assert.deepEqual(db.pendingAsks(0).map((e) => e.id), [asked], "an ask with no lesson yet is waiting to be retried");
  db.close();
});
