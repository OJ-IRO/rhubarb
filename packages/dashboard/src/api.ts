import type { Card, Evidence, FieldEvidence, Item, LadderLevel, Lesson, LessonBeat, LessonSession, Practice, Profile, Skill } from "@rhubarb/core";

export type { Card, Evidence, FieldEvidence, Item, LadderLevel, Lesson, LessonBeat, LessonSession, Practice, Profile, Skill };

/** A spark card, and the lesson it became if the reader asked for the whole story. */
export interface SparkRow {
  card: Card;
  item: Item;
  lessonSkillId?: number | null;
  /** the lines around it, when it came from a conversation */
  context?: string | null;
  editedAt?: number | null;
  rewrite?: { state: "writing" | "done" | "failed"; at: number; reason?: string } | null;
}

/** One day as it happened: where, what was noticed, and what came of it. */
export interface DayDetail {
  day: string;
  utterances: number;
  places: string[];
  moments: Evidence[];
  sparks: Array<{ card: Card; item: Item }>;
  skills: Array<{ id: number; name: string; status: Skill["status"]; kind: Skill["kind"]; moments: number; lessonId: number | null }>;
}

export interface SkillRow extends Skill {
  evidenceCount: number;
  ladderLength: number;
  lessonReady: boolean;
  lessonId: number | null;
}

export interface Today {
  profile: Profile | null;
  letter: string | null;
  letterDate: string | null;
  lesson: { lesson: Lesson; skill: Skill; ladderLength?: number } | null;
  duePractice: Practice[];
  dueCards: Array<{ cardId: number; dueAt: number; card: Card | null }>;
  proposed: number;
  active: number;
  sparks: Array<{ card: Card; item: Item }>;
  /** alarms not yet fired, soonest first */
  upcoming: Practice[];
  /** ISO time of the next learning window, or null if none is set */
  nextSlot: string | null;
}

export interface SkillDetail {
  skill: Skill;
  ladder: LadderLevel[];
  evidence: Evidence[];
  lessons: Lesson[];
  practice: Practice[];
  fieldEvidence: FieldEvidence[];
  rewrite?: RewriteStatus | null;
  /** days its moments came from, newest first (YYYY-MM-DD) */
  days?: string[];
}

export interface LessonView {
  lesson: Lesson;
  skill: Skill | null;
  ladder: LadderLevel[];
  session: LessonSession | null;
}

export interface Listening {
  state: "connecting" | "connected" | "down";
  lastHeardAt: number | null;
  since: number;
}

/** Whether Claude answered last time Rhubarb asked. `problem` is plain words, null when fine. */
export interface ClaudeHealth {
  problem: string | null;
  since: number | null;
  lastOkAt: number | null;
}

export interface RewriteStatus {
  state: "writing" | "done" | "failed";
  at: number;
  lessonId?: number;
  reason?: string;
}

/** What Claude has cost, at list price. */
export interface UsageSummary {
  today: number;
  week: number;
  total: number;
  since: number | null;
  byPurpose: Array<{ purpose: string; calls: number; cost: number; input: number; output: number }>;
  byDay: Array<{ day: string; cost: number }>;
  /** dollars per day; 0 means no cap */
  budget: number;
}

export interface Status {
  skills: number;
  evidence: number;
  openPractice: number;
  listening: Listening | null;
  claude?: ClaudeHealth;
  /** set when Rhubarb runs on a private server rather than this computer */
  hosted: { where: string } | null;
}

export type { LearningProgress, HistoryEntry, NudgePrefs } from "@rhubarb/core";

export interface PrivacyView {
  summary: { utterances: number; moments: number; voiceNotes: number; skills: number; lessons: number; since: string | null };
  days: Array<{ day: string; utterances: number; moments: number }>;
  moments: Evidence[];
}

export interface QuizResult {
  score: number;
  total: number;
  perQuestion: Array<{ correct: boolean; close?: boolean; note?: string }>;
  note: string;
}

/** Preview mode: sample content, no daemon. Toggled purely by the URL hash. */
export function isPreview(): boolean {
  return window.location.hash.startsWith("#/preview");
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (isPreview()) return previewCall<T>(path, init?.method ?? "GET", init?.body);
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error ?? res.statusText);
  return (await res.json()) as T;
}

