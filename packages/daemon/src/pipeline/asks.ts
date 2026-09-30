import { classify, lintProse, MODELS, systemBlocks, voiceGuide, type Evidence, type RhubarbDb } from "@rhubarb/core";
import { z } from "zod";

/**
 * "Hey Bee, give me a history lesson on ferris wheels." The wearer said out loud what they want,
 * so there is nothing to vote on: this decides what shape the answer takes and starts it.
 */
const AskOut = z.object({
  route: z
    .enum(["topic", "skill", "spark", "none"])
    .describe(
      "topic: they want to understand something in depth, one lesson will do (a history, how something works, why something is the way it is). skill: they want to get better at doing something over weeks (a language, a sport, negotiating). spark: a quick factual question a paragraph answers. none: a command meant for Bee's own assistant (reminders, timers, summaries of their day, 'remember that'), or not an ask at all."
    ),
  name: z.string().describe("short, specific title, e.g. 'The history of the ferris wheel' or 'Ordering food in Japanese'"),
  domain: z.string().nullable(),
  competentLooksLike: z.string().describe("one sentence: what it sounds like when this person can talk about or do it well"),
  terms: z.array(z.string()).describe("6-12 words or phrases that signal the subject is in play when overheard"),
  brief: z
    .string()
    .describe("two or three sentences to the reader: what they asked for, roughly when and where, and what the lesson will give them. Never use their name."),
});

const ROLE = `You read one thing a person said out loud to their wearable, addressed to it by name, and decide what they want from Rhubarb, a tutor that turns their day into lessons. They asked; you are not deciding whether to help, only how. Use the lines around the ask to understand what prompted it, such as where they were.`;

export interface AskDeps {
  db: RhubarbDb;
  log: (msg: string) => void;
  /** Start writing a lesson for a skill or topic that already exists. */
  start: (skillId: number) => Promise<void>;
  /** Answer a quick question as a spark card. */
  spark: (e: Evidence, topic: string) => void;
}

export async function handleAsk(deps: AskDeps, e: Evidence, ask: string): Promise<number | null> {
  const { db, log } = deps;
  const out = await classify({
    model: MODELS.worker,
    system: systemBlocks(voiceGuide(), ROLE),
    user: `They said: "${e.text}"\nThe ask: "${ask}"\nSpoken at: ${e.spokenAt}${e.place ? `\nWhere: ${e.place}` : ""}\n\nAround it:\n${e.context ?? "(nothing)"}`,
    schema: AskOut,
    maxTokens: 1500,
  });

  if (out.route === "none") {
    db.classifyEvidence(e.id, { kind: "intent", route: "noise", topic: out.name, confidence: 1 });
    log(`ask #${e.id} was for Bee's own assistant; left to Bee`);
    return null;
  }
  if (out.route === "spark") {
    db.classifyEvidence(e.id, { kind: "question", route: "spark", topic: out.name, confidence: 1 });
    deps.spark(e, out.name);
    return null;
  }

  let brief = out.brief.trim();
  if (!lintProse(brief).ok) brief = brief.replace(/\s+/g, " ");
  const id = db.insertSkill({
    name: out.name,
    domain: out.domain,
    competentLooksLike: out.competentLooksLike,
    terms: out.terms,
    // Asked for out loud outranks anything Rhubarb merely noticed.
    priority: 95,
    brief,
    kind: out.route === "topic" ? "topic" : "skill",
    origin: "asked",
  });
  db.assignEvidenceToSkill([e.id], id);
  log(`ask #${e.id} -> ${out.route} #${id} ${out.name}; writing it now`);
  await deps.start(id);
  return id;
}

/**
 * A spark answered in a paragraph, and the reader wants the whole story. Same path as an ask:
 * saying yes on the page is the decision.
 */
export async function topicFromSpark(deps: Pick<AskDeps, "db" | "log" | "start">, card: { title: string; answerMd: string }, e: Evidence | null): Promise<number> {
  const { db, log } = deps;
  const out = await classify({
    model: MODELS.worker,
    system: systemBlocks(voiceGuide(), "A reader got a one-paragraph answer to something they wondered out loud, and asked for a full lesson on it. Name the lesson and write the brief."),
    user: `The question: ${card.title}\nThe short answer they read:\n${card.answerMd}\n\nWhat they said:\n${e?.text ?? "(not recorded)"}\n${e?.context ?? ""}`,
    schema: AskOut.omit({ route: true }),
    maxTokens: 1500,
  });
  const id = db.insertSkill({
    name: out.name,
    domain: out.domain,
    competentLooksLike: out.competentLooksLike,
    terms: out.terms,
    priority: 90,
    brief: out.brief.trim(),
    kind: "topic",
    origin: "asked",
  });
  if (e) db.assignEvidenceToSkill([e.id], id);
  log(`spark "${card.title}" -> topic #${id} ${out.name}; writing it now`);
  await deps.start(id);
  return id;
}
