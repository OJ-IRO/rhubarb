import { classify, type WaggleDb } from "@waggle/core";
import { z } from "zod";

export interface LearningSlot {
  /** 0 = Sunday … 6 = Saturday */
  dow: number[];
  /** local time, HH:MM */
  time: string;
}

const Slots = z.object({
  slots: z.array(z.object({ dow: z.array(z.number().int().min(0).max(6)), time: z.string().regex(/^\d{2}:\d{2}$/) })),
});

/** Turn "weekday evenings after 8, sometimes Sunday mornings" into concrete weekly slots. */
export async function parseLearningWindows(text: string): Promise<LearningSlot[]> {
  if (!text.trim()) return [];
  const out = await classify({
    system:
      "Convert a person's description of when they like to learn into concrete weekly time slots. Use 24-hour local times. 'Commute' means 08:30 on weekdays unless they say otherwise; 'lunch' is 12:30; 'evening' is 20:00; 'morning' is 08:00. dow uses 0 for Sunday through 6 for Saturday.",
    user: text,
    schema: Slots,
  });
  return out.slots;
}

export function saveLearningSlots(db: WaggleDb, slots: LearningSlot[]): void {
  db.setKv("learning_slots", JSON.stringify(slots));
}

export function learningSlots(db: WaggleDb): LearningSlot[] {
  return JSON.parse(db.getKv("learning_slots") ?? "[]") as LearningSlot[];
}

/** The next time the reader said they like to learn; tomorrow 09:00 if they never said. */
export function nextLearningSlot(db: WaggleDb, from = new Date()): Date {
  if (process.env.WAGGLE_NUDGE_NOW) return new Date(from.getTime() + 2 * 60_000);
  const slots = learningSlots(db);
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const day = new Date(from);
    day.setDate(from.getDate() + dayOffset);
    for (const s of slots) {
      if (!s.dow.includes(day.getDay())) continue;
      const [h, m] = s.time.split(":").map(Number);
      const at = new Date(day);
      at.setHours(h, m, 0, 0);
      if (at.getTime() > from.getTime() + 60_000) candidates.push(at);
    }
  }
  if (candidates.length > 0) return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
  const fallback = new Date(from);
  fallback.setDate(from.getDate() + 1);
  fallback.setHours(9, 0, 0, 0);
  return fallback;
}
