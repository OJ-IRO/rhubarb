/**
 * Stage-1 heuristic detector. Cheap, recall-oriented; stage-2 (LLM) does precision.
 * ASR text has no question marks and garbles casual speech, so cues are lexical.
 */

import type { EvidenceKind } from "./types.js";

export interface Stage1Result {
  matched: boolean;
  kind: EvidenceKind;
  cues: string[];
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
// Direct-address noise we never want ("hey siri", "alexa, ...")
const ASSISTANT_ADDRESS = /^(hey |ok |okay )?(siri|alexa|google|bee)\b/;

export function stage1Detect(text: string): Stage1Result {
  const t = text.toLowerCase().trim();
  const cues: string[] = [];

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
  return terms.filter((term) => term.length > 2 && t.includes(term.toLowerCase()));
}
