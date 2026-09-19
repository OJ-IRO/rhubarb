import { createHash } from "node:crypto";
import type { BeeClient, RhubarbDb } from "@rhubarb/core";
import { handleUtterance, type CaptureDeps } from "./capture.js";

export interface SweepDeps extends CaptureDeps {
  bee: BeeClient;
}

interface ConversationDetail {
  id?: number;
  conversation_uuid?: string;
  utterances?: Array<{ id: number; text: string; spoken_at: string; speaker?: string }>;
  transcriptions?: Array<{ utterances?: Array<{ id: number; text: string; spoken_at: string; speaker?: string }> }>;
}

/**
 * Durable backstop for the at-most-once stream: walk the changefeed and
 * re-ingest any conversation utterances the live stream missed.
 * Short conversations are deleted server-side (docs/spike-results.md), so this
 * only ever sees the ones that survived processing.
 */
export async function runSweep(deps: SweepDeps): Promise<{ conversations: number; utterances: number }> {
  const { db, bee, log } = deps;
  const cursor = db.getKv("changes_cursor") ?? undefined;
  const changes = await bee.changes(cursor);
  let utterances = 0;

  for (const convId of changes.conversations) {
    const detail = (await bee.getConversation(convId).catch((e: Error) => {
      log(`sweep: conversation ${convId} unavailable (${e.message})`);
      return null;
    })) as ConversationDetail | null;
    if (!detail) continue;
    const uuid = detail.conversation_uuid ?? String(detail.id ?? convId);
    const list = detail.utterances ?? detail.transcriptions?.flatMap((t) => t.utterances ?? []) ?? [];
    for (const u of list) {
      if (!u?.text) continue;
      handleUtterance(deps, uuid, u, "sweep");
      utterances++;
    }
  }

  db.setKv("changes_cursor", changes.next_cursor);
  log(`sweep: ${changes.conversations.length} conversations, ${utterances} utterances re-checked`);
  return { conversations: changes.conversations.length, utterances };
}

/** Upcoming calendar events become 'stake' evidence so reflection can weigh urgency. */
export async function ingestStakes(deps: { db: RhubarbDb; bee: BeeClient; log: (m: string) => void }): Promise<number> {
  const { db, bee, log } = deps;
  const brief = await bee.todayBrief().catch(() => null);
  if (!brief) return 0;
  const seen = new Set<string>(JSON.parse(db.getKv("stakes_seen") ?? "[]") as string[]);
  let added = 0;

  for (const ev of brief.calendar_events) {
    const title = String(ev.title ?? ev.summary ?? ev.name ?? "").trim();
    const start = String(ev.start ?? ev.start_time ?? ev.starts_at ?? "");
    if (!title) continue;
    const key = createHash("sha1").update(`${title}|${start}`).digest("hex");
    if (seen.has(key)) continue;
    seen.add(key);
    db.insertEvidence({ kind: "stake", text: title, context: JSON.stringify(ev), spokenAt: start || new Date().toISOString(), source: "calendar" });
    added++;
  }

  db.setKv("stakes_seen", JSON.stringify([...seen].slice(-500)));
  if (added > 0) log(`stakes: ${added} upcoming events noted`);
  return added;
}
