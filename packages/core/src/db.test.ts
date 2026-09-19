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
