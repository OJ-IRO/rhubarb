import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { classify, MODELS } from "./llm.js";

function locateGuide(): string {
  if (process.env.RHUBARB_VOICE_PATH) return process.env.RHUBARB_VOICE_PATH;
  // packages/core/dist/voice.js -> repo root
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "VOICE.md");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("VOICE.md not found; set RHUBARB_VOICE_PATH");
}

let cachedGuide: string | null = null;
/** The writing guide, injected as the stable (cached) prefix of every generation prompt. */
export function voiceGuide(): string {
  cachedGuide ??= readFileSync(locateGuide(), "utf8");
  return cachedGuide;
}

const BANNED = [
  "delve",
  "leverage",
  "robust",
  "seamless",
  "utilize",
  "foster",
  "harness",
  "unlock",
  "elevate",
  "empower",
  "tapestry",
  "testament",
  "game-changer",
  "cutting-edge",
  "it's worth noting",
  "it is worth noting",
  "it's important to note",
  "in conclusion",
  "in summary",
  "to sum up",
  "let's explore",
  "let's dive",
  "great question",
  "certainly!",
  "absolutely!",
  "learning journey",
  "isn't just about",
  "not just about",
];

export interface LintIssue {
  rule: string;
  detail: string;
}

export interface LintResult {
  ok: boolean;
  issues: LintIssue[];
  /** 0 (clean) .. 10 (slop); deterministic part only unless a judge score is merged */
  score: number;
}

/** Deterministic slop checks. Cheap, runs on every generation. */
export function lintProse(text: string): LintResult {
  const issues: LintIssue[] = [];
  const lower = text.toLowerCase();

  for (const phrase of BANNED) {
    if (lower.includes(phrase)) issues.push({ rule: "banned-phrase", detail: phrase });
  }

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const bulletLines = lines.filter((l) => /^\s*([-*•]|\d+\.)\s/.test(l)).length;
  if (lines.length >= 6 && bulletLines / lines.length > 0.4) {
    issues.push({ rule: "bullet-heavy", detail: `${bulletLines}/${lines.length} lines are bullets` });
  }

  const headerLines = lines.filter((l) => /^\s*#{1,6}\s/.test(l)).length;
  if (headerLines > 0 && lines.length / headerLines < 6) {
    issues.push({ rule: "header-dense", detail: `${headerLines} headers for ${lines.length} lines` });
  }

  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations > 1) issues.push({ rule: "exclamation", detail: `${exclamations} exclamation marks` });

  for (const para of text.split(/\n\s*\n/)) {
    const dashes = (para.match(/—/g) ?? []).length;
    if (dashes > 1) {
      issues.push({ rule: "em-dash-chain", detail: para.slice(0, 60) });
      break;
    }
  }

  const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emoji > 1) issues.push({ rule: "emoji", detail: `${emoji} emoji` });

  if (/^\s*(sure|certainly|absolutely|great|of course)[,!.]/i.test(text)) {
    issues.push({ rule: "filler-opener", detail: text.slice(0, 40) });
  }

  const score = Math.min(10, issues.length * 2);
  return { ok: issues.length === 0, issues, score };
}

const JudgeSchema = z.object({
  slopScore: z.number().min(0).max(10).describe("0 = reads like a thoughtful human wrote it, 10 = obvious machine text"),
  reasons: z.array(z.string()).describe("specific, quotable problems; empty if clean"),
});

/** Model judgement of whether prose follows the guide. Merge with lintProse for the final gate. */
export async function judgeProse(text: string): Promise<{ slopScore: number; reasons: string[] }> {
  return classify({
    model: MODELS.worker,
    effort: "low",
    system: `You are an exacting editor. Judge the passage against this writing guide. Quote specific offending phrases.\n\n${voiceGuide()}`,
    user: `Passage:\n\n${text}`,
    schema: JudgeSchema,
  });
}

export const SLOP_THRESHOLD = 3;

/** Full gate: deterministic lint plus the judge. */
export async function passesVoice(text: string): Promise<{ ok: boolean; reasons: string[] }> {
  const lint = lintProse(text);
  const judged = await judgeProse(text);
  const reasons = [...lint.issues.map((i) => `${i.rule}: ${i.detail}`), ...judged.reasons];
  const ok = lint.ok && judged.slopScore <= SLOP_THRESHOLD;
  return { ok, reasons };
}
