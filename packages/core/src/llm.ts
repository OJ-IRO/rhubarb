import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Bedrock model ids (us-east-1). The writer writes and judges; the worker handles volume.
 *
 * These are cross-region inference profiles on the classic Bedrock endpoint, not the newer
 * Mantle one. A new AWS account is not allowed the newest models (Claude Opus 5, Sonnet 5,
 * Opus 4.8, 4.7 all answer "not available for this account"), and the Mantle endpoint serves
 * only those. Opus 4.6 and Sonnet 4.6 are the strongest models such an account can run, and
 * support everything this code uses: adaptive thinking, effort, and cached system blocks.
 * Override with RHUBARB_WRITER_MODEL / RHUBARB_WORKER_MODEL once the account is allowed more.
 */
/**
 * Two ways to reach Claude. With ANTHROPIC_API_KEY set, Rhubarb talks to Anthropic directly and
 * uses the current models. Otherwise it goes through Amazon Bedrock, where a new AWS account may
 * be held to older models and a token quota that starts at zero until AWS Support raises it.
 */
export const DIRECT = Boolean(process.env.ANTHROPIC_API_KEY);

export const MODELS = {
  writer: process.env.RHUBARB_WRITER_MODEL ?? (DIRECT ? "claude-opus-5" : "us.anthropic.claude-opus-4-6-v1"),
  worker: process.env.RHUBARB_WORKER_MODEL ?? (DIRECT ? "claude-sonnet-5" : "global.anthropic.claude-sonnet-4-6"),
} as const;

/** Opus 4.6 and Sonnet 4.6 take low, medium, high and max. xhigh arrived with 4.7 and would be a 400 here. */
export type Effort = "low" | "medium" | "high" | "max";

let client: Anthropic | AnthropicBedrock | null = null;
export function llm(): Anthropic | AnthropicBedrock {
  client ??= DIRECT ? new Anthropic() : new AnthropicBedrock({ awsRegion: process.env.AWS_REGION ?? "us-east-1" });
  return client;
}

/** For logs and the dashboard: which way Claude is being reached. */
export function llmRoute(): string {
  return DIRECT ? `Anthropic API (${MODELS.writer}, ${MODELS.worker})` : `Amazon Bedrock ${process.env.AWS_REGION ?? "us-east-1"} (${MODELS.writer}, ${MODELS.worker})`;
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

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await llm().messages.create({
      model: opts.model ?? MODELS.worker,
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
    });
    if (res.stop_reason === "refusal") throw new Error(`model refused: ${res.stop_details?.explanation ?? "no explanation"}`);
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!call) throw new Error("model did not call the emit tool");
    const parsed = opts.schema.safeParse(call.input);
    if (parsed.success) return parsed.data;
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
  throw new Error("structured output failed schema validation twice");
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
  const stream = llm().messages.stream({
    model: opts.model ?? (opts.quick ? MODELS.worker : MODELS.writer),
    max_tokens: opts.maxTokens ?? (opts.quick ? 2000 : 16000),
    system: opts.system,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? (opts.quick ? "low" : "high") },
    messages: opts.messages,
  });
  if (opts.onText) stream.on("text", opts.onText);
  const msg = await stream.finalMessage();
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
