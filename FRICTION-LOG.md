# Friction Log — Bee Developer Platform

Real friction encountered while building Rhubarb on the Bee CLI / MCP / Agent Skills stack.
(The project was called Waggle until 2026-09-19, which is why quoted transcripts and test data in early entries say "Waggle." Quotes are left exactly as captured.)
Format per hackathon guidance: task, steps, expected vs. actual, severity, workaround, suggestion.

---

## Entry template

```
### <short title>
- **Task:** what I was trying to do
- **Steps:** exact steps taken
- **Expected:** what should have happened
- **Actual:** what happened (exact error text where possible)
- **Severity:** blocker / major / minor / papercut
- **Workaround:** how I got past it (or "none")
- **Suggestion:** what would fix or prevent this
```

---

<!-- Entries appended chronologically below as they occur. Only log friction actually hit during this build. -->

### 2026-09-12 — `bee proxy` rejects POSTs with bare `application/json`
- **Task:** Create a todo through the local proxy: `POST http://127.0.0.1:8787/v1/todos` with `Content-Type: application/json`.
- **Steps:** `bee proxy --port 8787`, then `curl -X POST http://127.0.0.1:8787/v1/todos -H 'Content-Type: application/json' -d '{"text":"..."}'`.
- **Expected:** Todo created (GET requests through the proxy work fine).
- **Actual:** `{"statusCode":415,"code":"FST_ERR_CTP_INVALID_MEDIA_TYPE","error":"Unsupported Media Type"}`. Same failure on `POST /v1/search/conversations`. The identical request with `Content-Type: application/json; charset=utf-8` succeeds.
- **Severity:** major (breaks every non-curl HTTP client that sends the standard bare media type; the error message gives no hint the charset parameter is the issue)
- **Workaround:** always send `Content-Type: application/json; charset=utf-8`.
- **Suggestion:** register the Fastify content-type parser for `application/json` regardless of parameters (or use a regex/default parser), and document proxy POST usage in docs.bee.computer/docs/proxy.

### 2026-09-12 — Short conversations are silently deleted server-side after processing
- **Task:** Capture a short spoken test conversation (~30–60s) and read it back later.
- **Steps:** Wore the Bee, spoke ~3 sentences; watched `bee stream --json`; then tried to fetch the conversation afterward.
- **Expected:** Conversation persists (perhaps flagged short/low-content) and is retrievable via `/v1/conversations`.
- **Actual:** Each short conversation emitted `new-conversation` → `new-utterance`(s) → `update-conversation` (state PROCESSING) → **`delete-conversation`** seconds-to-minutes later. Observed 3/3 times (conversation ids 10461291, 10461300, 10461366). The utterances are unrecoverable through any read endpoint afterward.
- **Severity:** major (a changefeed/sweep-based integration silently loses these entirely; nothing in the docs mentions post-processing deletion)
- **Workaround:** consume utterances live from the SSE stream and persist them yourself at event time.
- **Suggestion:** document the deletion behavior and its threshold; consider a `conversation-discarded` event or a grace-period read endpoint.

### 2026-09-12 — Voice notes are double-captured as ambient conversation utterances
- **Task:** Record a voice note (press-and-hold) while the device is capturing.
- **Steps:** Held the button, spoke a note; watched the stream.
- **Expected:** The note appears once, as a journal.
- **Actual:** It arrived as `journal-text`/`journal-updated` AND ~20s later as a `new-utterance` inside a new ambient conversation with slightly different ASR text ("Testing Waggle Voice Note 123, this note was made at 12: 14 p. m.").
- **Severity:** minor (but any app reacting to utterances must dedupe against recent journals or it processes the same speech twice)
- **Workaround:** fuzzy-match utterance text against journals from the surrounding time window.
- **Suggestion:** suppress ambient capture during an active voice-note hold, or tag the resulting utterances with the journal id.

