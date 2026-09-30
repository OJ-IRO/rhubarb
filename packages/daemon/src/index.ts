import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { llmRoute, setSpendHooks, withPurpose, classify, BeeClient, BeeStreamConsumer, RhubarbDb, judge, lintProse, systemBlocks, voiceGuide, write, type Evidence, type Practice, ALL_NUDGES, type NudgePrefs } from "@rhubarb/core";
import { z } from "zod";
import { startApi, type Listening } from "./api.js";
import { handleAsk, topicFromSpark } from "./pipeline/asks.js";
import { askIn, handleStreamEvent, recordAsk } from "./pipeline/capture.js";
import { runClassifyBatch } from "./pipeline/classify.js";
import { findFieldCandidates, judgeFieldEvidence } from "./pipeline/field.js";
import { generateLessonOnce, resumeMissingLessons, rewriteLesson, startSkill } from "./pipeline/lessons.js";
import { writeTodayLetter } from "./pipeline/letter.js";
import { gradeAnswer, handleJournalReady, schedulePractice, sweepPractice, type Grade } from "./pipeline/practice.js";
import { bestFieldRung, maybeAdvance, onFieldCredited, onTeachbackGraded } from "./pipeline/progress.js";
import { runReflection } from "./pipeline/reflect.js";
import { afterQuietHours, nextLearningSlot, parseLearningWindows, saveLearningSlots } from "./pipeline/schedule.js";
import { buildSpark } from "./pipeline/sparks.js";
import { ingestStakes, runSweep } from "./pipeline/sweep.js";
import { tutorReply } from "./pipeline/tutor.js";

const DATA_DIR = process.env.RHUBARB_DATA_DIR ?? join(homedir(), ".rhubarb");
mkdirSync(DATA_DIR, { recursive: true });

const CLASSIFY_INTERVAL_MS = 2 * 60_000;
const PRACTICE_SWEEP_MS = 60_000;
const NIGHTLY_CHECK_MS = 10 * 60_000;
const FIELD_INTERVAL_MS = 15 * 60_000;
const REFLECT_HOUR_LOCAL = 3;
// Proposals are made during the day too, a few hours after the conversations that prompted them,
// so a yes or no can happen while the moment is still fresh.
const DAY_REFLECT_EVERY_MS = 3 * 3600_000;
const DAY_REFLECT_FROM_HOUR = 9;
const DAY_REFLECT_UNTIL_HOUR = 21;
// One proposal alarm at most this often. A buzzing wrist is how people come to hate a device.
const PROPOSAL_NUDGE_GAP_MS = 3 * 3600_000;
const API_PORT = Number(process.env.PORT ?? process.env.RHUBARB_PORT ?? 4242);
// A private server: the dashboard is opened with a token instead of being local-only.
const HOSTED = process.env.RHUBARB_ACCESS_TOKEN
  ? { accessToken: process.env.RHUBARB_ACCESS_TOKEN, where: process.env.RHUBARB_WHERE ?? "your private server" }
  : undefined;
// packages/daemon/dist/index.js -> packages/dashboard/dist
const DASHBOARD_DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard", "dist");

const db = new RhubarbDb(join(DATA_DIR, "rhubarb.db"));

// Every Claude call is recorded with its cost, and a daily budget pauses the expensive work.
// Set it in Settings; RHUBARB_DAILY_BUDGET_USD is the starting value. 0 means no cap.
const DEFAULT_BUDGET = Number(process.env.RHUBARB_DAILY_BUDGET_USD ?? 3);
setSpendHooks({
  record: (u) => db.recordUsage(u),
  spentToday: () => db.spentOn(new Date().toLocaleDateString("en-CA")),
  budgetUsd: () => Number(db.getKv("daily_budget_usd") ?? DEFAULT_BUDGET),
});
const bee = new BeeClient();

