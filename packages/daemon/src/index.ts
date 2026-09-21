import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, BeeClient, BeeStreamConsumer, RhubarbDb, judge, lintProse, systemBlocks, voiceGuide, write, type Evidence, type Practice } from "@rhubarb/core";
import { z } from "zod";
import { startApi, type Listening } from "./api.js";
import { handleStreamEvent } from "./pipeline/capture.js";
import { runClassifyBatch } from "./pipeline/classify.js";
import { findFieldCandidates, judgeFieldEvidence } from "./pipeline/field.js";
import { generateLessonOnce, resumeMissingLessons, startSkill } from "./pipeline/lessons.js";
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
const API_PORT = Number(process.env.RHUBARB_PORT ?? 4242);
// packages/daemon/dist/index.js -> packages/dashboard/dist
const DASHBOARD_DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard", "dist");

const db = new RhubarbDb(join(DATA_DIR, "rhubarb.db"));
const bee = new BeeClient();

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
  void generateLessonOnce(lessonDeps, skill, nextLevel).catch((e: Error) => log(`next lesson failed: ${e.message}`));
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

const captureDeps = {
  db,
  log,
  onJournalReady: (journalId: string, text: string) => {
    handleJournalReady(practiceDeps, journalId, text).catch((e: Error) => log(`grading failed: ${e.message}`));
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
      await buildSpark({ db, log }, next.e, next.topic).catch((err: Error) => log(`spark failed: ${err.message}`));
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

const classifyTick = guarded("classify", async () => {
  const n = await runClassifyBatch(classifyDeps);
  if (n > 0) log(`classified ${n} evidence`);
  findFieldCandidates(db, Date.now() - 3 * CLASSIFY_INTERVAL_MS, log);
});

const fieldTick = guarded("field", () => judgeFieldEvidence(fieldDeps));
const lessonsTick = guarded("lessons", () => resumeMissingLessons(lessonDeps));

const reflectNow = guarded("reflect", async () => {
  // Calendar stakes are a nice-to-have. Their failure must not stop the reflection itself.
  await ingestStakes({ db, bee, log }).catch((e: Error) => log(`stakes skipped: ${e.message}`));
  await classifyTick();
  const touched = await runReflection({ db, log });
  const proposed = db.skillsByStatus(["proposed"]);
  if (touched.length > 0 && proposed.length > 0) {
    const top = proposed[0];
    const line = `Your learning brief is ready. ${proposed.length === 1 ? "One skill" : `${proposed.length} skills`} worth a look, starting with ${top.name}.`;
    await bee.createTodo(line, afterQuietHours(new Date(Date.now() + 2 * 60_000)).toISOString()).catch((e: Error) => log(`brief nudge failed: ${e.message}`));
  }
  await writeTodayLetter(db, log);
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
  correct: z.boolean(),
  note: z.string().describe("one or two sentences to the learner about this answer, in the house voice"),
});
const ScoreNote = z.object({ note: z.string().describe("two or three sentences to the learner about how they did overall and what to do next, in the house voice") });

async function gradeQuiz(lesson: import("@rhubarb/core").Lesson, answers: Array<number | string | null>) {
  const quiz = JSON.parse(lesson.quiz) as import("@rhubarb/core").Quiz;
  const perQuestion: Array<{ correct: boolean; note?: string }> = [];
  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i];
    const a = answers[i];
    if (q.kind === "mcq") {
      perQuestion.push({ correct: a === q.answer });
    } else {
      const v = await judge({
        system: systemBlocks(voiceGuide(), "You grade one short written answer inside a lesson quiz. Decide if it meets the rubric; be fair about wording, strict about substance."),
        user: `Question: ${q.prompt}\nRubric: ${q.rubric}\nAnswer: "${String(a ?? "")}"`,
        schema: ShortVerdict,
        effort: "low",
      });
      perQuestion.push(v);
    }
  }
  const score = perQuestion.filter((p) => p.correct).length;
  const total = perQuestion.length;
  const skill = db.getSkill(lesson.skillId);
  const { note } = await judge({
    system: systemBlocks(voiceGuide(), "You write the closing note of a lesson quiz."),
    user: `Skill: ${skill?.name ?? "?"}\nScore: ${score} of ${total}\nMissed: ${quiz.questions
      .map((q, i) => (perQuestion[i].correct ? null : q.prompt))
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

const nightly = guarded("nightly", async () => {
  const today = new Date().toDateString();
  if (db.getKv("last_nightly") === today || new Date().getHours() < REFLECT_HOUR_LOCAL) return;
  db.setKv("last_nightly", today);
  // Bee's /v1/changes returns a 500 some nights. Reflect on what the live stream caught anyway.
  await runSweep({ ...captureDeps, bee }).catch((e: Error) => log(`sweep failed, reflecting without it: ${e.message}`));
  await reflectNow();
});

// --- boot
const me = await bee.me().catch((e: Error) => {
  log(`Bee proxy unreachable (${e.message}). Start it with: bee proxy --port 8787 --idle-timeout 0`);
  process.exit(1);
});
log(`connected as ${me.first_name} ${me.last_name}; data dir ${DATA_DIR}`);

// What the dashboard's "listening" light reads. The last-heard time starts from the database,
// so a restart doesn't make it look as if Rhubarb has never heard anything.
const listening: Listening = { state: "connecting", lastHeardAt: db.lastHeardAt(), since: Date.now() };

const consumer = new BeeStreamConsumer({
  onEvent: (ev) => {
    if (ev.type === "new-utterance") listening.lastHeardAt = Date.now();
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
];
void classifyTick();
// A restart mid-generation leaves a skill with no lesson and nothing writing one. Pick those up.
setTimeout(() => void lessonsTick(), 20_000);

startApi(
  {
    db,
    log,
    staticDir: existsSync(DASHBOARD_DIST) ? DASHBOARD_DIST : undefined,
    listening: () => ({ ...listening }),
    actions: {
      reflectNow,
      acceptSkill: async (id) => {
        // ladder + first lesson take a while; respond now, build in the background
        void startSkill(lessonDeps, id).catch((e: Error) => log(`startSkill ${id} failed: ${e.message}`));
      },
      dismissSkill: async (id) => db.updateSkill(id, { status: "dismissed" }),
      judgeGuess: (card, guess) =>
        classify({
          system: systemBlocks(voiceGuide(), "Someone guessed the answer to a question before being shown it. Say whether the guess was close to the real answer, and give one warm, honest sentence about it. If they were wrong, name the one thing the real answer turns on. Never say 'great guess'."),
          user: `Question: ${card.title}\n\nThe real answer:\n${card.answerMd}\n\nTheir guess: "${guess}"`,
          schema: GuessVerdict,
          maxTokens: 400,
        }),
      saveProfile: async (p) => {
        db.setProfile(p);
        const slots = await parseLearningWindows(p.learningWindows).catch((e: Error) => {
          log(`learning windows parse failed: ${e.message}`);
          return [];
        });
        saveLearningSlots(db, slots);
        log(`profile saved; ${slots.length} learning slots`);
      },
      answerBeat,
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
      gradeQuiz,
      tutor: (lesson, history, onText) => tutorReply(db, lesson, history, onText),
    },
  },
  API_PORT
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
