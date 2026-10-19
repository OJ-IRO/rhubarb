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

### 2026-09-22 — Pairing a new Bee Pioneer to iPhone fails after the Bluetooth step
- **Task:** Pair a new, charged Bee Pioneer to an iPhone in the Bee iOS app for the first time.
- **Steps:** Open the app, add a device, hold the bracelet next to the phone. Bracelet blinks blue. Pairing completes. Repeated with the five-press reset (light flashes green), after forgetting the device in iOS Bluetooth settings, after an app reinstall, and on cellular instead of Wi-Fi.
- **Expected:** Device added and listening.
- **Actual:** "Something went wrong", and the app asks to remove the Bee from the phone. Every attempt over two days. It succeeded on the third day with no change on our side, which points at the registration step on Bee's servers rather than Bluetooth.
- **Severity:** blocker (two days without a device, and the error gives no hint whether the fault is the bracelet, the phone or the account)
- **Workaround:** none found; it started working by itself.
- **Suggestion:** distinguish a Bluetooth failure from a server-side registration failure in the error, and say which one it was. A "try again later, our side" message would have saved two days of resets.

### 2026-09-23 — Developer Mode: the docs say "the Version row in Settings", but Version is inside About
- **Task:** Enable Developer Mode so `bee login` can be approved, following docs.bee.computer/docs/developer-mode.
- **Steps:** Settings → looked for a Version row. Found the device firmware version (v0.6.5) on the Your Bee screen and tapped that, which does nothing. Scrolled Settings to the bottom: no Version row. It is inside Settings → About.
- **Expected:** A Version row in Settings, as documented, or a "Developer" entry.
- **Actual:** Ten minutes of tapping the wrong version number. The `bee login` link expired (5 minutes) before Developer Mode was on, so the login had to be restarted.
- **Severity:** minor
- **Workaround:** Settings → About → tap the app version five times.
- **Suggestion:** update the doc to "Settings → About → Version", and make the login link valid for longer than five minutes, since the first thing a new developer does after seeing it is go and find Developer Mode.

### 2026-09-23 — `bee` is not on the PATH of a fresh login shell after `npm i -g`
- **Task:** Run `bee login` from a terminal.
- **Steps:** `npm i -g @beeai/cli` under nvm's Node 24, then open a new terminal tab and run `bee login`.
- **Expected:** The CLI runs.
- **Actual:** `zsh: command not found: bee`, then with the full path `env: node: No such file or directory`, because the shell had not loaded nvm. Worked with `PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH" bee login`.
- **Severity:** papercut (an nvm quirk, not Bee's, but it is the first thing every nvm user will hit)
- **Workaround:** put nvm's bin directory on PATH for the command.
- **Suggestion:** a one-line note in the install docs for nvm users, or offer a Homebrew formula.

### 2026-09-28 — The nightly transcript does not share ids with the live one
- **Task:** Use `/v1/changes` plus `/v1/conversations/:id` to recover lines the live stream missed, and to pick up speaker labels.
- **Steps:** Captured a full day live, then read the same conversations back through REST.
- **Expected:** The same utterance ids, so the REST copy can be matched to the live copy and fill in speaker labels.
- **Actual:** Every REST utterance has a new id (for example live 3520110070 and REST 3520133419 for "Why are you in Osaka?"), timestamps switch from ISO strings to epoch milliseconds, the payload is wrapped in `{ conversation: ... }`, the conversation has no `conversation_uuid` to join on, and every speaker is `"Unknown"` (voice recognition had not been set up in the Bee app; nothing in the API or docs said that was why).
- **Severity:** major (a naive sweep double-counts every long conversation, and speaker attribution is not possible from either feed)
- **Workaround:** match REST lines to stored live lines by timestamp (they agree to the second) and text similarity; remember the stream's conversation id-to-uuid pair from `new-conversation` events.
- **Suggestion:** keep ids stable between the realtime and final transcripts, or include the realtime id on each final utterance; include `conversation_uuid` in the REST conversation; document when speaker labels are expected to appear.

### 2026-10-17 — A new AWS account can't call any model on Amazon Bedrock
- **Task:** Run Rhubarb's Claude calls on Amazon Bedrock in us-east-1, for the AWS Builder mini challenge.
- **Steps:** Created an IAM user with Bedrock access, then called `bedrock-runtime converse` on Claude Opus 5, Sonnet 5, Opus 4.6, Sonnet 4.6, Haiku 4.5 and Amazon Nova, in six regions.
- **Expected:** At least one model answers, perhaps at a low limit.
- **Actual:** Opus 5 and Sonnet 5 answer "not available for this account"; every other model, Amazon's own included, answers "Too many tokens per day" on the first two-word request. The account has a card on file, owes nothing, and isn't on the free plan. Nothing in the console said the quota was zero or how to raise it, and the IAM user couldn't even read its own quotas.
- **Severity:** blocker (for the AWS Builder mini challenge)
- **Workaround:** run on Anthropic's API, keep Bedrock as the first choice with automatic fallback, and open an AWS Support case. A day later Support enabled Claude Opus 4.6 and Sonnet 4.6, and Rhubarb now runs on those through Bedrock; Opus 5 and Sonnet 5 were still refused.
- **Suggestion:** for hackathon participants, a starter Bedrock quota on sign-up, or a clear console message ("your daily token quota is 0; request an increase here") instead of a throttling error.

