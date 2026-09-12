import type { Card, Evidence, FieldEvidence, Item, LadderLevel, Lesson, LessonBeat, LessonSession, Practice, Profile, Skill } from "@waggle/core";

export type { Card, Evidence, FieldEvidence, Item, LadderLevel, Lesson, LessonBeat, LessonSession, Practice, Profile, Skill };

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
  lesson: { lesson: Lesson; skill: Skill } | null;
  duePractice: Practice[];
  dueCards: Array<{ cardId: number; dueAt: number; card: Card | null }>;
  proposed: number;
  active: number;
  sparks: Array<{ card: Card; item: Item }>;
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

export interface QuizResult {
  score: number;
  total: number;
  perQuestion: Array<{ correct: boolean; note?: string }>;
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

async function previewCall<T>(path: string, method: string, body?: BodyInit | null): Promise<T> {
  const f = await import("./fixtures");
  await new Promise((r) => setTimeout(r, 120));
  const as = (v: unknown) => v as T;
  if (path === "/today") return as(f.today);
  if (path === "/profile") return as(f.profile);
  if (path === "/skills") return as(f.skillRows);
  if (path === "/sparks") return as(f.cards);
  if (/^\/skills\/\d+$/.test(path)) return as(f.skillDetail);
  if (/^\/lessons\/\d+$/.test(path)) return as(f.lessonView);
  if (/^\/lessons\/\d+\/session$/.test(path)) return as({ id: 1, lessonId: 1, startedAt: Date.now(), completedAt: null, responses: "{}", tutor: "[]" });
  if (/\/beat\/\d+\/answer$/.test(path)) return as({ feedback: "You've got the gate right. The part you'd add for level two is what happens when it never opens: the rollout stalls, it doesn't break.", score: 4 });
  if (/\/quiz$/.test(path)) {
    const answers = body ? (JSON.parse(String(body)) as { answers: Array<number | string> }).answers : [];
    const per = f.quiz.questions.map((q, i) => (q.kind === "mcq" ? { correct: answers[i] === q.answer } : { correct: true, note: "Clear, and you named the stall as the safe failure. That's the level-two answer." }));
    const score = per.filter((p) => p.correct).length;
    return as({ score, total: per.length, perQuestion: per, note: score >= 4 ? "That's a pass, and a comfortable one. You can narrate a rollout now; Thursday is the place to prove it." : "Two of these tripped you up, both about what the readiness gate does. Reread the diagram card and try the quiz again tomorrow." });
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
  setPriority: (id: number, priority: number) => call<Skill>(`/skills/${id}/priority`, { method: "PUT", body: JSON.stringify({ priority }) }),
  reflect: () => call<{ ok: boolean }>("/reflect", { method: "POST" }),
  sparks: () => call<Array<{ card: Card; item: Item }>>("/sparks"),
  lesson: (id: number) => call<LessonView>(`/lessons/${id}`),
  startSession: (id: number) => call<LessonSession>(`/lessons/${id}/session`, { method: "POST" }),
  saveResponses: (id: number, responses: Record<string, string>) =>
    call<LessonSession>(`/lessons/${id}/session`, { method: "PUT", body: JSON.stringify({ responses }) }),
  answerBeat: (id: number, idx: number, text: string) =>
    call<{ feedback: string; score?: number }>(`/lessons/${id}/beat/${idx}/answer`, { method: "POST", body: JSON.stringify({ text }) }),
  submitQuiz: (id: number, answers: Array<number | string | null>) =>
    call<QuizResult>(`/lessons/${id}/quiz`, { method: "POST", body: JSON.stringify({ answers }) }),
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

export function when(iso: string | number): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
