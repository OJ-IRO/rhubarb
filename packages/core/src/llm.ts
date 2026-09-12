import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/** Bedrock model ids (us-east-1). Opus writes and judges; Sonnet handles volume. */
export const MODELS = {
  writer: "anthropic.claude-opus-5",
  worker: "anthropic.claude-sonnet-5",
} as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

let client: AnthropicBedrockMantle | null = null;
export function llm(): AnthropicBedrockMantle {
  client ??= new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION ?? "us-east-1" });
  return client;
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
 * Bedrock's Mantle endpoint rejects both `output_config.format` and `strict` tools,
 * so this is the portable path; a schema miss is retried once with the error attached.
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
