import Database from "better-sqlite3";
import type {
  Card,
  Deck,
  Quiz,
  Evidence,
  EvidenceKind,
  EvidenceRoute,
  FieldEvidence,
  Item,
  ItemKind,
  ItemStatus,
  LadderLevel,
  LearningStyle,
  Lesson,
  LessonBeat,
  LessonSession,
  LevelStatus,
  Practice,
  PracticeKind,
  PracticeStatus,
  Profile,
  Skill,
  HistoryEntry,
  LearningProgress,
  PrivacySummary,
  ProgressPoint,
  SkillKind,
  SkillOrigin,
  SkillStatus,
} from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS utterances (
  id INTEGER PRIMARY KEY,
  conversation_uuid TEXT NOT NULL,
  text TEXT NOT NULL,
  spoken_at TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'stream',
  speaker TEXT,
  processed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS journals (
  id TEXT PRIMARY KEY,
  text TEXT,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  context TEXT,
  spoken_at TEXT NOT NULL,
  utterance_id INTEGER,
  conversation_uuid TEXT,
  speaker_label TEXT,
  place TEXT,
  source TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'detected',
  route TEXT,
  topic TEXT,
  confidence REAL,
  skill_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT,
  competent_looks_like TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed',
  priority REAL NOT NULL DEFAULT 0,
  brief TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ladder_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL REFERENCES skills(id),
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  outcome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'locked',
  UNIQUE(skill_id, idx)
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL REFERENCES skills(id),
  level_idx INTEGER NOT NULL,
  style TEXT NOT NULL,
  body_md TEXT NOT NULL,
  beats TEXT NOT NULL DEFAULT '[]',
  citations TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS lesson_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  responses TEXT NOT NULL DEFAULT '{}',
  tutor TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS practice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER,
  lesson_id INTEGER,
  card_id INTEGER,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  rubric TEXT,
  bee_todo_id INTEGER,
  marker TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_for INTEGER NOT NULL,
  journal_id TEXT,
  answer_text TEXT,
  grade TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS field_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL REFERENCES skills(id),
  utterance_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  context TEXT,
  spoken_at TEXT NOT NULL,
  verdict TEXT,
  credited INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(skill_id, utterance_id)
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
  fsrs_card TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS forgotten_utterances (
  id INTEGER PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_utterances_processed ON utterances(processed);
CREATE INDEX IF NOT EXISTS idx_utterances_received ON utterances(received_at);
CREATE INDEX IF NOT EXISTS idx_evidence_stage ON evidence(stage);
CREATE INDEX IF NOT EXISTS idx_evidence_skill ON evidence(skill_id);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_practice_status ON practice(status);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
`;

type Row = Record<string, unknown>;

export class RhubarbDb {
  readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Additive migrations for databases created before a column existed. */
  private migrate(): void {
    const cols = (this.db.prepare("PRAGMA table_info(lessons)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!cols.includes("deck")) this.db.exec("ALTER TABLE lessons ADD COLUMN deck TEXT NOT NULL DEFAULT '{}'");
    if (!cols.includes("quiz")) this.db.exec("ALTER TABLE lessons ADD COLUMN quiz TEXT NOT NULL DEFAULT '{\"questions\":[]}'");
    if (!cols.includes("review")) this.db.exec("ALTER TABLE lessons ADD COLUMN review TEXT");
    const ccols = (this.db.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!ccols.includes("guess")) {
      this.db.exec("ALTER TABLE cards ADD COLUMN guess TEXT");
      this.db.exec("ALTER TABLE cards ADD COLUMN guess_close INTEGER");
      this.db.exec("ALTER TABLE cards ADD COLUMN guess_note TEXT");
    }
    const ucols = (this.db.prepare("PRAGMA table_info(utterances)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!ucols.includes("echo")) this.db.exec("ALTER TABLE utterances ADD COLUMN echo INTEGER NOT NULL DEFAULT 0");
    if (!ucols.includes("private")) this.db.exec("ALTER TABLE utterances ADD COLUMN private INTEGER NOT NULL DEFAULT 0");
    const scols = (this.db.prepare("PRAGMA table_info(skills)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!scols.includes("kind")) this.db.exec("ALTER TABLE skills ADD COLUMN kind TEXT NOT NULL DEFAULT 'skill'");
    if (!scols.includes("origin")) this.db.exec("ALTER TABLE skills ADD COLUMN origin TEXT NOT NULL DEFAULT 'noticed'");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_utterances_spoken ON utterances(spoken_at)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_evidence_utterance ON evidence(utterance_id)");
  }

  close(): void {
    this.db.close();
  }

  // ------------------------------------------------------------------ kv / profile
  getKv(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setKv(key: string, value: string): void {
    this.db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  getProfile(): Profile | null {
    const raw = this.getKv("profile");
    return raw ? (JSON.parse(raw) as Profile) : null;
  }

  setProfile(p: Profile): void {
    this.setKv("profile", JSON.stringify(p));
  }

  // ------------------------------------------------------------------ utterances
  /**
   * Returns false if the utterance was already stored (dedupe on Bee id).
   *
   * The live stream carries no speaker label; only the nightly sweep of full
   * conversations does. So when a known utterance comes back with a label, the
   * label is kept (on the utterance and on any evidence drawn from it) rather
   * than being dropped along with the duplicate.
   */
  insertUtterance(u: {
    id: number;
    conversationUuid: string;
    text: string;
    spokenAt: string;
    source: "stream" | "sweep";
    speaker?: string | null;
  }): boolean {
    // Something the wearer asked us to forget stays forgotten, even when the nightly sweep
    // finds the same conversation on Bee's servers again.
    if (this.db.prepare("SELECT 1 FROM forgotten_utterances WHERE id = ?").get(u.id)) return false;
    const res = this.db
      .prepare(
        "INSERT OR IGNORE INTO utterances (id, conversation_uuid, text, spoken_at, received_at, source, speaker) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(u.id, u.conversationUuid, u.text, u.spokenAt, Date.now(), u.source, u.speaker ?? null);
    if (res.changes > 0) return true;
    if (u.speaker) {
      this.db.prepare("UPDATE utterances SET speaker = ? WHERE id = ? AND speaker IS NULL").run(u.speaker, u.id);
      this.db.prepare("UPDATE evidence SET speaker_label = ? WHERE utterance_id = ? AND speaker_label IS NULL").run(u.speaker, u.id);
    }
    return false;
  }

  /** The lines around one utterance, looked up by its id alone. Null if we never stored it. */
  windowAroundUtterance(utteranceId: number, radius = 4): Array<{ id: number; text: string; speaker: string | null; spoken_at: string }> | null {
    const row = this.db.prepare("SELECT conversation_uuid FROM utterances WHERE id = ?").get(utteranceId) as { conversation_uuid: string } | undefined;
    if (!row) return null;
    return this.conversationWindow(row.conversation_uuid, utteranceId, radius);
  }

  markUtterancesProcessed(ids: number[]): void {
    const stmt = this.db.prepare("UPDATE utterances SET processed = 1 WHERE id = ?");
    this.db.transaction((all: number[]) => all.forEach((id) => stmt.run(id)))(ids);
  }

  /** Neighbouring utterances in the same conversation, for classifier context and lesson examples. */
  conversationWindow(conversationUuid: string, aroundUtteranceId: number, radius = 4): Array<{ id: number; text: string; speaker: string | null; spoken_at: string }> {
    const all = this.db
      .prepare("SELECT id, text, speaker, spoken_at FROM utterances WHERE conversation_uuid = ? AND private = 0 ORDER BY id")
      .all(conversationUuid) as Array<{ id: number; text: string; speaker: string | null; spoken_at: string }>;
    const at = all.findIndex((u) => u.id === aroundUtteranceId);
    if (at < 0) return all.slice(-radius);
    return all.slice(Math.max(0, at - radius), at + radius + 1);
  }

  /**
   * A private disclosure (see sensitive.ts). The text is blanked where it is stored, and the row
   * is kept only so the same line is not processed twice. It never appears in a context window.
   */
  markUtterancePrivate(id: number): void {
    this.db.prepare("UPDATE utterances SET private = 1, text = '' WHERE id = ?").run(id);
  }

  /** A voice note heard again through the ambient channel. It is practice, not real-world use. */
  markUtteranceEcho(id: number): void {
    this.db.prepare("UPDATE utterances SET echo = 1 WHERE id = ?").run(id);
  }

  /** Recent ambient speech, leaving out echoes of the wearer's own voice notes. */
  recentUtterances(sinceMs: number): Array<{ id: number; conversation_uuid: string; text: string; spoken_at: string; speaker: string | null }> {
    return this.db
      .prepare("SELECT id, conversation_uuid, text, spoken_at, speaker FROM utterances WHERE received_at >= ? AND echo = 0 AND private = 0 ORDER BY id")
      .all(sinceMs) as Array<{ id: number; conversation_uuid: string; text: string; spoken_at: string; speaker: string | null }>;
  }

  /** When Rhubarb last heard anything at all, in epoch ms. Null if it never has. */
  lastHeardAt(): number | null {
    const row = this.db.prepare("SELECT MAX(received_at) AS at FROM utterances").get() as { at: number | null };
    return row.at ?? null;
  }

  // ------------------------------------------------------------------ privacy
  /** What is on this machine right now, in numbers. */
  privacySummary(): PrivacySummary {
    const n = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    const first = this.db.prepare("SELECT MIN(spoken_at) AS at FROM utterances").get() as { at: string | null };
    return {
      utterances: n("SELECT COUNT(*) AS n FROM utterances"),
      moments: n("SELECT COUNT(*) AS n FROM evidence WHERE source != 'calendar'"),
      voiceNotes: n("SELECT COUNT(*) AS n FROM journals"),
      skills: n("SELECT COUNT(*) AS n FROM skills"),
      lessons: n("SELECT COUNT(*) AS n FROM lessons"),
      since: first.at,
    };
  }

  /** Days Rhubarb holds speech from, newest first, by the wearer's own calendar. */
  capturedDays(limit = 60): Array<{ day: string; utterances: number; moments: number }> {
    return this.db
      .prepare(
        `SELECT date(u.spoken_at, 'localtime') AS day, COUNT(*) AS utterances,
                (SELECT COUNT(*) FROM evidence e WHERE e.source != 'calendar' AND date(e.spoken_at, 'localtime') = date(u.spoken_at, 'localtime')) AS moments
         FROM utterances u GROUP BY day ORDER BY day DESC LIMIT ?`
      )
      .all(limit) as Array<{ day: string; utterances: number; moments: number }>;
  }

  /** The most recent things Rhubarb took note of, whatever became of them. */
  recentMoments(limit = 40): Evidence[] {
    return (this.db.prepare("SELECT * FROM evidence WHERE source != 'calendar' ORDER BY spoken_at DESC, id DESC LIMIT ?").all(limit) as Row[]).map(rowToEvidence);
  }

  /** Remove utterances and everything drawn from them, and remember their ids so they stay gone. */
  private forgetUtterances(ids: number[]): void {
    const tomb = this.db.prepare("INSERT OR IGNORE INTO forgotten_utterances (id) VALUES (?)");
    const cards = this.db.prepare("SELECT c.id FROM cards c JOIN items i ON i.id = c.item_id WHERE i.utterance_id = ?");
    const stmts = [
      "DELETE FROM evidence WHERE utterance_id = ?",
      "DELETE FROM field_evidence WHERE utterance_id = ?",
      "DELETE FROM items WHERE utterance_id = ?",
      "DELETE FROM utterances WHERE id = ?",
    ].map((sql) => this.db.prepare(sql));
    const dropState = this.db.prepare("DELETE FROM fsrs_state WHERE card_id = ?");
    const clearPractice = this.db.prepare("UPDATE practice SET card_id = NULL WHERE card_id = ?");
    const dropCard = this.db.prepare("DELETE FROM cards WHERE id = ?");
    for (const id of ids) {
      for (const c of cards.all(id) as Array<{ id: number }>) {
        dropState.run(c.id);
        clearPractice.run(c.id);
        dropCard.run(c.id);
      }
      for (const s of stmts) s.run(id);
      tomb.run(id);
    }
  }

  /** Forget one moment: the note Rhubarb made, the words behind it, and anything built on them. */
  forgetMoment(evidenceId: number): boolean {
    const row = this.db.prepare("SELECT utterance_id FROM evidence WHERE id = ?").get(evidenceId) as { utterance_id: number | null } | undefined;
    if (!row) return false;
    this.db.transaction(() => {
      if (row.utterance_id !== null) this.forgetUtterances([row.utterance_id]);
      this.db.prepare("DELETE FROM evidence WHERE id = ?").run(evidenceId);
    })();
    return true;
  }

  /** Forget everything heard on one day (YYYY-MM-DD, the wearer's calendar). Returns how many lines went. */
  forgetDay(day: string): number {
    const ids = (this.db.prepare("SELECT id FROM utterances WHERE date(spoken_at, 'localtime') = ?").all(day) as Array<{ id: number }>).map((r) => r.id);
    this.db.transaction(() => {
      this.forgetUtterances(ids);
      this.db.prepare("DELETE FROM evidence WHERE source != 'calendar' AND date(spoken_at, 'localtime') = ?").run(day);
      this.db.prepare("DELETE FROM journals WHERE date(created_at / 1000, 'unixepoch', 'localtime') = ?").run(day);
      this.db.prepare("UPDATE practice SET answer_text = NULL WHERE answer_text IS NOT NULL AND date(created_at / 1000, 'unixepoch', 'localtime') = ?").run(day);
    })();
    return ids.length;
  }

  /**
   * Erase everything Rhubarb has heard or made from it: speech, moments, voice notes, skills,
   * ladders, lessons, practice and answer cards. The profile and its off-limits list are kept,
   * and so is the list of forgotten ids, so none of it comes back with the next sweep.
   */
  eraseEverything(): void {
    this.db.transaction(() => {
      this.db.exec("INSERT OR IGNORE INTO forgotten_utterances (id) SELECT id FROM utterances");
      for (const t of ["fsrs_state", "cards", "items", "field_evidence", "practice", "lesson_sessions", "lessons", "ladder_levels", "evidence", "skills", "journals", "utterances"]) {
        this.db.exec(`DELETE FROM ${t}`);
      }
      this.db.prepare("DELETE FROM kv WHERE key IN ('today_letter', 'today_letter_date', 'stakes_seen')").run();
    })();
  }

  // ------------------------------------------------------------------ journals
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

  // ------------------------------------------------------------------ evidence
  insertEvidence(e: {
    kind: EvidenceKind;
    text: string;
    context?: string | null;
    spokenAt: string;
    utteranceId?: number | null;
    conversationUuid?: string | null;
    speakerLabel?: string | null;
    place?: string | null;
    source: "stream" | "sweep" | "calendar";
  }): number {
    const res = this.db
      .prepare(
        `INSERT INTO evidence (kind, text, context, spoken_at, utterance_id, conversation_uuid, speaker_label, place, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        e.kind,
        e.text,
        e.context ?? null,
        e.spokenAt,
        e.utteranceId ?? null,
        e.conversationUuid ?? null,
        e.speakerLabel ?? null,
        e.place ?? null,
        e.source,
        Date.now()
      );
    return Number(res.lastInsertRowid);
  }

  evidenceByStage(stage: "detected" | "classified", limit = 50): Evidence[] {
    return (this.db.prepare("SELECT * FROM evidence WHERE stage = ? ORDER BY id LIMIT ?").all(stage, limit) as Row[]).map(rowToEvidence);
  }

  classifyEvidence(id: number, r: { kind: EvidenceKind; route: EvidenceRoute; topic: string | null; confidence: number }): void {
    this.db
      .prepare("UPDATE evidence SET stage = 'classified', kind = ?, route = ?, topic = ?, confidence = ? WHERE id = ?")
      .run(r.kind, r.route, r.topic, r.confidence, id);
  }

  assignEvidenceToSkill(ids: number[], skillId: number): void {
    const stmt = this.db.prepare("UPDATE evidence SET skill_id = ? WHERE id = ?");
    this.db.transaction((all: number[]) => all.forEach((id) => stmt.run(skillId, id)))(ids);
  }

  /** Classified skill-route evidence not yet clustered into a skill. */
  unassignedSkillEvidence(): Evidence[] {
    return (this.db
      .prepare("SELECT * FROM evidence WHERE stage = 'classified' AND route = 'skill' AND skill_id IS NULL ORDER BY id")
      .all() as Row[]).map(rowToEvidence);
  }

  evidenceForSkill(skillId: number): Evidence[] {
    return (this.db.prepare("SELECT * FROM evidence WHERE skill_id = ? ORDER BY spoken_at").all(skillId) as Row[]).map(rowToEvidence);
  }

  // ------------------------------------------------------------------ skills
  insertSkill(s: {
    name: string;
    domain: string | null;
    competentLooksLike: string;
    terms: string[];
    priority: number;
    brief: string;
    kind?: SkillKind;
    origin?: SkillOrigin;
  }): number {
    const now = Date.now();
    const res = this.db
      .prepare(
        `INSERT INTO skills (name, domain, competent_looks_like, terms, priority, brief, kind, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(s.name, s.domain, s.competentLooksLike, JSON.stringify(s.terms), s.priority, s.brief, s.kind ?? "skill", s.origin ?? "noticed", now, now);
    return Number(res.lastInsertRowid);
  }

  evidenceById(id: number): Evidence | null {
    const r = this.db.prepare("SELECT * FROM evidence WHERE id = ?").get(id) as Row | undefined;
    return r ? rowToEvidence(r) : null;
  }

  /** The moment an utterance became, if it became one. */
  evidenceByUtterance(utteranceId: number): Evidence | null {
    const r = this.db.prepare("SELECT * FROM evidence WHERE utterance_id = ? ORDER BY id LIMIT 1").get(utteranceId) as Row | undefined;
    return r ? rowToEvidence(r) : null;
  }

  /** Has this utterance already become a moment? */
  hasEvidenceForUtterance(utteranceId: number): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM evidence WHERE utterance_id = ?").get(utteranceId));
  }

  /**
   * Stored speech within a time window, for matching Bee's cleaned-up transcript against what the
   * live stream already gave us. The two carry different utterance ids for the same words.
   */
  utterancesBetween(fromIso: string, toIso: string): Array<{ id: number; conversation_uuid: string; text: string; spoken_at: string; speaker: string | null }> {
    return this.db
      .prepare("SELECT id, conversation_uuid, text, spoken_at, speaker FROM utterances WHERE spoken_at >= ? AND spoken_at <= ? ORDER BY spoken_at")
      .all(fromIso, toIso) as Array<{ id: number; conversation_uuid: string; text: string; spoken_at: string; speaker: string | null }>;
  }

  /** Utterances heard since a time, in the order they were spoken, private and echoed lines left out. */
  utterancesSince(sinceMs: number): Array<{ id: number; conversation_uuid: string; text: string; spoken_at: string; speaker: string | null }> {
    return this.db
      .prepare("SELECT id, conversation_uuid, text, spoken_at, speaker FROM utterances WHERE received_at >= ? AND echo = 0 AND private = 0 ORDER BY conversation_uuid, spoken_at, id")
      .all(sinceMs) as Array<{ id: number; conversation_uuid: string; text: string; spoken_at: string; speaker: string | null }>;
  }

  /** The line spoken just before this one in the same conversation. */
  previousUtterance(conversationUuid: string, beforeId: number): { id: number; text: string; spoken_at: string } | null {
    const r = this.db
      .prepare("SELECT id, text, spoken_at FROM utterances WHERE conversation_uuid = ? AND id < ? AND private = 0 ORDER BY id DESC LIMIT 1")
      .get(conversationUuid, beforeId) as { id: number; text: string; spoken_at: string } | undefined;
    return r ?? null;
  }

  updateSkill(id: number, patch: Partial<Pick<Skill, "name" | "domain" | "competentLooksLike" | "priority" | "brief" | "status" | "level">> & { terms?: string[] }): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const map: Record<string, string> = {
      name: "name",
      domain: "domain",
      competentLooksLike: "competent_looks_like",
      priority: "priority",
      brief: "brief",
      status: "status",
      level: "level",
    };
    for (const [k, col] of Object.entries(map)) {
      if (k in patch) {
        sets.push(`${col} = ?`);
        vals.push((patch as Record<string, unknown>)[k]);
      }
    }
    if (patch.terms) {
      sets.push("terms = ?");
      vals.push(JSON.stringify(patch.terms));
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    vals.push(Date.now(), id);
    this.db.prepare(`UPDATE skills SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  getSkill(id: number): Skill | null {
    const r = this.db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as Row | undefined;
    return r ? rowToSkill(r) : null;
  }

  skillsByStatus(statuses: SkillStatus[]): Skill[] {
    const placeholders = statuses.map(() => "?").join(",");
    return (this.db
      .prepare(`SELECT * FROM skills WHERE status IN (${placeholders}) ORDER BY priority DESC, updated_at DESC`)
      .all(...statuses) as Row[]).map(rowToSkill);
  }

  // ------------------------------------------------------------------ ladders
  replaceLadder(skillId: number, levels: Array<{ title: string; outcome: string }>): void {
    const del = this.db.prepare("DELETE FROM ladder_levels WHERE skill_id = ?");
    const ins = this.db.prepare("INSERT INTO ladder_levels (skill_id, idx, title, outcome, status) VALUES (?, ?, ?, ?, ?)");
    this.db.transaction(() => {
      del.run(skillId);
      levels.forEach((l, i) => ins.run(skillId, i, l.title, l.outcome, i === 0 ? "current" : "locked"));
    })();
  }

  ladderFor(skillId: number): LadderLevel[] {
    return (this.db.prepare("SELECT * FROM ladder_levels WHERE skill_id = ? ORDER BY idx").all(skillId) as Row[]).map((r) => ({
      id: r.id as number,
      skillId: r.skill_id as number,
      idx: r.idx as number,
      title: r.title as string,
      outcome: r.outcome as string,
      status: r.status as LevelStatus,
    }));
  }

  setLevelStatus(skillId: number, idx: number, status: LevelStatus): void {
    this.db.prepare("UPDATE ladder_levels SET status = ? WHERE skill_id = ? AND idx = ?").run(status, skillId, idx);
  }

  // ------------------------------------------------------------------ lessons
  insertLesson(l: {
    skillId: number;
    levelIdx: number;
    style: LearningStyle;
    bodyMd: string;
    deck: Deck;
    quiz: Quiz;
    beats: LessonBeat[];
    citations: Array<{ title: string; url: string }>;
    status?: "draft" | "ready";
  }): number {
    const res = this.db
      .prepare(
        `INSERT INTO lessons (skill_id, level_idx, style, body_md, deck, quiz, beats, citations, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        l.skillId,
        l.levelIdx,
        l.style,
        l.bodyMd,
        JSON.stringify(l.deck),
        JSON.stringify(l.quiz),
        JSON.stringify(l.beats),
        JSON.stringify(l.citations),
        l.status ?? "ready",
        Date.now()
      );
    return Number(res.lastInsertRowid);
  }

  /** Replace a lesson's text after a correction pass. */
  updateLessonContent(id: number, l: { bodyMd: string; deck: Deck; quiz: Quiz; beats: LessonBeat[] }): void {
    this.db
      .prepare("UPDATE lessons SET body_md = ?, deck = ?, quiz = ?, beats = ? WHERE id = ?")
      .run(l.bodyMd, JSON.stringify(l.deck), JSON.stringify(l.quiz), JSON.stringify(l.beats), id);
  }

  getLesson(id: number): Lesson | null {
    const r = this.db.prepare("SELECT * FROM lessons WHERE id = ?").get(id) as Row | undefined;
    return r ? rowToLesson(r) : null;
  }

  lessonsForSkill(skillId: number): Lesson[] {
    return (this.db.prepare("SELECT * FROM lessons WHERE skill_id = ? ORDER BY level_idx").all(skillId) as Row[]).map(rowToLesson);
  }

  currentLesson(skillId: number, levelIdx: number): Lesson | null {
    const r = this.db
      .prepare("SELECT * FROM lessons WHERE skill_id = ? AND level_idx = ? ORDER BY id DESC LIMIT 1")
      .get(skillId, levelIdx) as Row | undefined;
    return r ? rowToLesson(r) : null;
  }

  completeLesson(id: number): void {
    this.db.prepare("UPDATE lessons SET status = 'done', completed_at = ? WHERE id = ?").run(Date.now(), id);
  }

  readyLessons(): Lesson[] {
    return (this.db.prepare("SELECT * FROM lessons WHERE status = 'ready' ORDER BY created_at DESC").all() as Row[]).map(rowToLesson);
  }

  // ------------------------------------------------------------------ lesson sessions
  startSession(lessonId: number): number {
    const res = this.db.prepare("INSERT INTO lesson_sessions (lesson_id, started_at) VALUES (?, ?)").run(lessonId, Date.now());
    return Number(res.lastInsertRowid);
  }

  getSession(id: number): LessonSession | null {
    const r = this.db.prepare("SELECT * FROM lesson_sessions WHERE id = ?").get(id) as Row | undefined;
    return r
      ? {
          id: r.id as number,
          lessonId: r.lesson_id as number,
          startedAt: r.started_at as number,
          completedAt: (r.completed_at as number) ?? null,
          responses: r.responses as string,
          tutor: r.tutor as string,
        }
      : null;
  }

  latestSessionForLesson(lessonId: number): LessonSession | null {
    const r = this.db.prepare("SELECT id FROM lesson_sessions WHERE lesson_id = ? ORDER BY id DESC LIMIT 1").get(lessonId) as { id: number } | undefined;
    return r ? this.getSession(r.id) : null;
  }

  updateSession(id: number, patch: { responses?: Record<string, string>; tutor?: unknown[]; completedAt?: number }): void {
    if (patch.responses) this.db.prepare("UPDATE lesson_sessions SET responses = ? WHERE id = ?").run(JSON.stringify(patch.responses), id);
    if (patch.tutor) this.db.prepare("UPDATE lesson_sessions SET tutor = ? WHERE id = ?").run(JSON.stringify(patch.tutor), id);
    if (patch.completedAt) this.db.prepare("UPDATE lesson_sessions SET completed_at = ? WHERE id = ?").run(patch.completedAt, id);
  }

  // ------------------------------------------------------------------ practice
  insertPractice(p: {
    skillId: number | null;
    lessonId: number | null;
    cardId?: number | null;
    kind: PracticeKind;
    prompt: string;
    rubric: string | null;
    marker: string;
    scheduledFor: number;
    beeTodoId: number | null;
  }): number {
    const res = this.db
      .prepare(
        `INSERT INTO practice (skill_id, lesson_id, card_id, kind, prompt, rubric, bee_todo_id, marker, scheduled_for, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(p.skillId, p.lessonId, p.cardId ?? null, p.kind, p.prompt, p.rubric, p.beeTodoId, p.marker, p.scheduledFor, Date.now());
    return Number(res.lastInsertRowid);
  }

  getPractice(id: number): Practice | null {
    const r = this.db.prepare("SELECT * FROM practice WHERE id = ?").get(id) as Row | undefined;
    return r ? rowToPractice(r) : null;
  }

  openPractice(): Practice[] {
    return (this.db
      .prepare("SELECT * FROM practice WHERE status IN ('scheduled','delivered') ORDER BY scheduled_for DESC")
      .all() as Row[]).map(rowToPractice);
  }

  /** True if this voice note has already been taken as the answer to some practice. */
  practiceHasJournal(journalId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM practice WHERE journal_id = ? LIMIT 1").get(journalId));
  }

  setPracticeStatus(id: number, status: PracticeStatus): void {
    this.db.prepare("UPDATE practice SET status = ? WHERE id = ?").run(status, id);
  }

  attachPracticeAnswer(id: number, journalId: string, answerText: string): void {
    this.db.prepare("UPDATE practice SET journal_id = ?, answer_text = ?, status = 'answered' WHERE id = ?").run(journalId, answerText, id);
  }

  gradePractice(id: number, grade: object): void {
    this.db.prepare("UPDATE practice SET grade = ?, status = 'graded' WHERE id = ?").run(JSON.stringify(grade), id);
  }

  /** The most recent practice of one kind for a lesson, for example the quiz that was just taken. */
  latestPracticeForLesson(lessonId: number, kind: PracticeKind): Practice | null {
    const r = this.db.prepare("SELECT * FROM practice WHERE lesson_id = ? AND kind = ? ORDER BY id DESC LIMIT 1").get(lessonId, kind) as Row | undefined;
    return r ? rowToPractice(r) : null;
  }

  practiceForSkill(skillId: number): Practice[] {
    return (this.db.prepare("SELECT * FROM practice WHERE skill_id = ? ORDER BY created_at DESC").all(skillId) as Row[]).map(rowToPractice);
  }

  // ------------------------------------------------------------------ field evidence
  insertFieldCandidate(f: { skillId: number; utteranceId: number; text: string; context: string | null; spokenAt: string }): boolean {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO field_evidence (skill_id, utterance_id, text, context, spoken_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(f.skillId, f.utteranceId, f.text, f.context, f.spokenAt, Date.now());
    return res.changes > 0;
  }

  unjudgedFieldEvidence(): FieldEvidence[] {
    return (this.db.prepare("SELECT * FROM field_evidence WHERE verdict IS NULL ORDER BY id").all() as Row[]).map(rowToFieldEvidence);
  }

  setFieldVerdict(id: number, verdict: object, credited: boolean): void {
    this.db.prepare("UPDATE field_evidence SET verdict = ?, credited = ? WHERE id = ?").run(JSON.stringify(verdict), credited ? 1 : 0, id);
  }

  fieldEvidenceForSkill(skillId: number): FieldEvidence[] {
    return (this.db.prepare("SELECT * FROM field_evidence WHERE skill_id = ? ORDER BY spoken_at DESC").all(skillId) as Row[]).map(rowToFieldEvidence);
  }

  // ------------------------------------------------------------------ sparks
  insertItem(i: { kind: ItemKind; sourceText: string; utteranceId: number | null; conversationUuid: string | null; spokenAt: string; speakerLabel?: string | null; topic?: string | null }): number {
    const res = this.db
      .prepare(
        "INSERT INTO items (kind, source_text, topic, status, utterance_id, conversation_uuid, spoken_at, created_at, speaker_label) VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?, ?)"
      )
      .run(i.kind, i.sourceText, i.topic ?? null, i.utteranceId, i.conversationUuid, i.spokenAt, Date.now(), i.speakerLabel ?? null);
    return Number(res.lastInsertRowid);
  }

  updateItemStatus(id: number, status: ItemStatus): void {
    this.db.prepare("UPDATE items SET status = ? WHERE id = ?").run(status, id);
  }

  setItemPlace(id: number, place: string): void {
    this.db.prepare("UPDATE items SET place = ? WHERE id = ?").run(place, id);
  }

  itemsByStatus(status: ItemStatus, limit = 100): Item[] {
    return (this.db.prepare("SELECT * FROM items WHERE status = ? ORDER BY id DESC LIMIT ?").all(status, limit) as Row[]).map(rowToItem);
  }

  insertCard(c: { itemId: number; title: string; answerMd: string; citations: Array<{ title: string; url: string }> }): number {
    const res = this.db
      .prepare("INSERT INTO cards (item_id, title, answer_md, citations, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(c.itemId, c.title, c.answerMd, JSON.stringify(c.citations), Date.now());
    this.db.prepare("UPDATE items SET status = 'researched' WHERE id = ?").run(c.itemId);
    return Number(res.lastInsertRowid);
  }

  /** Record what the learner guessed before the answer was shown. An empty guess means they skipped. */
  setCardGuess(id: number, guess: string, verdict: { close: boolean; note: string } | null): void {
    this.db.prepare("UPDATE cards SET guess = ?, guess_close = ?, guess_note = ? WHERE id = ?").run(guess, verdict ? (verdict.close ? 1 : 0) : null, verdict?.note ?? null, id);
  }

  setLessonReview(id: number, review: object): void {
    this.db.prepare("UPDATE lessons SET review = ? WHERE id = ?").run(JSON.stringify(review), id);
  }

  /**
   * Numbers about learning, and only numbers: no speech, no quotes, no names. It is what the
   * Evidence page draws, and it is safe to hand to a researcher as it stands.
   */
  learningProgress(): LearningProgress {
    const graded = this.db.prepare("SELECT kind, skill_id, grade, created_at FROM practice WHERE grade IS NOT NULL ORDER BY created_at").all() as Array<{ kind: string; skill_id: number | null; grade: string; created_at: number }>;
    const teachbacks: ProgressPoint[] = [];
    const quizzes: ProgressPoint[] = [];
    const recall = { asked: 0, remembered: 0 };
    for (const p of graded) {
      let g: { score?: number; total?: number };
      try {
        g = JSON.parse(p.grade) as { score?: number; total?: number };
      } catch {
        continue;
      }
      if (typeof g.score !== "number") continue;
      if (p.kind === "quiz") quizzes.push({ at: p.created_at, score: g.total ? g.score / g.total : 0, skillId: p.skill_id });
      else if (p.kind === "recall") {
        recall.asked++;
        if (g.score >= 3) recall.remembered++;
      } else teachbacks.push({ at: p.created_at, score: g.score, skillId: p.skill_id });
    }

    const n = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    const credits = this.db.prepare("SELECT skill_id, spoken_at FROM field_evidence WHERE credited = 1 ORDER BY spoken_at").all() as Array<{ skill_id: number; spoken_at: string }>;
    const weeks = new Map<string, number>();
    for (const c of credits) {
      const d = new Date(c.spoken_at);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      weeks.set(key, (weeks.get(key) ?? 0) + 1);
    }

    const firstSeen = this.db.prepare("SELECT skill_id, MIN(spoken_at) AS at FROM evidence WHERE skill_id > 0 GROUP BY skill_id").all() as Array<{ skill_id: number; at: string }>;
    const transfer: Array<{ skillId: number; days: number }> = [];
    for (const f of firstSeen) {
      const used = credits.find((c) => c.skill_id === f.skill_id && c.spoken_at > f.at);
      if (used) transfer.push({ skillId: f.skill_id, days: Math.max(0, Math.round((Date.parse(used.spoken_at) - Date.parse(f.at)) / 86_400_000)) });
    }

    const reviews = (this.db.prepare("SELECT review FROM lessons WHERE review IS NOT NULL").all() as Array<{ review: string }>).map((r) => {
      try {
        return JSON.parse(r.review) as { checks?: Array<{ ok: boolean }> };
      } catch {
        return {};
      }
    });

    return {
      teachbacks,
      quizzes,
      recall,
      guesses: {
        made: n("SELECT COUNT(*) AS n FROM cards WHERE guess IS NOT NULL AND guess != ''"),
        close: n("SELECT COUNT(*) AS n FROM cards WHERE guess_close = 1"),
        skipped: n("SELECT COUNT(*) AS n FROM cards WHERE guess = ''"),
      },
      field: { heard: n("SELECT COUNT(*) AS n FROM field_evidence WHERE verdict IS NOT NULL"), credited: credits.length, byWeek: [...weeks].map(([weekStart, credited]) => ({ weekStart, credited })) },
      levels: { passed: n("SELECT COUNT(*) AS n FROM ladder_levels WHERE status = 'done'"), mastered: n("SELECT COUNT(*) AS n FROM skills WHERE status = 'mastered'"), active: n("SELECT COUNT(*) AS n FROM skills WHERE status = 'active'") },
      transfer,
      lessons: {
        written: n("SELECT COUNT(*) AS n FROM lessons"),
        finished: n("SELECT COUNT(*) AS n FROM lessons WHERE status = 'done'"),
        reviewed: reviews.length,
        passedEveryCheck: reviews.filter((r) => (r.checks ?? []).length > 0 && (r.checks ?? []).every((c) => c.ok)).length,
      },
    };
  }

  /** What has happened, newest first: lessons finished, answers graded, real-world credits, sparks, levels passed. */
  history(limit = 60): HistoryEntry[] {
    const skillName = new Map((this.db.prepare("SELECT id, name FROM skills").all() as Array<{ id: number; name: string }>).map((s) => [s.id, s.name]));
    const out: HistoryEntry[] = [];
    for (const l of this.db.prepare("SELECT id, skill_id, level_idx, completed_at FROM lessons WHERE status = 'done' AND completed_at IS NOT NULL").all() as Array<{ id: number; skill_id: number; level_idx: number; completed_at: number }>) {
      out.push({ at: l.completed_at, kind: "lesson", title: `Finished a lesson: ${skillName.get(l.skill_id) ?? "a skill"}`, detail: `Level ${l.level_idx + 1}.`, skillId: l.skill_id, lessonId: l.id, score: null });
    }
    for (const p of this.db.prepare("SELECT id, skill_id, lesson_id, kind, prompt, grade, created_at FROM practice WHERE grade IS NOT NULL").all() as Array<{ id: number; skill_id: number | null; lesson_id: number | null; kind: string; prompt: string; grade: string; created_at: number }>) {
      let g: { score?: number; total?: number; feedback?: string } = {};
      try {
        g = JSON.parse(p.grade);
      } catch {
        continue;
      }
      if (typeof g.score !== "number") continue;
      const label = p.kind === "quiz" ? "Took the check" : p.kind === "recall" ? "Recalled" : p.kind === "mission" ? "Reported on a mission" : "Explained it out loud";
      const scoreText = p.kind === "quiz" ? `${g.score} of ${g.total ?? "?"}` : `${g.score} of 5`;
      out.push({ at: p.created_at, kind: "answer", title: `${label}: ${skillName.get(p.skill_id ?? -1) ?? p.prompt.slice(0, 60)}`, detail: g.feedback ? `${scoreText}. ${g.feedback}` : scoreText, skillId: p.skill_id, lessonId: p.lesson_id, score: p.kind === "quiz" ? (g.total ? g.score / g.total : null) : g.score });
    }
    for (const f of this.db.prepare("SELECT skill_id, spoken_at, verdict FROM field_evidence WHERE credited = 1").all() as Array<{ skill_id: number; spoken_at: string; verdict: string | null }>) {
      let note = "";
      try {
        note = f.verdict ? String((JSON.parse(f.verdict) as { note?: string }).note ?? "") : "";
      } catch {
        /* no note */
      }
      out.push({ at: Date.parse(f.spoken_at), kind: "credit", title: `Used it for real: ${skillName.get(f.skill_id) ?? "a skill"}`, detail: note || "Heard in a real conversation, and it counted.", skillId: f.skill_id, lessonId: null, score: null });
    }
    for (const c of this.db.prepare("SELECT id, title, created_at FROM cards").all() as Array<{ id: number; title: string; created_at: number }>) {
      out.push({ at: c.created_at, kind: "spark", title: `Wondered: ${c.title}`, detail: "Answered on the Sparks page.", skillId: null, lessonId: null, score: null });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, limit);
  }

  getCard(id: number): Card | null {
    const r = this.db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as Row | undefined;
    return r ? rowToCard(r) : null;
  }

  cardsWithItems(limit = 50): Array<{ card: Card; item: Item }> {
    const rows = this.db
      .prepare(
        `SELECT c.id AS c_id, c.item_id, c.title, c.answer_md, c.citations, c.created_at AS c_created_at, c.guess, c.guess_close, c.guess_note, i.*
         FROM cards c JOIN items i ON i.id = c.item_id ORDER BY c.id DESC LIMIT ?`
      )
      .all(limit) as Row[];
    return rows.map((r) => ({
      card: rowToCard({ ...r, id: r.c_id, created_at: r.c_created_at }),
      item: rowToItem(r),
    }));
  }

  setFsrsState(cardId: number, dueAt: number, serialized: string): void {
    this.db
      .prepare("INSERT INTO fsrs_state (card_id, due_at, fsrs_card) VALUES (?, ?, ?) ON CONFLICT(card_id) DO UPDATE SET due_at = excluded.due_at, fsrs_card = excluded.fsrs_card")
      .run(cardId, dueAt, serialized);
  }

  getFsrsState(cardId: number): { dueAt: number; fsrsCard: string } | null {
    const r = this.db.prepare("SELECT due_at, fsrs_card FROM fsrs_state WHERE card_id = ?").get(cardId) as { due_at: number; fsrs_card: string } | undefined;
    return r ? { dueAt: r.due_at, fsrsCard: r.fsrs_card } : null;
  }

  dueCards(nowMs: number, limit = 5): Array<{ cardId: number; dueAt: number }> {
    return this.db
      .prepare(
        `SELECT f.card_id AS cardId, f.due_at AS dueAt FROM fsrs_state f
         WHERE f.due_at <= ? AND NOT EXISTS (
           SELECT 1 FROM practice p WHERE p.card_id = f.card_id AND p.status IN ('scheduled','delivered','answered')
         ) ORDER BY f.due_at LIMIT ?`
      )
      .all(nowMs, limit) as Array<{ cardId: number; dueAt: number }>;
  }
}

// ---------------------------------------------------------------------- row mappers

function rowToEvidence(r: Row): Evidence {
  return {
    id: r.id as number,
    kind: r.kind as EvidenceKind,
    text: r.text as string,
    context: (r.context as string) ?? null,
    spokenAt: r.spoken_at as string,
    utteranceId: (r.utterance_id as number) ?? null,
    conversationUuid: (r.conversation_uuid as string) ?? null,
    speakerLabel: (r.speaker_label as string) ?? null,
    place: (r.place as string) ?? null,
    source: r.source as Evidence["source"],
    stage: r.stage as Evidence["stage"],
    route: (r.route as EvidenceRoute) ?? null,
    topic: (r.topic as string) ?? null,
    confidence: (r.confidence as number) ?? null,
    skillId: (r.skill_id as number) ?? null,
    createdAt: r.created_at as number,
  };
}

function rowToSkill(r: Row): Skill {
  return {
    id: r.id as number,
    name: r.name as string,
    domain: (r.domain as string) ?? null,
    competentLooksLike: r.competent_looks_like as string,
    terms: r.terms as string,
    status: r.status as SkillStatus,
    priority: r.priority as number,
    brief: r.brief as string,
    level: r.level as number,
    kind: ((r.kind as string) ?? "skill") as SkillKind,
    origin: ((r.origin as string) ?? "noticed") as SkillOrigin,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function rowToLesson(r: Row): Lesson {
  return {
    id: r.id as number,
    skillId: r.skill_id as number,
    levelIdx: r.level_idx as number,
    style: r.style as LearningStyle,
    bodyMd: r.body_md as string,
    deck: (r.deck as string) ?? "{}",
    quiz: (r.quiz as string) ?? '{"questions":[]}',
    beats: r.beats as string,
    citations: r.citations as string,
    status: r.status as Lesson["status"],
    createdAt: r.created_at as number,
    completedAt: (r.completed_at as number) ?? null,
    review: (r.review as string) ?? null,
  };
}

function rowToPractice(r: Row): Practice {
  return {
    id: r.id as number,
    skillId: (r.skill_id as number) ?? null,
    lessonId: (r.lesson_id as number) ?? null,
    cardId: (r.card_id as number) ?? null,
    kind: r.kind as PracticeKind,
    prompt: r.prompt as string,
    rubric: (r.rubric as string) ?? null,
    beeTodoId: (r.bee_todo_id as number) ?? null,
    marker: r.marker as string,
    status: r.status as PracticeStatus,
    scheduledFor: r.scheduled_for as number,
    journalId: (r.journal_id as string) ?? null,
    answerText: (r.answer_text as string) ?? null,
    grade: (r.grade as string) ?? null,
    createdAt: r.created_at as number,
  };
}

function rowToFieldEvidence(r: Row): FieldEvidence {
  return {
    id: r.id as number,
    skillId: r.skill_id as number,
    utteranceId: r.utterance_id as number,
    text: r.text as string,
    context: (r.context as string) ?? null,
    spokenAt: r.spoken_at as string,
    verdict: (r.verdict as string) ?? null,
    credited: Boolean(r.credited),
    createdAt: r.created_at as number,
  };
}

function rowToItem(r: Row): Item {
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

function rowToCard(r: Row): Card {
  return {
    id: r.id as number,
    itemId: r.item_id as number,
    title: r.title as string,
    answerMd: r.answer_md as string,
    citations: r.citations as string,
    createdAt: r.created_at as number,
    guess: (r.guess as string) ?? null,
    guessClose: r.guess_close === null || r.guess_close === undefined ? null : Boolean(r.guess_close),
    guessNote: (r.guess_note as string) ?? null,
  };
}
