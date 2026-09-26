import {
  ALL_NUDGES,
  classify,
  lintProse,
  MODELS,
  systemBlocks,
  voiceGuide,
  type BeeClient,
  type Deck,
  type LessonBeat,
  type Profile,
  type Quiz,
  type Skill,
  type Slide,
  type RhubarbDb,
  checkLesson,
  withoutInventedQuotes,
  judge,
  type LessonReview,
} from "@rhubarb/core";
import { z } from "zod";
import { resolveImage, sanitizeMermaid, urlAlive } from "./images.js";
import { researchThenEmit } from "./research.js";
import { nextLearningSlot } from "./schedule.js";

const Ladder = z.object({
  levels: z
    .array(z.object({ title: z.string(), outcome: z.string().describe("starts with 'can': what the learner can do at this level") }))
    .min(3)
    .max(6),
});

const SlideSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cover"), title: z.string(), subtitle: z.string(), hook: z.string().describe("one or two sentences that make the reader want the next card") }),
  z.object({ kind: z.literal("text"), heading: z.string(), body: z.string().describe("one to three short paragraphs, markdown allowed, no headers"), aside: z.string().optional() }),
  z.object({ kind: z.literal("keyidea"), statement: z.string().describe("one sentence, the thing to keep"), why: z.string() }),
  z.object({
    kind: z.literal("diagram"),
    heading: z.string(),
    mermaid: z.string().describe("Mermaid source only: flowchart LR/TD, sequenceDiagram, or stateDiagram-v2; at most 12 nodes; plain labels, no styling"),
    caption: z.string(),
  }),
  z.object({
    kind: z.literal("image"),
    heading: z.string(),
    query: z.string().describe("a short image search query likely to find a real photo or diagram on Wikimedia Commons"),
    alt: z.string(),
    caption: z.string(),
  }),
  z.object({ kind: z.literal("example"), heading: z.string(), quote: z.string().describe("verbatim from the reader's evidence"), when: z.string(), who: z.string().optional(), explanation: z.string() }),
  z.object({ kind: z.literal("steps"), heading: z.string(), steps: z.array(z.object({ title: z.string(), body: z.string() })).min(2).max(6) }),
  z.object({ kind: z.literal("compare"), heading: z.string(), columns: z.array(z.object({ title: z.string(), points: z.array(z.string()).min(2).max(4) })).min(2).max(3) }),
  z.object({ kind: z.literal("learnmore"), links: z.array(z.object({ title: z.string(), url: z.string(), why: z.string() })).min(1).max(4) }),
]);

const LessonOut = z.object({
  deck: z.object({
    title: z.string(),
    subtitle: z.string(),
    minutes: z.number().int().min(3).max(30),
    slides: z.array(SlideSchema).min(7).max(14),
  }),
  quiz: z.object({
    questions: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("mcq"), prompt: z.string(), choices: z.array(z.string()).length(4), answer: z.number().int().min(0).max(3), explanation: z.string() }),
          z.object({ kind: z.literal("short"), prompt: z.string(), rubric: z.string().describe("what a good answer contains; never shown") }),
        ])
      )
      .min(4)
      .max(7),
  }),
  bodyMd: z.string().describe("the same lesson as flowing prose, for the tutor and for readers who prefer text"),
  beats: z
    .array(
      z.object({
        kind: z.enum(["checkin", "scenario", "teachback", "mission"]),
        prompt: z.string().describe("the teachback prompt is answered aloud into a Bee wearable: one or two sentences"),
        rubric: z.string(),
      })
    )
    .length(4),
  citations: z.array(z.object({ title: z.string(), url: z.string() })),
});

const LADDER_ROLE = `You design competence ladders for Rhubarb. Given a skill and what the learner's life is asking of them, lay out three to six levels from 'can follow the conversation' to 'can teach it', each a concrete outcome. Levels should be about what they can do, not what they know.`;

