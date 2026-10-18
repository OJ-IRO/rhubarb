import { AsyncLocalStorage } from "node:async_hooks";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Two ways to reach Claude: Amazon Bedrock, or Anthropic's API directly.
 *
 * RHUBARB_LLM picks the first choice ("bedrock" or "anthropic"). Without it, an ANTHROPIC_API_KEY
 * means Anthropic, and no key means Bedrock. When Bedrock is first choice and a key is also set,
 * any call Bedrock can't serve (an account not yet allowed a model, a zero token quota, an outage)
 * is made again through Anthropic, so the learner never notices which way it went.
 *
 * Bedrock ids are cross-region inference profiles. A new AWS account is refused the newest models
 * ("not available for this account") and starts at a zero daily token quota until AWS Support
 * raises it. Override the models with RHUBARB_BEDROCK_WRITER_MODEL / RHUBARB_BEDROCK_WORKER_MODEL,
 * or RHUBARB_WRITER_MODEL / RHUBARB_WORKER_MODEL for the Anthropic route.
 */
type Route = "bedrock" | "anthropic";
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY);
const FIRST: Route = process.env.RHUBARB_LLM === "bedrock" || process.env.RHUBARB_LLM === "anthropic"
  ? process.env.RHUBARB_LLM
  : HAS_KEY ? "anthropic" : "bedrock";
const FALLBACK = FIRST === "bedrock" && HAS_KEY;
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";

const ROUTE_MODELS: Record<Route, { writer: string; worker: string }> = {
  bedrock: {
    writer: process.env.RHUBARB_BEDROCK_WRITER_MODEL ?? "us.anthropic.claude-opus-5",
    worker: process.env.RHUBARB_BEDROCK_WORKER_MODEL ?? "global.anthropic.claude-sonnet-5",
  },
  anthropic: {
    writer: process.env.RHUBARB_WRITER_MODEL ?? "claude-opus-5",
    worker: process.env.RHUBARB_WORKER_MODEL ?? "claude-sonnet-5",
  },
};

const routeStore = new AsyncLocalStorage<Route>();
function currentRoute(): Route {
  return routeStore.getStore() ?? FIRST;
}

/** The writer writes and judges; the worker handles volume. Read inside a call, they follow its route. */
export const MODELS = {
  get writer(): string {
    return ROUTE_MODELS[currentRoute()].writer;
  },
  get worker(): string {
    return ROUTE_MODELS[currentRoute()].worker;
  },
};

/** A model id chosen before a call started, translated to the route the call is actually taking. */
export function routeModel(id: string): string {
  const here = ROUTE_MODELS[currentRoute()];
  for (const r of Object.values(ROUTE_MODELS)) {
    if (id === r.writer) return here.writer;
    if (id === r.worker) return here.worker;
  }
  return id;
}

/** Opus 4.6 and Sonnet 4.6 take low, medium, high and max. xhigh arrived with 4.7 and would be a 400 there. */
export type Effort = "low" | "medium" | "high" | "max";

const clients: Partial<Record<Route, Anthropic | AnthropicBedrock>> = {};
export function llm(): Anthropic | AnthropicBedrock {
  const route = currentRoute();
  // With a fallback waiting, a refusal should hand over at once, not after the SDK's own retries.
  return (clients[route] ??= route === "anthropic"
    ? new Anthropic()
    : new AnthropicBedrock({ awsRegion: AWS_REGION, ...(FALLBACK ? { maxRetries: 0 } : {}) }));
}

/** For logs and the dashboard: which way Claude is being reached. */
export function llmRoute(): string {
  const describe = (r: Route) => r === "anthropic"
    ? `Anthropic API (${ROUTE_MODELS.anthropic.writer}, ${ROUTE_MODELS.anthropic.worker})`
    : `Amazon Bedrock ${AWS_REGION} (${ROUTE_MODELS.bedrock.writer}, ${ROUTE_MODELS.bedrock.worker})`;
  return FALLBACK ? `${describe("bedrock")}, falling back to ${describe("anthropic")}` : describe(FIRST);
}

// After Bedrock refuses, go straight to Anthropic for a while instead of being refused on every call.
const BEDROCK_REST_MS = 10 * 60_000;
let bedrockRefusedAt = 0;

