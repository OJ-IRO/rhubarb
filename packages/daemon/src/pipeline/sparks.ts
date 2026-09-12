import {
  classify,
  initCardSchedule,
  lintProse,
  llm,
  MODELS,
  systemBlocks,
  voiceGuide,
  type Evidence,
  type WaggleDb,
} from "@waggle/core";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const CardSchema = z.object({
  title: z.string().describe("the question, rephrased cleanly, under 80 characters"),
  answerMd: z.string().describe("one paragraph, three to six sentences, that actually answers it"),
  citations: z.array(z.object({ title: z.string(), url: z.string() })).describe("sources actually used; empty if none"),
});
type CardOut = z.infer<typeof CardSchema>;

const ROLE = `You write Waggle's spark cards. A spark is a passing curiosity someone voiced during their day. Answer it in one paragraph, the way a knowledgeable friend would over coffee: the real mechanism, one concrete detail worth remembering, no throat-clearing. If sources were searched, cite only the ones you actually drew on.`;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 5, search_depth: "basic" }),
  });
  if (!res.ok) throw new Error(`tavily ${res.status}`);
  const data = (await res.json()) as { results?: TavilyResult[] };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, content: r.content.slice(0, 1200) }));
}

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_web",
  description: "Search the web for sources. Use at most twice, then write the card.",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

const emitSchema = z.toJSONSchema(CardSchema) as Record<string, unknown>;
delete emitSchema.$schema;
const EMIT_TOOL: Anthropic.Tool = {
  name: "emit_card",
  description: "Return the finished spark card.",
  input_schema: emitSchema as Anthropic.Tool["input_schema"],
};

/** Research with web search (Tavily) in a small manual tool loop; falls back to model knowledge without a key. */
async function researchCard(question: string, context: string | null, feedback?: string[]): Promise<CardOut> {
  const system = systemBlocks(voiceGuide(), ROLE);
  const ask = `Spark: "${question}"\n\nWhat was going on when they said it:\n${context ?? "(no context)"}${
    feedback?.length ? `\n\nA previous draft was rejected by the editor for: ${feedback.join("; ")}. Fix those.` : ""
  }`;

  if (!process.env.TAVILY_API_KEY) {
    return classify({ model: MODELS.writer, effort: "medium", system, user: ask, schema: CardSchema, maxTokens: 2000 });
  }

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: ask }];
  for (let turn = 0; turn < 5; turn++) {
    const res = await llm().messages.create({
      model: MODELS.writer,
      max_tokens: 4000,
      system,
      output_config: { effort: "medium" },
      tools: [SEARCH_TOOL, EMIT_TOOL],
      messages,
    });
    if (res.stop_reason === "refusal") throw new Error("model refused spark research");
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const emit = calls.find((c) => c.name === "emit_card");
    if (emit) {
      const parsed = CardSchema.safeParse(emit.input);
      if (parsed.success) return parsed.data;
    }
    if (calls.length === 0) break;
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      if (call.name === "search_web") {
        const q = (call.input as { query: string }).query;
        const hits = await tavilySearch(q).catch((e: Error) => [{ title: "search failed", url: "", content: e.message }]);
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(hits) });
      } else {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Card did not match the schema; call emit_card again." });
      }
    }
    messages.push({ role: "user", content: results });
  }
  // Loop exhausted without a valid card: one forced emit.
  return classify({ model: MODELS.writer, effort: "medium", system, user: ask, schema: CardSchema, maxTokens: 2000 });
}

export interface SparkDeps {
  db: WaggleDb;
  log: (msg: string) => void;
}

/** Turn classified spark evidence into an answer card with a recall schedule. */
export async function buildSpark(deps: SparkDeps, e: Evidence, topic: string): Promise<number> {
  const { db, log } = deps;
  const itemId = db.insertItem({
    kind: e.kind === "gap" ? "gap" : "question",
    sourceText: e.text,
    topic,
    utteranceId: e.utteranceId,
    conversationUuid: e.conversationUuid,
    spokenAt: e.spokenAt,
    speakerLabel: e.speakerLabel,
  });

  let card = await researchCard(topic, e.context);
  const lint = lintProse(card.answerMd);
  if (!lint.ok) {
    log(`spark #${itemId} draft failed lint (${lint.issues.map((i) => i.rule).join(",")}); regenerating`);
    card = await researchCard(topic, e.context, lint.issues.map((i) => `${i.rule}: ${i.detail}`));
  }

  const cardId = db.insertCard({ itemId, title: card.title, answerMd: card.answerMd, citations: card.citations });
  initCardSchedule(db, cardId);
  log(`spark card #${cardId}: ${card.title}`);
  return cardId;
}
