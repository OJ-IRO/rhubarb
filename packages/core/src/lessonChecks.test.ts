import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLesson, withoutInventedQuotes } from "./lessonChecks.js";
import type { Deck, Quiz, Slide } from "./types.js";

const HEARD = [
  "wait what does halfway through the pods actually mean",
  "speaker_2: we're halfway through the pods\nsomeone: wait what does halfway through the pods actually mean",
  "i really need to actually understand how our deploys work before thursday",
];

const text = (body: string): Slide => ({ kind: "text", heading: "A heading", body });
const example = (quote: string): Slide => ({ kind: "example", heading: "From your week", quote, when: "Tuesday", explanation: "Here is what was going on." });

function deckOf(...extra: Slide[]): Deck {
  const base: Slide[] = [{ kind: "cover", title: "Rolling deployments", subtitle: "Level two", hook: "Why nobody panicked." }, text("One."), text("Two."), text("Three."), text("Four."), { kind: "keyidea", statement: "It stalls, it doesn't break.", why: "Readiness gates traffic." }];
  return { title: "Rolling deployments", subtitle: "Level two", minutes: 10, slides: [...base, ...extra] };
}

const quiz: Quiz = {
  questions: [
    { kind: "mcq", prompt: "Q1", choices: ["a", "b", "c"], answer: 1, explanation: "" },
    { kind: "mcq", prompt: "Q2", choices: ["a", "b", "c"], answer: 0, explanation: "" },
    { kind: "mcq", prompt: "Q3", choices: ["a", "b", "c"], answer: 2, explanation: "" },
    { kind: "short", prompt: "Explain it.", rubric: "Mentions readiness." },
  ],
};

const byId = (r: ReturnType<typeof checkLesson>, id: string) => r.checks.find((c) => c.id === id)!;

test("a quote the learner really said passes, even with the grammar tidied", () => {
  const r = checkLesson(deckOf(example("Wait, what does 'halfway through the pods' actually mean?")), quiz, HEARD);
  assert.equal(byId(r, "own-words").ok, true);
  assert.equal(byId(r, "uses-a-moment").ok, true);
  assert.deepEqual(r.inventedQuotes, []);
  assert.equal(r.checks.every((c) => c.ok), true);
});

test("a quote the model made up is caught, and the slide is cut", () => {
  const deck = deckOf(example("I told the whole team I finally understand Kubernetes networking."), example("I really need to understand how our deploys work before Thursday."));
  const r = checkLesson(deck, quiz, HEARD);
  assert.equal(byId(r, "own-words").ok, false);
  assert.deepEqual(r.inventedQuotes, [6]);
  assert.equal(byId(r, "uses-a-moment").ok, true, "the real one still counts");

  const cleaned = withoutInventedQuotes(deck, r);
  assert.equal(cleaned.slides.length, deck.slides.length - 1);
  assert.equal(cleaned.slides.some((s) => s.kind === "example" && s.quote.startsWith("I told the whole team")), false);
});

test("a lesson with none of the learner's own moments says so", () => {
  const r = checkLesson(deckOf(), quiz, HEARD);
  assert.equal(byId(r, "uses-a-moment").ok, false);
  assert.equal(checkLesson(deckOf(), quiz, []).checks.some((c) => c.id === "uses-a-moment"), false, "nothing was heard, so nothing is expected");
});

test("a wall of text, a broken question and a fake link are each flagged", () => {
  const wall = text(Array.from({ length: 200 }, () => "word").join(" "));
  const badQuiz: Quiz = { questions: [...quiz.questions.slice(0, 3), { kind: "mcq", prompt: "Q", choices: ["same", "Same ", "other"], answer: 5, explanation: "" }] };
  const links: Slide = { kind: "learnmore", links: [{ title: "Docs", url: "https://kubernetes.io/docs/", why: "" }, { title: "Nope", url: "kubernetes docs page", why: "" }] };
  const r = checkLesson(deckOf(wall, links, example("what does halfway through the pods actually mean")), badQuiz, HEARD);
  assert.equal(byId(r, "one-idea-a-card").ok, false);
  assert.equal(byId(r, "quiz").ok, false);
  assert.equal(byId(r, "sources").ok, false);
  assert.equal(byId(r, "own-words").ok, true);
});
