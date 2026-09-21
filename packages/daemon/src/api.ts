import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { Lesson, LessonBeat, Profile, Skill, RhubarbDb } from "@rhubarb/core";
import { z } from "zod";

export interface ApiDeps {
  db: RhubarbDb;
  log: (msg: string) => void;
  /** absolute path to the built dashboard (index.html + assets); optional in dev */
  staticDir?: string;
  /** Whether Rhubarb can hear the Bee right now. Optional so tests need not fake a stream. */
  listening?: () => Listening;
  actions: {
    reflectNow: () => Promise<void>;
    acceptSkill: (id: number) => Promise<void>;
    dismissSkill: (id: number) => Promise<void>;
    restoreSkill?: (id: number) => Promise<void>;
    saveProfile: (p: Profile) => Promise<void>;
    answerBeat: (lesson: Lesson, beat: LessonBeat, idx: number, text: string) => Promise<{ feedback: string; score?: number }>;
    teachbackToPendant: (lesson: Lesson, beat: LessonBeat) => Promise<void>;
    scheduleMission: (lesson: Lesson, beat: LessonBeat) => Promise<Date>;
    completeLesson: (lesson: Lesson) => Promise<void>;
    gradeQuiz: (lesson: Lesson, answers: Array<number | string | null>) => Promise<QuizResult>;
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
  perQuestion: Array<{ correct: boolean; note?: string }>;
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

export function startApi(deps: ApiDeps, port: number): Server {
  const { db, log, actions } = deps;

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    let path = "/";
    let url = new URL("http://localhost/");

    try {
      // Transcripts live behind this API. Refuse anything not addressed to this machine by name,
      // which is what a DNS-rebinding page would look like.
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") return json(res, 403, { error: "forbidden" });
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
        if (from !== "127.0.0.1" && from !== "localhost" && from !== "[::1]") return json(res, 403, { error: "forbidden" });
      }
      try {
        url = new URL(req.url ?? "/", "http://localhost");
        path = url.pathname;
      } catch {
        return json(res, 400, { error: "bad request" });
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
          });
        }
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
          });
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
        if (head === "reflect" && method === "POST") {
          void actions.reflectNow();
          return json(res, 202, { ok: true });
        }

        // ---- sparks / practice
        if (head === "sparks" && method === "GET") return json(res, 200, db.cardsWithItems(100));
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
          if (tail === "quiz" && method === "POST") {
            const { answers } = await readBody<{ answers: Array<number | string | null> }>(req);
            return json(res, 200, await actions.gradeQuiz(lesson, answers));
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

  server.listen(port, "127.0.0.1", () => log(`dashboard + api on http://127.0.0.1:${port}`));
  return server;
}
