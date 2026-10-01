/**
 * Stage-1 heuristic detector. Cheap, recall-oriented; stage-2 (LLM) does precision.
 * ASR text has no question marks and garbles casual speech, so cues are lexical.
 */

import type { EvidenceKind } from "./types.js";

export interface Stage1Result {
  matched: boolean;
  kind: EvidenceKind;
  cues: string[];
  /** Set when the wearer addressed Bee directly ("hey Bee, teach me ..."): the ask, without the address. */
  ask?: string;
}

/** Languages a person can name as a goal that we can also recognise by script. */
export type ScriptLanguage = "japanese" | "korean" | "chinese";

export interface DetectHints {
  /** Languages from the profile goals; a line in one of these scripts counts as exposure. */
  languages?: ScriptLanguage[];
}

const SCRIPT: Record<ScriptLanguage, RegExp> = {
  japanese: /[\u3040-\u30ff]/, // kana; kanji alone could be Chinese
  korean: /[\uac00-\ud7af\u1100-\u11ff]/,
  chinese: /[\u4e00-\u9fff]/,
};

/** Which script languages a profile's goals mention ("conversational Japanese", "日本語"). */
export function goalLanguages(goals: string[]): ScriptLanguage[] {
  const text = goals.join(" ").toLowerCase();
  const out: ScriptLanguage[] = [];
  if (/japanese|日本語|nihongo/.test(text)) out.push("japanese");
  if (/korean|한국어|hangul/.test(text)) out.push("korean");
  if (/chinese|mandarin|cantonese|中文|汉语|漢語/.test(text)) out.push("chinese");
  return out;
}

/** The script language a line is written in, if any. Japanese wins over Chinese when kana are present. */
export function scriptLanguage(text: string): ScriptLanguage | null {
  if (SCRIPT.japanese.test(text)) return "japanese";
  if (SCRIPT.korean.test(text)) return "korean";
  if (SCRIPT.chinese.test(text)) return "chinese";
  return null;
}

const INTENT_CUES = [
  "need to learn",
  "want to learn",
  "should learn",
  "have to learn",
  "get better at",
  "need to get better",
  "want to get better",
  "should really learn",
  "trying to learn",
  "i'm learning",
  "im learning",
  "need to understand",
  "want to understand",
  "brush up on",
  "need to practice",
  "want to practice",
  "need to figure out how",
];

const STRUGGLE_CUES = [
  "no idea what",
  "didn't understand",
  "didnt understand",
  "don't understand",
  "dont understand",
  "didn't know what",
  "didnt know what",
  "what does that mean",
  "what does that even mean",
  "what is that",
  "never heard of",
  "over my head",
  "lost me",
  "not sure what",
  "not sure how",
  "confused about",
  "confusing",
];

const WONDER_CUES = [
  "i wonder",
  "i'm curious",
  "im curious",
  "curious about",
  "i want to know",
  "i'd love to know",
  "i would love to know",
  "how come",
  "what if",
  "no idea how",
  "no idea why",
  "no idea what",
  "never understood",
  "don't understand how",
  "don't understand why",
  "have to look up",
  "need to look up",
  "look that up",
  "google that",
];

const HEDGE_CUES = [
  "i think it's",
  "i think its",
  "i think it is",
  "i think they",
  "i believe it's",
  "i believe its",
  "if i remember",
  "if i recall",
  "pretty sure it's",
  "pretty sure its",
  "something like",
  "isn't it like",
  "isnt it like",
  "i guess it's",
  "i might be wrong",
  "don't quote me",
  "dont quote me",
];

const INTERROGATIVE_START = /^(who|what|when|where|why|how|which|whose)\b/;
// Commands to someone else's assistant are noise ("hey siri, set a timer").
const ASSISTANT_ADDRESS = /^(hey |ok |okay )?(siri|alexa|google)\b/;
// Addressing the wearable itself is the opposite: the clearest ask Rhubarb ever gets. Speech
// recognition spells the name several ways ("hey B", "Hey, be.", "Hey Bea"), so the greeting is
// required: a bare "be" or "b" starts too many ordinary sentences. A false match costs little,
// because the ask is read by a model before anything is written.
const GREETING = String.raw`(?:hey|hi|okay|ok|yo)`;
// "Hey Rhubarb" is the demo phrase; the recogniser splits and respells it.
const NAME = String.raw`(?:rhubarbs?|rubarb|ruebarb|rue\s?barb|roo\s?barb|ruby\s?barb|rub\s?bar|rhu\s?bar|bee|be|b|bea)`;
const BEE_ADDRESS = new RegExp(String.raw`(?:^|[\s,.!?])${GREETING}[,.!\s]+${NAME}(?![a-z'])[,.!?]*\s*(.*)$`, "i");

/** "hey Bee, give me a history lesson on ferris wheels" -> "give me a history lesson on ferris wheels". */
export function directAsk(text: string): string | null {
  const m = text.trim().match(BEE_ADDRESS);
  if (!m) return null;
  const ask = m[1].trim().replace(/^[,.!?\s]+|[.?!]+$/g, "");
  return ask.split(/\s+/).length >= 2 ? ask : null;
}

/** "Hey Bee." on its own: the ask is the next line in the same conversation. */
export function isBareAddress(text: string): boolean {
  const m = text.trim().match(BEE_ADDRESS);
  return Boolean(m) && m![1].replace(/[,.!?\s]/g, "").length === 0;
}

