import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { BeeStreamEvent, BeeTodo } from "./types.js";

const DEFAULT_PROXY = "http://127.0.0.1:8787";
// The proxy 415s on bare application/json — the charset parameter is required (FRICTION-LOG.md 2026-09-12).
const JSON_CT = "application/json; charset=utf-8";

export class BeeClient {
  constructor(private readonly baseUrl: string = process.env.BEE_PROXY_URL ?? DEFAULT_PROXY) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": JSON_CT } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Bee API ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  me(): Promise<{ id: number; first_name: string; last_name: string; timezone: string }> {
    return this.request("GET", "/v1/me");
  }

  createTodo(text: string, alarmAtIso?: string): Promise<BeeTodo> {
    return this.request("POST", "/v1/todos", alarmAtIso ? { text, alarm_at: alarmAtIso } : { text });
  }

  deleteTodo(id: number): Promise<{ success: boolean }> {
    return this.request("DELETE", `/v1/todos/${id}`);
  }

  completeTodo(id: number): Promise<BeeTodo> {
    return this.request("PUT", `/v1/todos/${id}`, { completed: true });
  }

  createFact(text: string): Promise<{ id: number; text: string }> {
    return this.request("POST", "/v1/facts", { text });
  }

  changes(cursor?: string): Promise<Record<string, unknown>> {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return this.request("GET", `/v1/changes${q}`);
  }

  recentVisits(limit = 20): Promise<{ visits?: Array<Record<string, unknown>> } & Record<string, unknown>> {
    return this.request("GET", `/v1/locations/recent?limit=${limit}`);
  }
}

export interface StreamConsumerOptions {
  /** Called for every typed event. */
  onEvent: (ev: BeeStreamEvent) => void;
  onStatus?: (msg: string) => void;
  /** Restart backoff cap in ms. */
  maxBackoffMs?: number;
}

/**
 * Consumes `bee stream --json` as a child process and emits typed events.
 * The CLI owns auth + TLS (private CA), so this is the most robust transport.
 * At-most-once semantics: pair with a periodic /v1/changes sweep for durability.
 */
export class BeeStreamConsumer {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private stopped = false;
  private backoffMs = 1_000;

  constructor(private readonly opts: StreamConsumerOptions) {}

  start(): void {
    this.stopped = false;
    this.spawnOnce();
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill("SIGTERM");
    this.child = null;
  }

  private spawnOnce(): void {
    if (this.stopped) return;
    this.opts.onStatus?.("spawning bee stream");
    const child = spawn("bee", ["stream", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;

    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return;
      }
      const ev = parsed as Record<string, unknown>;
      if (typeof ev.type !== "string") {
        // connect handshake ({timestamp}) — reset backoff, nothing to emit
        this.backoffMs = 1_000;
        this.opts.onStatus?.("stream connected");
        return;
      }
      this.opts.onEvent(ev as unknown as BeeStreamEvent);
    });

    child.stderr.on("data", (d: Buffer) => this.opts.onStatus?.(`bee stream stderr: ${d.toString().trim()}`));

    child.on("exit", (code) => {
      rl.close();
      if (this.stopped) return;
      this.opts.onStatus?.(`bee stream exited (${code}); restarting in ${this.backoffMs}ms`);
      setTimeout(() => this.spawnOnce(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, this.opts.maxBackoffMs ?? 60_000);
    });
  }
}

/** Normalized token-set Jaccard similarity, for cross-channel dedupe of journals vs ambient utterances. */
export function textSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1)
    );
  const ta = tok(a);
  const tb = tok(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}
