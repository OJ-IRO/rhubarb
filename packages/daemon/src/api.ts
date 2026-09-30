import { createReadStream, existsSync, statSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { Card, Lesson, LessonBeat, Profile, Skill, RhubarbDb } from "@rhubarb/core";
import { llmHealth } from "@rhubarb/core";
import { z } from "zod";

export interface ApiDeps {
  db: RhubarbDb;
  log: (msg: string) => void;
  /** absolute path to the built dashboard (index.html + assets); optional in dev */
  staticDir?: string;
  /** Whether Rhubarb can hear the Bee right now. Optional so tests need not fake a stream. */
  listening?: () => Listening;
  /** The next time the wearer said they have time to learn. */
  nextSlot?: () => Date;
  actions: {
    reflectNow: () => Promise<void>;
    acceptSkill: (id: number) => Promise<void>;
    dismissSkill: (id: number) => Promise<void>;
    /** Write the current lesson again from corrected moments. Returns at once; the lesson nudge says when it is ready. */
    rewriteLesson?: (skillId: number) => Promise<void>;
    /** "Teach me the whole thing": a spark becomes a one-lesson topic. Returns the new skill id. */
    lessonFromSpark?: (card: Card) => Promise<number>;
    restoreSkill?: (id: number) => Promise<void>;
    /** How close was a guess to the answer on the card? Optional so tests need not fake a model. */
    judgeGuess?: (card: Card, guess: string) => Promise<{ close: boolean; note: string }>;
    saveProfile: (p: Profile) => Promise<void>;
    answerBeat: (lesson: Lesson, beat: LessonBeat, idx: number, text: string) => Promise<{ feedback: string; score?: number }>;
    teachbackToPendant: (lesson: Lesson, beat: LessonBeat) => Promise<void>;
    scheduleMission: (lesson: Lesson, beat: LessonBeat) => Promise<Date>;
    completeLesson: (lesson: Lesson) => Promise<void>;
    gradeQuiz: (lesson: Lesson, answers: Array<number | string | null>) => Promise<QuizResult>;
    /** One more go at a single written answer after seeing the feedback. */
    retryQuizAnswer?: (lesson: Lesson, idx: number, text: string) => Promise<QuizResult>;
    tutor: (lesson: Lesson, history: Array<{ role: "user" | "assistant"; content: string }>, onText: (t: string) => void) => Promise<string>;
  };
}

export interface Listening {
  /** connecting: starting up. connected: the stream is open. down: it dropped and is being restarted. */
  state: "connecting" | "connected" | "down";
  /** epoch ms of the last line of speech received, or null if nothing has been heard yet */
  lastHeardAt: number | null;
  /** epoch ms the current state began */
  since: number;
}

export interface QuizResult {
  score: number;
  total: number;
  perQuestion: Array<{ correct: boolean; close?: boolean; note?: string }>;
  note: string;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const ProfileIn = z.object({
  name: z.string().trim().min(1).max(80),
  style: z.enum(["story", "hands-on", "socratic", "structured", "analogy"]),
  sessionMinutes: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  learningWindows: z.string().max(500).default(""),
  goals: z.array(z.string().max(200)).max(30).default([]),
  offLimits: z.array(z.string().max(200)).max(30).default([]),
  timezone: z.string().max(80).default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  onboardedAt: z.number().nullable().default(null),
  nudges: z.object({ lessons: z.boolean(), feedback: z.boolean(), credits: z.boolean(), brief: z.boolean() }).optional(),
});

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return (text ? JSON.parse(text) : null) as T;
}

function serveStatic(res: ServerResponse, dir: string, urlPath: string): boolean {
  const rel = normalize(urlPath === "/" ? "/index.html" : urlPath).replace(/^(\.\.[/\\])+/, "");
  let file = join(dir, rel);
  if (!file.startsWith(dir)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html"); // SPA fallback
  if (!existsSync(file)) return false;
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file)
    .on("error", () => res.destroy())
    .pipe(res);
  return true;
}

/** The lesson the reader should open today: highest-priority active skill with a ready lesson at its current level. */
export function todaysLesson(db: RhubarbDb): { lesson: Lesson; skill: Skill } | null {
  for (const skill of db.skillsByStatus(["active"])) {
    const lesson = db.currentLesson(skill.id, skill.level);
    if (lesson && lesson.status === "ready") return { lesson, skill };
  }
  return null;
}

function withLadderLength(db: RhubarbDb, t: { lesson: Lesson; skill: Skill } | null) {
  return t ? { ...t, ladderLength: db.ladderFor(t.skill.id).length } : null;
}

/**
 * Hosted mode. Rhubarb normally answers only this machine. On a private server it answers the
 * open internet, so every request must carry the access token instead: as a cookie the login page
 * sets, or as a bearer header for scripts and the agent skill. Assets are public; nothing else is.
 */
export interface HostedOptions {
  /** the one secret that opens the dashboard; RHUBARB_ACCESS_TOKEN */
  accessToken: string;
  /** where to say the data lives, for the privacy page, e.g. "your private server on Railway" */
  where: string;
}

const COOKIE = "rhubarb_access";
const isLocalName = (h: string) => h === "127.0.0.1" || h === "localhost" || h === "[::1]";

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Same length or not, the comparison takes the same time, so the token can't be guessed a byte at a time. */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const LOGIN_PAGE = (wrong: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rhubarb</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbf8f1;color:#1f1b14;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:17px}
form{width:min(380px,90vw);padding:30px 32px;background:#fff;border:1px solid #e7dfcc;border-radius:16px;box-shadow:0 22px 40px -20px rgba(122,84,10,.4)}
h1{font-size:26px;font-weight:500;margin:0 0 6px}p{margin:0 0 18px;color:#6f6656;line-height:1.5}input{width:100%;box-sizing:border-box;font:inherit;padding:11px 14px;border:1px solid #e7dfcc;border-radius:10px}
button{margin-top:14px;width:100%;font:inherit;padding:10px;border-radius:10px;border:1px solid #c98a0e;background:linear-gradient(180deg,#f6c34f,#e9a825 55%,#dd9c1c);color:#2a1e04;cursor:pointer}
.bad{color:#b2452f}</style></head><body><form method="post" action="/login"><h1>Rhubarb</h1><p>${wrong ? '<span class="bad">That wasn\'t it. Try again.</span>' : "This is your private Rhubarb. Enter the access token to open it."}</p>
<input type="password" name="token" autocomplete="current-password" autofocus aria-label="Access token"><button type="submit">Open</button></form></body></html>`;

const sparkLessonsStarting = new Set<number>();

export function startApi(deps: ApiDeps, port: number, hosted?: HostedOptions): Server {
  const { db, log, actions } = deps;

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    let path = "/";
    let url = new URL("http://localhost/");

    try {
      try {
        url = new URL(req.url ?? "/", "http://localhost");
        path = url.pathname;
      } catch {
        return json(res, 400, { error: "bad request" });
      }

      if (hosted) {
        // Anyone can reach the login page and the app's own assets. Everything else needs the token.
        if (path === "/login" && method === "POST") {
          const form = await readForm(req);
          if (sameSecret(form.token ?? "", hosted.accessToken)) {
            res.writeHead(303, { "Set-Cookie": `${COOKIE}=${encodeURIComponent(hosted.accessToken)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${60 * 60 * 24 * 90}`, Location: "/" });
            return res.end();
          }
          res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(LOGIN_PAGE(true));
        }
        if (path === "/logout") {
          res.writeHead(303, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`, Location: "/login" });
          return res.end();
        }
        const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
        const authed = sameSecret(cookies(req)[COOKIE] ?? "", hosted.accessToken) || (bearer !== "" && sameSecret(bearer, hosted.accessToken));
        if (!authed) {
          if (path.startsWith("/api/")) return json(res, 401, { error: "sign in at /login" });
          if (path === "/login" || path.startsWith("/assets/")) {
            if (path === "/login") {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              return res.end(LOGIN_PAGE(false));
            }
          } else {
            res.writeHead(303, { Location: "/login" });
            return res.end();
          }
        } else if (path === "/login") {
          res.writeHead(303, { Location: "/" });
          return res.end();
        }
      } else {
        // Local mode. Transcripts live behind this API. Refuse anything not addressed to this
        // machine by name, which is what a DNS-rebinding page would look like.
        const host = (req.headers.host ?? "").replace(/:\d+$/, "");
        if (!isLocalName(host)) return json(res, 403, { error: "forbidden" });
        // Browsers attach Origin to cross-site requests. Any other site's page could otherwise POST
        // here blind, to accept skills or start Opus runs on the wearer's bill.
        const origin = req.headers.origin;
        if (origin) {
          let from = "";
          try {
            from = new URL(origin).hostname;
          } catch {
            /* unparseable origin is treated as foreign */
          }
          if (!isLocalName(from)) return json(res, 403, { error: "forbidden" });
        }
      }
      if (path.startsWith("/api/")) {
        const parts = path.slice(5).split("/").filter(Boolean);
        const [head, idStr, tail, tail2] = parts;
        const id = idStr ? Number(idStr) : NaN;

        // ---- status / today / profile
        if (head === "status" && method === "GET") {
          return json(res, 200, {
            profile: db.getProfile(),
            skills: db.skillsByStatus(["proposed", "active"]).length,
            evidence: db.evidenceByStage("classified", 1000).length,
            openPractice: db.openPractice().length,
            listening: deps.listening?.() ?? null,
            // whether Claude answered last time, so an empty account or an outage is visible
            claude: llmHealth(),
            // where the data lives, so the privacy page can tell the truth in both modes
            hosted: hosted ? { where: hosted.where } : null,
          });
        }
        if (head === "today" && method === "GET") {
          const now = Date.now();
          return json(res, 200, {
            profile: db.getProfile(),
            letter: db.getKv("today_letter"),
            letterDate: db.getKv("today_letter_date"),
            lesson: withLadderLength(db, todaysLesson(db)),
            duePractice: db.openPractice().filter((p) => p.scheduledFor <= now),
            dueCards: db.dueCards(now, 10).map((d) => ({ ...d, card: db.getCard(d.cardId) })),
            proposed: db.skillsByStatus(["proposed"]).length,
            active: db.skillsByStatus(["active"]).length,
            sparks: db.cardsWithItems(5),
            // What is on its way, like a schedule: alarms not yet fired, and tonight's reflection.
            upcoming: db.openPractice().filter((p) => p.scheduledFor > now).sort((a, b) => a.scheduledFor - b.scheduledFor).slice(0, 6),
            nextSlot: deps.nextSlot?.()?.toISOString() ?? null,
          });
        }
        if (head === "history" && method === "GET") return json(res, 200, db.history());
        if (head === "profile" && method === "GET") return json(res, 200, db.getProfile());
        if (head === "profile" && method === "PUT") {
          // Reflection and lesson writing call goals.join() and friends on every run, so a
          // half-formed profile saved here would break them all until someone fixed the row by hand.
          const parsed = ProfileIn.safeParse(await readBody<unknown>(req));
          if (!parsed.success) return json(res, 400, { error: `That profile is missing something: ${parsed.error.issues.map((i) => i.path.join(".") || "body").join(", ")}` });
          const body: Profile = parsed.data;
          await actions.saveProfile({ ...body, onboardedAt: body.onboardedAt ?? Date.now() });
          return json(res, 200, db.getProfile());
        }

        // ---- evidence / skills
        if (head === "evidence" && method === "GET") {
          const stage = (url.searchParams.get("stage") as "detected" | "classified") ?? "classified";
          return json(res, 200, db.evidenceByStage(stage, 200));
        }
        if (head === "skills" && method === "GET" && !idStr) {
          const skills = db.skillsByStatus(["proposed", "active", "mastered"]).map((s) => ({
            ...s,
            evidenceCount: db.evidenceForSkill(s.id).length,
            ladderLength: db.ladderFor(s.id).length,
            lessonReady: Boolean(db.currentLesson(s.id, s.level)?.status === "ready"),
            lessonId: db.currentLesson(s.id, s.level)?.id ?? null,
          }));
          return json(res, 200, skills);
        }
        // ---- skills set aside, and bringing one back
        if (head === "skills" && idStr === "dismissed" && method === "GET") {
          return json(res, 200, db.skillsByStatus(["dismissed"]));
        }
        if (head === "skills" && idStr && tail === "restore" && method === "POST") {
          const skill = db.getSkill(id);
          if (!skill) return json(res, 404, { error: "not found" });
          if (skill.status === "dismissed") db.updateSkill(id, { status: "proposed" });
          return json(res, 200, db.getSkill(id));
        }

        // ---- privacy: what is held here, and forgetting it
        if (head === "privacy") {
          const snapshot = () => ({ summary: db.privacySummary(), days: db.capturedDays(), moments: db.recentMoments() });
          if (method === "GET" && !idStr) return json(res, 200, snapshot());
          if (method === "DELETE" && idStr === "moments" && tail) {
            if (!db.forgetMoment(Number(tail))) return json(res, 404, { error: "not found" });
            log(`privacy: forgot one moment`);
            return json(res, 200, snapshot());
          }
          if (method === "DELETE" && idStr === "days" && tail) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(tail)) return json(res, 400, { error: "day must look like 2026-09-17" });
            const n = db.forgetDay(tail);
            log(`privacy: forgot ${tail} (${n} lines)`);
            return json(res, 200, snapshot());
          }
          if (method === "DELETE" && idStr === "everything") {
            // A second, deliberate signal. One stray request must not be able to wipe a month of work.
            const body = await readBody<{ confirm?: string } | null>(req).catch(() => null);
            if (body?.confirm !== "erase everything") return json(res, 400, { error: 'send { "confirm": "erase everything" }' });
            db.eraseEverything();
            log("privacy: erased everything");
            return json(res, 200, snapshot());
          }
        }

        if (head === "skills" && idStr && method === "GET") {
          const skill = db.getSkill(id);
          if (!skill) return json(res, 404, { error: "not found" });
          return json(res, 200, {
            skill,
            ladder: db.ladderFor(id),
            evidence: db.evidenceForSkill(id),
            lessons: db.lessonsForSkill(id),
            practice: db.practiceForSkill(id),
            fieldEvidence: db.fieldEvidenceForSkill(id),
            rewrite: JSON.parse(db.getKv(`rewrite:${id}`) ?? "null"),
          });
        }
        // The transcript got it wrong: the wearer corrects the line and the lines around it.
        if (head === "moments" && idStr && method === "PUT") {
          const body = await readBody<{ text?: unknown; context?: unknown } | null>(req).catch(() => null);
          const text = typeof body?.text === "string" ? body.text.slice(0, 2000) : undefined;
          const context = typeof body?.context === "string" ? body.context.slice(0, 8000) : undefined;
          if (text === undefined && context === undefined) return json(res, 400, { error: "send text and/or context" });
          if (text !== undefined && !text.trim()) return json(res, 400, { error: "the line cannot be empty" });
          const e = db.editMoment(id, { text, context });
          if (!e) return json(res, 404, { error: "not found" });
          log(`moment #${id} corrected by the wearer`);
          return json(res, 200, e);
        }
        if (head === "skills" && idStr && tail === "rewrite" && method === "POST") {
          if (!db.getSkill(id)) return json(res, 404, { error: "not found" });
          if (!actions.rewriteLesson) return json(res, 501, { error: "not available" });
          db.setKv(`rewrite:${id}`, JSON.stringify({ state: "writing", at: Date.now() }));
          void actions.rewriteLesson(id).catch((e: Error) => log(`rewrite ${id} failed: ${e.message}`));
          return json(res, 202, { ok: true });
        }
        if (head === "skills" && idStr && tail === "accept" && method === "POST") {
          await actions.acceptSkill(id);
          return json(res, 200, db.getSkill(id));
        }
        if (head === "skills" && idStr && tail === "dismiss" && method === "POST") {
          await actions.dismissSkill(id);
          return json(res, 200, db.getSkill(id));
        }
        if (head === "skills" && idStr && tail === "priority" && method === "PUT") {
          const { priority } = await readBody<{ priority: number }>(req);
          db.updateSkill(id, { priority });
          return json(res, 200, db.getSkill(id));
        }
        // ---- what Claude has cost, and the daily budget
        if (head === "usage" && method === "GET" && !idStr) {
          const budget = Number(db.getKv("daily_budget_usd") ?? process.env.RHUBARB_DAILY_BUDGET_USD ?? 3);
          return json(res, 200, { ...db.usageSummary(), budget });
        }
        if (head === "usage" && idStr === "budget" && method === "PUT") {
          const body = await readBody<{ usd?: unknown } | null>(req).catch(() => null);
          const usd = Number(body?.usd);
          if (!Number.isFinite(usd) || usd < 0 || usd > 500) return json(res, 400, { error: "send { usd } between 0 and 500; 0 means no cap" });
          db.setKv("daily_budget_usd", String(Math.round(usd * 100) / 100));
          log(`budget: daily Claude budget set to $${usd.toFixed(2)}`);
          return json(res, 200, { budget: usd });
        }
        if (head === "reflect" && method === "POST") {
          void actions.reflectNow();
          return json(res, 202, { ok: true });
        }

        // ---- sparks / practice
        if (head === "sparks" && method === "GET" && !idStr) {
          const rows = db.cardsWithItems(100).map((r) => {
            const sid = Number(db.getKv(`spark_lesson:${r.card.id}`) ?? 0);
            return { ...r, lessonSkillId: sid > 0 ? sid : null };
          });
          return json(res, 200, rows);
        }
        if (head === "sparks" && idStr && tail === "lesson" && method === "POST") {
          const card = db.getCard(id);
          if (!card) return json(res, 404, { error: "not found" });
          if (!actions.lessonFromSpark) return json(res, 501, { error: "not available" });
          const existing = Number(db.getKv(`spark_lesson:${card.id}`) ?? 0);
          if (existing > 0) return json(res, 200, { skillId: existing });
          // Two quick taps must not write two lessons.
          if (sparkLessonsStarting.has(card.id)) return json(res, 409, { error: "already starting" });
          sparkLessonsStarting.add(card.id);
          try {
            const skillId = await actions.lessonFromSpark(card);
            return json(res, 200, { skillId });
          } finally {
            sparkLessonsStarting.delete(card.id);
          }
        }
        // Guess first, then see the answer. An empty guess means "just show me", and is recorded as a skip.
        if (head === "sparks" && idStr && tail === "guess" && method === "POST") {
          const card = db.getCard(id);
          if (!card) return json(res, 404, { error: "not found" });
          const body = await readBody<{ text?: unknown } | null>(req);
          const guess = typeof body?.text === "string" ? body.text.trim().slice(0, 600) : "";
          let verdict: { close: boolean; note: string } | null = null;
          if (guess && actions.judgeGuess) {
            verdict = await actions.judgeGuess(card, guess).catch((e: Error) => {
              log(`guess not judged: ${e.message}`);
              return null;
            });
          }
          db.setCardGuess(id, guess, verdict);
          return json(res, 200, db.getCard(id));
        }

        // ---- evidence that it is working: numbers only, never speech
        if (head === "progress" && method === "GET" && !idStr) return json(res, 200, db.learningProgress());
        if (head === "progress" && idStr === "research-copy" && method === "GET") {
          const copy = { about: "Rhubarb learning record. Counts, scores and dates only. It contains no speech, no quotes, no names and no skill titles.", schema: 1, exportedAt: new Date().toISOString(), ...db.learningProgress() };
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="rhubarb-learning-record.json"' });
          return void res.end(JSON.stringify(copy, null, 2));
        }
        if (head === "practice" && method === "GET") return json(res, 200, db.openPractice());

        // ---- lessons
        if (head === "lessons" && idStr) {
          const lesson = db.getLesson(id);
          if (!lesson) return json(res, 404, { error: "not found" });
          const beats = JSON.parse(lesson.beats) as LessonBeat[];

          if (!tail && method === "GET") {
            return json(res, 200, {
              lesson,
              skill: db.getSkill(lesson.skillId),
              ladder: db.ladderFor(lesson.skillId),
              session: db.latestSessionForLesson(id),
            });
          }
          if (tail === "session" && method === "POST") {
            const existing = db.latestSessionForLesson(id);
            const session = existing && !existing.completedAt ? existing : db.getSession(db.startSession(id));
            return json(res, 200, session);
          }
          if (tail === "session" && method === "PUT") {
            const { responses } = await readBody<{ responses: Record<string, string> }>(req);
            const session = db.latestSessionForLesson(id);
            if (!session) return json(res, 404, { error: "no session" });
            db.updateSession(session.id, { responses });
            return json(res, 200, db.getSession(session.id));
          }
          if (tail === "beat" && tail2 !== undefined && parts[4] === "answer" && method === "POST") {
            const idx = Number(tail2);
            const beat = beats[idx];
            if (!beat) return json(res, 404, { error: "no such beat" });
            const { text } = await readBody<{ text: string }>(req);
            const result = await actions.answerBeat(lesson, beat, idx, text);
            return json(res, 200, result);
          }
          if (tail === "teachback" && tail2 === "pendant" && method === "POST") {
            const beat = beats.find((b) => b.kind === "teachback");
            if (!beat) return json(res, 404, { error: "no teachback beat" });
            await actions.teachbackToPendant(lesson, beat);
            return json(res, 200, { ok: true });
          }
          if (tail === "mission" && method === "POST") {
            const beat = beats.find((b) => b.kind === "mission");
            if (!beat) return json(res, 404, { error: "no mission beat" });
            const at = await actions.scheduleMission(lesson, beat);
            return json(res, 200, { at: at.toISOString() });
          }
          if (tail === "complete" && method === "POST") {
            await actions.completeLesson(lesson);
            return json(res, 200, db.getLesson(id));
          }
          if (tail === "quiz" && !tail2 && method === "POST") {
            const { answers } = await readBody<{ answers: Array<number | string | null> }>(req);
            return json(res, 200, await actions.gradeQuiz(lesson, answers));
          }
          if (tail === "quiz" && tail2 === "retry" && method === "POST" && actions.retryQuizAnswer) {
            const body = await readBody<{ idx?: unknown; text?: unknown }>(req);
            const idx = Number(body?.idx);
            const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
            if (!Number.isInteger(idx) || !text) return json(res, 400, { error: "idx and text are needed" });
            return json(res, 200, await actions.retryQuizAnswer(lesson, idx, text));
          }
          if (tail === "tutor" && method === "POST") {
            const { history } = await readBody<{ history: Array<{ role: "user" | "assistant"; content: string }> }>(req);
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
            const full = await actions.tutor(lesson, history, (t) => res.write(t));
            const session = db.latestSessionForLesson(id);
            if (session) db.updateSession(session.id, { tutor: [...history, { role: "assistant", content: full }] });
            return res.end();
          }
        }
        return json(res, 404, { error: `no route ${method} ${path}` });
      }

      if (deps.staticDir && method === "GET" && serveStatic(res, deps.staticDir, path)) return;
      json(res, 404, { error: "not found" });
    } catch (e) {
      log(`api error ${method} ${path}: ${(e as Error).message}`);
      if (!res.headersSent) json(res, 500, { error: (e as Error).message });
      else res.end();
    }
  });

  const bind = hosted ? "0.0.0.0" : "127.0.0.1";
  server.listen(port, bind, () => log(hosted ? `dashboard + api on port ${port}, hosted mode, token required` : `dashboard + api on http://127.0.0.1:${port}`));
  return server;
}

async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}
