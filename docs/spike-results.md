# Week-1 Hardware Spike Results (2026-09-12)

Live measurements against a physical Bee Pioneer + Bee iOS app, `@beeai/cli` 0.7.3, production API, real account.

## Auth & access
- `bee login` device pairing: smooth, ~1 min end to end. Token persisted in secure store (open issue #9 did NOT reproduce on macOS 25.5).
- `bee proxy --port 8787 --idle-timeout 0`: works; plain-HTTP `/v1/*` passthrough confirmed (`GET /v1/me` OK).
- **Proxy POST gotcha:** bare `Content-Type: application/json` → 415 `FST_ERR_CTP_INVALID_MEDIA_TYPE`; **must send `application/json; charset=utf-8`** (see FRICTION-LOG.md).

## SSE stream (`bee stream --json`)
- `connected` event is bare `{"timestamp":...}` — no `type` field. All other observed events DO carry a `"type"` field (research said otherwise; the type-less case is only the connect handshake).
- **Speech → `new-utterance` latency: 6–40s observed** (n=5: ~6s, ~12s, ~26s, ~38s, ~21s). Utterances arrive incrementally during an active conversation, each with `text`, `spoken_at` (ISO), `start`/`end` (seconds into conversation), `id`, `sample_id`, `conversation_uuid`.
- Conversation lifecycle observed: `new-conversation` (state CAPTURING) → `new-utterance`× → `update-conversation` (state PROCESSING, end_time set) → **`delete-conversation`** for short conversations (3/3 short test conversations deleted seconds-to-minutes after processing; their utterances become unrecoverable via reads — LIVE CAPTURE IS MANDATORY).
- Conversation objects carry `template`, `city`, `business`, `primary_location`, `bookmarked`, `device_type` fields.
- Voice notes echo into ambient capture as separate `new-utterance`s with different ASR text (~20s later) → cross-channel dedupe required.
- Stream todo events use **camelCase** (`alarmAt`, `appleId`, `conversationId`) unlike the REST API's snake_case. `todo-created` did NOT fire for todos created via the API (only `todo-deleted` observed on delete) — quiz-todo bookkeeping cannot rely on stream confirmation.

## Voice notes (teach-back answer channel) — VALIDATED
- Press-and-hold → `journal-created` (PREPARING) → **`journal-text` with full transcript** → `journal-updated` (ANALYZING, `sound:"success"`) → `journal-updated` (READY) in **~3s total**.
- Failed attempts (no speech detected) emit `journal-created` then `journal-deleted` `{reason:"silence", sound:"failure"}` ~1s later — several observed; filter these.
- **Bee's own AI answers voice notes** (`aiResponse.message`, with `cleanedUpText`, `followUp`, `questions`, `pushTitle`/`pushBody`). Implication: Waggle's differentiation must center on AMBIENT capture (questions spoken in conversation, not into the device), spaced repetition, teach-back grading, and mastery tracking — NOT "ask Bee a question via voice note," which the product already handles.

## ASR quality notes
- Casual speech garbles: "it'd super interesting", "honey bees actually make honey bees actually make", "12: 14 p. m" formatting. Stage-2 LLM classification must tolerate noisy text; exact-match dedupe won't work (use time-window + fuzzy text).

## Design consequences (locked in)
1. Two-tier capture is mandatory, not defensive: SSE is the only source for short-conversation utterances (server deletes them).
2. All proxy POSTs use `application/json; charset=utf-8`.
3. Quiz-answer matching: journal events are fast (~3s) and reliable → use journals as the answer channel; dedupe journal text against subsequent ambient utterances (fuzzy, ±60s window).
4. Track quiz todos by REST response id (no stream confirmation events for API-created todos).
5. Demo must stage the curiosity question inside a natural conversation, and allow ~10–40s on camera for the card to appear (or cut in real time honestly).
6. **Alarm surfacing UX: VALIDATED.** Todo `alarm_at` fires a real push notification — banner + haptic buzz — with the Bee app closed and phone locked (tested 12:19 in-app, 12:22 lock-screen). Quiz delivery through todo alarms is viable as the primary interruption channel. The screenless loop is fully proven: ambient speech → SSE utterance → [Waggle] → alarm quiz on locked phone → voice-note answer → transcript in ~3s.
