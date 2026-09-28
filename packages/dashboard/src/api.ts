import type { Card, Evidence, FieldEvidence, Item, LadderLevel, Lesson, LessonBeat, LessonSession, Practice, Profile, Skill } from "@rhubarb/core";

export type { Card, Evidence, FieldEvidence, Item, LadderLevel, Lesson, LessonBeat, LessonSession, Practice, Profile, Skill };

/** A spark card, and the lesson it became if the reader asked for the whole story. */
export interface SparkRow {
  card: Card;
  item: Item;
  lessonSkillId?: number | null;
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

export interface Status {
  skills: number;
  evidence: number;
  openPractice: number;
  listening: Listening | null;
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
  pv ??= { rows: structuredClone(f.skillRows), privacy: structuredClone(f.privacy), cards: structuredClone(f.cards), profile: structuredClone(f.profile) };
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
  if (path === "/sparks") return as(st.cards);
  if (path === "/progress") return as(f.progress);
  if (path === "/history") return as(f.history);
  if ((m = path.match(/^\/moments\/(\d+)$/)) && method === "PUT" && body) {
    const e = f.skillDetail.evidence.find((x) => x.id === Number(m![1]));
    const patch = JSON.parse(String(body)) as { text?: string; context?: string };
    if (e) Object.assign(e, { ...(patch.text ? { text: patch.text } : {}), ...(patch.context !== undefined ? { context: patch.context } : {}), editedAt: Date.now() });
    return as(e ?? null);
  }
  if (/^\/skills\/\d+\/rewrite$/.test(path)) return as({ ok: true });
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
      const close = /stress|corner|crack|pressur|fatigue/i.test(text);
      Object.assign(row.card, {
        guess: text,
        guessClose: text ? close : null,
        guessNote: text ? (close ? "That's the heart of it. The corners are where the stress gathers, and that's what the real answer turns on." : "Not quite, and most people land there. The real answer turns on where stress collects in a shape, not on how it looks or flies.") : null,
      });
    }
    return as(row?.card ?? null);
  }
  if (/^\/skills\/\d+$/.test(path)) return as(f.skillDetail);
  if (/^\/lessons\/\d+$/.test(path)) return as(f.lessonView);
  if (/^\/lessons\/\d+\/session$/.test(path)) return as({ id: 1, lessonId: 1, startedAt: Date.now(), completedAt: null, responses: "{}", tutor: "[]" });
  if (/\/beat\/\d+\/answer$/.test(path)) return as({ feedback: "You've got the gate right. The part you'd add for level two is what happens when it never opens: the rollout stalls, it doesn't break.", score: 4 });
  if (/\/quiz$/.test(path)) {
    const answers = body ? (JSON.parse(String(body)) as { answers: Array<number | string> }).answers : [];
    const per = f.quiz.questions.map((q, i) => (q.kind === "mcq" ? { correct: answers[i] === q.answer } : { correct: false, close: true, note: "You have the gate right. What is missing is what happens when it never opens: the rollout stalls, it does not break. Add that and you have it." }));
    const score = per.filter((p) => p.correct).length;
    const missed = per.length - score;
    const counts = ["None", "One", "Two", "Three", "Four", "Five"];
    const note =
      missed === 0
        ? "All of them. You can narrate a rollout now; Thursday is the place to prove it."
        : score >= 4
          ? "That's a pass, and a comfortable one. The one you missed is about what the readiness gate does; the diagram card covers it."
          : `${counts[missed] ?? missed} of these tripped you up, mostly around what the readiness gate does. Reread the diagram card and try the quiz again tomorrow.`;
    pv!.lastQuiz = { score, total: per.length, perQuestion: per, note };
    return as(pv!.lastQuiz);
  }
  if (/\/quiz\/retry$/.test(path)) {
    const { idx } = JSON.parse(String(body)) as { idx: number; text: string };
    const r: QuizResult = pv!.lastQuiz ?? { score: 0, total: f.quiz.questions.length, perQuestion: f.quiz.questions.map(() => ({ correct: false })), note: "" };
    r.perQuestion[idx] = { correct: true, note: "That's it. The listener is what decides the form, and you named it." };
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
  acceptSkill: (id: number) => call<Skill>(`/skills/${id}/accept`, { method: "POST" }),
  dismissSkill: (id: number) => call<Skill>(`/skills/${id}/dismiss`, { method: "POST" }),
  restoreSkill: (id: number) => call<Skill>(`/skills/${id}/restore`, { method: "POST" }),
  dismissedSkills: () => call<Skill[]>("/skills/dismissed"),
  status: () => call<Status>("/status"),
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
      const reply = "Fair push. The lesson says \"never zero pods,\" and that's true of the rolling strategy as configured here, but it depends on maxUnavailable. Set it to 100% and you've effectively got a recreate deploy. The safe default is 25%, which is what Maya's cluster uses.";
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