const STYLE_NOTES: Record<Profile["style"], string> = {
  story: "Teach through a narrative: a situation unfolds, the concept becomes necessary, the learner sees it work. Characters and stakes from the reader's own week where possible.",
  "hands-on": "Teach by doing: short explanation, then a concrete thing to try immediately, then what to notice. Minimize preamble.",
  socratic: "Teach by asking: pose a question, let the reader think, then reveal. Build from what they already said toward what they were missing.",
  structured: "Teach cleanly: the idea, why it matters, how it works, where it breaks. Clear spine, no filler.",
  analogy: "Teach through one strong analogy carried through the whole lesson, then explicitly show where the analogy stops holding.",
};

function lessonRole(profile: Profile | null): string {
  const style = profile?.style ?? "story";
  const minutes = profile?.sessionMinutes ?? 10;
  return `You design Rhubarb lessons as a deck of cards. One reader, one skill, one level of the ladder. About ${minutes} minutes to work through.

Learning style: ${STYLE_NOTES[style]}

Deck rules:
- 8 to 12 cards. Open with a cover whose hook promises something specific. Close with learnmore.
- At least one example card built from a real moment in the reader's evidence: quote it verbatim, say when, name who if known, then explain what was actually going on. This card is the reason Rhubarb exists; a deck without it has failed.
- Exactly one diagram card when the idea has structure (a flow, a sequence, states). Mermaid only: flowchart, sequenceDiagram, or stateDiagram-v2, at most 12 nodes, short plain labels, no styling or class lines. If a diagram would be forced, use a steps card instead.
- One or two image cards where a real photo or diagram would help. Give a search query that will actually find something on Wikimedia Commons (concrete nouns, no jargon), plus a caption that does teaching work on its own.
- One keyidea card: the single sentence to keep.
- Text cards carry one idea each, one to three short paragraphs, no bullet lists, no headers inside the body.
- learnmore: two to four real, specific URLs from the sources you searched. Never invent a URL.

Then a quiz of 4 to 7 questions that test understanding, not vocabulary: mostly multiple choice with four plausible choices and a one-sentence explanation of the right answer, plus one short-answer question with a grading rubric.

Then four beats in order: checkin, scenario (from their week), teachback (spoken aloud), mission (something to try in a real conversation tomorrow). And bodyMd: the lesson as flowing prose.

Every word follows the writing guide. The reader's own moments are the examples.`;
}

