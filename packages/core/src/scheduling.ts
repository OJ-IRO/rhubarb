import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard } from "ts-fsrs";
import type { RhubarbDb } from "./db.js";

const f = fsrs(generatorParameters({ enable_fuzz: true }));

/** Initialize FSRS state for a newly researched card; first review lands a few hours out. */
export function initCardSchedule(db: RhubarbDb, cardId: number, now = new Date()): void {
  const card = createEmptyCard(now);
  const due = new Date(now.getTime() + 4 * 3600_000);
  db.setFsrsState(cardId, due.getTime(), JSON.stringify(card));
}

/** Map a 0-5 grading score to an FSRS rating and advance the schedule. Returns the next due time. */
export function recordReview(db: RhubarbDb, cardId: number, score: number, now = new Date()): Date {
  const state = db.getFsrsState(cardId);
  const prev: FsrsCard = state ? reviveFsrsCard(JSON.parse(state.fsrsCard)) : createEmptyCard(now);
  const rating = score >= 5 ? Rating.Easy : score >= 3 ? Rating.Good : score >= 2 ? Rating.Hard : Rating.Again;
  const next = f.repeat(prev, now)[rating].card;
  db.setFsrsState(cardId, next.due.getTime(), JSON.stringify(next));
  return next.due;
}

function reviveFsrsCard(raw: Record<string, unknown>): FsrsCard {
  return {
    ...raw,
    due: new Date(raw.due as string),
    last_review: raw.last_review ? new Date(raw.last_review as string) : undefined,
  } as FsrsCard;
}