/** The wearer chooses which alarms reach their phone. Anything unset is on. */
function nudgeOn(db: RhubarbDb, kind: keyof NudgePrefs): boolean {
  return (db.getProfile()?.nudges ?? ALL_NUDGES)[kind] !== false;
}

function log(msg: string): void {
  console.log(`[rhubarb ${new Date().toISOString()}] ${msg}`);
}

const lessonDeps = { db, bee, log };

/** After a level is passed, write the next lesson in the background. */
function advanceAndContinue(skillId: number, nextLevel: number | null): void {
  if (nextLevel === null) return;
  const skill = db.getSkill(skillId);
  if (!skill || skill.status !== "active") return;
  log(`skill #${skillId} ${skill.name} advanced to level ${nextLevel + 1}`);
  void withPurpose("lessons", () => generateLessonOnce(lessonDeps, skill, nextLevel)).catch((e: Error) => log(`next lesson failed: ${e.message}`));
}

const practiceDeps = {
  db,
  bee,
  log,
  onGraded: (p: Practice, grade: Grade) => {
    if (p.skillId) advanceAndContinue(p.skillId, onTeachbackGraded(db, p, grade));
  },
};

const fieldDeps = {
  db,
  bee,
  log,
  onCredited: (skillId: number, level: number) => advanceAndContinue(skillId, onFieldCredited(db, skillId, level)),
};

// Building a lesson takes minutes. Asks and sparks only start it; the lesson nudge says when it's ready.
const startInBackground = async (skillId: number) => {
  void withPurpose("lessons", () => startSkill(lessonDeps, skillId)).catch((e: Error) => log(`startSkill ${skillId} failed: ${e.message}`));
};

// --- asks: "hey Bee, ..." handled one at a time, straight away
const askQueue: Array<{ e: Evidence; ask: string }> = [];
let asking = false;
async function drainAsks(): Promise<void> {
  if (asking) return;
  asking = true;
  try {
    while (askQueue.length > 0) {
      const next = askQueue.shift()!;
      await withPurpose("asks", () => handleAsk({ db, log, start: startInBackground, spark: (e, topic) => classifyDeps.onSpark(e, topic) }, next.e, next.ask)).catch((err: Error) =>
        log(`ask #${next.e.id} failed: ${err.message}`)
      );
    }
  } finally {
    asking = false;
  }
}

const captureDeps = {
  db,
  log,
  onJournalReady: (journalId: string, text: string) => {
    withPurpose("practice and grading", () => handleJournalReady(practiceDeps, journalId, text)).catch((e: Error) => log(`grading failed: ${e.message}`));
  },
  onAsk: (e: Evidence, ask: string) => {
    askQueue.push({ e, ask });
    void drainAsks();
  },
};

// --- sparks: serialized so research calls don't pile up
const sparkQueue: Array<{ e: Evidence; topic: string }> = [];
let sparking = false;
async function drainSparks(): Promise<void> {
  if (sparking) return;
  sparking = true;
  try {
    while (sparkQueue.length > 0) {
      const next = sparkQueue.shift()!;
      await withPurpose("spark answers", () => buildSpark({ db, log }, next.e, next.topic)).catch((err: Error) => log(`spark failed: ${err.message}`));
    }
  } finally {
    sparking = false;
  }
}

const classifyDeps = {
  db,
  log,
  onSpark: (e: Evidence, topic: string) => {
    sparkQueue.push({ e, topic });
    void drainSparks();
  },
};

