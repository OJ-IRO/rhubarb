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

/** A captured spark of curiosity or a detected knowledge gap. */
export type ItemKind = "question" | "gap";
export type ItemStatus =
  | "detected" // passed stage-1 heuristics, awaiting stage-2 classification
  | "confirmed" // stage-2 says it's real curiosity/gap
  | "researched" // card exists
  | "dismissed"; // stage-2 rejected, or user dismissed in review queue

export interface Item {
  id: number;
  kind: ItemKind;
  /** verbatim ASR text that triggered detection */
  sourceText: string;
  /** normalized statement of what the user wants to know */
  topic: string | null;
  status: ItemStatus;
  /** stage-2 confidence 0-1 */
  confidence: number | null;
  utteranceId: number | null;
  conversationUuid: string | null;
  spokenAt: string;
  createdAt: number;
  /** provenance */
  place: string | null;
  speakerLabel: string | null;
}

export interface Card {
  id: number;
  itemId: number;
  title: string;
  /** markdown answer */
  answerMd: string;
  /** JSON array of {title, url} */
  citations: string;
  createdAt: number;
}

export type QuizStatus = "scheduled" | "delivered" | "answered" | "graded" | "expired";

export interface Quiz {
  id: number;
  cardId: number;
  beeTodoId: number | null;
  questionText: string;
  status: QuizStatus;
  scheduledFor: number;
  journalId: string | null;
  answerText: string | null;
  /** JSON: {score: 0-5, feedback, missing: string[]} */
  grade: string | null;
  createdAt: number;
}
