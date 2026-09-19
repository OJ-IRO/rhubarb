import { judge, lintProse, matchesSkillTerms, systemBlocks, voiceGuide, write, type BeeClient, type RhubarbDb } from "@rhubarb/core";
import { z } from "zod";
import { renderContext } from "./capture.js";

const Verdict = z.object({
  used: z.boolean().describe("the wearer actually exercised this skill here (not just heard someone else, not just mentioned the topic)"),
  correct: z.boolean().describe("what they said was accurate and competent for this skill"),
  level: z.number().int().min(0).max(5).describe("how far up the ladder this moment shows them to be, 0 if not used"),
  note: z.string().describe("one or two sentences to the learner about this moment, in the house voice"),
});

const ROLE = `You judge field evidence for Rhubarb. The wearer of a microphone has been studying a skill. Here is a moment from a later real conversation that touched that skill. Decide whether the wearer used the skill themselves, and whether they used it well. Be honest: repeating a term is not using a skill; explaining, deciding, or teaching with it is. Only credit clear cases.`;

export interface FieldDeps {
  db: RhubarbDb;
  bee: BeeClient;
  log: (msg: string) => void;
  onCredited?: (skillId: number, level: number) => void;
}

/** Scan recent utterances for active skills' signal terms and queue candidates. Cheap; runs after each classify batch. */
export function findFieldCandidates(db: RhubarbDb, sinceMs: number, log: (m: string) => void): number {
  const active = db.skillsByStatus(["active"]);
  if (active.length === 0) return 0;
  const recent = db.recentUtterances(sinceMs);
  let queued = 0;
  for (const skill of active) {
    const terms = JSON.parse(skill.terms) as string[];
    for (const u of recent) {
      if (matchesSkillTerms(u.text, terms).length === 0) continue;
      const context = renderContext(db.conversationWindow(u.conversation_uuid, u.id, 5));
      if (db.insertFieldCandidate({ skillId: skill.id, utteranceId: u.id, text: u.text, context, spokenAt: u.spoken_at })) queued++;
    }
  }
  if (queued > 0) log(`field: ${queued} candidate moments queued`);
  return queued;
}

/** Judge queued candidates; credit real uses and tell the learner. */
export async function judgeFieldEvidence(deps: FieldDeps): Promise<number> {
  const { db, bee, log } = deps;
  let credited = 0;
  for (const fe of db.unjudgedFieldEvidence()) {
    const skill = db.getSkill(fe.skillId);
    if (!skill) continue;
    const ladder = db.ladderFor(skill.id);
    // The context saved at queue time predates the nightly sweep, so its lines have no
    // speaker labels. Re-read it now to use whatever labels have arrived since.
    const window = db.windowAroundUtterance(fe.utteranceId, 5);
    const context = window ? renderContext(window) : fe.context;
    let v = await judge({
      system: systemBlocks(voiceGuide(), ROLE),
      user: `Skill: ${skill.name}\nCompetent use sounds like: ${skill.competentLooksLike}\nLadder: ${ladder.map((l) => `${l.idx + 1}. ${l.title}: ${l.outcome}`).join("; ") || "(none)"}\n\nThe moment (${fe.spokenAt}):\n"${fe.text}"\n\nAround it:\n${context ?? "(none)"}`,
      schema: Verdict,
    });
    const ok = v.used && v.correct;
    if (ok && !lintProse(v.note).ok) {
      const fixed = await write({
        quick: true,
        system: systemBlocks(voiceGuide(), "Rewrite this note so it follows the guide. Keep it to two sentences."),
        messages: [{ role: "user", content: v.note }],
      });
      v = { ...v, note: fixed.trim() };
    }
    db.setFieldVerdict(fe.id, v, ok);
    if (!ok) continue;
    credited++;
    log(`field: credited ${skill.name} at level ${v.level}: "${fe.text.slice(0, 60)}"`);
    await bee.createTodo(`Heard you use ${skill.name} today. ${v.note}`.slice(0, 1900), new Date(Date.now() + 60_000).toISOString()).catch((e: Error) => log(`field nudge failed: ${e.message}`));
    deps.onCredited?.(skill.id, v.level);
  }
  return credited;
}
