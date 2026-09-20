import { classify, lintProse, MODELS, systemBlocks, voiceGuide, write, type Evidence, type Profile, type Skill, type RhubarbDb } from "@rhubarb/core";
import { z } from "zod";

const SkillOut = z.object({
  existingId: z.number().nullable().describe("id of an existing skill this evidence belongs to, or null for a new skill"),
  name: z.string().describe("short, specific skill name, e.g. 'Kubernetes rolling deployments' not 'DevOps'"),
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
- Cluster evidence into skills. A skill is a capability someone builds over weeks, not a fact. Merge into an existing skill when the evidence clearly belongs to it (use existingId).
- Priority (0-100) weighs: stated intent (they said they want this) highest; then urgency from upcoming calendar stakes; then how often and how recently it came up; then how deep the gap looks; then fit with their declared goals. Passing curiosity with no follow-up ranks low.
- Respect off-limits topics from the profile absolutely: never create a skill in one, and put that evidence in drop.
- The brief is written to the reader in the house voice. Cite the actual moments: what they said, roughly when, who was there if known. Say why now. End with what it would take.
- Prefer three to six skills total. Fewer, sharper skills beat a long list.`;

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
  return list.map((s) => `- id ${s.id} | ${s.name} | status ${s.status} | level ${s.level} | priority ${s.priority}`).join("\n");
}

function renderProfile(p: Profile | null): string {
  if (!p) return "No profile yet: assume a curious generalist with no stated goals or off-limits topics.";
  return `Learning style: ${p.style}\nSession length: ${p.sessionMinutes} minutes\nWhen they like to learn: ${p.learningWindows}\nGoals they already named: ${p.goals.join("; ") || "(none)"}\nOff-limits topics: ${p.offLimits.join("; ") || "(none)"}`;
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

/** Cluster unassigned evidence into skills, rank, and write briefs. Returns ids of skills created or updated. */
export async function runReflection(deps: ReflectDeps): Promise<number[]> {
  const { db, log } = deps;
  const evidence = db.unassignedSkillEvidence();
  if (evidence.length === 0) {
    log("reflect: nothing new to reflect on");
    return [];
  }
  const existing = db.skillsByStatus(["proposed", "active"]);
  const profile = db.getProfile();

  const user = `## The person\n${renderProfile(profile)}\n\n## Skills already on their board\n${renderSkills(existing)}\n\n## New evidence since last reflection\n${renderEvidence(evidence)}\n\nToday is ${new Date().toDateString()}.`;

  const out = await classify({
    model: MODELS.writer,
    effort: "high",
    maxTokens: 12000,
    system: systemBlocks(voiceGuide(), ROLE),
    user,
    schema: Reflection,
  });

  const touched: number[] = [];
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
      id = db.insertSkill({ name: s.name, domain: s.domain, competentLooksLike: s.competentLooksLike, terms: s.terms, priority: s.priority, brief });
      log(`reflect: new skill #${id} ${s.name} (priority ${s.priority})`);
    }
    const validIds = s.evidenceIds.filter((eid) => evidence.some((e) => e.id === eid));
    if (validIds.length > 0) db.assignEvidenceToSkill(validIds, id);
    touched.push(id);
  }

  // Evidence the model dropped is parked on a sentinel so it isn't re-fed every night.
  if (out.drop.length > 0) db.assignEvidenceToSkill(out.drop.filter((eid) => evidence.some((e) => e.id === eid)), -1);

  return touched;
}
