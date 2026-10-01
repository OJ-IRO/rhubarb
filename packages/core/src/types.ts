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
// Rhubarb domain
// ---------------------------------------------------------------------------

/** What Rhubarb heard that suggests something worth learning. */
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
  /** When the wearer corrected what the transcript says. The corrected words are what everything uses. */
  editedAt: number | null;
  createdAt: number;
}

export type SkillStatus = "proposed" | "active" | "dismissed" | "mastered";
/** How well someone reads a language they are learning: decides how much reading help every lesson gives. */
export type ReadingLevel = "none" | "basic" | "most" | "fluent";
/** What they said they already knew when they said yes. */
export type Familiarity = "new" | "some" | "comfortable";
/** skill: a capability built over weeks, on a ladder. topic: one lesson on something they wanted to understand. */
export type SkillKind = "skill" | "topic";
/** noticed: Rhubarb inferred it from conversation and asks yes or no. asked: they asked Bee for it out loud. */
export type SkillOrigin = "noticed" | "asked";

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
  kind: SkillKind;
  origin: SkillOrigin;
  familiarity: Familiarity | null;
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

/** replaced: superseded by a rewrite (for example after the learner corrected what was said). Kept, never shown. */
export type LessonStatus = "draft" | "ready" | "done" | "replaced";

/** One card in a lesson deck. */
export type Slide =
  | { kind: "cover"; title: string; subtitle: string; hook: string }
  | { kind: "text"; heading: string; body: string; aside?: string }
  | { kind: "keyidea"; statement: string; why: string }
  | { kind: "diagram"; heading: string; mermaid: string; caption: string }
  | { kind: "image"; heading: string; query: string; url?: string; alt: string; caption: string; credit?: string }
  | { kind: "example"; heading: string; quote: string; when: string; who?: string; explanation: string }
  | { kind: "steps"; heading: string; steps: Array<{ title: string; body: string }> }
  | { kind: "compare"; heading: string; columns: Array<{ title: string; points: string[] }> }
  | { kind: "learnmore"; links: Array<{ title: string; url: string; why: string }> };

export interface Deck {
  title: string;
  subtitle: string;
  minutes: number;
  slides: Slide[];
}

export type QuizQuestion =
  | { kind: "mcq"; prompt: string; choices: string[]; answer: number; explanation: string }
  | { kind: "short"; prompt: string; rubric: string };

export interface Quiz {
  questions: QuizQuestion[];
}

export interface Lesson {
  id: number;
  skillId: number;
  levelIdx: number;
  style: LearningStyle;
  /** plain-prose rendering of the lesson (tutor context, fallback) */
  bodyMd: string;
  /** JSON Deck */
  deck: string;
  /** JSON Quiz */
  quiz: string;
  /** JSON LessonBeat[] */
  beats: string;
  /** JSON array of {title, url} */
  citations: string;
  status: LessonStatus;
  createdAt: number;
  completedAt: number | null;
  /** JSON LessonReview (see lessonChecks.ts), or null for lessons written before reviews existed */
  review: string | null;
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

export type PracticeKind = "teachback" | "mission" | "recall" | "quiz";
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
  /** Which alarms Rhubarb may send to the phone. Missing means all on. */
  nudges?: NudgePrefs;
  /** Name where conversations happened (landmark or neighbourhood, never home or an address). Missing means on. */
  usePlaces?: boolean;
  /** How well they read each language they are learning. Missing means "basic". */
  reading?: Partial<Record<"japanese" | "korean" | "chinese", ReadingLevel>>;
}

export interface NudgePrefs {
  /** "Your lesson is ready" */
  lessons: boolean;
  /** the score and feedback after a spoken answer */
  feedback: boolean;
  /** "Heard you use X today" */
  credits: boolean;
  /** the nightly learning brief */
  brief: boolean;
}

export const ALL_NUDGES: NudgePrefs = { lessons: true, feedback: true, credits: true, brief: true };

/** One thing that happened, for looking back. */
export interface HistoryEntry {
  at: number;
  kind: "lesson" | "answer" | "credit" | "spark" | "level";
  title: string;
  /** one line of detail, in the house voice */
  detail: string;
  skillId: number | null;
  lessonId: number | null;
  score: number | null;
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
  /** What the learner guessed before seeing the answer. "" means they chose to skip. Null means not yet asked. */
  guess: string | null;
  /** Whether the guess was close, and a sentence about it. Null until a guess is judged. */
  guessClose: boolean | null;
  guessNote: string | null;
}

// --- Evidence that it is working ---

export interface ProgressPoint {
  at: number;
  /** 0..5 for spoken answers, 0..1 for quizzes */
  score: number;
  skillId: number | null;
}

export interface LearningProgress {
  /** spoken teach-backs, oldest first */
  teachbacks: ProgressPoint[];
  quizzes: ProgressPoint[];
  recall: { asked: number; remembered: number };
  guesses: { made: number; close: number; skipped: number };
  /** real conversations where a skill came up, and how many were judged a correct use */
  field: { heard: number; credited: number; byWeek: Array<{ weekStart: string; credited: number }> };
  levels: { passed: number; mastered: number; active: number };
  /** per skill: days from the first moment it showed up to the first time it was used for real */
  transfer: Array<{ skillId: number; days: number }>;
  lessons: { written: number; finished: number; reviewed: number; passedEveryCheck: number };
}

// --- Privacy ---

export interface PrivacySummary {
  /** lines of speech held */
  utterances: number;
  /** things Rhubarb took note of */
  moments: number;
  voiceNotes: number;
  skills: number;
  lessons: number;
  /** ISO time of the oldest line held, or null if there is none */
  since: string | null;
}
