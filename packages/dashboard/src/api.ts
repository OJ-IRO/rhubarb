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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error ?? res.statusText);
  return (await res.json()) as T;
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
  teachbackToPendant: (id: number) => call<{ ok: boolean }>(`/lessons/${id}/teachback/pendant`, { method: "POST" }),
  scheduleMission: (id: number) => call<{ at: string }>(`/lessons/${id}/mission`, { method: "POST" }),
  completeLesson: (id: number) => call<Lesson>(`/lessons/${id}/complete`, { method: "POST" }),
  async tutor(id: number, history: Array<{ role: "user" | "assistant"; content: string }>, onText: (t: string) => void): Promise<void> {
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
