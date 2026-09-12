/**
 * Replay real Bee stream events from a log file through the capture layer.
 * Development aid only: lets the classifier and spark research run on real
 * captured speech without waiting for new conversations.
 *
 *   node packages/daemon/dist/scripts/replay.js docs/spike-stream.log
 *
 * Log lines are "HH:MM:SS.xxx {json}" (as written by the spike) or bare JSON.
 * Writes to the same SQLite the daemon uses; the daemon's timers pick the evidence up.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { WaggleDb, type BeeStreamEvent } from "@waggle/core";
import { handleStreamEvent } from "../pipeline/capture.js";

const file = process.argv[2];
if (!file) {
  console.error("usage: replay <log file>");
  process.exit(1);
}

const DATA_DIR = process.env.WAGGLE_DATA_DIR ?? join(homedir(), ".waggle");
const db = new WaggleDb(join(DATA_DIR, "waggle.db"));
const deps = {
  db,
  log: (m: string) => console.log(m),
  onJournalReady: (id: string, text: string) => console.log(`(journal ready ${id}: ${text.slice(0, 60)})`),
};

let n = 0;
for (const raw of readFileSync(file, "utf8").split("\n")) {
  const at = raw.indexOf("{");
  if (at < 0) continue;
  let ev: unknown;
  try {
    ev = JSON.parse(raw.slice(at));
  } catch {
    continue;
  }
  if (typeof (ev as { type?: unknown }).type !== "string") continue;
  handleStreamEvent(deps, ev as BeeStreamEvent);
  n++;
}
console.log(`replayed ${n} events`);
db.close();
