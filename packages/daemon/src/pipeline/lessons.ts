import {
  classify,
  lintProse,
  MODELS,
  systemBlocks,
  voiceGuide,
  type BeeClient,
  type LessonBeat,
  type Profile,
  type Skill,
  type WaggleDb,
} from "@waggle/core";
import { z } from "zod";
import { researchThenEmit } from "./research.js";

const Ladder = z.object({
  levels: z
    .array(z.object({ title: z.string(), outcome: z.string().describe("starts with 'can': what the learner can do at this level") }))
    .min(3)
    .max(6),
});

const LessonOut = z.object({
  bodyMd: z.string().describe("the lesson itself, in markdown, written for this reader in the house voice"),
  beats: z
    .array(
      z.object({
        kind: z.enum(["checkin", "scenario", "teachback", "mission"]),
        prompt: z.string().describe("what the learner is asked to do; the teachback prompt is spoken aloud into their pendant, so keep it to one or two sentences"),
        rubric: z.string().describe("what a good response contains; used for grading, never shown"),
      })
    )
    .length(4),
  citations: z.array(z.object({ title: z.string(), url: z.string() })),
});

const LADDER_ROLE = `You design competence ladders for Waggle. Given a skill and what the learner's life is asking of them, lay out three to six levels from 'can follow the conversation' to 'can teach it', each a concrete outcome. Levels should be about what they can do, not what they know.`;

const STYLE_NOTES: Record<Profile["style"], string> = {
  story: "Teach through a narrative: a situation unfolds, the concept becomes necessary, the learner sees it work. Characters and stakes from the reader's own week where possible.",
  "hands-on": "Teach by doing: short explanation, then a concrete thing to try immediately, then what to notice. Minimize preamble.",
  socratic: "Teach by asking: pose a question, let the reader think, then reveal. Build from what they already said toward what they were missing.",
  structured: "Teach cleanly: the idea, why it matters, how it works, where it breaks. Prose paragraphs, not bullets, but with a clear spine.",
  analogy: "Teach through one strong analogy carried through the whole lesson, then explicitly show where the analogy stops holding.",
};

function lessonRole(profile: Profile | null): string {
  const style = profile?.style ?? "story";
  const minutes = profile?.sessionMinutes ?? 10;
  return `You write Waggle's lessons. One reader, one skill, one level of the ladder. The lesson should take about ${minutes} minutes to read and think through.

Learning style: ${STYLE_NOTES[style]}

Use the reader's own moments as the examples: quote what they or the people around them actually said, and name when it happened. That is the whole point of Waggle; a lesson that could have been written for anyone has failed.

After the lesson body, design four beats in this order: checkin (a quick question to confirm they followed), scenario (a situation to reason through, ideally drawn from their week), teachback (they will explain this aloud into their pendant; one or two sentences of prompt), mission (something specific to try in a real conversation tomorrow).

Ground factual claims in searched sources when the skill is factual or technical; cite only what you used.`;
}

export interface LessonDeps {
  db: WaggleDb;
  bee: BeeClient;
  log: (msg: string) => void;
}

export async function ensureLadder(deps: LessonDeps, skill: Skill): Promise<void> {
  const { db, log } = deps;
  if (db.ladderFor(skill.id).length > 0) return;
  const out = await classify({
    model: MODELS.writer,
    effort: "medium",
    system: LADDER_ROLE,
    user: `Skill: ${skill.name}\nDomain: ${skill.domain ?? "(unspecified)"}\nWhat competent use sounds like: ${skill.competentLooksLike}\nWhy it matters to them:\n${skill.brief}`,
    schema: Ladder,
    maxTokens: 3000,
  });
  db.replaceLadder(skill.id, out.levels);
  log(`ladder for #${skill.id} ${skill.name}: ${out.levels.map((l) => l.title).join(" -> ")}`);
}

/** Write the lesson for the skill's current level, gate it through the voice check, store it, and nudge the reader. */
export async function generateLesson(deps: LessonDeps, skill: Skill, levelIdx: number): Promise<number> {
  const { db, bee, log } = deps;
  const profile = db.getProfile();
  const ladder = db.ladderFor(skill.id);
  const level = ladder.find((l) => l.idx === levelIdx);
  if (!level) throw new Error(`no ladder level ${levelIdx} for skill ${skill.id}`);
  const evidence = db.evidenceForSkill(skill.id);
  const earlier = db.lessonsForSkill(skill.id).filter((l) => l.levelIdx < levelIdx);

  const system = systemBlocks(voiceGuide(), lessonRole(profile));
  const baseAsk = `## Skill\n${skill.name}${skill.domain ? ` (${skill.domain})` : ""}\nCompetent use sounds like: ${skill.competentLooksLike}\n\n## This level (${levelIdx + 1} of ${ladder.length}): ${level.title}\nOutcome: ${level.outcome}\n${
    earlier.length ? `\nEarlier levels already covered: ${earlier.map((l) => ladder[l.levelIdx]?.title).join(", ")}` : ""
  }\n\n## Why this skill is on their board\n${skill.brief}\n\n## Moments from their life to draw on\n${
    evidence.map((e) => `- ${e.spokenAt}${e.speakerLabel ? ` (${e.speakerLabel})` : ""}: "${e.text}"${e.context ? `\n  around it:\n  ${e.context.replace(/\n/g, "\n  ")}` : ""}`).join("\n") || "(none recorded)"
  }\n\n## Reader\n${profile ? `${profile.name}; goals: ${profile.goals.join("; ") || "none stated"}` : "no profile yet"}`;

  const research = (feedback?: string[]) =>
    researchThenEmit({
      system,
      ask: feedback?.length ? `${baseAsk}\n\nA previous draft was rejected by the editor for: ${feedback.join("; ")}. Fix those without losing the substance.` : baseAsk,
      schema: LessonOut,
      emitName: "emit_lesson",
      emitDescription: "Return the finished lesson with its four beats.",
      maxSearches: 3,
      effort: "high",
      maxTokens: 16000,
    });

  let out = await research();
  const lint = lintProse([out.bodyMd, ...out.beats.map((b) => b.prompt)].join("\n\n"));
  if (!lint.ok) {
    log(`lesson for #${skill.id} L${levelIdx} failed lint (${lint.issues.map((i) => i.rule).join(",")}); regenerating`);
    out = await research(lint.issues.map((i) => `${i.rule}: ${i.detail}`));
  }

  const lessonId = db.insertLesson({
    skillId: skill.id,
    levelIdx,
    style: profile?.style ?? "story",
    bodyMd: out.bodyMd,
    beats: out.beats as LessonBeat[],
    citations: out.citations,
  });
  db.setLevelStatus(skill.id, levelIdx, "current");
  log(`lesson #${lessonId} ready: ${skill.name} / ${level.title}`);

  const minutes = profile?.sessionMinutes ?? 10;
  const nudge = `Your ${skill.name} lesson is ready. About ${minutes} minutes, whenever you're at your desk.`;
  await bee.createTodo(nudge, new Date(Date.now() + 2 * 60_000).toISOString()).catch((e: Error) => log(`lesson nudge failed: ${e.message}`));
  return lessonId;
}

/** Called when a skill is accepted from the board: build its ladder and first lesson. */
export async function startSkill(deps: LessonDeps, skillId: number): Promise<void> {
  const skill = deps.db.getSkill(skillId);
  if (!skill) return;
  deps.db.updateSkill(skillId, { status: "active" });
  await ensureLadder(deps, skill);
  if (!deps.db.currentLesson(skillId, skill.level)) await generateLesson(deps, skill, skill.level);
}
