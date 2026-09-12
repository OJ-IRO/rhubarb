import type { Practice, Skill, WaggleDb } from "@waggle/core";
import type { Grade } from "./practice.js";

/**
 * A level is done when its lesson is finished and the learner has shown it,
 * either by a strong teach-back (4/5 or better) or by using the skill for real.
 * Returns the new level index, or null if nothing changed.
 */
export function maybeAdvance(db: WaggleDb, skill: Skill, reason: { teachbackScore?: number; fieldLevel?: number }): number | null {
  const ladder = db.ladderFor(skill.id);
  const current = ladder.find((l) => l.idx === skill.level);
  if (!current) return null;

  const lesson = db.currentLesson(skill.id, skill.level);
  const lessonDone = lesson?.status === "done";
  const shown = (reason.teachbackScore ?? 0) >= 4 || (reason.fieldLevel ?? -1) >= skill.level;
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

export function onTeachbackGraded(db: WaggleDb, p: Practice, grade: Grade): number | null {
  if (p.kind !== "teachback" || !p.skillId) return null;
  const skill = db.getSkill(p.skillId);
  return skill ? maybeAdvance(db, skill, { teachbackScore: grade.score }) : null;
}

export function onFieldCredited(db: WaggleDb, skillId: number, level: number): number | null {
  const skill = db.getSkill(skillId);
  return skill ? maybeAdvance(db, skill, { fieldLevel: level }) : null;
}
