/**
 * Stage-1 heuristic detector. Cheap, recall-oriented; stage-2 (LLM) does precision.
 * ASR text has no question marks and garbles casual speech, so cues are lexical.
 */

export interface Stage1Result {
  matched: boolean;
  kind: "question" | "gap";
  cues: string[];
}

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

  for (const cue of WONDER_CUES) if (t.includes(cue)) cues.push(cue);
  if (INTERROGATIVE_START.test(t)) cues.push("interrogative-start");
  if (cues.length > 0) return { matched: true, kind: "question", cues };

  for (const cue of HEDGE_CUES) if (t.includes(cue)) cues.push(cue);
  if (cues.length > 0) return { matched: true, kind: "gap", cues };

  return { matched: false, kind: "question", cues };
}
