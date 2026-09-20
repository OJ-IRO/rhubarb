import { randomBytes } from "node:crypto";
import {
  judge,
  lintProse,
  recordReview,
  systemBlocks,
  voiceGuide,
  write,
  type BeeClient,
  type Practice,
  type PracticeKind,
  type RhubarbDb,
} from "@rhubarb/core";
import { z } from "zod";

/** How long after its alarm a practice prompt still accepts a voice-note answer. */
const ANSWER_WINDOW_MS = 6 * 3600_000;

export interface PracticeDeps {
  db: RhubarbDb;
  bee: BeeClient;
  log: (msg: string) => void;
  /** Fires after grading so the lesson/skill layer can advance levels. */
  onGraded?: (p: Practice, grade: Grade) => void;
}

export interface Grade {
  score: number;
  feedback: string;
  missing: string[];
}

const GradeSchema = z.object({
  score: z.number().int().min(0).max(5).describe("0 = no real attempt, 3 = core idea right with gaps, 5 = could teach it"),
  feedback: z.string().describe("two to four sentences to the learner, in the house voice: what they got right, the one thing to fix"),
  missing: z.array(z.string()).describe("specific points from the rubric that were absent or wrong"),
});

function marker(): string {
  return `w${randomBytes(2).toString("hex")}`;
}

/** Create a practice prompt and deliver it as a Bee todo alarm. */
export async function schedulePractice(
  deps: PracticeDeps,
  p: { skillId: number | null; lessonId: number | null; cardId?: number | null; kind: PracticeKind; prompt: string; rubric: string | null; at: Date }
): Promise<number> {
  const { db, bee, log } = deps;
  const m = marker();
  const text = `${p.prompt} Hold the button and answer out loud. (${m})`;
  const todo = await bee.createTodo(text.slice(0, 1900), p.at.toISOString());
  const id = db.insertPractice({
    skillId: p.skillId,
    lessonId: p.lessonId,
    cardId: p.cardId ?? null,
    kind: p.kind,
    prompt: p.prompt,
    rubric: p.rubric,
    marker: m,
    scheduledFor: p.at.getTime(),
    beeTodoId: todo.id,
  });
  log(`practice #${id} (${p.kind}) scheduled for ${p.at.toISOString()} as todo ${todo.id}`);
  return id;
}

/** Find the practice prompt a fresh voice note is most likely answering. */
export function matchPractice(db: RhubarbDb, now = Date.now()): Practice | null {
  const open = db.openPractice().filter((p) => p.scheduledFor <= now + 60_000 && now - p.scheduledFor <= ANSWER_WINDOW_MS);
  return open[0] ?? null;
}

export async function gradeAnswer(deps: PracticeDeps, p: Practice, journalId: string, answer: string, opts: { notify?: boolean } = {}): Promise<Grade> {
  const { db, bee, log } = deps;
  const notify = opts.notify ?? true;
  db.attachPracticeAnswer(p.id, journalId, answer);

  const rubric = p.rubric ?? "A clear, correct explanation in the learner's own words.";
  let grade: Grade;
  try {
    grade = await judge({
      system: systemBlocks(voiceGuide(), "You grade a spoken teach-back. Be fair and specific. Feedback is addressed to the learner directly."),
      user: `Prompt they were given: "${p.prompt}"\n\nWhat a good answer contains:\n${rubric}\n\nWhat they said (voice transcript, may have recognition errors):\n"${answer}"`,
      schema: GradeSchema,
    });
  } catch (e) {
    // "answered" with no grade is a dead end: nothing re-opens it, and for a recall card it hides
    // the card for good. Put the practice back in play and ask for the answer again.
    db.setPracticeStatus(p.id, "delivered");
    if (notify) {
      await bee
        .createTodo("I lost your last answer before I could read it. Hold the button and say it once more when you have a minute.", new Date(Date.now() + 60_000).toISOString())
        .catch((err: Error) => log(`regrade nudge failed: ${err.message}`));
    }
    throw e;
  }

  const lint = lintProse(grade.feedback);
  if (!lint.ok) {
    const fixed = await write({
      quick: true,
      system: systemBlocks(voiceGuide(), "Rewrite this feedback so it follows the guide. Keep the substance."),
      messages: [{ role: "user", content: `Problems: ${lint.issues.map((i) => i.detail).join("; ")}\n\nFeedback:\n${grade.feedback}` }],
    });
    grade = { ...grade, feedback: fixed.trim() };
  }

  db.gradePractice(p.id, grade);
  if (p.kind === "recall" && p.cardId) recordReview(db, p.cardId, grade.score);
  if (p.beeTodoId) await bee.completeTodo(p.beeTodoId).catch(() => undefined);

  // Feedback reaches the phone the same way the prompt did: a short alarm a minute out.
  if (notify) {
    const line = `${grade.score}/5. ${grade.feedback}`.slice(0, 1900);
    await bee.createTodo(line, new Date(Date.now() + 60_000).toISOString()).catch((e: Error) => log(`feedback nudge failed: ${e.message}`));
  }

  log(`graded practice #${p.id}: ${grade.score}/5`);
  deps.onGraded?.(p, grade);
  return grade;
}

/** Entry point from the capture layer when a voice note finishes transcribing. */
export async function handleJournalReady(deps: PracticeDeps, journalId: string, text: string): Promise<void> {
  // Bee can report the same voice note READY more than once (an edit in the app, a reconnect).
  // It answers one practice, once.
  if (deps.db.practiceHasJournal(journalId)) return;
  const p = matchPractice(deps.db);
  if (!p) return;
  await gradeAnswer(deps, p, journalId, text);
}

/** Mark alarms that have fired as delivered; expire ones nobody answered. */
export function sweepPractice(db: RhubarbDb, now = Date.now()): void {
  for (const p of db.openPractice()) {
    if (p.status === "scheduled" && p.scheduledFor <= now) db.setPracticeStatus(p.id, "delivered");
    if (now - p.scheduledFor > ANSWER_WINDOW_MS) db.setPracticeStatus(p.id, "expired");
  }
}
