# Friction Log — Bee Developer Platform

Real friction encountered while building Waggle on the Bee CLI / MCP / Agent Skills stack.
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
