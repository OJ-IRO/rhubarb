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
