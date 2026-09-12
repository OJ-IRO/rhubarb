/**
 * Smoke test for the Bedrock wiring: one structured classification on the worker model,
 * one short piece of prose on the writer model, then the voice gate on that prose.
 * Run: node packages/daemon/dist/scripts/llm-smoke.js
 */
import { z } from "zod";
import { classify, lintProse, judgeProse, systemBlocks, voiceGuide, write } from "@waggle/core";

const Evidence = z.object({
  kind: z.enum(["question", "gap", "struggle", "intent", "none"]),
  topic: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const utterance = "I think that it'd super interesting to learn exactly how this happened from like a biological and chemical and perspective.";

console.time("classify");
const c = await classify({
  system: "Classify a single spoken utterance from someone's day. 'question' = they want to know something; 'gap' = they hedged or misstated a fact; 'struggle' = they did not understand something said to them; 'intent' = they said they want to learn or improve at something; 'none' otherwise.",
  user: `Utterance: "${utterance}"`,
  schema: Evidence,
});
console.timeEnd("classify");
console.log("classification:", c);

console.time("write");
const prose = await write({
  system: systemBlocks(voiceGuide(), "You write Waggle's phone nudges."),
  messages: [
    {
      role: "user",
      content:
        "Write one nudge (under 120 characters) telling the reader their lesson on how honeybees make honey is ready and takes about eight minutes.",
    },
  ],
  effort: "low",
  maxTokens: 300,
});
console.timeEnd("write");
console.log("nudge:", prose);

console.log("lint:", lintProse(prose));
console.time("judge");
console.log("judge:", await judgeProse(prose));
console.timeEnd("judge");
