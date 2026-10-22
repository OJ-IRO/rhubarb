import { classify, localDayOf, readingNote, lintProse, MODELS, systemBlocks, voiceGuide, write, type Evidence, type Profile, type Skill, type RhubarbDb } from "@rhubarb/core";
import { z } from "zod";

const SkillOut = z.object({
  // Optional with a default: a reply that leaves it out is still a usable proposal, and a strict
  // field here failed the whole night's reflection twice over.
  kind: z
    .enum(["skill", "topic"])
    .default("skill")
    .describe("skill: a capability built over weeks (a language, negotiating). topic: one lesson's worth, something they kept circling and would enjoy understanding properly (the history of a place, how a machine works)"),
  existingId: z.number().nullable().describe("id of an existing skill this evidence belongs to, or null for a new skill"),
  name: z.string().describe("short, specific skill name, e.g. 'Asking for tax-free at the register' not 'Japanese'"),
  domain: z.string().nullable(),
  competentLooksLike: z.string().describe("one sentence: what it sounds like when this person uses the skill well in conversation"),
  terms: z.array(z.string()).describe("6-12 words or phrases that signal this skill is in play when overheard"),
  priority: z.number().min(0).max(100),
  brief: z.string().describe("three or four sentences to the reader explaining why this, why now, grounded in what was actually said and when"),
  evidenceIds: z.array(z.number()),
});

const Reflection = z.object({
  skills: z.array(SkillOut),
  /** ids judged not worth a skill after all */
  drop: z.array(z.number()).describe("evidence ids that do not belong to any skill worth pursuing"),
});

const ROLE = `You are Rhubarb's reflection pass. You read moments a wearable microphone caught during one person's days: questions they asked, things they hedged or got wrong, things they said they wanted to learn, jargon they were around, and upcoming events on their calendar. Your job is to decide what skills their life is actually asking them to build, and to rank them.

Rules:
- Cluster evidence into proposals. Each one is a skill (a capability someone builds over weeks) or a topic (one lesson on something their day kept circling, worth understanding properly). A single fact is neither: leave it for the sparks lane and put it in drop. Merge into an existing proposal when the evidence clearly belongs to it (use existingId).
- These are proposals the person will say yes or no to. Propose from what their conversations reveal, whether or not it matches a goal they already named. A named goal raises priority; it never decides what may be proposed.
- Priority (0-100) weighs: stated intent (they said they want this) highest; then urgency from upcoming calendar stakes; then how often and how recently it came up; then how deep the gap looks; then fit with their declared goals. Passing curiosity with no follow-up ranks low.
- Respect off-limits topics from the profile absolutely: never create a skill in one, and put that evidence in drop.
- The brief is written to the reader in the house voice. Cite the actual moments: what they said, roughly when, who was there if known. Say why now. End with what it would take.
- Prefer three to six proposals on the board at once. Fewer, sharper ones beat a long list.
- The brief never uses the person's name.
- Where the reader confirmed or corrected something, that is what happened. Never build a proposal on something they said was wrong. State nothing as fact that they haven't confirmed; where a brief rests on an unconfirmed moment, say what was heard, not what it means.`;

export interface ReflectDeps {
  db: RhubarbDb;
  log: (msg: string) => void;
}

function renderEvidence(list: Evidence[]): string {
  return list
    .map(
      (e) =>
        `- id ${e.id} | ${e.kind} | ${e.spokenAt}${e.place ? ` | at ${e.place}` : ""}${e.speakerLabel ? ` | speaker ${e.speakerLabel}` : ""}\n  said: "${e.text}"${
          e.topic ? `\n  about: ${e.topic}` : ""
        }`
    )
    .join("\n");
}

function renderSkills(list: Skill[]): string {
  if (list.length === 0) return "(none yet)";
  return list.map((s) => `- id ${s.id} | ${s.kind} | ${s.name} | status ${s.status} | level ${s.level} | priority ${s.priority}`).join("\n");
}

