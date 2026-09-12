/**
 * Dev aid: schedule a recall practice for a spark card, delivered as a Bee alarm.
 *   node packages/daemon/dist/scripts/schedule-practice.js <cardId> [minutesFromNow]
 * The running daemon grades the voice-note answer.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { BeeClient, WaggleDb } from "@waggle/core";
import { schedulePractice } from "../pipeline/practice.js";

const cardId = Number(process.argv[2]);
const minutes = Number(process.argv[3] ?? 2);
if (!cardId) {
  console.error("usage: schedule-practice <cardId> [minutes]");
  process.exit(1);
}

const db = new WaggleDb(join(process.env.WAGGLE_DATA_DIR ?? join(homedir(), ".waggle"), "waggle.db"));
const card = db.getCard(cardId);
if (!card) {
  console.error(`no card ${cardId}`);
  process.exit(1);
}

const id = await schedulePractice(
  { db, bee: new BeeClient(), log: console.log },
  {
    skillId: null,
    lessonId: null,
    cardId,
    kind: "recall",
    prompt: `Quick one: explain ${card.title.replace(/^how /i, "how ")} in your own words, like you're telling a friend.`,
    rubric: card.answerMd,
    at: new Date(Date.now() + minutes * 60_000),
  }
);
console.log(`practice ${id} scheduled`);
db.close();
