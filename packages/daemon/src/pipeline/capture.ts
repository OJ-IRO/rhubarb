import { directAsk, goalLanguages, isBareAddress, sensitiveReason, stage1Detect, textContainment, type BeeStreamEvent, type Evidence, type RhubarbDb } from "@rhubarb/core";

// Voice notes echo into ambient capture as near-duplicate utterances ~20s later
// (docs/spike-results.md), so utterances are checked against recent journal texts.
const DEDUP_WINDOW_MS = 120_000;
const DEDUP_SIMILARITY = 0.6;

export interface CaptureDeps {
  db: RhubarbDb;
  log: (msg: string) => void;
  /** Called when a voice note finishes transcribing (teach-back answers, missions). */
  onJournalReady: (journalId: string, text: string) => void;
  /** Called when the wearer asked Bee for something out loud ("hey Bee, teach me ..."). */
  onAsk?: (e: Evidence, ask: string) => void;
}

// "Hey Bee." then a pause then the ask: the two lines arrive as separate utterances.
const BARE_ADDRESS_WINDOW_MS = 20_000;

function spokenMs(iso: string): number {
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

/** The ask in this line, or in this line following a bare "Hey Bee." a moment before. */
export function askIn(db: RhubarbDb, conversationUuid: string, u: { id: number; text: string; spoken_at: string }): string | null {
  const own = directAsk(u.text);
  if (own) return own;
  const prev = db.previousUtterance(conversationUuid, u.id);
  if (prev && isBareAddress(prev.text) && Math.abs(spokenMs(u.spoken_at) - spokenMs(prev.spoken_at)) <= BARE_ADDRESS_WINDOW_MS) {
    const words = u.text.trim().replace(/[.?!]+$/, "");
    return words.split(/\s+/).length >= 2 ? words : null;
  }
  return null;
}

/** Record a direct ask as a moment and hand it on. Returns the evidence id, or null if it was already one. */
export function recordAsk(deps: CaptureDeps, conversationUuid: string, u: { id: number; text: string; spoken_at: string; speaker?: string | null }, ask: string, source: "stream" | "sweep"): number | null {
  const { db, log } = deps;
  if (db.hasEvidenceForUtterance(u.id)) return null;
  const context = renderContext(db.conversationWindow(conversationUuid, u.id));
  const id = db.insertEvidence({
    kind: "intent",
    text: u.text,
    context,
    spokenAt: u.spoken_at,
    utteranceId: u.id,
    conversationUuid,
    speakerLabel: u.speaker ?? null,
    place: db.conversationPlace(conversationUuid),
    source,
  });
  // Asks skip the classifier: the wearer already said what they want. The ask handler decides
  // whether it is a lesson, a quick answer, or something meant for Bee's own assistant.
  db.classifyEvidence(id, { kind: "intent", route: "skill", topic: ask.slice(0, 120), confidence: 1 });
  log(`asked #${id}: "${ask}"`);
  const e = db.evidenceById(id);
  if (e) deps.onAsk?.(e, ask);
  return id;
}

function isJournalEcho(db: RhubarbDb, text: string): boolean {
  const recent = db.recentJournalTexts(Date.now() - DEDUP_WINDOW_MS);
  return recent.some((j) => textContainment(j, text) >= DEDUP_SIMILARITY);
}

export function renderContext(window: Array<{ text: string; speaker: string | null }>): string {
  return window.map((u) => `${u.speaker ?? "someone"}: ${u.text}`).join("\n");
}

export function handleUtterance(
  deps: CaptureDeps,
  conversationUuid: string,
  u: { id: number; text: string; spoken_at: string; speaker?: string | null },
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
    // Flagged as well as skipped: otherwise the field-evidence scan finds the learner's own
    // practice answer in the ambient feed and credits it as real-world use.
    db.markUtteranceEcho(u.id);
    db.markUtterancesProcessed([u.id]);
    return;
  }

  // Private disclosures stop here. No evidence is written and no model ever sees the line.
  // The log records the reason and never the words.
  const sensitive = sensitiveReason(u.text);
  if (sensitive) {
    db.markUtterancePrivate(u.id); // blanks the stored words and keeps it out of every context window
    db.markUtterancesProcessed([u.id]);
    log(`left alone: a ${sensitive} line`);
    return;
  }

  db.markUtterancesProcessed([u.id]);
  const ask = askIn(db, conversationUuid, u);
  if (ask) {
    recordAsk(deps, conversationUuid, u, ask, source);
    return;
  }

  const det = stage1Detect(u.text, { languages: goalLanguages(db.getProfile()?.goals ?? []) });
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
    place: db.conversationPlace(conversationUuid),
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
