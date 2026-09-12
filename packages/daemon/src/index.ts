import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BeeClient, BeeStreamConsumer, WaggleDb, judge, lintProse, systemBlocks, voiceGuide, write, type Evidence, type Practice } from "@waggle/core";
import { z } from "zod";
import { startApi } from "./api.js";
import { handleStreamEvent } from "./pipeline/capture.js";
import { runClassifyBatch } from "./pipeline/classify.js";
import { findFieldCandidates, judgeFieldEvidence } from "./pipeline/field.js";
import { generateLesson, startSkill } from "./pipeline/lessons.js";
import { writeTodayLetter } from "./pipeline/letter.js";
import { gradeAnswer, handleJournalReady, schedulePractice, sweepPractice, type Grade } from "./pipeline/practice.js";
import { maybeAdvance, onFieldCredited, onTeachbackGraded } from "./pipeline/progress.js";
import { runReflection } from "./pipeline/reflect.js";
import { nextLearningSlot, parseLearningWindows, saveLearningSlots } from "./pipeline/schedule.js";
import { buildSpark } from "./pipeline/sparks.js";
import { ingestStakes, runSweep } from "./pipeline/sweep.js";
import { tutorReply } from "./pipeline/tutor.js";

const DATA_DIR = process.env.WAGGLE_DATA_DIR ?? join(homedir(), ".waggle");
mkdirSync(DATA_DIR, { recursive: true });

const CLASSIFY_INTERVAL_MS = 2 * 60_000;
const PRACTICE_SWEEP_MS = 60_000;
const NIGHTLY_CHECK_MS = 10 * 60_000;
const FIELD_INTERVAL_MS = 15 * 60_000;
const REFLECT_HOUR_LOCAL = 3;
const API_PORT = Number(process.env.WAGGLE_PORT ?? 4242);
// packages/daemon/dist/index.js -> packages/dashboard/dist
const DASHBOARD_DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard", "dist");

const db = new WaggleDb(join(DATA_DIR, "waggle.db"));
const bee = new BeeClient();

function log(msg: string): void {
  console.log(`[waggle ${new Date().toISOString()}] ${msg}`);
}

const lessonDeps = { db, bee, log };

/** After a level is passed, write the next lesson in the background. */
function advanceAndContinue(skillId: number, nextLevel: number | null): void {
  if (nextLevel === null) return;
  const skill = db.getSkill(skillId);
  if (!skill || skill.status !== "active") return;
  log(`skill #${skillId} ${skill.name} advanced to level ${nextLevel + 1}`);
  void generateLesson(lessonDeps, skill, nextLevel).catch((e: Error) => log(`next lesson failed: ${e.message}`));
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
function guarded(name: string, job: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (e) {
      log(`${name} failed: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
}

const classifyTick = guarded("classify", async () => {
  const n = await runClassifyBatch(classifyDeps);
  if (n > 0) log(`classified ${n} evidence`);
  findFieldCandidates(db, Date.now() - 3 * CLASSIFY_INTERVAL_MS, log);
});

const fieldTick = guarded("field", () => judgeFieldEvidence(fieldDeps));

const reflectNow = guarded("reflect", async () => {
  await ingestStakes({ db, bee, log });
  await classifyTick();
  const touched = await runReflection({ db, log });
  const proposed = db.skillsByStatus(["proposed"]);
  if (touched.length > 0 && proposed.length > 0) {
    const top = proposed[0];
    const line = `Your learning brief is ready. ${proposed.length === 1 ? "One skill" : `${proposed.length} skills`} worth a look, starting with ${top.name}.`;
    await bee.createTodo(line, new Date(Date.now() + 2 * 60_000).toISOString()).catch((e: Error) => log(`brief nudge failed: ${e.message}`));
  }
  await writeTodayLetter(db, log);
});

// --- in-page lesson interactions
const QuickFeedback = z.object({ feedback: z.string().describe("two or three sentences to the learner: what they got, what they missed, in the house voice") });

async function answerBeat(lesson: import("@waggle/core").Lesson, beat: import("@waggle/core").LessonBeat, idx: number, text: string) {
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

async function completeLesson(lesson: import("@waggle/core").Lesson): Promise<void> {
  db.completeLesson(lesson.id);
  const session = db.latestSessionForLesson(lesson.id);
  if (session) db.updateSession(session.id, { completedAt: Date.now() });
  const skill = db.getSkill(lesson.skillId);
  if (!skill) return;
  const best = db
    .practiceForSkill(skill.id)
    .filter((p) => p.lessonId === lesson.id && p.kind === "teachback" && p.grade)
    .map((p) => (JSON.parse(p.grade!) as Grade).score)
    .reduce((a, b) => Math.max(a, b), 0);
  advanceAndContinue(skill.id, maybeAdvance(db, skill, { teachbackScore: best }));
}

const nightly = guarded("nightly", async () => {
  const today = new Date().toDateString();
  if (db.getKv("last_nightly") === today || new Date().getHours() < REFLECT_HOUR_LOCAL) return;
  db.setKv("last_nightly", today);
  await runSweep({ ...captureDeps, bee });
  await reflectNow();
});

// --- boot
const me = await bee.me().catch((e: Error) => {
  log(`Bee proxy unreachable (${e.message}). Start it with: bee proxy --port 8787 --idle-timeout 0`);
  process.exit(1);
});
log(`connected as ${me.first_name} ${me.last_name}; data dir ${DATA_DIR}`);

const consumer = new BeeStreamConsumer({ onEvent: (ev) => handleStreamEvent(captureDeps, ev), onStatus: log });
consumer.start();

const timers = [
  setInterval(() => void classifyTick(), CLASSIFY_INTERVAL_MS),
  setInterval(() => sweepPractice(db), PRACTICE_SWEEP_MS),
  setInterval(() => void nightly(), NIGHTLY_CHECK_MS),
  setInterval(() => void fieldTick(), FIELD_INTERVAL_MS),
];
void classifyTick();

startApi(
  {
    db,
    log,
    staticDir: existsSync(DASHBOARD_DIST) ? DASHBOARD_DIST : undefined,
    actions: {
      reflectNow,
      acceptSkill: async (id) => {
        // ladder + first lesson take a while; respond now, build in the background
        void startSkill(lessonDeps, id).catch((e: Error) => log(`startSkill ${id} failed: ${e.message}`));
      },
      dismissSkill: async (id) => db.updateSkill(id, { status: "dismissed" }),
      saveProfile: async (p) => {
        db.setProfile(p);
        const slots = await parseLearningWindows(p.learningWindows).catch((e: Error) => {
          log(`learning windows parse failed: ${e.message}`);
          return [];
        });
        saveLearningSlots(db, slots);
        log(`profile saved for ${p.name}; ${slots.length} learning slots`);
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
      tutor: (lesson, history, onText) => tutorReply(db, lesson, history, onText),
    },
  },
  API_PORT
);

process.on("SIGINT", () => {
  timers.forEach(clearInterval);
  consumer.stop();
  db.close();
  process.exit(0);
});
