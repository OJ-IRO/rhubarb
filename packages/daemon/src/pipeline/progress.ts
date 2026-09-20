import type { Practice, Skill, RhubarbDb } from "@rhubarb/core";
import type { Grade } from "./practice.js";

/**
 * A level is done when its lesson is finished and the learner has shown it,
 * either by a strong teach-back (4/5 or better) or by using the skill for real.
 * Returns the new level index, or null if nothing changed.
 */
export function maybeAdvance(db: RhubarbDb, skill: Skill, reason: { teachbackScore?: number; fieldLevel?: number }): number | null {
  const ladder = db.ladderFor(skill.id);
  const current = ladder.find((l) => l.idx === skill.level);
  if (!current) return null;

  const lesson = db.currentLesson(skill.id, skill.level);
  const lessonDone = lesson?.status === "done";
  const shown = (reason.teachbackScore ?? 0) >= 4 || fieldShowsLevel(reason.fieldLevel, skill.level);
  if (!lessonDone || !shown) return null;

  db.setLevelStatus(skill.id, skill.level, "done");
  const next = skill.level + 1;
  if (next >= ladder.length) {
    db.updateSkill(skill.id, { status: "mastered", level: next });
    return next;
  }
  db.setLevelStatus(skill.id, next, "current");
  db.updateSkill(skill.id, { level: next });
  return next;
}

/**
 * The field judge sees the ladder numbered from 1 ("1. Follow the conversation") and answers in
 * those numbers, with 0 for "not used". A skill's level is a 0-based index into the same ladder.
 * So rung N on the judge's scale is index N - 1 here. Comparing the two directly promoted a
 * learner on rung 2 for showing only rung 1.
 */
export function fieldShowsLevel(judgedRung: number | undefined, levelIdx: number): boolean {
  return (judgedRung ?? 0) - 1 >= levelIdx;
}

/** Highest rung (judge's 1-based scale) any credited real-world moment has shown for this skill. */
export function bestFieldRung(db: RhubarbDb, skillId: number): number {
  let best = 0;
  for (const fe of db.fieldEvidenceForSkill(skillId)) {
    if (!fe.credited || !fe.verdict) continue;
    try {
      best = Math.max(best, Number((JSON.parse(fe.verdict) as { level?: number }).level ?? 0));
    } catch {
      /* a verdict we can't read credits nothing */
    }
  }
  return best;
}

export function onTeachbackGraded(db: RhubarbDb, p: Practice, grade: Grade): number | null {
  if (p.kind !== "teachback" || !p.skillId) return null;
  const skill = db.getSkill(p.skillId);
  return skill ? maybeAdvance(db, skill, { teachbackScore: grade.score }) : null;
}

export function onFieldCredited(db: RhubarbDb, skillId: number, level: number): number | null {
  const skill = db.getSkill(skillId);
  return skill ? maybeAdvance(db, skill, { fieldLevel: level }) : null;
}