interface PreviewState {
  rows: SkillRow[];
  privacy: PrivacyView;
  cards: SparkRow[];
  budget?: number;
  review?: import("@rhubarb/core").DayReview | null;
  profile: Profile;
  lastQuiz?: QuizResult;
}
let pv: PreviewState | null = null;

/**
 * Preview mode keeps a little state of its own. Without it every button was a dead end: you could
 * press "Not this" on the sample board and nothing happened, which reads as a broken app.
 * Reloading the page puts the sample content back.
 */
function previewState(f: typeof import("./fixtures")): PreviewState {
  pv ??= { rows: structuredClone(f.skillRows), privacy: structuredClone(f.privacy), cards: structuredClone(f.cards), profile: structuredClone(f.profile), review: f.sampleReview(localDay(Date.now() - 86_400_000)) };
  return pv;
}

async function previewCall<T>(path: string, method: string, body?: BodyInit | null): Promise<T> {
  const f = await import("./fixtures");
  await new Promise((r) => setTimeout(r, 120));
  const as = (v: unknown) => v as T;
  const st = previewState(f);
  let m: RegExpMatchArray | null;

  if (path === "/status") return as({ hosted: null, skills: st.rows.length, evidence: 14, openPractice: 1, listening: { state: "connected", lastHeardAt: Date.now() - 2 * 60_000, since: Date.now() - 3 * 3600_000 } });
  if (path === "/skills" && method === "GET") return as(st.rows.filter((s) => s.status !== "dismissed"));
  if (path === "/skills/dismissed") return as(st.rows.filter((s) => s.status === "dismissed"));
  if ((m = path.match(/^\/skills\/(\d+)\/reading$/)) && body) {
    const reading = (JSON.parse(String(body)) as { reading: import("@rhubarb/core").ReadingLevel }).reading;
    const row = st.rows.find((r) => r.id === Number(m![1]));
    if (row) row.reading = reading;
    return as(row ?? null);
  }
  if (path === "/skills/start" && body) {
    const { idea, familiarity } = JSON.parse(String(body)) as { idea: string; familiarity: import("@rhubarb/core").Familiarity | null };
    const id = Math.max(...st.rows.map((r) => r.id)) + 1;
    st.rows.push({ ...st.rows[0], id, name: idea.charAt(0).toUpperCase() + idea.slice(1), brief: `You asked for this on the board. Rhubarb is writing it now.`, status: "active", priority: 92, kind: "topic", origin: "asked", familiarity, reading: null, level: 0, evidenceCount: 0, ladderLength: 1, lessonReady: false, lessonId: null });
    return as({ skillId: id });
  }
  if ((m = path.match(/^\/skills\/(\d+)\/(accept|dismiss|restore|priority)$/))) {
    const row = st.rows.find((s) => s.id === Number(m![1]));
    if (row) {
      if (m[2] === "dismiss") row.status = "dismissed";
      if (m[2] === "restore") row.status = "proposed";
      if (m[2] === "accept") Object.assign(row, { status: "active", ladderLength: row.ladderLength || 4, lessonReady: true, lessonId: 1 });
      if (m[2] === "priority" && body) row.priority = (JSON.parse(String(body)) as { priority: number }).priority;
    }
    return as(row ?? null);
  }
  if (path === "/review" && method === "GET") return as(st.review && st.review.status !== "done" ? st.review : null);
  if ((m = path.match(/^\/review\/(\d{4}-\d{2}-\d{2})(\/build)?$/))) {
    const day = m[1];
    if (m[2]) {
      st.review = { ...f.sampleReview(day), status: "building" };
      setTimeout(() => (st.review = f.sampleReview(day)), 2500);
      return as({ day, status: "building" });
    }
    if (method === "PUT" && body && st.review) {
      const patch = JSON.parse(String(body)) as { findings: Array<{ id: number; verdict: "right" | "wrong" | null; correction: string | null }>; questions: Array<{ id: number; answer: string | null }>; done?: boolean };
      for (const p of patch.findings) Object.assign(st.review.findings.find((x) => x.id === p.id) ?? {}, p);
      for (const q of patch.questions) Object.assign(st.review.questions.find((x) => x.id === q.id) ?? {}, q);
      if (patch.done) Object.assign(st.review, { status: "done", doneAt: Date.now() });
      return as({ review: st.review, dropped: patch.findings.filter((x) => x.verdict === "wrong").length, setAside: [] });
    }
    return as(st.review?.day === day ? st.review : null);
  }
  if (path === "/days") return as(st.privacy.days);
  if ((m = path.match(/^\/days\/(\d{4}-\d{2}-\d{2})$/))) {
    const day = m[1];
    const moments = f.evidence.filter((e) => localDay(e.spokenAt) === day).map((e) => ({ ...e, place: e.place ?? "Minato, Osaka" }));
    const ids = [...new Set(moments.map((e) => e.skillId).filter((x): x is number => Boolean(x)))];
    return as({
      day,
      utterances: st.privacy.days.find((d) => d.day === day)?.utterances ?? 0,
      places: [...new Set(moments.map((e) => e.place))],
      moments,
      sparks: st.cards.filter((c) => localDay(c.item.spokenAt) === day),
      skills: ids.map((id) => {
        const s = st.rows.find((r) => r.id === id)!;
        return { id, name: s.name, status: s.status, kind: s.kind, moments: moments.filter((e) => e.skillId === id).length, lessonId: s.lessonId };
      }),
    });
  }
  if ((m = path.match(/^\/sparks\/(\d+)\/said$/)) && body) {
    const row = st.cards.find((c) => c.card.id === Number(m![1]));
    const patch = JSON.parse(String(body)) as { text: string; context?: string };
    if (row) Object.assign(row, { item: { ...row.item, sourceText: patch.text }, context: patch.context ?? row.context, editedAt: Date.now() });
    return as({ ok: true });
  }
  if ((m = path.match(/^\/sparks\/(\d+)\/answer-again$/))) {
    const row = st.cards.find((c) => c.card.id === Number(m![1]));
    if (row) {
      row.rewrite = { state: "writing", at: Date.now() };
      setTimeout(() => (row.rewrite = { state: "done", at: Date.now() }), 6000);
    }
    return as({ ok: true });
  }
  if (path === "/usage") return as({ today: 0.84, week: 6.12, total: 11.4, since: Date.now() - 9 * 86_400_000, budget: st.budget ?? 3, byPurpose: [{ purpose: "lessons", calls: 38, cost: 4.1, input: 910_000, output: 88_000 }, { purpose: "spark answers", calls: 22, cost: 0.95, input: 160_000, output: 21_000 }, { purpose: "proposals and letter", calls: 9, cost: 0.61, input: 70_000, output: 12_000 }, { purpose: "sorting moments", calls: 140, cost: 0.46, input: 180_000, output: 11_000 }], byDay: [] });
  if (path === "/usage/budget" && body) {
    st.budget = (JSON.parse(String(body)) as { usd: number }).usd;
    return as({ budget: st.budget });
  }
  if (path === "/privacy" && method === "GET") return as(st.privacy);
  if ((m = path.match(/^\/privacy\/moments\/(\d+)$/))) {
    const gone = st.privacy.moments.find((e) => e.id === Number(m![1]));
    st.privacy.moments = st.privacy.moments.filter((e) => e !== gone);
    if (gone) {
      st.privacy.summary.moments--;
      st.privacy.summary.utterances--;
    }
    return as(st.privacy);
  }
  if ((m = path.match(/^\/privacy\/days\/(\d{4}-\d{2}-\d{2})$/))) {
    const day = st.privacy.days.find((d) => d.day === m![1]);
    if (day) {
      st.privacy.summary.utterances -= day.utterances;
      st.privacy.summary.moments -= day.moments;
      st.privacy.days = st.privacy.days.filter((d) => d !== day);
      st.privacy.moments = st.privacy.moments.filter((e) => localDay(e.spokenAt) !== day.day);
    }
    return as(st.privacy);
  }
  if (path === "/privacy/everything") {
    st.privacy = { summary: { utterances: 0, moments: 0, voiceNotes: 0, skills: 0, lessons: 0, since: null }, days: [], moments: [] };
    st.rows = [];
    return as(st.privacy);
  }
  if (path === "/today") return as({ ...f.today, profile: st.profile });
  if (path === "/profile") {
    if (method === "PUT" && body) st.profile = { ...st.profile, ...(JSON.parse(String(body)) as Partial<Profile>) };
    return as(st.profile);
  }
  if (path === "/sparks") return as(st.cards.map((c) => ({ ...c })));
  if (path === "/progress") return as(f.progress);
  if (path === "/history") return as(f.history);
  if ((m = path.match(/^\/moments\/(\d+)$/)) && method === "PUT" && body) {
    const e = f.skillDetail.evidence.find((x) => x.id === Number(m![1]));
    const patch = JSON.parse(String(body)) as { text?: string; context?: string };
    if (e) Object.assign(e, { ...(patch.text ? { text: patch.text } : {}), ...(patch.context !== undefined ? { context: patch.context } : {}), editedAt: Date.now() });
    return as(e ?? null);
  }
  if (/^\/skills\/\d+\/rewrite$/.test(path)) {
    (f.skillDetail as { rewrite?: unknown }).rewrite = { state: "writing", at: Date.now() };
    setTimeout(() => ((f.skillDetail as { rewrite?: unknown }).rewrite = { state: "done", at: Date.now(), lessonId: 1 }), 8000);
    return as({ ok: true });
  }
  if ((m = path.match(/^\/sparks\/(\d+)\/lesson$/))) {
    const row = st.cards.find((c) => c.card.id === Number(m![1]));
    await new Promise((r) => setTimeout(r, 600));
    if (row) row.lessonSkillId = 8;
    return as({ skillId: 8 });
  }
  if ((m = path.match(/^\/sparks\/(\d+)\/guess$/))) {
    const row = st.cards.find((c) => c.card.id === Number(m![1]));
    const text = body ? String((JSON.parse(String(body)) as { text?: string }).text ?? "").trim() : "";
    if (row) {
      await new Promise((r) => setTimeout(r, text ? 700 : 0));
      // the sample sparks: the Tempozan wheel's lights, and station departure tunes
      const close = /weather|forecast|rain|sun|tomorrow|door|leav|depart|clos/i.test(text);
      Object.assign(row.card, {
        guess: text,
        guessClose: text ? close : null,
        guessNote: text ? (close ? "That's the heart of it, and the rest of the answer is detail." : "Not quite, and most people guess something like that. Read on: the real answer is more practical than it looks.") : null,
      });
    }
    return as(row?.card ?? null);
  }
  // A copy, as a real server would send: handing back the same object hides changes from React.
  if ((m = path.match(/^\/skills\/(\d+)$/))) {
    // The plan that was clicked, around the sample lesson and moments.
    const row = st.rows.find((r) => r.id === Number(m![1]));
    const detail = structuredClone(f.skillDetail);
    const id = Number(m[1]);
    const own = f.evidence.filter((e) => e.skillId === id);
    return as({
      ...detail,
      skill: row ? { ...detail.skill, ...row } : detail.skill,
      ladder: id === 1 ? detail.ladder : [],
      lessons: id === 1 ? detail.lessons : [],
      practice: id === 1 ? detail.practice : [],
      fieldEvidence: id === 1 ? detail.fieldEvidence : [],
      evidence: own,
      days: [...new Set(own.map((e) => localDay(e.spokenAt)))].sort().reverse(),
    });
  }
  if (/^\/lessons\/\d+$/.test(path)) return as(f.lessonView);
  if (/^\/lessons\/\d+\/session$/.test(path)) return as({ id: 1, lessonId: 1, startedAt: Date.now(), completedAt: null, responses: "{}", tutor: "[]" });
  if (/\/beat\/\d+\/answer$/.test(path)) return as({ feedback: "You've got the request right. The part to add for level two is the answer: listen for a floor, then カウンター, and you know where to go.", score: 4 });
  if (/\/quiz$/.test(path)) {
    const answers = body ? (JSON.parse(String(body)) as { answers: Array<number | string> }).answers : [];
    const per = f.quiz.questions.map((q, i) => (q.kind === "mcq" ? { correct: answers[i] === q.answer } : { correct: false, close: true, note: "Nearly. You have the direction; the piece to add is that 〜の方(ほう) softens it to \"over toward\", so it isn't an order." }));
    const score = per.filter((p) => p.correct).length;
    const missed = per.length - score;
    const counts = ["None", "One", "Two", "Three", "Four", "Five"];
    const note =
      missed === 0
        ? "All of them. You can follow where a clerk sends you now; the next shop is the place to prove it."
        : score >= 4
          ? "That's a pass, and a comfortable one. The one you missed is covered on the floors card."
          : `${counts[missed] ?? missed} of these tripped you up, mostly the floors and what 聞(き)いてみてください asks you to do. Reread those two cards and try again tomorrow.`;
    pv!.lastQuiz = { score, total: per.length, perQuestion: per, note };
    return as(pv!.lastQuiz);
  }
  if (/\/quiz\/retry$/.test(path)) {
    const { idx } = JSON.parse(String(body)) as { idx: number; text: string };
    const r: QuizResult = pv!.lastQuiz ?? { score: 0, total: f.quiz.questions.length, perQuestion: f.quiz.questions.map(() => ({ correct: false })), note: "" };
    r.perQuestion[idx] = { correct: true, note: "That's it: \"over toward the first floor\", a softer way of pointing." };
    r.score = r.perQuestion.reduce((n, p) => n + (p.correct ? 1 : p.close ? 0.5 : 0), 0);
    return as(r);
  }
  if (/\/mission$/.test(path)) return as({ at: new Date(Date.now() + 15 * 3600_000).toISOString() });
  if (method !== "GET") return as({ ok: true });
  return as(null);
}

