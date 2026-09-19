# Bee Capability Reference

> Everything the Bee (bee.computer, Amazon Devices & Services) currently does — consumer product and developer platform — with verified boundaries. Compiled 2026-09-11 from official docs, the Bee FAQ, App Store metadata, the open-source CLI (including a string-dump of the compiled binary for the definitive API surface), ~215 App Store reviews, and press/interviews. Purpose: know exactly what exists so our hackathon entry builds BEYOND it, not on top of it.

---

## 1. Hardware & Platforms

| Item | Detail |
|---|---|
| Device | **Bee Pioneer**, $49.99, modular puck: wristband or clip/pendant. US-only shipping. |
| Mics/controls | Dual mics w/ noise filtering; one action button; green LED = capturing. USB-C (no cable included). Water-resistant, not waterproof. |
| Battery | Claimed 7 days / 160+ hrs; **real-world 6–14 hrs (~1.5–2 days)** with continuous capture. |
| Languages | 40 (official). Claims of "112 languages" online are fabricated. |
| Platforms | **iOS 17.6+ and Apple Watch (watchOS 10+)**. Apple Watch app alone counts as "Bee hardware" for the hackathon. Android: early-access only (summaries, suggested todos, chat), **not actively supported**, last release v1.0.3 (2026-04-18). **No web app. No desktop app.** |
| Pricing | Hardware $49.99; software **free** post-Amazon-acquisition (was $19/mo). Premium tier ("advanced search, specialized agents, deep personalization") announced but **unreleased** — zero in-app purchases exist. |
| Button config | Double-press → bookmark moment / process conversation / both. Press-and-hold → voice note OR chat (user-selectable). Short press = mute/unmute. 5 rapid presses = reset. |
| Auto-stop | Recording stops after 15 min of silence by default (configurable timer values). |

## 2. Consumer App Features (shipped)

1. **Conversation capture + transcription** — real-time processing; **raw audio is never stored** (processed and immediately deleted — no playback, no re-transcription, ever).
2. **Conversation segmentation** — auto-splits recordings into labeled, color-coded topic sections, each tappable to the exact transcript.
3. **Summaries** — short + detailed per conversation and per day.
4. **Daily summary / "Day in Review"** — lands ~8pm; includes sentiment, email + calendar digests, locations, linked conversations.
5. **Suggested to-dos** — auto-extracted; accept/dismiss; alarm times; completion state.
6. **Facts** — "things Bee remembers about you"; proactively suggested; confirmed vs. pending states; user-editable.
7. **Search** — keyword AND semantic, across all captured data.
8. **Chat assistant ("Buzz")** — Q&A grounded in your captured corpus (conversations, facts, todos, summaries, journals, locations, photos + calendar/email context). Persistent corrections land in Facts.
9. **Voice Notes / journals** — press-and-hold dictation; stored as searchable journal entries.
10. **Templates** — automatic per-conversation summary formatting (e.g., lecture → study plan, sales meeting → next steps). Auto-selected; no known picker; no public template list; possibly partially shipped.
11. **Daily Insights** ("Grow" tab) — longitudinal patterns: mood/sentiment trends, relationship shifts, recurring themes, **personalized goal recommendations**. Inputs include months of conversations, email, calendar, and optional **HealthKit** (sleep, heart rate). Fixed daily cadence.
12. **Actions** — converts spoken commitments into outcomes. **Exact scope: two verbs on Google only** — draft a Gmail email, create a Google Calendar invite. Trigger is implicit (detected commitments in conversation). Human-approval-gated (high confidence, not first-party-documented).
13. **Locations** — clustered visited places, recent visits (address + duration), current location.
14. **Photos** — synced from phone gallery, associated to days.
15. **Relationship mapping** — contacts with interaction history.
16. **Onboarding voice training** — Bee learns to recognize the owner's voice.

### Integrations (complete list)
- **Gmail, Google Calendar, Google Contacts** (OAuth). Optional **Apple Health**.
- That is ALL. No Slack, Notion, Linear, Jira, Outlook/Microsoft 365, Todoist, HubSpot/CRM, Zapier, Obsidian. ("More actively in development.")

