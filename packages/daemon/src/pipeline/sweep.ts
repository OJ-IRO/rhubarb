import { createHash } from "node:crypto";
import { textContainment, type BeeClient, type RhubarbDb } from "@rhubarb/core";
import { handleUtterance, type CaptureDeps } from "./capture.js";

export interface SweepDeps extends CaptureDeps {
  bee: BeeClient;
  /** Where the conversation happened, when Bee knows. */
  onPlace?: (conversationUuid: string, loc: { address?: string; latitude?: number; longitude?: number }) => void;
}

type RestUtterance = { id: number; text: string; spoken_at: string | number; speaker?: string | null };

interface ConversationDetail {
  id?: number;
  primary_location?: { address?: string; latitude?: number; longitude?: number } | null;
  conversation_uuid?: string;
  start_time?: number | string;
  end_time?: number | string | null;
  utterances?: RestUtterance[];
  transcriptions?: Array<{ realtime?: boolean; utterances?: RestUtterance[] }>;
}

// Bee re-transcribes a conversation after it ends. The cleaned-up words carry new ids and
// timestamps that drift a few seconds from the live ones, so a line is matched by time and text.
const MATCH_WINDOW_MS = 20_000;
const MATCH_SIMILARITY = 0.6;

function iso(t: string | number | null | undefined): string | null {
  if (t === null || t === undefined || t === "") return null;
  const d = new Date(typeof t === "number" || /^\d+$/.test(String(t)) ? Number(t) : String(t));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Bee writes "Unknown" where it could not tell who spoke. That is no label at all. */
function speakerLabel(s: string | null | undefined): string | null {
  if (!s || /^unknown$/i.test(s.trim())) return null;
  return s;
}

/** The detail endpoint wraps the conversation: { conversation: {...}, timezone }. */
function unwrap(raw: Record<string, unknown> | null): ConversationDetail | null {
  if (!raw) return null;
  return ((raw.conversation as ConversationDetail | undefined) ?? (raw as ConversationDetail)) || null;
}

/** Which stream conversation this REST one is, by the words we already stored in its time span. */
export function streamUuidFor(db: RhubarbDb, detail: ConversationDetail): string | null {
  const known = detail.id ? db.getKv(`conv:${detail.id}`) : null;
  if (known) return known;
  const from = iso(detail.start_time);
  const to = iso(detail.end_time ?? null) ?? (from ? new Date(Date.parse(from) + 3 * 3600_000).toISOString() : null);
  if (!from || !to) return null;
  const counts = new Map<string, number>();
  for (const u of db.utterancesBetween(from, to)) counts.set(u.conversation_uuid, (counts.get(u.conversation_uuid) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? null;
}

/** A line the live stream already gave us, under its own id. */
function alreadyHeard(db: RhubarbDb, text: string, spokenAt: string): { id: number; speaker: string | null } | null {
  const at = Date.parse(spokenAt);
  const near = db.utterancesBetween(new Date(at - MATCH_WINDOW_MS).toISOString(), new Date(at + MATCH_WINDOW_MS).toISOString());
  const hit = near.find((u) => u.text && textContainment(u.text, text) >= MATCH_SIMILARITY);
  return hit ? { id: hit.id, speaker: hit.speaker } : null;
}

/**
 * Durable backstop for the at-most-once stream: walk the changefeed and pick up any lines the
 * live stream missed (a dropped connection, a restart). Lines it already has are matched and
 * left alone, so a long conversation is never counted twice.
 * Short conversations are deleted server-side (docs/spike-results.md), so this only ever sees
 * the ones that survived processing.
 */
export async function runSweep(deps: SweepDeps): Promise<{ conversations: number; utterances: number; matched: number }> {
  const { db, bee, log } = deps;
  const cursor = db.getKv("changes_cursor") ?? undefined;
  const changes = await bee.changes(cursor);
  let added = 0;
  let matched = 0;

  for (const convId of changes.conversations) {
    const detail = unwrap(
      await bee.getConversation(convId).catch((e: Error) => {
        log(`sweep: conversation ${convId} unavailable (${e.message})`);
        return null;
      })
    );
    if (!detail) continue;
    const uuid = detail.conversation_uuid ?? streamUuidFor(db, detail) ?? `bee-${detail.id ?? convId}`;
    if (detail.primary_location) deps.onPlace?.(uuid, detail.primary_location);
    const list = detail.utterances ?? detail.transcriptions?.flatMap((t) => t.utterances ?? []) ?? [];
    for (const u of list) {
      const spokenAt = iso(u?.spoken_at);
      if (!u?.text || !spokenAt) continue;
      // If one utterance throws, skip it. Otherwise the cursor never advances and every
      // later night dies on the same conversation.
      try {
        const seen = alreadyHeard(db, u.text, spokenAt);
        const label = speakerLabel(u.speaker);
        if (seen) {
          matched++;
          if (label && !seen.speaker) db.insertUtterance({ id: seen.id, conversationUuid: uuid, text: u.text, spokenAt, source: "sweep", speaker: label });
          continue;
        }
        handleUtterance(deps, uuid, { id: u.id, text: u.text, spoken_at: spokenAt, speaker: label }, "sweep");
        added++;
      } catch (e) {
        log(`sweep: utterance ${u.id} skipped (${(e as Error).message})`);
      }
    }
  }

  db.setKv("changes_cursor", changes.next_cursor);
  log(`sweep: ${changes.conversations.length} conversations, ${matched} lines already heard live, ${added} recovered`);
  return { conversations: changes.conversations.length, utterances: added, matched };
}

/** Upcoming calendar events become 'stake' evidence so reflection can weigh urgency. */
export async function ingestStakes(deps: { db: RhubarbDb; bee: BeeClient; log: (m: string) => void }): Promise<number> {
  const { db, bee, log } = deps;
  const brief = await bee.todayBrief().catch(() => null);
  if (!brief) return 0;
  const seen = new Set<string>(JSON.parse(db.getKv("stakes_seen") ?? "[]") as string[]);
  let added = 0;

  // No calendar connected in the Bee app means no calendar_events field at all.
  for (const ev of Array.isArray(brief.calendar_events) ? brief.calendar_events : []) {
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