function renderProfile(p: Profile | null, reading: string): string {
  if (!p) return "No profile yet: assume a curious generalist with no stated goals or off-limits topics.";
  return `Learning style: ${p.style}\nSession length: ${p.sessionMinutes} minutes\nWhen they like to learn: ${p.learningWindows}\nGoals they already named: ${p.goals.join("; ") || "(none)"}\nOff-limits topics: ${p.offLimits.join("; ") || "(none)"}${reading ? `\n${reading} (This applies to the briefs too.)` : ""}`;
}

async function fixBrief(brief: string, reasons: string[]): Promise<string> {
  const fixed = await write({
    model: MODELS.writer,
    effort: "medium",
    maxTokens: 1500,
    system: systemBlocks(voiceGuide(), "Rewrite this brief so it follows the guide. Keep every concrete fact and the reasoning."),
    messages: [{ role: "user", content: `Problems: ${reasons.join("; ")}\n\nBrief:\n${brief}` }],
  });
  return fixed.trim();
}

/** Cluster unassigned evidence into proposals, rank, and write briefs. Returns ids of proposals created or updated, and which were new. */
export async function runReflection(deps: ReflectDeps): Promise<{ touched: number[]; created: number[] }> {
  const { db, log } = deps;
  // A day still waiting for its review is held back (for up to two days): proposals come from what
  // the reader confirmed, not from a first guess. Spoken asks already started on their own.
  const held = db.heldDays();
  const evidence = db.unassignedSkillEvidence().filter((e) => !held.has(localDayOf(Date.parse(e.spokenAt))));
  if (evidence.length === 0) {
    log("reflect: nothing new to reflect on");
    return { touched: [], created: [] };
  }
  const existing = db.skillsByStatus(["proposed", "active"]);
  const profile = db.getProfile();

  const reading = readingNote(existing, profile?.goals ?? []);
  const notes = db.reviewNotes(localDayOf(Date.now() - 14 * 86_400_000));
  const user = `${notes.length ? `## What the reader confirmed, corrected and answered (trust this over the moments)\n${notes.map((n) => `- ${n}`).join("\n")}\n\n` : ""}## The person\n${renderProfile(profile, reading)}\n\n## Skills already on their board\n${renderSkills(existing)}\n\n## New evidence since last reflection\n${renderEvidence(evidence)}\n\nToday is ${new Date().toDateString()}.`;

  const out = await classify({
    model: MODELS.writer,
    effort: "high",
    maxTokens: 12000,
    system: systemBlocks(voiceGuide(), ROLE),
    user,
    schema: Reflection,
  });

  const touched: number[] = [];
  const created: number[] = [];
  for (const s of out.skills) {
    let brief = s.brief;
    const lint = lintProse(brief);
    if (!lint.ok) {
      log(`reflect: brief for "${s.name}" failed lint (${lint.issues.map((i) => i.rule).join(",")}); rewriting`);
      brief = await fixBrief(brief, lint.issues.map((i) => `${i.rule}: ${i.detail}`));
    }

    let id: number;
    if (s.existingId && db.getSkill(s.existingId)) {
      id = s.existingId;
      db.updateSkill(id, { priority: s.priority, brief, terms: s.terms, competentLooksLike: s.competentLooksLike });
      log(`reflect: updated skill #${id} ${s.name} (priority ${s.priority})`);
    } else {
      id = db.insertSkill({ name: s.name, domain: s.domain, competentLooksLike: s.competentLooksLike, terms: s.terms, priority: s.priority, brief, kind: s.kind, origin: "noticed" });
      created.push(id);
      log(`reflect: new ${s.kind} #${id} ${s.name} (priority ${s.priority})`);
    }
    const validIds = s.evidenceIds.filter((eid) => evidence.some((e) => e.id === eid));
    if (validIds.length > 0) db.assignEvidenceToSkill(validIds, id);
    touched.push(id);
  }

  // Evidence the model dropped is parked on a sentinel so it isn't re-fed every night.
  if (out.drop.length > 0) db.assignEvidenceToSkill(out.drop.filter((eid) => evidence.some((e) => e.id === eid)), -1);

  return { touched, created };
}
