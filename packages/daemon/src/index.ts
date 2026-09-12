import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BeeClient, BeeStreamConsumer, WaggleDb, type Evidence } from "@waggle/core";
import { handleStreamEvent } from "./pipeline/capture.js";
import { runClassifyBatch } from "./pipeline/classify.js";
import { handleJournalReady, sweepPractice } from "./pipeline/practice.js";
import { buildSpark } from "./pipeline/sparks.js";

const DATA_DIR = process.env.WAGGLE_DATA_DIR ?? join(homedir(), ".waggle");
mkdirSync(DATA_DIR, { recursive: true });

const CLASSIFY_INTERVAL_MS = 2 * 60_000;
const PRACTICE_SWEEP_MS = 60_000;

const db = new WaggleDb(join(DATA_DIR, "waggle.db"));
const bee = new BeeClient();

function log(msg: string): void {
  console.log(`[waggle ${new Date().toISOString()}] ${msg}`);
}

const practiceDeps = { db, bee, log };

const captureDeps = {
  db,
  log,
  onJournalReady: (journalId: string, text: string) => {
    handleJournalReady(practiceDeps, journalId, text).catch((e: Error) => log(`grading failed: ${e.message}`));
  },
};

const sparkQueue: Array<{ e: Evidence; topic: string }> = [];
let sparking = false;
async function drainSparks(): Promise<void> {
  if (sparking) return;
  sparking = true;
  try {
    while (sparkQueue.length > 0) {
      const next = sparkQueue.shift()!;
      await buildSpark({ db, log }, next.e, next.topic).catch((err: Error) => log(`spark failed: ${err.message}`));
    }
  } finally {
    sparking = false;
  }
}

const classifyDeps = {
  db,
  log,
  onSpark: (e: Evidence, topic: string) => {
    sparkQueue.push({ e, topic });
    void drainSparks();
  },
};

let classifying = false;
async function classifyTick(): Promise<void> {
  if (classifying) return;
  classifying = true;
  try {
    const n = await runClassifyBatch(classifyDeps);
    if (n > 0) log(`classified ${n} evidence`);
  } catch (e) {
    log(`classify failed: ${(e as Error).message}`);
  } finally {
    classifying = false;
  }
}

const me = await bee.me().catch((e: Error) => {
  log(`Bee proxy unreachable (${e.message}). Start it with: bee proxy --port 8787 --idle-timeout 0`);
  process.exit(1);
});
log(`connected as ${me.first_name} ${me.last_name}; data dir ${DATA_DIR}`);

const consumer = new BeeStreamConsumer({ onEvent: (ev) => handleStreamEvent(captureDeps, ev), onStatus: log });
consumer.start();

const timers = [
  setInterval(() => void classifyTick(), CLASSIFY_INTERVAL_MS),
  setInterval(() => sweepPractice(db), PRACTICE_SWEEP_MS),
];
void classifyTick();

process.on("SIGINT", () => {
  timers.forEach(clearInterval);
  consumer.stop();
  db.close();
  process.exit(0);
});
