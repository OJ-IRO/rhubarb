import { classify, localDayOf, MODELS, readingNote, systemBlocks, unavailableReason, voiceGuide, type DayReview, type RhubarbDb } from "@rhubarb/core";
import { z } from "zod";

/**
 * The end-of-day check. Speech recognition mishears, can't tell who spoke, and a first reading of a
 * day is a guess. So before anything is proposed, Rhubarb says what it thinks happened, as claims
 * the reader marks right or wrong, and asks the few questions whose answers would change what
 * they should learn. Proposals and the morning letter are made from what the reader confirmed.
 */
const ReviewOut = z.object({
  findings: z
    .array(
      z.object({
        claim: z
          .string()
          .describe("what you think happened, one plain sentence to the reader, phrased so they can answer right or wrong. Not a conclusion about them: what happened."),
        momentIds: z.array(z.number()).describe("ids of the moments this rests on"),
        unsure: z.string().nullable().describe("the one thing you're unsure of, if any: who was speaking, whether a word was misheard, what was meant"),
      })
    )
    .max(7),
  questions: z
    .array(z.object({ text: z.string().describe("one short question whose answer would change what they should learn") }))
    .max(3),
});

const ROLE = `You review one day that a wearable microphone heard, before a tutor called Rhubarb proposes anything from it. The transcript mishears words, and it can't tell the wearer from the people around them. A first reading of a day is a guess.

Write findings: the handful of things that happened today that might be worth learning from, each as a claim the reader can mark right or wrong. Say what happened, not what it means about them ("At the tax-free counter, the clerk asked for your passport and the conversation stalled", not "You struggle with formal Japanese"). If you're unsure who spoke, or a line looks misheard, say so in "unsure". Skip small talk and anything that clearly isn't theirs. Fewer, sharper findings beat many.

Then ask at most three questions whose answers would change what Rhubarb should propose: whether they want to get better at something, what they were trying to do, what a garbled line was. Never ask what the moments already answer.

Never state anything as fact that the reader hasn't confirmed. Never use their name. Never invent people.`;

export interface ReviewDeps {
  db: RhubarbDb;
  log: (m: string) => void;
}

/** Write the review for a day. Days with too little in them get none. */
export async function buildReview(deps: ReviewDeps, day: string): Promise<DayReview | null> {
  const { db, log } = deps;
  const detail = db.dayDetail(day);
  const moments = detail.moments.filter((m) => m.source !== "calendar");
  if (moments.length < 2) {
    log(`review: ${day} has too little to review`);
    return null;
  }
  db.saveReview({ day, status: "building", findings: [], questions: [] });
  try {
    const plans = db.skillsByStatus(["proposed", "active"]);
    const reading = readingNote(plans, db.getProfile()?.goals ?? []);
    const out = await classify({
      model: MODELS.writer,
      effort: "medium",
      maxTokens: 6000,
      system: systemBlocks(voiceGuide(), `${ROLE}${reading ? `\n\n${reading}` : ""}`),
      user: `Day: ${day}${detail.places.length ? `\nWhere they were: ${detail.places.join(", ")}` : ""}\n\nWhat they are already working on: ${
        plans.map((p) => p.name).join("; ") || "(nothing yet)"
      }\n\nThe moments Rhubarb noticed, with the lines around them:\n${moments
        .slice(0, 60)
        .map((m) => `### moment ${m.id} (${m.spokenAt}${m.place ? `, ${m.place}` : ""}${m.editedAt ? ", corrected by the reader" : ""})\nline: "${m.text}"\naround it:\n${m.context ?? "(none)"}`)
        .join("\n\n")}`,
      schema: ReviewOut,
    });
    const ids = new Set(moments.map((m) => m.id));
    db.saveReview({
      day,
      status: "open",
      findings: out.findings.map((f, i) => ({ id: i + 1, claim: f.claim.trim(), momentIds: f.momentIds.filter((id) => ids.has(id)), unsure: f.unsure?.trim() || null, verdict: null, correction: null })),
      questions: out.questions.map((q, i) => ({ id: i + 1, text: q.text.trim(), answer: null })),
    });
    log(`review: ${day} ready, ${out.findings.length} findings and ${out.questions.length} questions`);
    return db.getReview(day);
  } catch (e) {
    db.saveReview({ day, status: "failed", reason: unavailableReason(e) ?? "something went wrong while writing it" });
    throw e;
  }
}

/**
 * The reader went through it. Wrong findings stop counting toward any plan, and a proposal left
 * with nothing true under it is set aside. What they confirmed, corrected and answered is kept
 * as the most trusted thing Rhubarb knows, and feeds proposals and the letter from here on.
 */
export function finishReview(db: RhubarbDb, review: DayReview): { dropped: number; setAside: string[] } {
  let dropped = 0;
  const touched = new Set<number>();
  for (const f of review.findings) {
    if (f.verdict !== "wrong") continue;
    for (const id of f.momentIds) {
      const e = db.evidenceById(id);
      if (e?.skillId && e.skillId > 0) touched.add(e.skillId);
    }
    db.dropMoments(f.momentIds);
    dropped += f.momentIds.length;
  }
  const setAside: string[] = [];
  for (const id of touched) {
    const s = db.getSkill(id);
    if (s?.status === "proposed" && db.evidenceForSkill(id).length === 0) {
      db.updateSkill(id, { status: "dismissed" });
      setAside.push(s.name);
    }
  }
  db.saveReview({ day: review.day, status: "done", findings: review.findings, questions: review.questions, doneAt: Date.now() });
  return { dropped, setAside };
}

/** The day to review: today in the evening, otherwise yesterday if it was never reviewed. */
export function dayToReview(now = new Date()): string {
  return localDayOf(now.getTime());
}
