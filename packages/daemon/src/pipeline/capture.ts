import { stage1Detect, textSimilarity, type BeeStreamEvent, type WaggleDb } from "@waggle/core";

// Voice notes echo into ambient capture as near-duplicate utterances ~20s later
// (docs/spike-results.md), so utterances are checked against recent journal texts.
const DEDUP_WINDOW_MS = 120_000;
const DEDUP_SIMILARITY = 0.6;

export interface CaptureDeps {
  db: WaggleDb;
  log: (msg: string) => void;
  /** Called when a voice note finishes transcribing (teach-back answers, missions). */
  onJournalReady: (journalId: string, text: string) => void;
}

function isJournalEcho(db: WaggleDb, text: string): boolean {
  const recent = db.recentJournalTexts(Date.now() - DEDUP_WINDOW_MS);
  return recent.some((j) => textSimilarity(j, text) >= DEDUP_SIMILARITY);
}

export function renderContext(window: Array<{ text: string; speaker: string | null }>): string {
  return window.map((u) => `${u.speaker ?? "someone"}: ${u.text}`).join("\n");
}

export function handleUtterance(
  deps: CaptureDeps,
  conversationUuid: string,
  u: { id: number; text: string; spoken_at: string; speaker?: string },
  source: "stream" | "sweep" = "stream"
): void {
  const { db, log } = deps;
  const fresh = db.insertUtterance({
    id: u.id,
    conversationUuid,
    text: u.text,
    spokenAt: u.spoken_at,
    source,
    speaker: u.speaker ?? null,
  });
  if (!fresh) return;

  if (isJournalEcho(db, u.text)) {
    db.markUtterancesProcessed([u.id]);
    return;
  }

  const det = stage1Detect(u.text);
  db.markUtterancesProcessed([u.id]);
  if (!det.matched) return;

  const context = renderContext(db.conversationWindow(conversationUuid, u.id));
  const id = db.insertEvidence({
    kind: det.kind,
    text: u.text,
    context,
    spokenAt: u.spoken_at,
    utteranceId: u.id,
    conversationUuid,
    speakerLabel: u.speaker ?? null,
    source,
  });
  log(`evidence #${id} [${det.kind}] (${det.cues.join(",")}): "${u.text}"`);
}

export function handleStreamEvent(deps: CaptureDeps, ev: BeeStreamEvent): void {
  const { db } = deps;
  switch (ev.type) {
    case "new-utterance":
      handleUtterance(deps, ev.conversation_uuid, ev.utterance);
      break;
    case "journal-created":
    case "journal-updated":
      db.upsertJournal({ id: ev.journal.id, text: ev.journal.text, state: ev.journal.state });
      if (ev.type === "journal-updated" && ev.journal.state === "READY" && ev.journal.text) {
        deps.onJournalReady(ev.journal.id, ev.journal.text);
      }
      break;
    case "journal-deleted":
      db.deleteJournal(ev.journalId);
      break;
    default:
      break;
  }
}
