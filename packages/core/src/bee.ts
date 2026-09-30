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

  /** Durable changefeed: arrays of entity ids changed since the cursor. */
  changes(cursor?: string): Promise<{
    facts: number[];
    conversations: number[];
    dailies: number[];
    journals: string[];
    todos: number[];
    next_cursor: string;
    since: number;
    until: number;
    updated: boolean;
  }> {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return this.request("GET", `/v1/changes${q}`);
  }

  getConversation(id: number): Promise<Record<string, unknown>> {
    return this.request("GET", `/v1/conversations/${id}`);
  }

  todayBrief(): Promise<{ calendar_events: Array<Record<string, unknown>>; emails: Array<Record<string, unknown>>; timezone: string }> {
    return this.request("GET", "/v1/todayBrief");
  }

  /** Places Bee has seen the wearer spend time, with visit counts and dwell. */
  locationClusters(): Promise<{ clusters?: Array<{ latitude?: number; longitude?: number; total_dwell_ms?: number; visit_count?: number }> }> {
    return this.request("GET", "/v1/locations/clusters");
  }

  listConversations(limit = 50): Promise<{ conversations?: Array<{ id: number; start_time?: number; end_time?: number | null; primary_location?: { address?: string; latitude?: number; longitude?: number } | null }> }> {
    return this.request("GET", `/v1/conversations?limit=${limit}`);
  }

  recentVisits(limit = 20): Promise<{ visits?: Array<Record<string, unknown>> } & Record<string, unknown>> {
    return this.request("GET", `/v1/locations/recent?limit=${limit}`);
  }
}

export type StreamState = "connecting" | "connected" | "down";

export interface StreamConsumerOptions {
  /** Called for every typed event. */
  onEvent: (ev: BeeStreamEvent) => void;
  onStatus?: (msg: string) => void;
  /** Connection state, for showing the wearer whether Rhubarb can hear their Bee. */
  onState?: (state: StreamState) => void;
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
    this.opts.onState?.("connecting");
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
        this.opts.onState?.("connected");
        return;
      }
      // One malformed event, or a database hiccup while handling it, must not take the daemon down.
      try {
        this.opts.onEvent(ev as unknown as BeeStreamEvent);
      } catch (e) {
        this.opts.onStatus?.(`stream event dropped (${String(ev.type)}): ${(e as Error).message}`);
      }
    });

    child.stderr.on("data", (d: Buffer) => this.opts.onStatus?.(`bee stream stderr: ${d.toString().trim()}`));

    // A spawn failure (bee not on PATH, too many open files) emits "error" and may never emit
    // "exit". Without a listener it would be an uncaught exception. Either event restarts, once.
    let restarted = false;
    const restart = (why: string) => {
      rl.close();
      if (this.stopped || restarted) return;
      restarted = true;
      if (this.child === child) this.child = null;
      this.opts.onState?.("down");
      this.opts.onStatus?.(`bee stream ${why}; restarting in ${this.backoffMs}ms`);
      setTimeout(() => this.spawnOnce(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, this.opts.maxBackoffMs ?? 60_000);
    };
    child.on("error", (e) => restart(`failed to run (${e.message})`));
    child.on("exit", (code) => restart(`exited (${code})`));
  }
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
}

/**
 * How much of the shorter text's vocabulary appears in the longer one (0..1).
 *
 * A voice note comes back through the ambient channel in 4-10 second chunks, so each chunk is a
 * small piece of the note. Jaccard similarity scores a 12-word chunk of a 60-word note around 0.2
 * and misses it; containment scores it near 1.
 */
export function textContainment(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let inter = 0;
  for (const w of small) if (large.has(w)) inter++;
  return inter / small.size;
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
