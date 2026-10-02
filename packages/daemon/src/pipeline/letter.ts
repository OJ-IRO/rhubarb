import { localDayOf, lintProse, readingNote, systemBlocks, voiceGuide, write, type RhubarbDb } from "@rhubarb/core";
import { todaysLesson } from "../api.js";

const ROLE = `You write the short note at the top of the reader's Rhubarb page each day. Three to five sentences. What their week has been asking of them, what is on the board and why, and the one thing to do today. Address them as "you"; never use their name. No headers, no lists. Only state as fact what the reader confirmed in a day review; anything unconfirmed is said as what was heard, or left out. Never guess at what they meant. If there is nothing new, say that honestly and keep it to two sentences.`;

/** Written after each reflection; shown on the Today page. */
export async function writeTodayLetter(db: RhubarbDb, log: (m: string) => void): Promise<void> {
  const profile = db.getProfile();
  const proposed = db.skillsByStatus(["proposed"]);
  const active = db.skillsByStatus(["active"]);
  const lesson = todaysLesson(db);
  const sparks = db.cardsWithItems(5);
  const reading = readingNote([...proposed, ...active], profile?.goals ?? []);
  const notes = db.reviewNotes(localDayOf(Date.now() - 7 * 86_400_000));

  const facts = `Today: ${new Date().toDateString()}\n\nProposed skills waiting for a decision:\n${
    proposed.map((s) => `- ${s.name} (priority ${s.priority}): ${s.brief}`).join("\n") || "(none)"
  }\n\nActive skills:\n${active.map((s) => `- ${s.name}, level ${s.level + 1}`).join("\n") || "(none)"}\n\nLesson ready today: ${
    lesson ? `${lesson.skill.name}, level ${lesson.skill.level + 1}` : "none"
  }\n\nRecent sparks:\n${sparks.map(({ card }) => `- ${card.title}`).join("\n") || "(none)"}\n\nWhat the reader confirmed or corrected in their day reviews (the only facts to state):\n${notes.map((n) => `- ${n}`).join("\n") || "(no review yet: state nothing as fact about what happened)"}`;

  let letter = await write({
    quick: true,
    maxTokens: 800,
    system: systemBlocks(voiceGuide(), `${ROLE}${reading ? `\n\n${reading}` : ""}`),
    messages: [{ role: "user", content: facts }],
  });
  letter = letter.trim();
  const lint = lintProse(letter);
  if (!lint.ok) {
    letter = (
      await write({
        quick: true,
        maxTokens: 800,
        system: systemBlocks(voiceGuide(), "Rewrite this note so it follows the guide. Keep the facts."),
        messages: [{ role: "user", content: `Problems: ${lint.issues.map((i) => i.detail).join("; ")}\n\n${letter}` }],
      })
    ).trim();
  }
  db.setKv("today_letter", letter);
  db.setKv("today_letter_date", new Date().toDateString());
  log("today letter written");
}
