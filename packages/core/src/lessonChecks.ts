import { textContainment } from "./bee.js";
import type { Deck, Quiz } from "./types.js";

/**
 * Checks a finished lesson against things that can be decided without a model.
 *
 * The one that matters most is the first. Rhubarb's lessons quote the learner's own life back to
 * them ("when you said…"). A model that invents such a quote has put words in a real person's
 * mouth, and nothing reads as more broken, or more creepy. So every quoted moment must be
 * traceable to something that was actually heard, or the slide is cut.
 */

export interface LessonCheck {
  id: "own-words" | "uses-a-moment" | "length" | "one-idea-a-card" | "quiz" | "sources" | "diagram" | "accurate" | "right-level";
  ok: boolean;
  /** one plain sentence, shown to the learner if they ask what was checked */
  detail: string;
}

export interface LessonReview {
  checks: LessonCheck[];
  /** indexes of example slides whose quote could not be traced to anything heard */
  inventedQuotes: number[];
  checkedAt: number;
}

const QUOTE_MATCH = 0.75; // a lesson may tidy the grammar of what was said, not the substance
const WORDS_PER_CARD = 130;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** `heard` is everything the writer was shown from the learner's life: moments and the lines around them. */
export function checkLesson(deck: Deck, quiz: Quiz, heard: string[]): LessonReview {
  const checks: LessonCheck[] = [];
  const slides = deck.slides ?? [];

  const examples = slides.map((s, i) => ({ s, i })).filter((x) => x.s.kind === "example");
  const inventedQuotes = examples.filter(({ s }) => s.kind === "example" && !heard.some((h) => textContainment(s.quote, h) >= QUOTE_MATCH)).map(({ i }) => i);
  checks.push({
    id: "own-words",
    ok: inventedQuotes.length === 0,
    detail: inventedQuotes.length === 0 ? "Every quote from your week matches something Rhubarb actually heard." : `${inventedQuotes.length} quoted moment${inventedQuotes.length === 1 ? "" : "s"} could not be traced to anything heard, and ${inventedQuotes.length === 1 ? "was" : "were"} removed.`,
  });

  if (heard.length > 0) {
    const grounded = examples.length - inventedQuotes.length;
    checks.push({ id: "uses-a-moment", ok: grounded > 0, detail: grounded > 0 ? "It teaches from a moment in your own week." : "It has no moment from your own week in it." });
  }

  const n = slides.length - inventedQuotes.length;
  checks.push({ id: "length", ok: n >= 6 && n <= 14, detail: `${n} cards. A lesson should be 6 to 14.` });

  const heavy = slides.filter((s) => s.kind === "text" && words(s.body) > WORDS_PER_CARD).length;
  checks.push({ id: "one-idea-a-card", ok: heavy === 0, detail: heavy === 0 ? "No card tries to carry more than one idea's worth of text." : `${heavy} card${heavy === 1 ? " is" : "s are"} too long to take in at once.` });

  const qs = quiz.questions ?? [];
  const broken = qs.filter((q) => q.kind === "mcq" && (q.answer < 0 || q.answer >= q.choices.length || new Set(q.choices.map((c) => c.trim().toLowerCase())).size !== q.choices.length)).length;
  const quizOk = qs.length >= 4 && qs.length <= 8 && broken === 0;
  checks.push({ id: "quiz", ok: quizOk, detail: quizOk ? `${qs.length} questions, each with one answer that can be marked.` : broken > 0 ? `${broken} question${broken === 1 ? " has" : "s have"} no single right answer.` : `${qs.length} questions. A check should have 4 to 8.` });

  const links = slides.flatMap((s) => (s.kind === "learnmore" ? s.links : []));
  const badLinks = links.filter((l) => !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(l.url)).length;
  checks.push({ id: "sources", ok: badLinks === 0, detail: links.length === 0 ? "No further reading was offered." : badLinks === 0 ? `${links.length} further-reading link${links.length === 1 ? "" : "s"}, all real addresses.` : `${badLinks} further-reading link${badLinks === 1 ? " is" : "s are"} not a real address.` });

  const big = slides.filter((s) => s.kind === "diagram" && s.mermaid.split("\n").filter((l) => /-->|---|==>|->>/.test(l)).length > 14).length;
  if (slides.some((s) => s.kind === "diagram")) checks.push({ id: "diagram", ok: big === 0, detail: big === 0 ? "The diagram is small enough to read at a glance." : "The diagram has too many parts to read at a glance." });

  return { checks, inventedQuotes, checkedAt: Date.now() };
}

/** The deck with any invented quotes cut out. */
export function withoutInventedQuotes(deck: Deck, review: LessonReview): Deck {
  if (review.inventedQuotes.length === 0) return deck;
  const cut = new Set(review.inventedQuotes);
  return { ...deck, slides: deck.slides.filter((_, i) => !cut.has(i)) };
}
