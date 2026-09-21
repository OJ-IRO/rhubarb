import assert from "node:assert/strict";
import { test } from "node:test";
import { RhubarbDb } from "./db.js";

const count = (db: RhubarbDb, table: string) => (db.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

/** Two days of speech. Day one has a moment that became evidence, a field credit and an answer card. */
function seeded() {
  const db = new RhubarbDb(":memory:");
  const local = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0, 0).toISOString();
  const day1 = local(2026, 9, 17, 14);
  const day2 = local(2026, 9, 18, 10);

  db.insertUtterance({ id: 1, conversationUuid: "c1", text: "i wonder how honeybees actually make honey", spokenAt: day1, source: "stream" });
  db.insertUtterance({ id: 2, conversationUuid: "c1", text: "no idea honestly", spokenAt: day1, source: "stream" });
  db.insertUtterance({ id: 3, conversationUuid: "c2", text: "i need to get better at negotiating", spokenAt: day2, source: "stream" });

  const ev1 = db.insertEvidence({ kind: "question", text: "i wonder how honeybees actually make honey", context: null, spokenAt: day1, utteranceId: 1, conversationUuid: "c1", speakerLabel: null, source: "stream" });
  const ev3 = db.insertEvidence({ kind: "intent", text: "i need to get better at negotiating", context: null, spokenAt: day2, utteranceId: 3, conversationUuid: "c2", speakerLabel: null, source: "stream" });

  const skillId = db.insertSkill({ name: "Beekeeping basics", domain: null, competentLooksLike: "explains it", terms: ["honey"], priority: 50, brief: "You wondered about this." });
  db.insertFieldCandidate({ skillId, utteranceId: 1, text: "i wonder how honeybees actually make honey", context: null, spokenAt: day1 });
  const itemId = db.insertItem({ kind: "question", sourceText: "i wonder how honeybees actually make honey", utteranceId: 1, conversationUuid: "c1", spokenAt: day1 });
  const cardId = db.insertCard({ itemId, title: "How honeybees make honey", answerMd: "Enzymes and fanning.", citations: [] });
  db.setFsrsState(cardId, Date.now(), "{}");
  return { db, ev1, ev3, day1Key: "2026-09-17", day2Key: "2026-09-18" };
}

test("the summary and the day list describe what is held", () => {
  const { db, day1Key, day2Key } = seeded();
  const s = db.privacySummary();
  assert.equal(s.utterances, 3);
  assert.equal(s.moments, 2);
  assert.equal(s.skills, 1);
  assert.deepEqual(db.capturedDays(), [
    { day: day2Key, utterances: 1, moments: 1 },
    { day: day1Key, utterances: 2, moments: 1 },
  ]);
  assert.equal(db.recentMoments()[0].text, "i need to get better at negotiating", "newest first");
});

test("forgetting a moment removes the words and everything built on them, and nothing else", () => {
  const { db, ev1 } = seeded();
  assert.equal(db.forgetMoment(ev1), true);

  assert.deepEqual(db.recentMoments().map((e) => e.utteranceId), [3]);
  assert.equal(count(db, "field_evidence"), 0);
  assert.equal(count(db, "items"), 0);
  assert.equal(count(db, "cards"), 0);
  assert.equal(count(db, "fsrs_state"), 0);
  assert.equal(count(db, "utterances"), 2, "only the one line went; its neighbour in the conversation stays");
  assert.equal(db.forgetMoment(ev1), false, "already gone");
});

test("what was forgotten does not come back when the sweep sees it again", () => {
  const { db, ev1 } = seeded();
  db.forgetMoment(ev1);
  const back = db.insertUtterance({ id: 1, conversationUuid: "c1", text: "i wonder how honeybees actually make honey", spokenAt: new Date().toISOString(), source: "sweep", speaker: "speaker_1" });
  assert.equal(back, false);
  assert.equal(count(db, "utterances"), 2);
});

test("forgetting a day takes that day only", () => {
  const { db, day1Key, day2Key } = seeded();
  assert.equal(db.forgetDay(day1Key), 2);
  assert.deepEqual(db.capturedDays(), [{ day: day2Key, utterances: 1, moments: 1 }]);
  assert.equal(count(db, "cards"), 0);
  assert.equal(db.forgetDay("1999-01-01"), 0, "a day with nothing in it is a no-op");
});

test("erasing everything keeps the profile and the forgotten list, and nothing else", () => {
  const { db } = seeded();
  db.setProfile({ name: "Riley", style: "story", sessionMinutes: 10, learningWindows: "", goals: [], offLimits: ["my health"], timezone: "UTC", onboardedAt: 1 });
  db.eraseEverything();

  for (const t of ["utterances", "evidence", "journals", "skills", "lessons", "ladder_levels", "practice", "field_evidence", "items", "cards", "fsrs_state"]) {
    assert.equal(count(db, t), 0, `${t} should be empty`);
  }
  assert.deepEqual(db.getProfile()?.offLimits, ["my health"], "off-limits topics survive, so they keep being honoured");
  assert.equal(count(db, "forgotten_utterances"), 3);
  assert.equal(db.insertUtterance({ id: 3, conversationUuid: "c2", text: "i need to get better at negotiating", spokenAt: new Date().toISOString(), source: "sweep" }), false);
});