// --- guarded periodic jobs
// A caller that arrives while the job is running waits for that run rather than returning at
// once. "Reflect now" relies on this: it awaits classification, and must not reflect on evidence
// that the timer's batch is still halfway through classifying.
function guarded(name: string, job: () => Promise<unknown>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    inFlight ??= (async () => {
      try {
        await job();
      } catch (e) {
        log(`${name} failed: ${(e as Error).message}`);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

const classifyTick = guarded("classify", () => withPurpose("sorting moments", async () => {
  const n = await runClassifyBatch(classifyDeps);
  if (n > 0) log(`classified ${n} evidence`);
  findFieldCandidates(db, Date.now() - 3 * CLASSIFY_INTERVAL_MS, log);
}));

const fieldTick = guarded("field", () => withPurpose("real-world checks", () => judgeFieldEvidence(fieldDeps)));
const lessonsTick = guarded("lessons", () => withPurpose("lessons", () => resumeMissingLessons(lessonDeps)));

const reflectNow = guarded("reflect", () => withPurpose("proposals and letter", async () => {
  // Calendar stakes are a nice-to-have. Their failure must not stop the reflection itself.
  await ingestStakes({ db, bee, log }).catch((e: Error) => log(`stakes skipped: ${e.message}`));
  await classifyTick();
  const { created } = await runReflection({ db, log });
  db.setKv("last_reflect_at", String(Date.now()));
  await nudgeProposals(created);
  await writeTodayLetter(db, log);
}));

/** One alarm for new proposals: what it is, and that it wants a yes or no. */
async function nudgeProposals(created: number[]): Promise<void> {
  const fresh = created.map((id) => db.getSkill(id)).filter((s): s is NonNullable<typeof s> => Boolean(s && s.status === "proposed"));
  if (fresh.length === 0 || !nudgeOn(db, "brief")) return;
  const last = Number(db.getKv("last_proposal_nudge_at") ?? 0);
  if (Date.now() - last < PROPOSAL_NUDGE_GAP_MS) {
    log(`proposal nudge held back (${fresh.length} new); the board still has them`);
    return;
  }
  const top = fresh.sort((a, b) => b.priority - a.priority)[0];
  const what = top.kind === "topic" ? "a lesson idea" : "a skill idea";
  const more = fresh.length > 1 ? ` Plus ${fresh.length - 1} more.` : "";
  const line = `Rhubarb has ${what} from your day: ${top.name}. Yes or no on your board.${more}`;
  await bee
    .createTodo(line, afterQuietHours(new Date(Date.now() + 2 * 60_000)).toISOString())
    .then(() => db.setKv("last_proposal_nudge_at", String(Date.now())))
    .catch((e: Error) => log(`proposal nudge failed: ${e.message}`));
}

/** Daytime pass: only when there is something new, only in waking hours, at most every few hours. */
const dayReflectTick = guarded("day-reflect", async () => {
  const h = new Date().getHours();
  if (h < DAY_REFLECT_FROM_HOUR || h >= DAY_REFLECT_UNTIL_HOUR) return;
  if (Date.now() - Number(db.getKv("last_reflect_at") ?? 0) < DAY_REFLECT_EVERY_MS) return;
  await classifyTick();
  if (db.unassignedSkillEvidence().length === 0) return;
  log("day-reflect: new moments since the last pass; proposing");
  await reflectNow();
});

// --- in-page lesson interactions
const QuickFeedback = z.object({ feedback: z.string().describe("two or three sentences to the learner: what they got, what they missed, in the house voice") });

async function answerBeat(lesson: import("@rhubarb/core").Lesson, beat: import("@rhubarb/core").LessonBeat, idx: number, text: string) {
  if (beat.kind === "teachback") {
    const practiceId = db.insertPractice({
      skillId: lesson.skillId,
      lessonId: lesson.id,
      kind: "teachback",
      prompt: beat.prompt,
      rubric: beat.rubric,
      marker: "web",
      scheduledFor: Date.now(),
      beeTodoId: null,
    });
    const p = db.getPractice(practiceId)!;
    const grade = await gradeAnswer(practiceDeps, p, `web-${lesson.id}-${idx}`, text, { notify: false });
    return { feedback: grade.feedback, score: grade.score };
  }
  const out = await judge({
    system: systemBlocks(voiceGuide(), "You respond to a learner's answer to a check-in or scenario inside a lesson. Be direct and specific; no grades, no praise inflation."),
    user: `Prompt: "${beat.prompt}"\n\nWhat a good answer contains:\n${beat.rubric}\n\nTheir answer:\n"${text}"`,
    schema: QuickFeedback,
    effort: "low",
  });
  let feedback = out.feedback;
  if (!lintProse(feedback).ok) {
    feedback = (
      await write({ quick: true, system: systemBlocks(voiceGuide(), "Rewrite so it follows the guide."), messages: [{ role: "user", content: feedback }] })
    ).trim();
  }
  return { feedback };
}

/** Best demonstrated score for a lesson: teach-backs as graded, quizzes mapped from their ratio. */
function bestScoreFor(lessonId: number, skillId: number): number {
  return db
    .practiceForSkill(skillId)
    .filter((p) => p.lessonId === lessonId && p.grade)
    .map((p) => {
      const g = JSON.parse(p.grade!) as { score: number; total?: number };
      if (p.kind === "quiz" && g.total) {
        const ratio = g.score / g.total;
        return ratio >= 0.8 ? 4 : ratio >= 0.6 ? 3 : 1;
      }
      return g.score;
    })
    .reduce((a, b) => Math.max(a, b), 0);
}

async function completeLesson(lesson: import("@rhubarb/core").Lesson): Promise<void> {
  db.completeLesson(lesson.id);
  const session = db.latestSessionForLesson(lesson.id);
  if (session) db.updateSession(session.id, { completedAt: Date.now() });
  const skill = db.getSkill(lesson.skillId);
  if (!skill) return;
  // A real-world credit can arrive before the lesson is marked done. Count it now rather than lose it.
  advanceAndContinue(skill.id, maybeAdvance(db, skill, { teachbackScore: bestScoreFor(lesson.id, skill.id), fieldLevel: bestFieldRung(db, skill.id) }));
}

const GuessVerdict = z.object({ close: z.boolean(), note: z.string().describe("one sentence to the learner about their guess, in the house voice") });

const ShortVerdict = z.object({
  verdict: z.enum(["yes", "nearly", "no"]).describe("yes: the one idea the rubric asks for is there, in any words. nearly: they have the gist but a piece is missing or muddled. no: it is missing or wrong."),
  note: z.string().describe("one or two plain sentences to the learner: what they got, and the one thing to add or fix. Plain text only: no markdown, no asterisks."),
});
const SHORT_GRADER =
  "You grade one short written answer inside a lesson quiz. The learner just read the lesson and is answering from memory in their own words, so be generous about wording and strict only about the one idea the rubric names. If the idea is there, say yes. If they have the gist but a piece is missing, say nearly and name the piece. Say no only when it is missing or wrong.";

function shortResult(v: z.infer<typeof ShortVerdict>): { correct: boolean; close?: boolean; note?: string } {
  return { correct: v.verdict === "yes", close: v.verdict === "nearly", note: v.note.replace(/[*_`]/g, "") };
}

function quizScore(per: Array<{ correct: boolean; close?: boolean }>): number {
  // a near miss is worth half, so one muddled sentence does not sink a check the learner mostly passed
  return per.reduce((n, p) => n + (p.correct ? 1 : p.close ? 0.5 : 0), 0);
}
const ScoreNote = z.object({ note: z.string().describe("two or three sentences to the learner about how they did overall and what to do next, in the house voice") });

async function gradeQuiz(lesson: import("@rhubarb/core").Lesson, answers: Array<number | string | null>) {
  const quiz = JSON.parse(lesson.quiz) as import("@rhubarb/core").Quiz;
  const perQuestion: Array<{ correct: boolean; close?: boolean; note?: string }> = [];
  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i];
    const a = answers[i];
    if (q.kind === "mcq") {
      perQuestion.push({ correct: a === q.answer });
    } else {
      const v = await judge({
        system: systemBlocks(voiceGuide(), SHORT_GRADER),
        user: `Question: ${q.prompt}\nWhat a good answer contains: ${q.rubric}\nAnswer: "${String(a ?? "")}"`,
        schema: ShortVerdict,
        effort: "low",
      });
      perQuestion.push(shortResult(v));
    }
  }
  const score = quizScore(perQuestion);
  const total = perQuestion.length;
  const skill = db.getSkill(lesson.skillId);
  const { note } = await judge({
    system: systemBlocks(voiceGuide(), "You write the closing note of a lesson quiz."),
    user: `Skill: ${skill?.name ?? "?"}\nScore: ${score} of ${total}\nMissed: ${quiz.questions
      .map((q, i) => (perQuestion[i].correct || perQuestion[i].close ? null : q.prompt))
      .filter(Boolean)
      .join(" | ") || "nothing"}`,
    schema: ScoreNote,
    effort: "low",
  });
  const practiceId = db.insertPractice({
    skillId: lesson.skillId,
    lessonId: lesson.id,
    kind: "quiz",
    prompt: `Quiz for lesson ${lesson.id}`,
    rubric: null,
    marker: "web",
    scheduledFor: Date.now(),
    beeTodoId: null,
  });
  db.attachPracticeAnswer(practiceId, `web-quiz-${lesson.id}`, JSON.stringify(answers));
  db.gradePractice(practiceId, { score, total, perQuestion });
  log(`quiz for lesson #${lesson.id}: ${score}/${total}`);
  return { score, total, perQuestion, note };
}

/** One more go at a written answer. The stored quiz is updated, so the better attempt is what counts. */
async function retryQuizAnswer(lesson: import("@rhubarb/core").Lesson, idx: number, text: string) {
  const quiz = JSON.parse(lesson.quiz) as import("@rhubarb/core").Quiz;
  const q = quiz.questions[idx];
  const row = db.latestPracticeForLesson(lesson.id, "quiz");
  if (!q || q.kind !== "short" || !row?.grade) throw new Error("no written answer to retry");
  const stored = JSON.parse(row.grade) as { score: number; total: number; perQuestion: Array<{ correct: boolean; close?: boolean; note?: string }>; note?: string };
  const v = await judge({
    system: systemBlocks(voiceGuide(), SHORT_GRADER),
    user: `Question: ${q.prompt}\nWhat a good answer contains: ${q.rubric}\nAnswer: "${text}"`,
    schema: ShortVerdict,
    effort: "low",
  });
  const fresh = shortResult(v);
  const was = stored.perQuestion[idx];
  const better = fresh.correct || (fresh.close && !was?.correct) ? fresh : was?.correct || was?.close ? { ...was, note: fresh.note } : fresh;
  stored.perQuestion[idx] = better;
  const score = quizScore(stored.perQuestion);
  db.gradePractice(row.id, { ...stored, score });
  log(`quiz retry for lesson #${lesson.id} q${idx + 1}: ${v.verdict}; now ${score}/${stored.total}`);
  return { score, total: stored.total, perQuestion: stored.perQuestion, note: stored.note ?? "" };
}

const nightly = guarded("nightly", async () => {
  const today = new Date().toDateString();
  if (db.getKv("last_nightly") === today || new Date().getHours() < REFLECT_HOUR_LOCAL) return;
  db.setKv("last_nightly", today);
  // Bee's /v1/changes returns a 500 some nights. Reflect on what the live stream caught anyway.
  await runSweep({ ...captureDeps, bee }).catch((e: Error) => log(`sweep failed, reflecting without it: ${e.message}`));
  await classifyTick();
  await reflectNow();
});

// --- boot
const me = await bee.me().catch((e: Error) => {
  log(`Bee proxy unreachable (${e.message}). Start it with: bee proxy --port 8787 --idle-timeout 0`);
  process.exit(1);
});
log(`connected as ${me.first_name} ${me.last_name}; data dir ${DATA_DIR}`);
log(`claude via ${llmRoute()}`);

// What the dashboard's "listening" light reads. The last-heard time starts from the database,
// so a restart doesn't make it look as if Rhubarb has never heard anything.
const listening: Listening = { state: "connecting", lastHeardAt: db.lastHeardAt(), since: Date.now() };

const consumer = new BeeStreamConsumer({
  onEvent: (ev) => {
    if (ev.type === "new-utterance") listening.lastHeardAt = Date.now();
    // The nightly sweep knows conversations by number, the stream by uuid. Remember the pair.
    if ((ev.type === "new-conversation" || ev.type === "update-conversation") && ev.conversation?.id && ev.conversation.conversation_uuid) {
      db.setKv(`conv:${ev.conversation.id}`, ev.conversation.conversation_uuid);
    }
    handleStreamEvent(captureDeps, ev);
  },
  onState: (state) => {
    if (state === listening.state) return;
    listening.state = state;
    listening.since = Date.now();
  },
  onStatus: log,
});
consumer.start();

const timers = [
  setInterval(() => void classifyTick(), CLASSIFY_INTERVAL_MS),
  setInterval(() => sweepPractice(db), PRACTICE_SWEEP_MS),
  setInterval(() => void nightly(), NIGHTLY_CHECK_MS),
  setInterval(() => void fieldTick(), FIELD_INTERVAL_MS),
  setInterval(() => void lessonsTick(), 30 * 60_000),
  setInterval(() => void dayReflectTick(), 30 * 60_000),
];
void classifyTick();
// A restart mid-generation leaves a skill with no lesson and nothing writing one. Pick those up.
setTimeout(() => void lessonsTick(), 20_000);

// Until this version, "hey Bee, ..." was thrown away as a command to an assistant. The words were
// still stored, so the last few days are read once more for asks that were dropped.
function rescanForAsks(days = 3): void {
  const key = "ask_rescan_v1";
  if (db.getKv(key)) return;
  let found = 0;
  for (const u of db.utterancesSince(Date.now() - days * 86_400_000)) {
    if (db.hasEvidenceForUtterance(u.id)) continue;
    const ask = askIn(db, u.conversation_uuid, u);
    if (ask && recordAsk(captureDeps, u.conversation_uuid, u, ask, "stream")) found++;
  }
  db.setKv(key, String(Date.now()));
  log(`rescan: ${found} earlier ask${found === 1 ? "" : "s"} to Bee picked back up`);
}
// Before this version, moments that failed to classify because Claude couldn't be reached were
// filed as noise. Put them back once; they are judged when Claude answers.
if (!db.getKv("requeue_unjudged_v1")) {
  const n = db.requeueUnjudged();
  db.setKv("requeue_unjudged_v1", String(Date.now()));
  if (n > 0) log(`requeue: ${n} moment${n === 1 ? "" : "s"} filed as noise during an outage put back in the queue`);
}

// Rewrites finished before their status was recorded: mark them done so the page stops offering one.
for (const skill of db.skillsByStatus(["active", "mastered"])) {
  if (db.getKv(`rewrite:${skill.id}`)) continue;
  const lastEdit = Math.max(0, ...db.evidenceForSkill(skill.id).map((e) => e.editedAt ?? 0));
  const lesson = db.currentLesson(skill.id, skill.level);
  if (lastEdit > 0 && lesson && lesson.createdAt > lastEdit) {
    db.setKv(`rewrite:${skill.id}`, JSON.stringify({ state: "done", at: lesson.createdAt, lessonId: lesson.id }));
  }
}

// A spoken ask that arrived while Claude was unreachable is tried again, for up to three days.
const askRetryTick = guarded("ask-retry", async () => {
  if (asking || askQueue.length > 0) return;
  for (const e of db.pendingAsks(Date.now() - 3 * 86_400_000)) askQueue.push({ e, ask: e.topic ?? e.text });
  if (askQueue.length > 0) {
    log(`asks: retrying ${askQueue.length} that never became a lesson`);
    await drainAsks();
  }
});
timers.push(setInterval(() => void askRetryTick(), 10 * 60_000));

setTimeout(() => {
  try {
    rescanForAsks();
  } catch (e) {
    log(`rescan failed: ${(e as Error).message}`);
  }
}, 5_000);

startApi(
  {
    db,
    log,
    staticDir: existsSync(DASHBOARD_DIST) ? DASHBOARD_DIST : undefined,
    listening: () => ({ ...listening }),
    nextSlot: () => nextLearningSlot(db),
    actions: {
      reflectNow,
      acceptSkill: async (id) => {
        // ladder + first lesson take a while; respond now, build in the background
        void startInBackground(id);
      },
      dismissSkill: async (id) => db.updateSkill(id, { status: "dismissed" }),
      rewriteLesson: (id) => withPurpose("lessons", () => rewriteLesson(lessonDeps, id)),
      lessonFromSpark: async (card) => {
        const item = db.cardsWithItems(200).find((r) => r.card.id === card.id)?.item ?? null;
        const e = item?.utteranceId ? db.evidenceByUtterance(item.utteranceId) : null;
        const skillId = await withPurpose("lessons", () => topicFromSpark({ db, log, start: startInBackground }, card, e));
        db.setKv(`spark_lesson:${card.id}`, String(skillId));
        return skillId;
      },
      judgeGuess: (card, guess) =>
        withPurpose("practice and grading", () => classify({
          system: systemBlocks(voiceGuide(), "Someone guessed the answer to a question before being shown it. Say whether the guess was close to the real answer, and give one warm, honest sentence about it. If they were wrong, name the one thing the real answer turns on. Never say 'great guess'."),
          user: `Question: ${card.title}\n\nThe real answer:\n${card.answerMd}\n\nTheir guess: "${guess}"`,
          schema: GuessVerdict,
          maxTokens: 400,
        })),
      saveProfile: async (p) => {
        db.setProfile(p);
        const slots = await withPurpose("settings", () => parseLearningWindows(p.learningWindows)).catch((e: Error) => {
          log(`learning windows parse failed: ${e.message}`);
          return [];
        });
        saveLearningSlots(db, slots);
        log(`profile saved; ${slots.length} learning slots`);
      },
      answerBeat: (lesson, beat, idx, text) => withPurpose("practice and grading", () => answerBeat(lesson, beat, idx, text)),
      teachbackToPendant: async (lesson, beat) => {
        await schedulePractice(practiceDeps, {
          skillId: lesson.skillId,
          lessonId: lesson.id,
          kind: "teachback",
          prompt: beat.prompt,
          rubric: beat.rubric,
          at: new Date(Date.now() + 60_000),
        });
      },
      scheduleMission: async (lesson, beat) => {
        const at = nextLearningSlot(db);
        await schedulePractice(practiceDeps, {
          skillId: lesson.skillId,
          lessonId: lesson.id,
          kind: "mission",
          prompt: beat.prompt,
          rubric: beat.rubric,
          at,
        });
        return at;
      },
      completeLesson,
      gradeQuiz: (lesson, answers) => withPurpose("practice and grading", () => gradeQuiz(lesson, answers)),
      retryQuizAnswer: (lesson, idx, text) => withPurpose("practice and grading", () => retryQuizAnswer(lesson, idx, text)),
      tutor: (lesson, history, onText) => withPurpose("tutor chat", () => tutorReply(db, lesson, history, onText)),
    },
  },
  API_PORT,
  HOSTED
);

function shutdown(): void {
  timers.forEach(clearInterval);
  consumer.stop();
  db.close();
  process.exit(0);
}
// Last line of defence for a process meant to run for weeks: log a stray rejection, keep listening.
process.on("unhandledRejection", (reason) => log(`unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
