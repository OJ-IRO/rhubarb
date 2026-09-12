/** Shapes observed live from `bee stream --json` and the /v1 REST API (see docs/spike-results.md). */

export interface BeeUtterance {
  id: number;
  sample_id: string;
  text: string;
  /** ISO timestamp of when the words were spoken */
  spoken_at: string;
  /** seconds into the conversation */
  start: number;
  end: number;
  speaker?: string;
}

export interface BeeConversationEvent {
  id: number;
  conversation_uuid: string;
  start_time: string;
  end_time: string | null;
  state: "CAPTURING" | "PROCESSING" | "COMPLETED" | string;
  summary: string | null;
  short_summary: string | null;
  primary_location: unknown;
  city: string | null;
  business: string | null;
}

export interface BeeJournal {
  id: string;
  text: string | null;
  state: "PREPARING" | "ANALYZING" | "READY" | string;
  aiResponse: { message?: string; cleanedUpText?: string } | null;
  createdAt: number;
  updatedAt: number;
}

/** Discriminated on the `type` field; the connect handshake has no type and is ignored upstream. */
export type BeeStreamEvent =
  | { type: "new-utterance"; conversation_uuid: string; utterance: BeeUtterance }
  | { type: "new-conversation" | "update-conversation" | "delete-conversation"; conversation: BeeConversationEvent }
  | { type: "update-conversation-summary"; conversation: BeeConversationEvent }
  | { type: "journal-created" | "journal-updated"; journal: BeeJournal; sound?: string }
  | { type: "journal-text"; journalId: string; text: string }
  | { type: "journal-deleted"; journalId: string; reason?: string }
  | { type: "update-location"; [k: string]: unknown }
  | { type: "todo-created" | "todo-updated" | "todo-deleted"; todo: Record<string, unknown> };

export interface BeeTodo {
  id: number;
  text: string;
  alarm_at: number | null;
  completed: boolean;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Waggle domain
// ---------------------------------------------------------------------------

/** What Waggle heard that suggests something worth learning. */
export type EvidenceKind = "question" | "gap" | "struggle" | "intent" | "exposure" | "stake";
export type EvidenceStage = "detected" | "classified";
export type EvidenceRoute = "spark" | "skill" | "noise";

export interface Evidence {
  id: number;
  kind: EvidenceKind;
  /** verbatim ASR text (or calendar event title for stakes) */
  text: string;
  /** neighbouring utterances, for the classifier and for lesson examples */
  context: string | null;
  spokenAt: string;
  utteranceId: number | null;
  conversationUuid: string | null;
  speakerLabel: string | null;
  place: string | null;
  source: "stream" | "sweep" | "calendar";
  stage: EvidenceStage;
  route: EvidenceRoute | null;
  /** normalized statement of what this is about, set by stage-2 */
  topic: string | null;
  confidence: number | null;
  skillId: number | null;
  createdAt: number;
}

export type SkillStatus = "proposed" | "active" | "dismissed" | "mastered";

export interface Skill {
  id: number;
  name: string;
  domain: string | null;
  /** one line: what competent use of this skill looks like in conversation */
  competentLooksLike: string;
  /** JSON array of terms/phrases that signal this skill is in play (for field evidence) */
  terms: string;
  status: SkillStatus;
  priority: number;
  /** the human-written "why now" */
  brief: string;
  /** current ladder level index (0 = not started) */
  level: number;
  createdAt: number;
  updatedAt: number;
}

export type LevelStatus = "locked" | "current" | "done";

export interface LadderLevel {
  id: number;
  skillId: number;
  idx: number;
  title: string;
  /** "can ..." outcome statement */
  outcome: string;
  status: LevelStatus;
}

export type LearningStyle = "story" | "hands-on" | "socratic" | "structured" | "analogy";

export interface LessonBeat {
  kind: "checkin" | "scenario" | "teachback" | "mission";
  prompt: string;
  /** what a good answer contains; used for grading */
  rubric: string;
}

export type LessonStatus = "draft" | "ready" | "done";

export interface Lesson {
  id: number;
  skillId: number;
  levelIdx: number;
  style: LearningStyle;
  bodyMd: string;
  /** JSON LessonBeat[] */
  beats: string;
  /** JSON array of {title, url} */
  citations: string;
  status: LessonStatus;
  createdAt: number;
  completedAt: number | null;
}

export interface LessonSession {
  id: number;
  lessonId: number;
  startedAt: number;
  completedAt: number | null;
  /** JSON: beat index -> answer text */
  responses: string;
  /** JSON: tutor chat transcript */
  tutor: string;
}

export type PracticeKind = "teachback" | "mission" | "recall";
export type PracticeStatus = "scheduled" | "delivered" | "answered" | "graded" | "expired";

export interface Practice {
  id: number;
  skillId: number | null;
  lessonId: number | null;
  /** Spark card id when kind = recall */
  cardId: number | null;
  kind: PracticeKind;
  prompt: string;
  rubric: string | null;
  beeTodoId: number | null;
  /** short code embedded in the todo text so answers can be matched */
  marker: string;
  status: PracticeStatus;
  scheduledFor: number;
  journalId: string | null;
  answerText: string | null;
  /** JSON: {score: 0-5, feedback, missing: string[]} */
  grade: string | null;
  createdAt: number;
}

export interface FieldEvidence {
  id: number;
  skillId: number;
  utteranceId: number;
  text: string;
  context: string | null;
  spokenAt: string;
  /** JSON: {used: boolean, correct: boolean, note: string} */
  verdict: string | null;
  credited: boolean;
  createdAt: number;
}

export interface Profile {
  name: string;
  style: LearningStyle;
  sessionMinutes: 5 | 10 | 20;
  /** free text, e.g. "weekday commute around 8:30, evenings after 8" */
  learningWindows: string;
  goals: string[];
  offLimits: string[];
  timezone: string;
  onboardedAt: number | null;
}

// --- Sparks lane (curiosity -> answer card -> optional recall) ---

export type ItemKind = "question" | "gap";
export type ItemStatus = "detected" | "confirmed" | "researched" | "dismissed";

export interface Item {
  id: number;
  kind: ItemKind;
  sourceText: string;
  topic: string | null;
  status: ItemStatus;
  confidence: number | null;
  utteranceId: number | null;
  conversationUuid: string | null;
  spokenAt: string;
  createdAt: number;
  place: string | null;
  speakerLabel: string | null;
}

export interface Card {
  id: number;
  itemId: number;
  title: string;
  answerMd: string;
  citations: string;
  createdAt: number;
}