export interface LessonDeps {
  db: RhubarbDb;
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

/** Resolve images, drop dead links, sanitize diagrams. Returns the cleaned deck. */
async function finishDeck(deck: Deck, log: (m: string) => void): Promise<Deck> {
  const slides: Slide[] = [];
  for (const s of deck.slides) {
    if (s.kind === "image") {
      const img = await resolveImage(s.query);
      if (!img) {
        log(`deck: no image found for "${s.query}", dropping card`);
        continue;
      }
      slides.push({ ...s, url: img.url, credit: img.credit });
    } else if (s.kind === "diagram") {
      const clean = sanitizeMermaid(s.mermaid);
      if (!clean) {
        log("deck: diagram rejected, replacing with text card");
        slides.push({ kind: "text", heading: s.heading, body: s.caption });
        continue;
      }
      slides.push({ ...s, mermaid: clean });
    } else if (s.kind === "learnmore") {
      const links = [];
      for (const l of s.links) if (await urlAlive(l.url)) links.push(l);
      if (links.length > 0) slides.push({ ...s, links });
      else log("deck: all learn-more links dead, dropping card");
    } else {
      slides.push(s);
    }
  }
  return { ...deck, slides };
}

function deckProse(deck: Deck): string {
  return deck.slides
    .map((s) => {
      switch (s.kind) {
        case "cover":
          return `${s.title}\n${s.hook}`;
        case "text":
          return `${s.heading}\n${s.body}${s.aside ? `\n${s.aside}` : ""}`;
        case "keyidea":
          return `${s.statement}\n${s.why}`;
        case "diagram":
        case "image":
          return `${s.heading}\n${s.caption}`;
        case "example":
          return `${s.heading}\n${s.explanation}`;
        case "steps":
          return `${s.heading}\n${s.steps.map((x) => `${x.title}: ${x.body}`).join("\n")}`;
        case "compare":
          return `${s.heading}\n${s.columns.map((c) => `${c.title}: ${c.points.join("; ")}`).join("\n")}`;
        case "learnmore":
          return s.links.map((l) => l.why).join("\n");
      }
    })
    .join("\n\n");
}

/** Write the deck for the skill's current level, gate it through the voice check, store it, and nudge the reader. */
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
  }\n\n## Reader\n${profile ? `goals: ${profile.goals.join("; ") || "none stated"}` : "no profile yet"}`;

  const research = (feedback?: string[]) =>
    researchThenEmit({
      system,
      ask: feedback?.length ? `${baseAsk}\n\nA previous draft was rejected by the editor for: ${feedback.join("; ")}. Fix those without losing the substance.` : baseAsk,
      schema: LessonOut,
      emitName: "emit_lesson",
      emitDescription: "Return the finished deck, quiz, beats, prose, and citations.",
      maxSearches: 4,
      effort: "high",
      maxTokens: 20000,
    });

  let out = await research();
  const lint = lintProse(deckProse(out.deck as Deck));
  if (!lint.ok) {
    log(`lesson for #${skill.id} L${levelIdx} failed lint (${lint.issues.map((i) => i.rule).join(",")}); regenerating`);
    out = await research(lint.issues.map((i) => `${i.rule}: ${i.detail}`));
  }

  // A second reader checks what code cannot: are the facts right, and is it pitched at this level?
  // A confident error is the worst thing a lesson can contain, so a doubted draft is rewritten once
  // with the reader's notes, and the rewrite is read again. Whatever the outcome, it is recorded.
  let opinion = await secondOpinion(skill, level, out.bodyMd).catch((e: Error) => {
    log(`lesson for #${skill.id} L${levelIdx}: second reader unavailable (${e.message})`);
    return null;
  });
  if (opinion && !opinion.accurate) {
    log(`lesson for #${skill.id} L${levelIdx}: second reader doubts the facts; rewriting once. ${opinion.accuracyNote}`);
    out = await research([`a fact-checker found errors: ${opinion.accuracyNote}`, ...(opinion.rightLevel ? [] : [`pitched at the wrong level: ${opinion.levelNote}`])]);
    opinion = await secondOpinion(skill, level, out.bodyMd).catch(() => null);
  }

  // Everything the writer was shown from the learner's life. A quoted moment must trace back to it.
  const heard = evidence.flatMap((e) => [e.text, e.context ?? ""]).filter(Boolean);
  const review = checkLesson(out.deck as Deck, out.quiz as Quiz, heard);
  if (review.inventedQuotes.length > 0) log(`lesson for #${skill.id} L${levelIdx}: cut ${review.inventedQuotes.length} quoted moment(s) that were never said`);

  const deck = await finishDeck(withoutInventedQuotes(out.deck as Deck, review), log);
  // finishDeck can drop a card whose image never resolved, so re-count on the deck the learner
  // actually gets. The own-words verdict is kept from the first pass, since the cut quotes are gone now.
  const after = checkLesson(deck, out.quiz as Quiz, heard);
  review.checks = after.checks.map((c) => (c.id === "own-words" || c.id === "uses-a-moment" ? review.checks.find((r) => r.id === c.id) ?? c : c));
  if (opinion) review.checks.push({ id: "accurate", ok: opinion.accurate, detail: opinion.accuracyNote }, { id: "right-level", ok: opinion.rightLevel, detail: opinion.levelNote });
  const citations = [];
  for (const c of out.citations) if (await urlAlive(c.url)) citations.push(c);

  const lessonId = db.insertLesson({
    skillId: skill.id,
    levelIdx,
    style: profile?.style ?? "story",
    bodyMd: out.bodyMd,
    deck,
    quiz: out.quiz as Quiz,
    beats: out.beats as LessonBeat[],
    citations,
  });
  db.setLessonReview(lessonId, review);
  if (opinion && !opinion.accurate) log(`lesson #${lessonId}: still doubted after the rewrite; shown with the note under "What was checked"`);
  db.setLevelStatus(skill.id, levelIdx, "current");
  log(`lesson #${lessonId} ready: ${skill.name} / ${level.title} (${deck.slides.length} cards, ${out.quiz.questions.length} questions)`);

  const nudge = `Your ${skill.name} lesson is ready. About ${deck.minutes} minutes, whenever you're at your desk.`;
  const at = nextLearningSlot(db);
  if ((profile?.nudges ?? ALL_NUDGES).lessons !== false) {
    await bee.createTodo(nudge, at.toISOString()).catch((e: Error) => log(`lesson nudge failed: ${e.message}`));
    log(`lesson nudge scheduled for ${at.toISOString()}`);
  }
  return lessonId;
}

