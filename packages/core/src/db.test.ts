import assert from "node:assert/strict";
import { test } from "node:test";
import { RhubarbDb } from "./db.js";

function utterance(id: number, text: string, speaker?: string) {
  return { id, conversationUuid: "conv-1", text, spokenAt: "2026-09-20T14:00:00Z", source: "stream" as const, speaker };
}

test("a sweep's speaker label is kept for an utterance the live stream already stored", () => {
  const db = new RhubarbDb(":memory:");

  // Live: Bee's stream sends no speaker.
  assert.equal(db.insertUtterance(utterance(1, "so a rolling deployment swaps pods a few at a time")), true);
  assert.equal(db.insertUtterance(utterance(2, "i need to get better at explaining that")), true);
  const evidenceId = db.insertEvidence({ kind: "intent", text: "i need to get better at explaining that", context: null, spokenAt: "2026-09-20T14:00:05Z", utteranceId: 2, conversationUuid: "conv-1", speakerLabel: null, source: "stream" });

  // Nightly: the same utterances come back from the full conversation, labelled.
  assert.equal(db.insertUtterance({ ...utterance(1, "so a rolling deployment swaps pods a few at a time", "speaker_2"), source: "sweep" }), false, "still reported as a duplicate, so it is not re-detected");
  assert.equal(db.insertUtterance({ ...utterance(2, "i need to get better at explaining that", "speaker_1"), source: "sweep" }), false);

  const window = db.windowAroundUtterance(2);
  assert.deepEqual(window?.map((u) => u.speaker), ["speaker_2", "speaker_1"]);

  const evidence = db.evidenceByStage("detected", 10).find((e) => e.id === evidenceId);
  assert.equal(evidence?.speakerLabel, "speaker_1", "evidence drawn from the utterance gets the label too");
});

test("a label that is already known is never overwritten", () => {
  const db = new RhubarbDb(":memory:");
  db.insertUtterance({ ...utterance(1, "what does liquidation preference mean", "speaker_1"), source: "sweep" });
  db.insertUtterance({ ...utterance(1, "what does liquidation preference mean", "speaker_9"), source: "sweep" });
  assert.equal(db.windowAroundUtterance(1)?.[0].speaker, "speaker_1");
});

test("windowAroundUtterance returns null for an utterance we never stored", () => {
  const db = new RhubarbDb(":memory:");
  assert.equal(db.windowAroundUtterance(404), null);
});

test("echoes of the wearer's own voice notes are left out of recent speech", () => {
  const db = new RhubarbDb(":memory:");
  db.insertUtterance(utterance(1, "a rolling deployment swaps pods a few at a time"));
  db.insertUtterance(utterance(2, "so yeah the rollout stalled for four minutes"));
  db.markUtteranceEcho(1);
  assert.deepEqual(db.recentUtterances(0).map((u) => u.id), [2]);
});

test("a voice note is only ever the answer to one practice", () => {
  const db = new RhubarbDb(":memory:");
  const id = db.insertPractice({ skillId: null, lessonId: null, cardId: null, kind: "teachback", prompt: "Explain a rolling deployment.", rubric: null, marker: "w1", scheduledFor: Date.now(), beeTodoId: null });
  assert.equal(db.practiceHasJournal("journal-1"), false);
  db.attachPracticeAnswer(id, "journal-1", "it swaps pods a few at a time");
  assert.equal(db.practiceHasJournal("journal-1"), true);
  assert.equal(db.practiceHasJournal("journal-2"), false);
});

test("a private line is blanked where it is stored and never appears as context for its neighbours", () => {
  const db = new RhubarbDb(":memory:");
  db.insertUtterance(utterance(1, "so how does a rolling deployment work"));
  db.insertUtterance(utterance(2, "my doctor put me on medication last month"));
  db.insertUtterance(utterance(3, "i need to get better at explaining that"));
  db.markUtterancePrivate(2);

  assert.deepEqual(db.windowAroundUtterance(3)?.map((u) => u.id), [1, 3]);
  assert.deepEqual(db.recentUtterances(0).map((u) => u.id), [1, 3]);
  const stored = db.db.prepare("SELECT text FROM utterances WHERE id = 2").get() as { text: string };
  assert.equal(stored.text, "", "the words themselves are not kept");
  assert.equal(db.insertUtterance(utterance(2, "my doctor put me on medication last month")), false, "and the sweep does not bring them back");
});