### Privacy/data controls
- Mute button + LED; per-item permanent deletion; full account+data deletion (Settings → bottom).
- E2E-style architecture: encryption keys live only on the user's phone; released to backend only after attestation of Amazon confidential compute; 7-day key expiry; ~10M tokens/user/year (per Bee security lead's July 2026 talk).
- **No user-configurable retention.** Users report a **~3-month silent retention limit** on memories (unannounced deletion).
- Named as FUTURE (unbuilt) in Bee's own FAQ: **geo-fencing** (auto-pause locations), **topic-fencing** (never-process topics), **on-device models**.

## 3. Developer Platform

### Access
- **Developer Mode:** Bee app → Settings → tap Version **5×**.
- **CLI:** `npm i -g @beeai/cli` (v0.7.3, 2026-06-27, MIT, repo `bee-computer/bee-cli`, 92★). Built with Bun; per-platform native binary.
- **Auth:** `bee login` — NaCl-encrypted device pairing approved in the phone app; `--token`/`--token-stdin`; `--no-wait` (agent-friendly); token in OS secure store. **No OAuth, no scopes, no multi-tenant app registration, single-user all-or-nothing.** Old `developer.bee.computer` key portal is dead (DNS gone).
- **API base:** `https://app-api-developer.ce.bee.amazon.dev` — **private CA**; direct TLS fails standard validation. **Intended path: `bee proxy`** → plain HTTP on `127.0.0.1:8787` (or Unix socket), all `/v1/*` forwarded.
- **Node lib:** `import { createBeeClient } from "@beeai/cli/lib"` — typed, but shells out to the `bee` binary (not an HTTP client). **No Python SDK** (use proxy + requests).
- **MCP:** the CLI is the MCP server. `bee mcp connect claude|claude-code|codex`; `bee mcp serve` (stdio); `bee mcp serve-http` (localhost-only, ≥32-char bearer token). ~30 tools covering all read surfaces + facts/todos writes. **No hosted/remote MCP.**
- **Agent Skill:** `npx skills add bee-computer/bee-skill` (MIT). Real-time awareness (last ~10h transcripts), life overview, archive search, voice memos, relationship context.
- Output modes: markdown, `--json`, `--agent` (token-efficient single lines).

### Complete verified endpoint catalog (from CLI binary string-dump)

**Read-only:**
- `GET /v1/me` — profile
- `GET /v1/todayBrief` — today's calendar events + emails
- `GET /v1/changes?cursor=` — durable cursor changefeed (facts, todos, dailies, conversations, journals)
- `GET /v1/conversations[/:id]` (+ `/related`, `/batch`) — transcript inline: per-utterance `text`, pseudonymous `speaker` label, `spoken_at` (epoch ms); summaries; state
- `GET /v1/daily[/:id]` — daily summaries (`from`/`to` date filter); fields incl. `email_summary`, `calendar_summary`, locations
- `GET /v1/journals[/:id]` — voice notes
- `GET /v1/insights[/:id]` — AI pattern insights (limit ≤50)
- `GET /v1/locations/clusters|recent|current`
- `GET /v1/photos[/:id]` — binary image bytes
- `GET /v1/external-access` — audit log of third-party data access
- `POST /v1/search/conversations` — BM25 (`filter`: conversations|daily|facts|all; `sort`; `since`/`until`; limit ≤100)
- `POST /v1/search/conversations/neural` — semantic (conversations only)
- `POST /v1/search/journals`

**Writable (the ENTIRE write surface):**
- Facts CRUD: `POST/PUT/DELETE /v1/facts[/:id]` — `text` ≤2000 chars, `confirmed` flag
- Todos CRUD: `POST/PUT/DELETE /v1/todos[/:id]` — `text`, `completed`, **`alarm_at`** (ISO-8601 in, epoch-ms out). **A todo alarm is the ONLY push-to-user channel that exists.**
- `GET /v1/todoSuggestions`, `POST /v1/todoSuggestions/:id/accept|dismiss`
- `POST /v1/feedback`

