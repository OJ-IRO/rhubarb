import Database from "better-sqlite3";
import type { Card, Item, ItemKind, ItemStatus, Quiz, QuizStatus } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS utterances (
  id INTEGER PRIMARY KEY,            -- Bee utterance id
  conversation_uuid TEXT NOT NULL,
  text TEXT NOT NULL,
  spoken_at TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'stream',  -- 'stream' | 'sweep'
  processed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  source_text TEXT NOT NULL,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'detected',
  confidence REAL,
  utterance_id INTEGER,
  conversation_uuid TEXT,
  spoken_at TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  place TEXT,
  speaker_label TEXT
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  title TEXT NOT NULL,
  answer_md TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fsrs_state (
  card_id INTEGER PRIMARY KEY REFERENCES cards(id),
  due_at INTEGER NOT NULL,
  fsrs_card TEXT NOT NULL              -- serialized ts-fsrs Card
);
CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  bee_todo_id INTEGER,
  question_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_for INTEGER NOT NULL,
  journal_id TEXT,
  answer_text TEXT,
  grade TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS journals (
  id TEXT PRIMARY KEY,               -- Bee journal id
  text TEXT,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_utterances_processed ON utterances(processed);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);
`;

export class WaggleDb {
  readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // --- kv (cursors etc.) ---
  getKv(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setKv(key: string, value: string): void {
    this.db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  // --- utterances ---
  /** Returns false if the utterance was already stored (dedupe on Bee id). */
  insertUtterance(u: { id: number; conversationUuid: string; text: string; spokenAt: string; source: "stream" | "sweep" }): boolean {
    const res = this.db
      .prepare("INSERT OR IGNORE INTO utterances (id, conversation_uuid, text, spoken_at, received_at, source) VALUES (?, ?, ?, ?, ?, ?)")
      .run(u.id, u.conversationUuid, u.text, u.spokenAt, Date.now(), u.source);
    return res.changes > 0;
  }

  unprocessedUtterances(limit = 50): Array<{ id: number; conversation_uuid: string; text: string; spoken_at: string }> {
    return this.db
      .prepare("SELECT id, conversation_uuid, text, spoken_at FROM utterances WHERE processed = 0 ORDER BY id LIMIT ?")
      .all(limit) as Array<{ id: number; conversation_uuid: string; text: string; spoken_at: string }>;
  }

  markUtterancesProcessed(ids: number[]): void {
    const stmt = this.db.prepare("UPDATE utterances SET processed = 1 WHERE id = ?");
    const tx = this.db.transaction((all: number[]) => all.forEach((id) => stmt.run(id)));
    tx(ids);
  }

  /** Recent utterance texts in a time window, for cross-channel dedupe against journals. */
  recentUtteranceTexts(sinceMs: number): string[] {
    return (this.db
      .prepare("SELECT text FROM utterances WHERE received_at >= ?")
      .all(sinceMs) as Array<{ text: string }>).map((r) => r.text);
  }

  // --- journals ---
  upsertJournal(j: { id: string; text: string | null; state: string }): void {
    this.db
      .prepare(
        "INSERT INTO journals (id, text, state, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET text = excluded.text, state = excluded.state"
      )
      .run(j.id, j.text, j.state, Date.now());
  }

  deleteJournal(id: string): void {
    this.db.prepare("DELETE FROM journals WHERE id = ?").run(id);
  }

  recentJournalTexts(sinceMs: number): string[] {
    return (this.db
      .prepare("SELECT text FROM journals WHERE created_at >= ? AND text IS NOT NULL")
      .all(sinceMs) as Array<{ text: string }>).map((r) => r.text);
  }

  // --- items ---
  insertItem(i: {
    kind: ItemKind;
    sourceText: string;
    utteranceId: number | null;
    conversationUuid: string | null;
    spokenAt: string;
    speakerLabel?: string | null;
  }): number {
    const res = this.db
      .prepare(
        "INSERT INTO items (kind, source_text, utterance_id, conversation_uuid, spoken_at, created_at, speaker_label) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(i.kind, i.sourceText, i.utteranceId, i.conversationUuid, i.spokenAt, Date.now(), i.speakerLabel ?? null);
    return Number(res.lastInsertRowid);
  }

  updateItemClassification(id: number, status: ItemStatus, topic: string | null, confidence: number | null): void {
    this.db.prepare("UPDATE items SET status = ?, topic = ?, confidence = ? WHERE id = ?").run(status, topic, confidence, id);
  }

  setItemPlace(id: number, place: string): void {
    this.db.prepare("UPDATE items SET place = ? WHERE id = ?").run(place, id);
  }

  itemsByStatus(status: ItemStatus, limit = 100): Item[] {
    return (this.db
      .prepare("SELECT * FROM items WHERE status = ? ORDER BY id DESC LIMIT ?")
      .all(status, limit) as Array<Record<string, unknown>>).map(rowToItem);
  }

  // --- cards ---
  insertCard(c: { itemId: number; title: string; answerMd: string; citations: Array<{ title: string; url: string }> }): number {
    const res = this.db
      .prepare("INSERT INTO cards (item_id, title, answer_md, citations, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(c.itemId, c.title, c.answerMd, JSON.stringify(c.citations), Date.now());
    this.db.prepare("UPDATE items SET status = 'researched' WHERE id = ?").run(c.itemId);
    return Number(res.lastInsertRowid);
  }

  getCard(id: number): Card | null {
    const r = this.db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? rowToCard(r) : null;
  }

  // --- FSRS scheduling state ---
  setFsrsState(cardId: number, dueAt: number, serialized: string): void {
    this.db
      .prepare("INSERT INTO fsrs_state (card_id, due_at, fsrs_card) VALUES (?, ?, ?) ON CONFLICT(card_id) DO UPDATE SET due_at = excluded.due_at, fsrs_card = excluded.fsrs_card")
      .run(cardId, dueAt, serialized);
  }

  getFsrsState(cardId: number): { dueAt: number; fsrsCard: string } | null {
    const r = this.db.prepare("SELECT due_at, fsrs_card FROM fsrs_state WHERE card_id = ?").get(cardId) as
      | { due_at: number; fsrs_card: string }
      | undefined;
    return r ? { dueAt: r.due_at, fsrsCard: r.fsrs_card } : null;
  }

  dueCards(nowMs: number, limit = 5): Array<{ cardId: number; dueAt: number }> {
    return (this.db
      .prepare(
        `SELECT f.card_id AS cardId, f.due_at AS dueAt FROM fsrs_state f
         WHERE f.due_at <= ? AND NOT EXISTS (
           SELECT 1 FROM quizzes q WHERE q.card_id = f.card_id AND q.status IN ('scheduled','delivered','answered')
         ) ORDER BY f.due_at LIMIT ?`
      )
      .all(nowMs, limit)) as Array<{ cardId: number; dueAt: number }>;
  }

  // --- quizzes ---
  insertQuiz(q: { cardId: number; questionText: string; scheduledFor: number; beeTodoId: number | null }): number {
    const res = this.db
      .prepare("INSERT INTO quizzes (card_id, question_text, scheduled_for, bee_todo_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(q.cardId, q.questionText, q.scheduledFor, q.beeTodoId, Date.now());
    return Number(res.lastInsertRowid);
  }

  updateQuizStatus(id: number, status: QuizStatus): void {
    this.db.prepare("UPDATE quizzes SET status = ? WHERE id = ?").run(status, id);
  }

  attachQuizAnswer(id: number, journalId: string, answerText: string): void {
    this.db
      .prepare("UPDATE quizzes SET journal_id = ?, answer_text = ?, status = 'answered' WHERE id = ?")
      .run(journalId, answerText, id);
  }

  gradeQuiz(id: number, grade: object): void {
    this.db.prepare("UPDATE quizzes SET grade = ?, status = 'graded' WHERE id = ?").run(JSON.stringify(grade), id);
  }

  openQuizzes(): Quiz[] {
    return (this.db
      .prepare("SELECT * FROM quizzes WHERE status IN ('scheduled','delivered') ORDER BY scheduled_for")
      .all() as Array<Record<string, unknown>>).map(rowToQuiz);
  }
}

function rowToItem(r: Record<string, unknown>): Item {
  return {
    id: r.id as number,
    kind: r.kind as ItemKind,
    sourceText: r.source_text as string,
    topic: (r.topic as string) ?? null,
    status: r.status as ItemStatus,
    confidence: (r.confidence as number) ?? null,
    utteranceId: (r.utterance_id as number) ?? null,
    conversationUuid: (r.conversation_uuid as string) ?? null,
    spokenAt: r.spoken_at as string,
    createdAt: r.created_at as number,
    place: (r.place as string) ?? null,
    speakerLabel: (r.speaker_label as string) ?? null,
  };
}

function rowToCard(r: Record<string, unknown>): Card {
  return {
    id: r.id as number,
    itemId: r.item_id as number,
    title: r.title as string,
    answerMd: r.answer_md as string,
    citations: r.citations as string,
    createdAt: r.created_at as number,
  };
}

function rowToQuiz(r: Record<string, unknown>): Quiz {
  return {
    id: r.id as number,
    cardId: r.card_id as number,
    beeTodoId: (r.bee_todo_id as number) ?? null,
    questionText: r.question_text as string,
    status: r.status as QuizStatus,
    scheduledFor: r.scheduled_for as number,
    journalId: (r.journal_id as string) ?? null,
    answerText: (r.answer_text as string) ?? null,
    grade: (r.grade as string) ?? null,
    createdAt: r.created_at as number,
  };
}