export const api = {
  today: () => call<Today>("/today"),
  profile: () => call<Profile | null>("/profile"),
  saveProfile: (p: Profile) => call<Profile>("/profile", { method: "PUT", body: JSON.stringify(p) }),
  skills: () => call<SkillRow[]>("/skills"),
  skill: (id: number) => call<SkillDetail>(`/skills/${id}`),
  acceptSkill: (id: number, familiarity?: import("@rhubarb/core").Familiarity | null, reading?: import("@rhubarb/core").ReadingLevel | null) =>
    call<Skill>(`/skills/${id}/accept`, { method: "POST", body: JSON.stringify({ familiarity: familiarity ?? null, reading: reading ?? null }) }),
  /** Start a lesson on anything typed on the board. */
  startFromIdea: (idea: string, familiarity: import("@rhubarb/core").Familiarity | null, reading?: import("@rhubarb/core").ReadingLevel | null) =>
    call<{ skillId: number }>("/skills/start", { method: "POST", body: JSON.stringify({ idea, familiarity, reading: reading ?? null }) }),
  /** How much reading help one language plan gives. */
  setPlanReading: (id: number, reading: import("@rhubarb/core").ReadingLevel) => call<Skill>(`/skills/${id}/reading`, { method: "PUT", body: JSON.stringify({ reading }) }),
  dismissSkill: (id: number) => call<Skill>(`/skills/${id}/dismiss`, { method: "POST" }),
  restoreSkill: (id: number) => call<Skill>(`/skills/${id}/restore`, { method: "POST" }),
  dismissedSkills: () => call<Skill[]>("/skills/dismissed"),
  status: () => call<Status>("/status"),
  usage: () => call<UsageSummary>("/usage"),
  setBudget: (usd: number) => call<{ budget: number }>("/usage/budget", { method: "PUT", body: JSON.stringify({ usd }) }),
  guess: (cardId: number, text: string) => call<Card>(`/sparks/${cardId}/guess`, { method: "POST", body: JSON.stringify({ text }) }),
  progress: () => call<import("@rhubarb/core").LearningProgress>("/progress"),
  history: () => call<import("@rhubarb/core").HistoryEntry[]>("/history"),
  privacy: () => call<PrivacyView>("/privacy"),
  forgetMoment: (id: number) => call<PrivacyView>(`/privacy/moments/${id}`, { method: "DELETE" }),
  forgetDay: (day: string) => call<PrivacyView>(`/privacy/days/${day}`, { method: "DELETE" }),
  eraseEverything: () => call<PrivacyView>("/privacy/everything", { method: "DELETE", body: JSON.stringify({ confirm: "erase everything" }) }),
  setPriority: (id: number, priority: number) => call<Skill>(`/skills/${id}/priority`, { method: "PUT", body: JSON.stringify({ priority }) }),
  reflect: () => call<{ ok: boolean }>("/reflect", { method: "POST" }),
  sparks: () => call<SparkRow[]>("/sparks"),
  /** Turn a spark into a full one-lesson topic. Returns the skill it became. */
  /** Correct what the transcript says for one moment: the line, the lines around it, or both. */
  editMoment: (id: number, patch: { text?: string; context?: string }) => call<Evidence>(`/moments/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  /** Write the current lesson again from the corrected moments. */
  rewriteLesson: (skillId: number) => call<{ ok: boolean }>(`/skills/${skillId}/rewrite`, { method: "POST" }),
  /** Correct what Bee heard for a spark. */
  fixSpark: (cardId: number, patch: { text: string; context?: string }) => call<{ ok: boolean }>(`/sparks/${cardId}/said`, { method: "PUT", body: JSON.stringify(patch) }),
  /** Answer a spark again from the corrected words. */
  answerSparkAgain: (cardId: number) => call<{ ok: boolean }>(`/sparks/${cardId}/answer-again`, { method: "POST" }),
  days: () => call<Array<{ day: string; utterances: number; moments: number }>>("/days"),
  /** The most recent day review still waiting, if any. */
  openReview: () => call<import("@rhubarb/core").DayReview | null>("/review"),
  review: (day: string) => call<import("@rhubarb/core").DayReview | null>(`/review/${day}`),
  buildReview: (day: string) => call<{ day: string; status: string }>(`/review/${day}/build`, { method: "POST" }),
  saveReview: (day: string, patch: { findings: Array<{ id: number; verdict: "right" | "wrong" | null; correction: string | null }>; questions: Array<{ id: number; answer: string | null }>; done?: boolean }) =>
    call<{ review: import("@rhubarb/core").DayReview; dropped?: number; setAside?: string[] }>(`/review/${day}`, { method: "PUT", body: JSON.stringify(patch) }),
  day: (day: string) => call<DayDetail>(`/days/${day}`),
  sparkLesson: (cardId: number) => call<{ skillId: number }>(`/sparks/${cardId}/lesson`, { method: "POST" }),
  lesson: (id: number) => call<LessonView>(`/lessons/${id}`),
  startSession: (id: number) => call<LessonSession>(`/lessons/${id}/session`, { method: "POST" }),
  saveResponses: (id: number, responses: Record<string, string>) =>
    call<LessonSession>(`/lessons/${id}/session`, { method: "PUT", body: JSON.stringify({ responses }) }),
  answerBeat: (id: number, idx: number, text: string) =>
    call<{ feedback: string; score?: number }>(`/lessons/${id}/beat/${idx}/answer`, { method: "POST", body: JSON.stringify({ text }) }),
  submitQuiz: (id: number, answers: Array<number | string | null>) =>
    call<QuizResult>(`/lessons/${id}/quiz`, { method: "POST", body: JSON.stringify({ answers }) }),
  retryQuiz: (id: number, idx: number, text: string) => call<QuizResult>(`/lessons/${id}/quiz/retry`, { method: "POST", body: JSON.stringify({ idx, text }) }),
  teachbackToPendant: (id: number) => call<{ ok: boolean }>(`/lessons/${id}/teachback/pendant`, { method: "POST" }),
  scheduleMission: (id: number) => call<{ at: string }>(`/lessons/${id}/mission`, { method: "POST" }),
  completeLesson: (id: number) => call<Lesson>(`/lessons/${id}/complete`, { method: "POST" }),
  async tutor(id: number, history: Array<{ role: "user" | "assistant"; content: string }>, onText: (t: string) => void): Promise<void> {
    if (isPreview()) {
      const reply = "Fair push. Some smaller shops do handle tax-free right at the register, so 免税(めんぜい)できますか can get a plain はい. The lesson leans on big stores because that's where you were sent downstairs, and that's where the floor numbers matter.";
      for (const word of reply.split(" ")) {
        await new Promise((r) => setTimeout(r, 30));
        onText(`${word} `);
      }
      return;
    }
    const res = await fetch(`/api/lessons/${id}/tutor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history }) });
    const reader = res.body?.getReader();
    if (!reader) return;
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      onText(dec.decode(value, { stream: true }));
    }
  },
};

/** YYYY-MM-DD on the reader's own calendar, matching how the daemon groups days. */
export function localDay(iso: string | number): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function when(iso: string | number): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
