import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { Profile, WaggleDb } from "@waggle/core";

export interface ApiDeps {
  db: WaggleDb;
  log: (msg: string) => void;
  /** absolute path to the built dashboard (index.html + assets); optional in dev */
  staticDir?: string;
  actions: {
    reflectNow: () => Promise<void>;
    acceptSkill: (id: number) => Promise<void>;
    dismissSkill: (id: number) => Promise<void>;
  };
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

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

function serveStatic(res: ServerResponse, dir: string, urlPath: string): boolean {
  const rel = normalize(urlPath === "/" ? "/index.html" : urlPath).replace(/^(\.\.[/\\])+/, "");
  let file = join(dir, rel);
  if (!file.startsWith(dir)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html"); // SPA fallback
  if (!existsSync(file)) return false;
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
  return true;
}

export function startApi(deps: ApiDeps, port: number): void {
  const { db, log } = deps;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";

    try {
      if (path.startsWith("/api/")) {
        const parts = path.slice(5).split("/").filter(Boolean);
        const [head, idStr, tail] = parts;
        const id = idStr ? Number(idStr) : NaN;

        if (head === "status" && method === "GET") {
          return json(res, 200, {
            profile: db.getProfile(),
            skills: db.skillsByStatus(["proposed", "active"]).length,
            evidence: db.evidenceByStage("classified", 1000).length,
            openPractice: db.openPractice().length,
          });
        }
        if (head === "profile" && method === "GET") return json(res, 200, db.getProfile());
        if (head === "profile" && method === "PUT") {
          const body = (await readBody(req)) as Profile;
          db.setProfile({ ...body, onboardedAt: body.onboardedAt ?? Date.now() });
          return json(res, 200, db.getProfile());
        }
        if (head === "evidence" && method === "GET") {
          const stage = (url.searchParams.get("stage") as "detected" | "classified") ?? "classified";
          return json(res, 200, db.evidenceByStage(stage, 200));
        }
        if (head === "skills" && method === "GET" && !idStr) {
          return json(res, 200, db.skillsByStatus(["proposed", "active", "mastered"]));
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
          await deps.actions.acceptSkill(id);
          return json(res, 200, db.getSkill(id));
        }
        if (head === "skills" && idStr && tail === "dismiss" && method === "POST") {
          await deps.actions.dismissSkill(id);
          return json(res, 200, db.getSkill(id));
        }
        if (head === "reflect" && method === "POST") {
          await deps.actions.reflectNow();
          return json(res, 200, { ok: true });
        }
        if (head === "sparks" && method === "GET") return json(res, 200, db.cardsWithItems(100));
        if (head === "lessons" && idStr && method === "GET") {
          const lesson = db.getLesson(id);
          if (!lesson) return json(res, 404, { error: "not found" });
          return json(res, 200, { lesson, session: db.latestSessionForLesson(id) });
        }
        if (head === "practice" && method === "GET") return json(res, 200, db.openPractice());
        return json(res, 404, { error: `no route ${method} ${path}` });
      }

      if (deps.staticDir && method === "GET" && serveStatic(res, deps.staticDir, path)) return;
      json(res, 404, { error: "not found" });
    } catch (e) {
      log(`api error ${method} ${path}: ${(e as Error).message}`);
      json(res, 500, { error: (e as Error).message });
    }
  });

  server.listen(port, "127.0.0.1", () => log(`dashboard + api on http://127.0.0.1:${port}`));
}
