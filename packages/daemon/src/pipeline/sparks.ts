import { initCardSchedule, lintProse, systemBlocks, textSimilarity, voiceGuide, type Evidence, type RhubarbDb } from "@rhubarb/core";
import { z } from "zod";
import { researchThenEmit } from "./research.js";

const CardSchema = z.object({
  title: z.string().describe("the question, rephrased cleanly, under 80 characters"),
  answerMd: z.string().describe("one paragraph, three to six sentences, that actually answers it"),
  citations: z.array(z.object({ title: z.string(), url: z.string() })).describe("sources actually used; empty if none"),
});

const ROLE = `You write Rhubarb's spark cards. A spark is a passing curiosity someone voiced during their day. Answer it in one paragraph, the way a knowledgeable friend would over coffee: the real mechanism, one concrete detail worth remembering, no throat-clearing. If sources were searched, cite only the ones you actually drew on.`;

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

  const system = systemBlocks(voiceGuide(), ROLE);
  const baseAsk = `Spark: "${topic}"\nWhat they actually said: "${e.text}"\n\nWhat was going on when they said it:\n${e.context ?? "(no context)"}`;
  const research = (feedback?: string[]) =>
    researchThenEmit({
      system,
      ask: feedback?.length ? `${baseAsk}\n\nA previous draft was rejected by the editor for: ${feedback.join("; ")}. Fix those.` : baseAsk,
      schema: CardSchema,
      emitName: "emit_card",
      emitDescription: "Return the finished spark card.",
      maxSearches: 2,
      maxTokens: 3000,
    });

  let card = await research();
  const lint = lintProse(card.answerMd);
  if (!lint.ok) {
    log(`spark #${itemId} draft failed lint (${lint.issues.map((i) => i.rule).join(",")}); regenerating`);
    card = await research(lint.issues.map((i) => `${i.rule}: ${i.detail}`));
  }

  const cardId = db.insertCard({ itemId, title: card.title, answerMd: card.answerMd, citations: card.citations });
  initCardSchedule(db, cardId);
  log(`spark card #${cardId}: ${card.title}`);
  return cardId;
}