async function onRoute<T>(call: () => Promise<T>): Promise<T> {
  if (!FALLBACK) return call();
  if (Date.now() - bedrockRefusedAt > BEDROCK_REST_MS) {
    try {
      return await routeStore.run("bedrock", call);
    } catch (e) {
      if (e instanceof BudgetReached || !unavailableReason(e)) throw e;
      bedrockRefusedAt = Date.now();
    }
  }
  return routeStore.run("anthropic", call);
}

// ---------------------------------------------------------------------------------------------
// Spend: what every call cost, what it was for, and a daily budget that pauses the expensive work.
// ---------------------------------------------------------------------------------------------

const purposeStore = new AsyncLocalStorage<string>();

/** Tag every Claude call made inside `fn` (across awaits) with what it was for. */
export function withPurpose<T>(purpose: string, fn: () => Promise<T>): Promise<T> {
  return purposeStore.run(purpose, fn);
}

export function currentPurpose(): string {
  return purposeStore.getStore() ?? "other";
}

export interface UsageRecord {
  at: number;
  purpose: string;
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** US dollars, at list price */
  cost: number;
}

interface SpendHooks {
  record(u: UsageRecord): void;
  spentToday(): number;
  /** null or 0 means no cap */
  budgetUsd(): number | null;
}

let spend: SpendHooks | null = null;
export function setSpendHooks(h: SpendHooks): void {
  spend = h;
}

/** List prices per million tokens. Cache writes cost 1.25x input, cache reads 0.1x. */
const PRICES: Array<[RegExp, { input: number; output: number }]> = [
  [/fable|mythos/, { input: 10, output: 50 }],
  [/opus-5-5/, { input: 4, output: 20 }],
  [/opus/, { input: 5, output: 25 }],
  [/sonnet-4-[56]/, { input: 3, output: 15 }],
  [/sonnet/, { input: 2, output: 10 }],
  [/haiku/, { input: 1, output: 5 }],
];

export function costOf(model: string, u: { input: number; output: number; cacheWrite: number; cacheRead: number }): number {
  const p = PRICES.find(([re]) => re.test(model))?.[1] ?? { input: 5, output: 25 };
  return (u.input * p.input + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.input * 0.1 + u.output * p.output) / 1_000_000;
}

/** Thrown before a call is made when today's budget is spent. Handled like an outage: held, not lost. */
export class BudgetReached extends Error {}

// Sorting what was heard and reading spoken asks are cheap and keep nothing from being lost, so
// they may run a little past the budget. Everything else stops at it.
const ESSENTIAL = new Set(["sorting moments", "asks"]);

function checkBudget(): void {
  const budget = spend?.budgetUsd();
  if (!spend || !budget || budget <= 0) return;
  const limit = ESSENTIAL.has(currentPurpose()) ? budget * 1.25 : budget;
  if (spend.spentToday() >= limit) throw new BudgetReached("today's writing limit is reached, so new lessons and answers wait until tomorrow");
}

function recordUsage(out: unknown): void {
  const r = out as { model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } };
  if (!spend || !r?.usage) return;
  const u = {
    input: r.usage.input_tokens ?? 0,
    output: r.usage.output_tokens ?? 0,
    cacheWrite: r.usage.cache_creation_input_tokens ?? 0,
    cacheRead: r.usage.cache_read_input_tokens ?? 0,
  };
  const model = r.model ?? "unknown";
  try {
    spend.record({ at: Date.now(), purpose: currentPurpose(), model, ...u, cost: costOf(model, u) });
  } catch {
    // Accounting must never break the work it is counting.
  }
}

/**
 * A failure about reaching Claude at all, not about this request: out of credit, the key refused,
 * rate limited, Anthropic having trouble, or the network. Work that fails this way is held and
 * retried later. It must never be judged, for example filed as noise. Null for anything else.
 */
export function unavailableReason(e: unknown): string | null {
  const status = (e as { status?: number } | null)?.status;
  const msg = String((e as Error | null)?.message ?? e ?? "");
  if (e instanceof BudgetReached) return msg;
  if (/credit balance is too low/i.test(msg)) return "the Anthropic account is out of credit";
  if (/not available for this account|quota|too many tokens per day/i.test(msg)) return "the account isn't allowed to use this model yet";
  if (status === 401 || status === 403) return "the API key was refused";
  if (status === 429 || /rate limit|too many requests/i.test(msg)) return "Claude is rate limiting us";
  if ((status && status >= 500) || /overloaded/i.test(msg)) return "Claude is having trouble on Anthropic's side";
  if (e instanceof Anthropic.APIConnectionError || /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up/i.test(msg)) return "Claude can't be reached";
  return null;
}

