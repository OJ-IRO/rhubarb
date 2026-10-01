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
  applyTextEdits,
  familiarityNote,
  readingNoteFor,
  unavailableReason,
  checkLesson,
  withoutInventedQuotes,
  judge,
  type LessonReview,
} from "@rhubarb/core";
import { z } from "zod";
import { resolveImage, sanitizeMermaid, urlAlive } from "./images.js";
import { researchThenEmit } from "./research.js";
import { afterQuietHours, nextLearningSlot } from "./schedule.js";

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
          z.object({
            kind: z.literal("short"),
            prompt: z.string().describe("asks for exactly ONE idea that a card in this deck states outright, and says what to name, e.g. 'In a sentence: what is the one thing that decides whether a sentence was polite?'. Never a two-part question."),
            rubric: z.string().describe("the one idea that must be present, in any wording; never shown to the learner"),
          }),
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

function lessonRole(profile: Profile | null, reading: string): string {
  const style = profile?.style ?? "story";
  const minutes = profile?.sessionMinutes ?? 10;
  return `You design Rhubarb lessons as a deck of cards. One reader, one skill, one level of the ladder. About ${minutes} minutes to work through.

Learning style: ${STYLE_NOTES[style]}

Deck rules:
- 8 to 12 cards. Open with a cover whose hook promises something specific. Close with learnmore.
- Never invent a person or a name. A name appears only if it is in the reader's moments.
- At least one example card built from a real moment in the reader's evidence: quote it verbatim, say when, name who if known, then explain what was actually going on. This card is the reason Rhubarb exists; a deck without it has failed.
- Exactly one diagram card when the idea has structure (a flow, a sequence, states). Mermaid only: flowchart, sequenceDiagram, or stateDiagram-v2, at most 12 nodes, short plain labels, no styling or class lines. If a diagram would be forced, use a steps card instead.
- One or two image cards where a real photo or diagram would help. Give a search query that will actually find something on Wikimedia Commons (concrete nouns, no jargon), plus a caption that does teaching work on its own.
- One keyidea card: the single sentence to keep.
- Text cards carry one idea each, one to three short paragraphs, no bullet lists, no headers inside the body.
- learnmore: two to four real, specific URLs from the sources you searched. Never invent a URL.

Then a quiz of 4 to 7 questions that test understanding, not vocabulary: mostly multiple choice with four plausible choices and a one-sentence explanation of the right answer, plus one short-answer question with a grading rubric.

Then four beats in order: checkin, scenario (from their week), teachback (spoken aloud), mission (something to try in a real conversation tomorrow). And bodyMd: the lesson as flowing prose.

Every word follows the writing guide. The reader's own moments are the examples.${reading ? `\n\n${reading} This applies to every card, the quiz, its answer choices and explanations, and the beats.` : ""}`;
}

export interface LessonDeps {
  db: RhubarbDb;
  bee: BeeClient;
  log: (msg: string) => void;
}

