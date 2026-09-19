import { systemBlocks, voiceGuide, write, type Lesson, type RhubarbDb } from "@rhubarb/core";

export interface TutorMsg {
  role: "user" | "assistant";
  content: string;
}

const ROLE = `You are the tutor inside a Rhubarb lesson. The reader has the lesson open and is pushing back, asking why, or asking for a different example. Answer in the house voice, briefly (a paragraph or two), grounded in the lesson and in the moments from their own week quoted below. If they are right and the lesson was wrong or unclear, say so plainly. Never restate what they just said before answering.`;

/** Stream a tutor reply scoped to one lesson. Returns the full text. */
export async function tutorReply(db: RhubarbDb, lesson: Lesson, history: TutorMsg[], onText: (t: string) => void): Promise<string> {
  const skill = db.getSkill(lesson.skillId);
  const evidence = skill ? db.evidenceForSkill(skill.id).slice(-8) : [];
  const profile = db.getProfile();
  const context = `## Skill\n${skill?.name ?? "(unknown)"}\n\n## The lesson they are reading\n${lesson.bodyMd}\n\n## Moments from their week\n${
    evidence.map((e) => `- ${e.spokenAt}: "${e.text}"`).join("\n") || "(none)"
  }\n\n## Reader\n${profile ? `${profile.name}, prefers ${profile.style} teaching` : "no profile"}`;

  return write({
    quick: true,
    maxTokens: 1500,
    system: systemBlocks(voiceGuide(), `${ROLE}\n\n${context}`),
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    onText,
  });
}
