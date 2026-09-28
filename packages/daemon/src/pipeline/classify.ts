import { classify, type Evidence, type RhubarbDb } from "@rhubarb/core";
import { z } from "zod";

const Verdict = z.object({
  id: z.number(),
  kind: z.enum(["question", "gap", "struggle", "intent", "exposure", "stake"]),
  route: z.enum(["spark", "skill", "noise"]).describe(
    "spark = a passing curiosity worth a one-paragraph answer; skill = points at something the speaker needs to become competent at; noise = not a learning signal (small talk, media playing, assistant commands, sarcasm)"
  ),
  topic: z.string().nullable().describe("what this is about, as a short noun phrase; null for noise"),
  confidence: z.number().min(0).max(1),
});

const Batch = z.object({ verdicts: z.array(Verdict) });

const SYSTEM = `You classify moments captured by a wearable microphone worn by one person through their day. Each item is one thing they (or someone near them) said, with the surrounding lines for context. The wearer is the speaker unless the context makes clear someone else was talking.

Decide, for each item:
- kind: question (they want to know something), gap (they hedged or misstated a fact they were trying to state), struggle (they did not understand something said to them), intent (they said they want to learn or improve at something), exposure (a domain they are clearly around but not fluent in, including a line in a language they are learning), stake (an upcoming event that raises the cost of not knowing).
- route: spark if it is a passing curiosity that a paragraph would satisfy; skill if it points at a capability worth building up over time; noise if it is not a learning signal at all. Noise is TV or podcast audio, jokes, commands to Siri or Alexa, rhetorical questions, and small talk between other people that says nothing about what the wearer wants to know. A real question with some substance behind it is a spark even when it was asked in passing.
- Their goals are a tiebreaker, not a filter. Anything that touches a goal (a line in a language they are learning, a moment where that goal was needed) routes to skill. Everything else is judged on its own.
- topic: a short noun phrase naming the subject.
- confidence: how sure you are about kind and route together.

Return one verdict per item id.`;

export interface ClassifyDeps {
  db: RhubarbDb;
  log: (msg: string) => void;
  /** Called for evidence routed to the sparks lane. */
  onSpark: (e: Evidence, topic: string) => void;
}

type VerdictOut = z.infer<typeof Verdict>;

/**
 * Classify a batch. If the model call fails (a refusal on something sensitive it overheard, a
 * malformed reply twice over, a token limit), split the batch and try each half, down to single
 * items. An item that fails alone comes back with no verdict, and the caller files it as noise.
 * Without this, the same oldest 25 rows were retried every two minutes forever and nothing
 * behind them was ever classified.
 */
async function classifyResilient(db: RhubarbDb, items: Evidence[], log: (msg: string) => void): Promise<VerdictOut[]> {
  const goals = db.getProfile()?.goals ?? [];
  const header = `Goals they named: ${goals.join("; ") || "(none)"}\n\n`;
  const user = header + items
    .map((e) => `### item ${e.id} (heuristic kind: ${e.kind}, spoken ${e.spokenAt})\nline: "${e.text}"\ncontext:\n${e.context ?? "(none)"}`)
    .join("\n\n");
  try {
    return (await classify({ system: SYSTEM, user, schema: Batch, maxTokens: 8000 })).verdicts;
  } catch (e) {
    if (items.length === 1) {
      log(`classify: gave up on evidence #${items[0].id} (${(e as Error).message})`);
      return [];
    }
    const mid = Math.ceil(items.length / 2);
    log(`classify: batch of ${items.length} failed (${(e as Error).message}); splitting`);
    return [...(await classifyResilient(db, items.slice(0, mid), log)), ...(await classifyResilient(db, items.slice(mid), log))];
  }
}

/** Stage-2: batch-classify detected evidence with context. Runs on a timer. */
export async function runClassifyBatch(deps: ClassifyDeps, limit = 25): Promise<number> {
  const { db, log } = deps;
  const pending = db.evidenceByStage("detected", limit);
  if (pending.length === 0) return 0;

  const verdicts = await classifyResilient(db, pending, log);
  const byId = new Map(pending.map((e) => [e.id, e]));
  let handled = 0;

  for (const v of verdicts) {
    const e = byId.get(v.id);
    if (!e) continue;
    db.classifyEvidence(e.id, { kind: v.kind, route: v.route, topic: v.topic, confidence: v.confidence });
    handled++;
    log(`classified #${e.id} -> ${v.route}/${v.kind} (${v.confidence.toFixed(2)}) ${v.topic ?? ""}`);
    if (v.route === "spark" && v.topic) deps.onSpark({ ...e, kind: v.kind, topic: v.topic }, v.topic);
  }

  // Anything the model skipped is marked noise so it doesn't loop forever.
  for (const e of pending) {
    if (!verdicts.some((v) => v.id === e.id)) {
      db.classifyEvidence(e.id, { kind: e.kind, route: "noise", topic: null, confidence: 0 });
    }
  }
  return handled;
}
