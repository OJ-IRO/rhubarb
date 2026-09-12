import { classify, llm, MODELS, type Effort } from "@waggle/core";
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { z as zod } from "zod";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

export function hasWebSearch(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 5, search_depth: "basic" }),
  });
  if (!res.ok) throw new Error(`tavily ${res.status}`);
  const data = (await res.json()) as { results?: TavilyResult[] };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, content: r.content.slice(0, 1500) }));
}

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_web",
  description: "Search the web for sources. Use sparingly, then produce the result.",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

export interface ResearchOptions<T> {
  system: Anthropic.TextBlockParam[];
  ask: string;
  schema: z.ZodType<T>;
  emitName: string;
  emitDescription: string;
  maxSearches?: number;
  effort?: Effort;
  maxTokens?: number;
}

/**
 * Writer-model tool loop: optional web searches (Tavily) then a structured result.
 * Without a TAVILY_API_KEY the model answers from its own knowledge in one forced call.
 */
export async function researchThenEmit<T>(opts: ResearchOptions<T>): Promise<T> {
  const forced = () =>
    classify({
      model: MODELS.writer,
      effort: opts.effort ?? "medium",
      system: opts.system,
      user: opts.ask,
      schema: opts.schema,
      maxTokens: opts.maxTokens ?? 8000,
    });

  if (!hasWebSearch()) return forced();

  const emitSchema = zod.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete emitSchema.$schema;
  const emitTool: Anthropic.Tool = {
    name: opts.emitName,
    description: opts.emitDescription,
    input_schema: emitSchema as Anthropic.Tool["input_schema"],
  };

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.ask }];
  let searches = 0;
  const maxSearches = opts.maxSearches ?? 3;

  for (let turn = 0; turn < maxSearches + 3; turn++) {
    const res = await llm().messages.create({
      model: MODELS.writer,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "medium" },
      tools: searches < maxSearches ? [SEARCH_TOOL, emitTool] : [emitTool],
      messages,
    });
    if (res.stop_reason === "refusal") throw new Error("model refused research");
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const emit = calls.find((c) => c.name === opts.emitName);
    if (emit) {
      const parsed = opts.schema.safeParse(emit.input);
      if (parsed.success) return parsed.data;
    }
    if (calls.length === 0) break;

    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      if (call.name === "search_web") {
        searches++;
        const q = (call.input as { query: string }).query;
        const hits = await tavilySearch(q).catch((e: Error) => [{ title: "search failed", url: "", content: e.message }]);
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(hits) });
      } else {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Result did not match the schema; call ${opts.emitName} again with a valid result.` });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return forced();
}
