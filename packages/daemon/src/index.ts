import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  BeeClient,
  BeeStreamConsumer,
  stage1Detect,
  textSimilarity,
  WaggleDb,
  type BeeStreamEvent,
} from "@waggle/core";

const DATA_DIR = process.env.WAGGLE_DATA_DIR ?? join(homedir(), ".waggle");
mkdirSync(DATA_DIR, { recursive: true });

const db = new WaggleDb(join(DATA_DIR, "waggle.db"));
const bee = new BeeClient();

// Voice notes echo into ambient capture as near-duplicate utterances ~20s later
// (docs/spike-results.md), so utterances are checked against recent journal texts.
const DEDUP_WINDOW_MS = 120_000;
const DEDUP_SIMILARITY = 0.6;

function isJournalEcho(text: string): boolean {
  const recent = db.recentJournalTexts(Date.now() - DEDUP_WINDOW_MS);
  return recent.some((j) => textSimilarity(j, text) >= DEDUP_SIMILARITY);
}

function handleUtterance(conversationUuid: string, u: { id: number; text: string; spoken_at: string }): void {
  const fresh = db.insertUtterance({
    id: u.id,
    conversationUuid,
    text: u.text,
    spokenAt: u.spoken_at,
    source: "stream",
  });
  if (!fresh) return; // duplicate delivery
  if (isJournalEcho(u.text)) {
    log(`skip (journal echo): "${u.text.slice(0, 60)}"`);
    db.markUtterancesProcessed([u.id]);
    return;
  }
  const det = stage1Detect(u.text);
  db.markUtterancesProcessed([u.id]);
  if (!det.matched) return;
  const itemId = db.insertItem({
    kind: det.kind,
    sourceText: u.text,
    utteranceId: u.id,
    conversationUuid,
    spokenAt: u.spoken_at,
  });
  log(`DETECTED [${det.kind}] item #${itemId} (${det.cues.join(",")}): "${u.text}"`);
  // TODO(stage-2): Bedrock classification -> confirm/dismiss, extract topic
  // TODO(research): Bedrock research agent -> card + citations, then initCardSchedule()
}

function handleJournal(ev: Extract<BeeStreamEvent, { type: "journal-created" | "journal-updated" }>): void {
  db.upsertJournal({ id: ev.journal.id, text: ev.journal.text, state: ev.journal.state });
  if (ev.journal.state === "READY" && ev.journal.text) {
    // TODO(teach-back): match against open quizzes awaiting an answer and grade via Bedrock
    log(`journal READY: "${ev.journal.text.slice(0, 80)}"`);
  }
}

function onEvent(ev: BeeStreamEvent): void {
  switch (ev.type) {
    case "new-utterance":
      handleUtterance(ev.conversation_uuid, ev.utterance);
      break;
    case "journal-created":
    case "journal-updated":
      handleJournal(ev);
      break;
    case "journal-deleted":
      db.deleteJournal(ev.journalId); // silence/failed notes
      break;
    default:
      break;
  }
}

function log(msg: string): void {
  console.log(`[waggle ${new Date().toISOString()}] ${msg}`);
}

const consumer = new BeeStreamConsumer({ onEvent, onStatus: (m) => log(m) });

const me = await bee.me().catch((e: Error) => {
  log(`Bee proxy unreachable (${e.message}). Start it with: bee proxy --port 8787 --idle-timeout 0`);
  process.exit(1);
});
log(`connected as ${me.first_name} ${me.last_name}; data dir ${DATA_DIR}`);
consumer.start();

process.on("SIGINT", () => {
  consumer.stop();
  db.close();
  process.exit(0);
});