**Real-time:** `GET /v1/stream` (SSE) — event types: `connected`, `new-utterance` (live per-utterance transcript w/ speaker + conversation_uuid), `new-conversation`, `update-conversation`, `update-conversation-summary`, `delete-conversation`, `update-location`, `todo-created/updated/deleted`, `journal-created/updated/deleted`, `journal-text`. CLI: `bee stream --types ... --webhook-endpoint URL --webhook-body '<Handlebars template>'` = zero-code bridge to any HTTP service (client-initiated; Bee never POSTs to you). **At-most-once delivery** — events during disconnect are lost; pair with `/v1/changes` cursor for durability. JSON events have **no top-level event-type field** (distinguish structurally). No `fact-created` event (facts appear only via `/v1/changes`).

**Sync:** `bee sync` — incremental markdown export (`facts.md`, `todos.md`, `daily/YYYY-MM-DD/summary.md`, `conversations/YYYY-MM-DD/ID.md`) via `.bee-sync.json` cursors. **Currently broken (issue #14): `/v1/todos` and `/v1/daily` return 500s.**

**CLI conveniences:** `bee now` (last ~10h w/ verbatim utterances — "the single most valuable context"), `bee today`, `bee changed`, `bee activity`, `bee search` (keyword/neural).

### Limits & known bugs
- No documented rate limits anywhere; no client backoff — assume server throttling exists.
- Per-request caps: search ≤100, insights ≤50, clusters ≤20, visits ≤100, photos 20–100, related ≤10, external-access ≤100. CLI `fetchAllPages` silently truncates at **20 pages**.
- Open bugs (friction-log material): **#14** sync 500s; **#5** TLS private-CA validation failure; **#9** macOS login token not persisted; **#3** duplicated utterances in `bee now`; **#4** no raw-audio stream (open feature request); no linux-arm64 binary (#1).

## 4. What Does NOT Exist (verified whitespace)

**In the API:**
- ❌ Raw audio — zero endpoints (grep of full CLI source: no hits)
- ❌ Real speaker names — pseudonymous labels only ("speaker_1", "4", "9"); in-app tagging **not exposed to API**
- ❌ `/v1/chat` (Buzz unreachable programmatically), `/v1/actions`, `/v1/templates`, `/v1/agents`
- ❌ Calendar/email write; any push-to-device (LED, sound, notification) except todo `alarm_at`
- ❌ Embeddings export; device telemetry (battery etc.); OpenAPI spec; webhooks FROM Bee's servers

**In the product:**
- ❌ Custom/user-defined Actions; any automation or workflow builder (the "workflow automation studio" claim online is a content-farm fabrication describing a third-party product)
- ❌ Chat-initiated actions; web search in Buzz
- ❌ Non-Google integrations of any kind
- ❌ Desktop/web client
- ❌ Multi-user / shared / team context ("optimized for single-user"); the 2025 agent-to-agent and "cloud phone" experiments never shipped
- ❌ Media filtering — TV/podcasts/music ingested as real life (fake facts, todos, people)
- ❌ Reliable speaker ID — manual tagging is buggy, doesn't persist, fails at 3+ speakers
- ❌ Prioritization/dedup/decay — ~15 todos + ~25 facts per day of raw volume needing manual triage
- ❌ Outcome tracking — goals suggested, follow-through never checked
- ❌ Proactive timing — insights on fixed ~8pm cadence, not at moments of relevance
- ❌ Geo-fencing, topic-fencing, on-device processing (Bee's own FAQ: future)
- ❌ Consent signal for bystanders (LED only; legal onus on wearer)
- ❌ Multilingual parity — summaries default to English regardless of conversation language; some languages broken
- ❌ Long-term retention — users report silent ~3-month deletion
- ❌ Device locator / capture-failure alerts (silent capture failures are a top trust complaint)

## 5. Top User Demand Signals (ranked, from ~215 reviews + power-user blogs)

1. **Signal-to-noise collapse** — media pollution + duplicate facts + junk todos = top churn driver ("the data becomes quickly unmanageable"). *API fit: excellent (writable facts/todos).*
2. **Speaker identification** — #1 functional complaint. *API fit: partial (build a cluster-and-name resolution layer on pseudonymous labels).*
3. **Silent capture failures** — "two days of important meetings now live only in my head." *API fit: SSE + calendar watchdog + alarm.*
4. **Export/desktop/integrations** (Notion, Slack, CRM, Obsidian, OneNote) — highest-volume ask. *API fit: trivial reads; differentiate beyond `bee sync` with reasoning.*
5. **Multilingual summaries** in the conversation's language.
6. **Find-my-Bee** (people physically lose it; band pops open).
7. **Permanent archive** beating the 3-month limit.
8. **Reliable grounded Q&A with citations** (Buzz hangs, hallucinates).
9. **"Coach mode"** — strongest positive signal; users find Bee accidentally therapeutic and explicitly request specific coaching + follow-through.
10. Work/personal separation; multiple todo lists.
11. Consent tooling (chime impossible via API; consent ledger partially buildable).
12. Not buildable via API: phone/watch battery drain, Android app parity at capture level, hands-free voice assistant fixes.

## 6. Competitor Feature Deltas (context)

| Competitor | Has that Bee lacks |
|---|---|
| Limitless Pendant | Web/Mac/Windows app; consent chime; desktop "Ask AI"; Android 13+ |
| Plaud Note/NotePin | Raw audio retention + playback; desktop app; clean session boundaries |
| Omi | Open-source hardware/firmware; local-only option; app ecosystem |

## 7. Third-Party Ecosystem Snapshot (competitive field)

~18 projects ever; `@beeai/cli` ≈ 944 npm downloads/month. **Saturated:** MCP servers (4 incl. official), markdown exporters (4 incl. `bee sync`), chat-with-lifelog RAG (4–5). **Empty:** real-time/streaming (0 projects ever use `bee stream`), education (~0), dev-experience (~1.5), cross-device (0), Bee+Bedrock/Strands (1 — an AWS DevRel's reference notetaker). Known public hackathon competitors: 1 confirmed (ambient-guard, weather/AQI advisor), 1 suspected (cuenexa-loop). Zero Bee developer video content exists on YouTube.

## 8. Key Sources

- Product/FAQ: https://bee.computer/bee-pioneer · https://bee.computer/ · https://bee.computer/privacy
- Dev docs: https://docs.bee.computer/ (11 pages; `/docs/proxy` = closest to an API reference)
- Code: https://github.com/bee-computer/bee-cli · https://github.com/bee-computer/bee-skill · npm `@beeai/cli`
- Amazon: https://www.aboutamazon.com/news/devices/bee-amazon-wearable-ai-device-new-features (Actions/Templates/Insights announcement)
- Hackathon: https://amazonappdev2026.devpost.com/ (+ /rules, /resources)
- Reviews/gaps: TechCrunch hands-ons (Jan & May 2026), mikecann.blog month-long test, samjulien.com, ekavc.substack.com, Trustpilot, ~215 App Store reviews via iTunes RSS
- Architecture: Bee security lead's AI Engineer World's Fair 2026 talk (confidential compute, key custody)
- Historical intent (pre-acquisition, unshipped): Latent.Space interview, Feb 2025

### Claims circulating online that are FALSE or unverified (do not rely on)
- "Workflow automation studio / IFTTT rules" — false (content-farm describing its own product)
- "$12/month Premium" — unverified; no IAPs exist
- "Alexa+ integration shipped" — false (Amazon explicitly declined to share integration plans at CES 2026)
- "112 languages / 95–98% accuracy" — fabricated (official: 40 languages, no accuracy claim)
- "Requires explicit activation, not always listening" — contradicted by Bee's own FAQ