export function stage1Detect(text: string, hints: DetectHints = {}): Stage1Result {
  const t = text.toLowerCase().trim();
  const cues: string[] = [];

  const ask = directAsk(text);
  if (ask) return { matched: true, kind: "intent", cues: ["hey-bee"], ask };

  // A line in a language they are learning is exposure even when no English cue fires. Spoken
  // Japanese has no spaces, so the word count below would drop every one of these.
  const lang = scriptLanguage(text);
  if (lang) {
    if (hints.languages?.includes(lang) && text.replace(/\s+/g, "").length >= 6) return { matched: true, kind: "exposure", cues: [lang] };
    return { matched: false, kind: "exposure", cues };
  }

  if (t.split(/\s+/).length < 4) return { matched: false, kind: "question", cues };
  if (ASSISTANT_ADDRESS.test(t)) return { matched: false, kind: "question", cues };

  // Order matters: a stated intent to learn outranks the question it may contain.
  for (const cue of INTENT_CUES) if (t.includes(cue)) cues.push(cue);
  if (cues.length > 0) return { matched: true, kind: "intent", cues };

  for (const cue of STRUGGLE_CUES) if (t.includes(cue)) cues.push(cue);
  if (cues.length > 0) return { matched: true, kind: "struggle", cues };

  for (const cue of WONDER_CUES) if (t.includes(cue)) cues.push(cue);
  if (INTERROGATIVE_START.test(t)) cues.push("interrogative-start");
  if (cues.length > 0) return { matched: true, kind: "question", cues };

  for (const cue of HEDGE_CUES) if (t.includes(cue)) cues.push(cue);
  if (cues.length > 0) return { matched: true, kind: "gap", cues };

  return { matched: false, kind: "question", cues };
}

/** Does this utterance touch any of a skill's signal terms? Used to find field-evidence candidates. */
export function matchesSkillTerms(text: string, terms: string[]): string[] {
  const t = text.toLowerCase();
  // Whole words only: a bare substring test matches the term "api" inside "capital".
  return terms.filter((term) => {
    const needle = term.trim().toLowerCase();
    if (needle.length <= 2) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(t);
  });
}

// ---------------------------------------------------------------------------------------------
// Reading help: how much of a language to spell out, by how well the reader reads it.
// ---------------------------------------------------------------------------------------------

const READING: Record<ScriptLanguage, Record<"none" | "basic" | "most" | "fluent", string>> = {
  japanese: {
    none: "The reader can't read Japanese yet. Every time Japanese appears, write the Japanese, then romaji in parentheses, then the English meaning, for example 駅の前 (eki no mae, \"in front of the station\"). Never leave Japanese without romaji and English.",
    basic: "The reader reads kana but few kanji. After every kanji word, give its reading in hiragana in parentheses, for example 駅(えき)の前(まえ), and give the English meaning of any new word or phrase. No romaji.",
    most: "The reader reads most everyday kanji. Give hiragana readings only for uncommon kanji, and English only for new or tricky words.",
    fluent: "The reader reads Japanese fluently. Write Japanese plainly, with no readings or translations.",
  },
  korean: {
    none: "The reader can't read Hangul yet. Every time Korean appears, write the Hangul, then the romanization in parentheses, then the English meaning.",
    basic: "The reader sounds out Hangul slowly. Give the English meaning of every new word or phrase. No romanization.",
    most: "The reader reads most everyday Korean. Give English only for new or tricky words.",
    fluent: "The reader reads Korean fluently. No romanization or translations.",
  },
  chinese: {
    none: "The reader can't read Chinese yet. Every time Chinese appears, write the characters, then pinyin with tone marks in parentheses, then the English meaning.",
    basic: "The reader knows some characters. Give pinyin with tone marks after every word and the English meaning of new words.",
    most: "The reader reads most everyday characters. Give pinyin only for uncommon characters, and English only for new or tricky words.",
    fluent: "The reader reads Chinese fluently. No pinyin or translations.",
  },
};

type Level = "none" | "basic" | "most" | "fluent";
type PlanLike = { name: string; domain: string | null; brief: string; reading: Level | null; status?: string; updatedAt?: number };

/** Which script language a plan is about, judged from its name, domain and brief. */
export function planLanguage(plan: { name: string; domain: string | null; brief: string }): ScriptLanguage | null {
  return goalLanguages([plan.name, plan.domain ?? "", plan.brief])[0] ?? null;
}

/** Reading help for one plan, at the level chosen for it (some help when unset). Empty if it isn't a language plan. */
export function readingNoteFor(plan: PlanLike): string {
  const lang = planLanguage(plan);
  return lang ? `Reading help: ${READING[lang][plan.reading ?? "basic"]}` : "";
}

/**
 * For writing that isn't tied to one plan (the morning letter, sparks, proposal briefs): follow
 * the most recently touched language plan of each language, and give some help where there is none.
 */
export function readingNote(plans: PlanLike[], goals: string[] = []): string {
  const byLang = new Map<ScriptLanguage, Level>();
  for (const p of [...plans].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))) {
    const lang = planLanguage(p);
    if (lang && !byLang.has(lang)) byLang.set(lang, p.reading ?? "basic");
  }
  for (const lang of goalLanguages(goals)) if (!byLang.has(lang)) byLang.set(lang, "basic");
  const notes = [...byLang].map(([lang, level]) => READING[lang][level]);
  return notes.length ? `Reading help: ${notes.join(" ")}` : "";
}

const FAMILIARITY = {
  new: "They said they are new to this: assume nothing, define every term the first time, and start from the very beginning.",
  some: "They said they know some of this already: skip the basics they would already have, and build from there.",
  comfortable: "They said they are comfortable with this: skip the basics, go to the nuance, the mistakes even capable people make, and what experts know.",
} as const;

/** One sentence telling a writer where this learner is starting from. */
export function familiarityNote(f: "new" | "some" | "comfortable" | null | undefined): string {
  return f ? FAMILIARITY[f] : "";
}