test("learning progress is numbers only, and counts what happened", () => {
  const db = new RhubarbDb(":memory:");
  const skillId = db.insertSkill({ name: "Rolling deployments", domain: null, competentLooksLike: "narrates a rollout", terms: ["rollout"], priority: 90, brief: "It came up three times." });
  const day = (n: number) => new Date(2026, 8, n, 10).toISOString();

  db.insertUtterance({ ...utterance(1, "what does halfway through the pods mean"), spokenAt: day(1) });
  const ev = db.insertEvidence({ kind: "struggle", text: "what does halfway through the pods mean", context: null, spokenAt: day(1), utteranceId: 1, conversationUuid: "conv-1", speakerLabel: null, source: "stream" });
  db.assignEvidenceToSkill([ev], skillId);

  for (const [kind, grade] of [["teachback", { score: 2 }], ["teachback", { score: 4 }], ["quiz", { score: 4, total: 5 }], ["recall", { score: 4 }], ["recall", { score: 1 }]] as const) {
    const id = db.insertPractice({ skillId, lessonId: null, cardId: null, kind, prompt: "p", rubric: null, marker: "m", scheduledFor: Date.now(), beeTodoId: null });
    db.gradePractice(id, grade);
  }

  db.insertUtterance({ ...utterance(9, "the new pods just haven't passed readiness yet"), spokenAt: day(8) });
  db.insertFieldCandidate({ skillId, utteranceId: 9, text: "the new pods just haven't passed readiness yet", context: null, spokenAt: day(8) });
  const fe = db.unjudgedFieldEvidence()[0];
  db.setFieldVerdict(fe.id, { used: true, correct: true, level: 1, note: "" }, true);

  const itemId = db.insertItem({ kind: "question", sourceText: "i wonder how bees make honey", utteranceId: null, conversationUuid: null, spokenAt: day(2) });
  const cardId = db.insertCard({ itemId, title: "How bees make honey", answerMd: "Enzymes and fanning.", citations: [] });
  db.setCardGuess(cardId, "they chew it?", { close: false, note: "Not quite." });
  assert.equal(db.getCard(cardId)?.guessClose, false);
  assert.equal(db.cardsWithItems()[0].card.guess, "they chew it?");

  const p = db.learningProgress();
  assert.deepEqual(p.teachbacks.map((t) => t.score), [2, 4], "oldest first, so a rise reads left to right");
  assert.deepEqual(p.quizzes.map((q) => q.score), [0.8]);
  assert.deepEqual(p.recall, { asked: 2, remembered: 1 });
  assert.deepEqual(p.guesses, { made: 1, close: 0, skipped: 0 });
  assert.equal(p.field.credited, 1);
  assert.deepEqual(p.transfer, [{ skillId, days: 7 }], "a week from first not following it to using it for real");
  assert.equal(JSON.stringify(p).includes("pods"), false, "no speech leaks into the numbers");
});

test("history lists what happened, newest first, in plain words", () => {
  const db = new RhubarbDb(":memory:");
  const skillId = db.insertSkill({ name: "Salary negotiation", domain: null, competentLooksLike: "names a number first", terms: ["salary"], priority: 80, brief: "b" });
  const day = (n: number) => new Date(2026, 8, n, 12).getTime();

  const p = db.insertPractice({ skillId, lessonId: null, cardId: null, kind: "teachback", prompt: "Explain anchoring.", rubric: null, marker: "m", scheduledFor: day(3), beeTodoId: null });
  db.gradePractice(p, { score: 4, feedback: "You named the number first." });
  db.db.prepare("UPDATE practice SET created_at = ? WHERE id = ?").run(day(3), p);

  db.insertUtterance({ id: 1, conversationUuid: "c", text: "i'd want to start from ninety", spokenAt: new Date(day(5)).toISOString(), source: "stream" });
  db.insertFieldCandidate({ skillId, utteranceId: 1, text: "i'd want to start from ninety", context: null, spokenAt: new Date(day(5)).toISOString() });
  db.setFieldVerdict(db.unjudgedFieldEvidence()[0].id, { used: true, correct: true, level: 2, note: "You anchored first." }, true);

  const h = db.history();
  assert.deepEqual(h.map((e) => e.kind), ["credit", "answer"]);
  assert.equal(h[0].title, "Used it for real: Salary negotiation");
  assert.equal(h[1].detail, "4 of 5. You named the number first.");
  assert.equal(h[1].score, 4);
});
