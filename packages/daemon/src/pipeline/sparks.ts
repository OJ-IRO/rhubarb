import { initCardSchedule, lintProse, systemBlocks, textSimilarity, unavailableReason, voiceGuide, type Evidence, type RhubarbDb } from "@rhubarb/core";
import { z } from "zod";
import { researchThenEmit } from "./research.js";

const CardSchema = z.object({
  title: z.string().describe("the question, rephrased cleanly, under 80 characters"),
  answerMd: z.string().describe("one paragraph, three to six sentences, that actually answers it"),
  citations: z.array(z.object({ title: z.string(), url: z.string() })).describe("sources actually used; empty if none"),
});

const ROLE = `You write Rhubarb's spark cards. Never invent a person or a name: use a name only if it appears in what was heard. A spark is a passing curiosity someone voiced during their day. Answer it in one paragraph, the way a knowledgeable friend would over coffee: the real mechanism, one concrete detail worth remembering, no throat-clearing. If sources were searched, cite only the ones you actually drew on.`;

export interface SparkDeps {
  db: RhubarbDb;
  log: (msg: string) => void;
}

/** The same wondering often arrives twice (restated, or echoed); one card per topic per day. */
function recentDuplicate(db: RhubarbDb, topic: string): boolean {
  const dayAgo = Date.now() - 24 * 3600_000;
  return db
    .cardsWithItems(50)
    .some(({ card, item }) => card.createdAt >= dayAgo && item.topic && textSimilarity(item.topic, topic) >= 0.6);
}

/** Turn classified spark evidence into an answer card with a recall schedule. Returns 0 if it was a duplicate. */
export async function buildSpark(deps: SparkDeps, e: Evidence, topic: string): Promise<number> {
  const { db, log } = deps;
  if (recentDuplicate(db, topic)) {
    log(`spark skipped (duplicate topic): ${topic}`);
    return 0;
  }
  const itemId = db.insertItem({
    kind: e.kind === "gap" ? "gap" : "question",
    sourceText: e.text,
    topic,
    utteranceId: e.utteranceId,
    conversationUuid: e.conversationUuid,
    spokenAt: e.spokenAt,
    speakerLabel: e.speakerLabel,
  });
  if (e.place) db.setItemPlace(itemId, e.place);

  const card = await writeCard(log, { label: `#${itemId}`, topic, text: e.text, context: e.context, place: e.place });

  const cardId = db.insertCard({ itemId, title: card.title, answerMd: card.answerMd, citations: card.citations });
  initCardSchedule(db, cardId);
  log(`spark card #${cardId}: ${card.title}`);
  return cardId;
}

type CardOut = z.infer<typeof CardSchema>;

/** Research and write one spark card, fixing its style once without searching again. */
async function writeCard(
  log: (m: string) => void,
  m: { label: string; topic: string | null; text: string; context: string | null; place: string | null }
): Promise<CardOut> {
  const system = systemBlocks(voiceGuide(), ROLE);
  const baseAsk = `${m.topic ? `Spark: "${m.topic}"` : "Spark: work out what they were wondering from their own words below."}${m.place ? `\nWhere they were: ${m.place}` : ""}\nWhat they actually said: "${m.text}"\n\nWhat was going on when they said it:\n${m.context ?? "(no context)"}`;
  let card = await researchThenEmit({
    system,
    ask: baseAsk,
    schema: CardSchema,
    emitName: "emit_card",
    emitDescription: "Return the finished spark card.",
    maxSearches: 2,
    maxTokens: 3000,
  });
  const lint = lintProse(card.answerMd);
  if (!lint.ok) {
    // Fix the paragraph it has instead of searching the web all over again.
    log(`spark ${m.label} draft failed lint (${lint.issues.map((i) => i.rule).join(",")}); revising`);
    card = await researchThenEmit({
      system,
      ask: `${baseAsk}\n\nYour draft:\n${JSON.stringify(card)}\n\nThe editor rejected it for: ${lint.issues.map((i) => `${i.rule}: ${i.detail}`).join("; ")}. Return the card with those fixed, keeping the facts and sources.`,
      schema: CardSchema,
      emitName: "emit_card",
      emitDescription: "Return the finished spark card.",
      maxSearches: 0,
      maxTokens: 3000,
    });
  }
  return card;
}

export interface SparkRewrite {
  state: "writing" | "done" | "failed";
  at: number;
  reason?: string;
}

/**
 * The wearer fixed what Bee heard for a spark. Answer it again from their words, in place: the
 * card keeps its guess and its recall schedule, and the answer is what changes.
 */
export async function reanswerSpark(deps: SparkDeps, cardId: number): Promise<void> {
  const { db, log } = deps;
  const card = db.getCard(cardId);
  const item = card ? db.getItem(card.itemId) : null;
  if (!card || !item) throw new Error("no such spark");
  const e = item.utteranceId ? db.evidenceByUtterance(item.utteranceId) : null;
  const key = `spark_rewrite:${cardId}`;
  db.setKv(key, JSON.stringify({ state: "writing", at: Date.now() } satisfies SparkRewrite));
  try {
    const out = await writeCard(log, { label: `card #${cardId}`, topic: null, text: item.sourceText, context: e?.context ?? null, place: item.place });
    db.updateCard(cardId, out);
    db.setKv(key, JSON.stringify({ state: "done", at: Date.now() } satisfies SparkRewrite));
    log(`spark card #${cardId} answered again from the corrected words: ${out.title}`);
  } catch (err) {
    db.setKv(key, JSON.stringify({ state: "failed", at: Date.now(), reason: unavailableReason(err) ?? "something went wrong while writing it" } satisfies SparkRewrite));
    throw err;
  }
}