export interface LlmHealth {
  /** Plain words for the dashboard, or null when the last call got through. */
  problem: string | null;
  /** When the current problem started. */
  since: number | null;
  lastOkAt: number | null;
}

const health: LlmHealth = { problem: null, since: null, lastOkAt: null };

/** Whether Claude answered last time Rhubarb asked, for the dashboard. */
export function llmHealth(): LlmHealth {
  return { ...health };
}

/**
 * Every call to Claude goes through here: the budget is checked before it is made, its cost is
 * recorded after, and the dashboard can say plainly when Claude can't be reached.
 */
export async function tracked<T>(call: () => Promise<T>): Promise<T> {
  try {
    checkBudget();
    const out = await onRoute(call);
    recordUsage(out);
    health.problem = null;
    health.since = null;
    health.lastOkAt = Date.now();
    return out;
  } catch (e) {
    const reason = unavailableReason(e);
    if (reason) {
      if (health.problem !== reason) health.since = Date.now();
      health.problem = reason;
    }
    throw e;
  }
}

/** System prompt as cacheable blocks: stable guide first (cached), then the volatile part. */
export function systemBlocks(stable: string, volatile?: string): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: stable, cache_control: { type: "ephemeral" } }];
  if (volatile) blocks.push({ type: "text", text: volatile });
  return blocks;
}

export interface ClassifyOptions<T> {
  system: string | Anthropic.TextBlockParam[];
  user: string;
  schema: z.ZodType<T>;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
}

/**
 * Structured extraction/classification via a forced tool call, validated with zod.
 * Bedrock rejects `output_config.format`, so a forced tool call is the portable path;
 * a schema miss is retried once with the error attached.
 * Defaults to the worker model at low effort.
 */
export async function classify<T>(opts: ClassifyOptions<T>): Promise<T> {
  const schema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete schema.$schema;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
  let lastIssue = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await tracked(() => llm().messages.create({
      model: routeModel(opts.model ?? MODELS.worker),
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      output_config: { effort: opts.effort ?? "low" },
      tools: [
        {
          name: "emit",
          description: "Return the result in exactly the required structure.",
          input_schema: schema as Anthropic.Tool["input_schema"],
        },
      ],
      tool_choice: { type: "tool", name: "emit" },
      messages,
    }));
    if (res.stop_reason === "refusal") throw new Error(`model refused: ${res.stop_details?.explanation ?? "no explanation"}`);
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!call) throw new Error("model did not call the emit tool");
    const parsed = opts.schema.safeParse(call.input);
    if (parsed.success) return parsed.data;
    // Say which field was wrong, so a failure in the logs can be fixed instead of guessed at.
    lastIssue = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    messages.push(
      { role: "assistant", content: res.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: `Output did not match the schema: ${parsed.error.message}. Call emit again with a valid result.`,
          },
        ],
      }
    );
  }
  throw new Error(`structured output failed schema validation twice (${lastIssue})`);
}

export interface WriteOptions {
  system: string | Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  model?: string;
  effort?: Effort;
  maxTokens?: number;
  /** Short, latency-sensitive prose (nudges, feedback lines, tutor turns): worker model, low effort. */
  quick?: boolean;
  onText?: (delta: string) => void;
}

/** Prose generation, streamed. Long-form defaults to the writer model at high effort. */
export async function write(opts: WriteOptions): Promise<string> {
  const msg = await tracked(() => {
    const stream = llm().messages.stream({
      model: routeModel(opts.model ?? (opts.quick ? MODELS.worker : MODELS.writer)),
      max_tokens: opts.maxTokens ?? (opts.quick ? 2000 : 16000),
      system: opts.system,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? (opts.quick ? "low" : "high") },
      messages: opts.messages,
    });
    if (opts.onText) stream.on("text", opts.onText);
    return stream.finalMessage();
  });
  if (msg.stop_reason === "refusal") throw new Error(`model refused: ${msg.stop_details?.explanation ?? "no explanation"}`);
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Judgement with reasoning: writer model, structured result. */
export function judge<T>(opts: Omit<ClassifyOptions<T>, "model" | "effort"> & { effort?: Effort }): Promise<T> {
  return classify({ ...opts, model: MODELS.writer, effort: opts.effort ?? "medium" });
}