export async function ensureLadder(deps: LessonDeps, skill: Skill): Promise<void> {
  const { db, log } = deps;
  if (db.ladderFor(skill.id).length > 0) return;
  // A topic is one lesson, not a climb: a single rung, and finishing it finishes the topic.
  if (skill.kind === "topic") {
    db.replaceLadder(skill.id, [{ title: skill.name, outcome: `can tell someone the story of it: ${skill.competentLooksLike}` }]);
    log(`topic #${skill.id} ${skill.name}: one lesson`);
    return;
  }
  const out = await classify({
    model: MODELS.writer,
    effort: "medium",
    system: LADDER_ROLE,
    user: `Skill: ${skill.name}\nDomain: ${skill.domain ?? "(unspecified)"}\nWhat competent use sounds like: ${skill.competentLooksLike}\nWhy it matters to them:\n${skill.brief}${skill.familiarity ? `\n\nWhere they start: ${familiarityNote(skill.familiarity)} Start the ladder at their level, not below it.` : ""}`,
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

  // Reading help is chosen per plan: the same person may read kana for one and want romaji for another.
  const system = systemBlocks(voiceGuide(), lessonRole(profile, readingNoteFor(skill)));
  const shape =
    skill.kind === "topic"
      ? `\n\n## Shape\nThis is a single lesson on one topic from their day, not a rung on a ladder. Tell the whole story in one deck: where it came from, how it works, why it matters, and the one surprising thing worth repeating to a friend.${skill.origin === "asked" ? " They asked for this out loud, so open by answering what they asked." : ""}`
      : "";
  const start = familiarityNote(skill.familiarity);
  const own = evidence.length === 0 ? "\n\n## No moments recorded\nThey started this lesson themselves from an idea, so there is no moment of theirs to quote. Don't invent one: use a clearly labelled example situation instead." : "";
  const baseAsk = `${shape.trimStart()}${shape ? "\n\n" : ""}${start ? `## Where they start\n${start}\n\n` : ""}## Skill\n${skill.name}${skill.domain ? ` (${skill.domain})` : ""}\nCompetent use sounds like: ${skill.competentLooksLike}\n\n## This level (${levelIdx + 1} of ${ladder.length}): ${level.title}\nOutcome: ${level.outcome}\n${
    earlier.length ? `\nEarlier levels already covered: ${earlier.map((l) => ladder[l.levelIdx]?.title).join(", ")}` : ""
  }\n\n## Why this skill is on their board\n${skill.brief}\n\n## Moments from their life to draw on\n${
    evidence.map((e) => `- ${e.spokenAt}${e.place ? ` at ${e.place}` : ""}${e.speakerLabel ? ` (${e.speakerLabel})` : ""}${e.editedAt ? " (corrected by the learner: trust these words over anything else)" : ""}: "${e.text}"${e.context ? `\n  around it:\n  ${e.context.replace(/\n/g, "\n  ")}` : ""}`).join("\n") || "(none recorded)"
  }${own}\n\n## Reader\n${profile ? `goals: ${profile.goals.join("; ") || "none stated"}` : "no profile yet"}`;

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
    // Fix the draft it already has, without searching again. Researching from scratch for a
    // few style problems used to double the cost of a lesson.
    log(`lesson for #${skill.id} L${levelIdx} failed lint (${lint.issues.map((i) => i.rule).join(",")}); revising the draft`);
    out = await researchThenEmit({
      system,
      ask: `${baseAsk}\n\nYour draft:\n${JSON.stringify(out)}\n\nThe editor rejected it for: ${lint.issues.map((i) => `${i.rule}: ${i.detail}`).join("; ")}. Return the whole lesson with those fixed and everything else kept.`,
      schema: LessonOut,
      emitName: "emit_lesson",
      emitDescription: "Return the finished deck, quiz, beats, prose, and citations.",
      maxSearches: 0,
      effort: "medium",
      maxTokens: 20000,
    });
  }

  // A second reader checks what code cannot: are the facts right, and is it pitched at this level?
  // A confident error is the worst thing a lesson can contain, so a doubted draft is rewritten once
  // with the reader's notes, and the rewrite is read again. Whatever the outcome, it is recorded.
  let opinion = await secondOpinion(skill, level, readable(out)).catch((e: Error) => {
    log(`lesson for #${skill.id} L${levelIdx}: second reader unavailable (${e.message})`);
    return null;
  });
  // Doubted: fix the disputed claims in place, once, and read it once more. This used to rewrite
  // the whole lesson with fresh research and then run two correction rounds, each read again by
  // Opus: about five dollars for one lesson whenever the checker kept disagreeing over a detail.
  // Whatever doubt remains is shown to the learner under "What was checked".
  let corrected = 0;
  if (opinion && !opinion.accurate) {
    log(`lesson for #${skill.id} L${levelIdx}: second reader doubts the facts; correcting in place. ${opinion.accuracyNote}`);
    const fix = await correctClaims(skill, out, opinion.accuracyNote, log).catch((e: Error) => {
      log(`lesson for #${skill.id} L${levelIdx}: correction pass failed (${e.message})`);
      return null;
    });
    if (fix && fix.applied > 0) {
      out = fix.out;
      corrected = fix.applied;
      opinion = (await secondOpinion(skill, level, readable(out)).catch(() => null)) ?? opinion;
    }
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
  if (opinion) review.checks.push(accuracyCheck(opinion, corrected), { id: "right-level", ok: opinion.rightLevel, detail: opinion.levelNote });
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
  // Something they asked for out loud is wanted now, not at the next study slot.
  const at = skill.origin === "asked" ? afterQuietHours(new Date(Date.now() + 60_000)) : nextLearningSlot(db);
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

function secondOpinion(skill: Skill, level: { title: string; outcome: string }, lessonText: string): Promise<z.infer<typeof Opinion>> {
  return judge({
    system: systemBlocks(voiceGuide(), OPINION_ROLE),
    user: `Skill: ${skill.name}\nThis level: ${level.title}. Outcome: ${level.outcome}\n\nThe lesson:\n${lessonText}`,
    schema: Opinion,
  });
}

type LessonText = { deck: unknown; quiz: unknown; bodyMd: string; beats: unknown };

/** Everything the learner will read: the prose, the cards, and the quiz with its explanations. */
function readable(out: LessonText): string {
  const quiz = (out.quiz as Quiz).questions
    .map((q, i) => (q.kind === "mcq" ? `Q${i + 1}. ${q.prompt}\nAnswer: ${q.choices[q.answer]}. ${q.explanation}` : `Q${i + 1}. ${q.prompt}`))
    .join("\n");
  return `${out.bodyMd}\n\n## The cards\n${deckProse(out.deck as Deck)}\n\n## The quiz\n${quiz}`;
}

function accuracyCheck(opinion: z.infer<typeof Opinion>, corrected: number) {
  const fixed = corrected > 0 ? ` ${corrected === 1 ? "One claim was" : `${corrected} claims were`} corrected after the first check.` : "";
  return { id: "accurate" as const, ok: opinion.accurate, detail: `${opinion.accuracyNote}${fixed}` };
}

const Corrections = z.object({
  edits: z
    .array(
      z.object({
        find: z.string().describe("a passage copied exactly, character for character, from one field of the lesson JSON: one sentence or less"),
        replace: z.string().describe("the corrected passage, same length and tone, in the same voice"),
      })
    )
    .max(12),
});

const FIX_ROLE = `A fact-checker doubted some claims in a finished lesson. Correct those claims and change nothing else.
- For each wrong claim, copy the exact passage from the lesson JSON as "find" (it must match character for character, inside a single field) and give the corrected passage as "replace". The same claim often appears in several places (a card, the prose, a quiz explanation): fix every place.
- Check each disputed claim against sources before changing it. The fact-checker can be wrong too; if a claim holds up, leave it.
- If the right figure cannot be pinned down, replace the precise number with what sources agree on ("about", "more than") or cut the detail. A vaguer true sentence beats a precise wrong one.
- If a quiz answer depends on a corrected fact, fix the question, choices and explanation so they still agree.`;

/** Targeted fix: patch the disputed claims in place instead of rewriting the whole lesson again. */
async function correctClaims<T extends LessonText>(skill: Skill, out: T, note: string, log: (m: string) => void): Promise<{ out: T; applied: number }> {
  const lessonJson = JSON.stringify({ bodyMd: out.bodyMd, deck: out.deck, quiz: out.quiz, beats: out.beats });
  const fix = await researchThenEmit({
    system: systemBlocks(voiceGuide(), FIX_ROLE),
    ask: `Topic: ${skill.name}\n\nWhat the fact-checker said:\n${note}\n\nThe lesson JSON:\n${lessonJson}`,
    schema: Corrections,
    emitName: "emit_corrections",
    emitDescription: "Return the exact passages to replace and their corrections.",
    maxSearches: 2,
    effort: "medium",
    maxTokens: 6000,
  });
  const { value, applied } = applyTextEdits({ bodyMd: out.bodyMd, deck: out.deck, quiz: out.quiz, beats: out.beats }, fix.edits);
  const missed = fix.edits.length - applied.length;
  if (fix.edits.length === 0) log(`lesson "${skill.name}": the corrector checked the disputed claims and found nothing to change`);
  log(`lesson "${skill.name}": corrected ${applied.length} claim${applied.length === 1 ? "" : "s"}${missed ? `, ${missed} passage${missed === 1 ? "" : "s"} not found` : ""}`);
  return { out: { ...out, ...value }, applied: applied.length };
}

/**
 * Lessons written before the correction pass existed, still flagged as inaccurate, get it once.
 * The learner sees the corrected lesson and an honest note under "What was checked".
 */
export async function correctDoubtedLessons(deps: LessonDeps): Promise<number> {
  const { db, log } = deps;
  let fixed = 0;
  for (const skill of db.skillsByStatus(["active", "mastered"])) {
    for (const lesson of db.lessonsForSkill(skill.id)) {
      const key = `claims_corrected:${lesson.id}`;
      if (db.getKv(key) || !lesson.review) continue;
      const review = JSON.parse(lesson.review) as LessonReview;
      const accurate = review.checks.find((c) => c.id === "accurate");
      if (!accurate || accurate.ok) continue;
      db.setKv(key, String(Date.now()));
      const level = db.ladderFor(skill.id).find((l) => l.idx === lesson.levelIdx);
      if (!level) continue;
      let out = { bodyMd: lesson.bodyMd, deck: JSON.parse(lesson.deck) as Deck, quiz: JSON.parse(lesson.quiz) as Quiz, beats: JSON.parse(lesson.beats) as LessonBeat[] };
      let note = accurate.detail;
      let opinion: z.infer<typeof Opinion> | null = null;
      let corrected = 0;
      for (let round = 0; round < 2; round++) {
        const fix = await correctClaims(skill, out, note, log).catch((e: Error) => {
          log(`lesson #${lesson.id}: correction pass failed (${e.message})`);
          return null;
        });
        if (!fix || fix.applied === 0) break;
        out = fix.out;
        corrected += fix.applied;
        opinion = await secondOpinion(skill, level, readable(out)).catch(() => null);
        if (!opinion || opinion.accurate) break;
        note = opinion.accuracyNote;
      }
      if (corrected === 0 || !opinion) continue;
      db.updateLessonContent(lesson.id, out);
      const heard = db.evidenceForSkill(skill.id).flatMap((e) => [e.text, e.context ?? ""]).filter(Boolean);
      const again = checkLesson(out.deck, out.quiz, heard);
      const kept = review.checks.filter((c) => c.id === "own-words" || c.id === "uses-a-moment");
      review.checks = [
        ...again.checks.map((c) => kept.find((k) => k.id === c.id) ?? c),
        accuracyCheck(opinion, corrected),
        { id: "right-level", ok: opinion.rightLevel, detail: opinion.levelNote },
      ];
      review.checkedAt = Date.now();
      db.setLessonReview(lesson.id, review);
      log(`lesson #${lesson.id}: ${corrected} claim${corrected === 1 ? "" : "s"} corrected; fact-checker now ${opinion.accurate ? "satisfied" : "still has a doubt, shown to the learner"}`);
      fixed++;
    }
  }
  return fixed;
}

const Refreshed = z.object({
  name: z.string().describe("the same title, corrected if it rested on a misheard word"),
  brief: z.string().describe("the same brief, corrected so it matches what was really said; same length and voice; never uses the reader's name"),
});

/**
 * The learner fixed what the transcript says. Correct the title and brief if they rested on a
 * misheard word, then write the lesson again from the corrected moments. The old lesson stays
 * readable until the new one is ready, then it is set aside.
 */
export async function rewriteLesson(deps: LessonDeps, skillId: number): Promise<void> {
  const { db, log } = deps;
  const skill = db.getSkill(skillId);
  if (!skill || writing.has(skillId)) return;
  setRewriteStatus(db, skillId, { state: "writing", at: Date.now() });
  const evidence = db.evidenceForSkill(skillId);
  if (evidence.some((e) => e.editedAt)) {
    const fixed = await classify({
      model: MODELS.worker,
      system: systemBlocks(voiceGuide(), "A speech recogniser misheard some words, and the learner has corrected the transcript. Correct the lesson's title and brief to match what was really said. Change nothing that was right."),
      user: `Title: ${skill.name}\nBrief: ${skill.brief}\n\nWhat was really said:\n${evidence.map((e) => `- "${e.text}"\n  around it:\n  ${(e.context ?? "").replace(/\n/g, "\n  ")}`).join("\n")}`,
      schema: Refreshed,
      maxTokens: 1500,
    }).catch((e: Error) => {
      log(`rewrite: title and brief left as they were (${e.message})`);
      return null;
    });
    if (fixed) db.updateSkill(skillId, { name: fixed.name.trim() || skill.name, brief: fixed.brief.trim() || skill.brief });
  }
  const fresh = db.getSkill(skillId)!;
  writing.add(skillId);
  try {
    await ensureLadder(deps, fresh);
    const lessonId = await generateLesson(deps, fresh, fresh.level);
    db.replaceOlderLessons(skillId, fresh.level, lessonId);
    setRewriteStatus(db, skillId, { state: "done", at: Date.now(), lessonId });
    log(`rewrite: ${fresh.name} rewritten from the corrected moments as lesson #${lessonId}`);
  } catch (e) {
    setRewriteStatus(db, skillId, { state: "failed", at: Date.now(), reason: unavailableReason(e) ?? "something went wrong while writing it" });
    throw e;
  } finally {
    writing.delete(skillId);
  }
}

export interface RewriteStatus {
  state: "writing" | "done" | "failed";
  at: number;
  lessonId?: number;
  /** plain words for the learner when it failed */
  reason?: string;
}

export function setRewriteStatus(db: RhubarbDb, skillId: number, s: RewriteStatus): void {
  db.setKv(`rewrite:${skillId}`, JSON.stringify(s));
}

export function rewriteStatus(db: RhubarbDb, skillId: number): RewriteStatus | null {
  const raw = db.getKv(`rewrite:${skillId}`);
  return raw ? (JSON.parse(raw) as RewriteStatus) : null;
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
    await startSkill(deps, skill.id).catch((e: Error) => {
      deps.log(`lessons: resume failed for ${skill.name}: ${e.message}`);
      // Out of budget or Claude unreachable says nothing about the lesson. Don't use up a try.
      if (unavailableReason(e)) resumeTries.set(skill.id, tries);
    });
    resumed++;
  }
  return resumed;
}