const Opinion = z.object({
  accurate: z.boolean().describe("every factual claim in the lesson is correct as stated"),
  accuracyNote: z.string().describe("one or two plain sentences to the learner: what is wrong, or that the facts hold up. Plain text, no HTML or markdown."),
  rightLevel: z.boolean().describe("the lesson teaches this level's outcome: not the level below, not the one above"),
  levelNote: z.string().describe("one plain sentence to the learner about the pitch of the lesson"),
});

const OPINION_ROLE = `You are the second reader of a lesson another writer produced. You are checking two things only, and you are hard to please. First, is every factual claim correct as stated? A confident error is the worst thing a lesson can contain. Second, does it teach the outcome named for this level, rather than re-teaching the level below or skipping ahead? Say what you found in one plain sentence each, addressed to the learner.`;

function secondOpinion(skill: Skill, level: { title: string; outcome: string }, bodyMd: string): Promise<z.infer<typeof Opinion>> {
  return judge({
    system: systemBlocks(voiceGuide(), OPINION_ROLE),
    user: `Skill: ${skill.name}\nThis level: ${level.title}. Outcome: ${level.outcome}\n\nThe lesson:\n${bodyMd}`,
    schema: Opinion,
  });
}

const writing = new Set<number>();
const resumeTries = new Map<number, number>();
const MAX_RESUME_TRIES = 3;

/** Write the lesson for a level unless something is already writing for this skill. */
export async function generateLessonOnce(deps: LessonDeps, skill: Skill, levelIdx: number): Promise<void> {
  if (writing.has(skill.id)) return;
  writing.add(skill.id);
  try {
    await generateLesson(deps, skill, levelIdx);
  } finally {
    writing.delete(skill.id);
  }
}

/** Is a ladder or lesson for this skill being written right now? */
export function isWriting(skillId: number): boolean {
  return writing.has(skillId);
}

/**
 * Called when a skill is accepted from the board: build its ladder and first lesson.
 * Two quick taps on "Yes, teach me this" used to write two ladders, two lessons and two nudges.
 */
export async function startSkill(deps: LessonDeps, skillId: number): Promise<void> {
  const skill = deps.db.getSkill(skillId);
  if (!skill || writing.has(skillId)) return;
  writing.add(skillId);
  try {
    deps.db.updateSkill(skillId, { status: "active" });
    await ensureLadder(deps, skill);
    if (!deps.db.currentLesson(skillId, skill.level)) await generateLesson(deps, skill, skill.level);
  } finally {
    writing.delete(skillId);
  }
}

/**
 * An active skill with no lesson at its current level sits on "writing your next lesson" with
 * nothing actually writing it. That happens when generation failed (the lesson schema is strict)
 * or the daemon restarted halfway. Run at boot and on a slow timer to pick those back up.
 */
export async function resumeMissingLessons(deps: LessonDeps): Promise<number> {
  let resumed = 0;
  for (const skill of deps.db.skillsByStatus(["active"])) {
    if (writing.has(skill.id) || deps.db.currentLesson(skill.id, skill.level)) continue;
    // Each try is a pair of Opus calls. A lesson that will not come out is left for a person.
    const tries = resumeTries.get(skill.id) ?? 0;
    if (tries >= MAX_RESUME_TRIES) continue;
    resumeTries.set(skill.id, tries + 1);
    const ladder = deps.db.ladderFor(skill.id);
    if (ladder.length > 0 && skill.level >= ladder.length) continue; // finished the ladder
    deps.log(`lessons: ${skill.name} has no lesson at level ${skill.level + 1}; writing it`);
    await startSkill(deps, skill.id).catch((e: Error) => deps.log(`lessons: resume failed for ${skill.name}: ${e.message}`));
    resumed++;
  }
  return resumed;
}
