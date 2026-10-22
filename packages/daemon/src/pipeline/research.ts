import { classify, llm, MODELS, tracked, type Effort } from "@rhubarb/core";
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

const RUN = 5;
const MAX_QUERY_CHARS = 120;

/**
 * A web search is the one place the wearer's speech could leave for a third party, because the
 * model writes the query with their quoted words in front of it. So a query is refused if it is
 * long, or if any run of five words in it appears word for word in what we showed the model.
 * A topic ("Tempozan Ferris wheel lights") passes. A sentence someone said does not.
 */
export function queryLeaksPrompt(query: string, shown: string): boolean {
  if (query.length > MAX_QUERY_CHARS) return true;
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const q = words(query);
  if (q.length < RUN) return false;
  const hay = ` ${words(shown).join(" ")} `;
  for (let i = 0; i + RUN <= q.length; i++) {
    if (hay.includes(` ${q.slice(i, i + RUN).join(" ")} `)) return true;
  }
  return false;
}

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_web",
  description:
    "Search the web for sources. Use sparingly, then produce the result. Queries go to an outside search service, so write them about the subject in general terms. Never put in the reader's own words, anyone's name, a workplace, or a place.",
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
 * Every turn of the loop resends the whole conversation so far: the brief, each search result,
 * each draft. Marking the end of it as cacheable means the next turn pays a tenth of the price
 * for everything it has already seen, instead of full price again.
 */
function cacheUpToHere(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = messages[messages.length - 1];
  if (!last) return messages;
  const content: Anthropic.ContentBlockParam[] = typeof last.content === "string" ? [{ type: "text", text: last.content }] : [...last.content];
  const tail = content[content.length - 1] as Anthropic.ContentBlockParam & { cache_control?: { type: "ephemeral" } };
  content[content.length - 1] = { ...tail, cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
  return [...messages.slice(0, -1), { ...last, content }];
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
    const res = await tracked(() =>
      llm().messages.create({
        model: MODELS.writer,
        max_tokens: opts.maxTokens ?? 8000,
        system: opts.system,
        thinking: { type: "adaptive" },
        output_config: { effort: opts.effort ?? "medium" },
        tools: searches < maxSearches ? [SEARCH_TOOL, emitTool] : [emitTool],
        messages: cacheUpToHere(messages),
      })
    );
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
        const q = String((call.input as { query?: unknown }).query ?? "");
        if (queryLeaksPrompt(q, opts.ask)) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Search refused: the query repeats the reader's own words. Search for the subject in general terms instead." });
          continue;
        }
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