### 2026-09-12 — `todo-created` is not emitted on the stream for todos created through the API
- **Task:** Create a todo with `POST /v1/todos` (or `bee todos create`) while `bee stream --json` is running, and use the stream event as confirmation.
- **Steps:** Started the stream; created two todos via the CLI and the proxy; later deleted one.
- **Expected:** A `todo-created` event for each, then `todo-deleted`.
- **Actual:** No `todo-created` event arrived for either API-created todo. Deleting one did emit `todo-deleted`.
- **Severity:** minor (an integration cannot use the stream to confirm its own writes, and the asymmetry with `todo-deleted` is surprising)
- **Workaround:** track the id from the REST response instead of waiting for a stream event.
- **Suggestion:** emit `todo-created` for API-originated todos too, or document that stream events only cover app/device-originated changes.

### 2026-09-12 — Stream events use camelCase where the REST API uses snake_case for the same object
- **Task:** Reuse one todo type for both REST responses and stream events.
- **Steps:** Compared `GET /v1/todos` output with the payload of a `todo-deleted` stream event.
- **Expected:** The same field names for the same resource.
- **Actual:** REST returns `alarm_at`, `created_at`; the stream sends `alarmAt`, `appleId`, `conversationId`. Journals are camelCase in both places (`createdAt`, `aiResponse`) while conversations and utterances are snake_case (`spoken_at`, `conversation_uuid`). `alarm_at` also goes in as ISO 8601 and comes back as epoch milliseconds.
- **Severity:** papercut (every client ends up writing two mappers per resource)
- **Workaround:** separate types for stream payloads and REST payloads.
- **Suggestion:** pick one casing per resource across REST and stream, and return timestamps in the format they are accepted in.

### 2026-09-13 to 2026-09-19 — `bee stream` drops about every 90 minutes and exits instead of reconnecting
- **Task:** Keep a long-lived `bee stream --json` connection open for a week as the live input to an always-on app.
- **Steps:** Ran `bee stream --json` as a child process from 09-13 to 09-19 on one always-on Mac, restarting it whenever it exited.
- **Expected:** The CLI holds the SSE connection open, or reconnects on its own after a transient drop.
- **Actual:** The process exited with code 1 **99 times in about 6.3 days**. Stderr on exit: "The socket connection was closed unexpectedly…" (65 times), "The operation timed out." (25), "Unable to connect. Is the computer able to access the url?" (9). Each restart reconnected within about two seconds, so the service was reachable. Because delivery is at-most-once, anything said during each gap is gone.
- **Severity:** major (every always-on integration has to supervise the CLI, and each drop is a silent hole in capture)
- **Workaround:** supervise the process and respawn with backoff (`BeeStreamConsumer` in `packages/core/src/bee.ts`); run a nightly `/v1/changes` sweep to recover whatever conversations survived.
- **Suggestion:** reconnect inside `bee stream` with backoff and `Last-Event-ID` so events during a short gap are replayed; send SSE keep-alive comments so idle connections are not reaped; print the reason and a timestamp in `--json` mode as a structured event rather than only on stderr.

### 2026-09-15 to 2026-09-19 — `GET /v1/changes` intermittently returns 500 with an HTML body
- **Task:** Nightly durable sync using the changefeed cursor.
- **Steps:** Called `GET /v1/changes?cursor=<saved cursor>` through `bee proxy` once a night.
- **Expected:** JSON with changed ids and `next_cursor`.
- **Actual:** On three of seven nights (09-15, 09-16, 09-19) the response was `500` with an HTML document (`<!doctype html>…`) instead of a JSON error. The same cursor succeeded on a later night, so the cursor itself was valid. Related: open CLI issue #14 reports 500s from `/v1/todos` and `/v1/daily` during `bee sync`.
- **Severity:** major (the changefeed is the documented recovery path for the at-most-once stream; when it fails too, there is no second backstop)
- **Workaround:** keep the old cursor on failure and retry on the next run; never advance the cursor unless the call succeeds.
- **Suggestion:** return JSON errors with a request id from the API, and document retry guidance and cursor lifetime for `/v1/changes`.
