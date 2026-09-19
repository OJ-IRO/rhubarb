# Rhubarb: product plan

> Carried over from the working plan on 2026-09-19. Written while the project was called Waggle; names are updated, decisions and dates are unchanged. `HANDOFF.md` is the short version.


## Context

Jay is competing to win the Bee track ($12k 1st + Amazon Developer team 1:1) plus the Open Source and AWS Builder mini challenges. **Deadline Oct 23, 2026 12:00pm PDT; submit Oct 21–22; AWS credits request by Oct 21.** Judging: Tech Implementation, Design, Potential Impact, Quality of Idea (25% each) + up to 10% friction-log bonus. Hard gate: demo video and code must show live real Bee data delivering value.

**What's already built (Sep 11–12):** research (`docs/BEE-CAPABILITIES.md`), private repo `jdesai840/rhubarb` (flip public at submission), hardware spike fully validated (`docs/spike-results.md`: SSE utterance latency 6–40s, voice-note transcript ~3s, todo alarms buzz a locked phone, short conversations deleted server-side so live capture is mandatory, proxy needs `application/json; charset=utf-8`), 3 friction-log entries, and a working capture skeleton: `packages/core` (types, SQLite `RhubarbDb`, `BeeClient`/`BeeStreamConsumer`, `stage1Detect`, FSRS `initCardSchedule`/`recordReview`) and `packages/daemon` (stream → journal-echo dedupe → stage-1 → items table). AWS creds work; Bedrock has `anthropic.claude-opus-5` and `anthropic.claude-sonnet-5` in us-east-1.

**The vision, evolved (this plan):** Rhubarb listens to your day, figures out the *skills* you actually need, ranks them by priority, and teaches them through interactive lessons in your learning style until you're competent — then **credits competence when it hears you use the skill in real life**. Sparks (passing curiosity → one-paragraph answer card) stay as a secondary lane. Everything Rhubarb writes must read like a thoughtful human wrote it, not AI slop. Decisions locked with Jay: Skills hero + Sparks lane; field evidence is the flagship differentiator; web app is laptop-local, served by the daemon.

**Pitch:** *"Rhubarb doesn't just teach you. It hears you get better."*

## Product flow (the spec)

1. **Listening (continuous).** Live SSE stream + nightly sweep of full conversations via `/v1/changes`. Collect *evidence*, not just questions: `question` (wonderings), `gap` (hedges, misstatements), `struggle` ("had no idea what they meant by…"), `intent` ("I need to get better at…", "I should learn…"), `exposure` (domain vocabulary you're around but never use), `stake` (calendar events from `/v1/todayBrief` — interview, trip, presentation). Every piece keeps provenance: when, where (`/v1/locations/recent` match), who (speaker label).
2. **Reflection (nightly + "Reflect now" button).** Cluster evidence into skills ("Kubernetes fundamentals", "salary negotiation", "conversational Japanese"). Score priority from stated intent, frequency/recency, urgency (calendar-linked), stakes, gap depth, and declared goals. Output per skill: a **brief** — three or four human sentences explaining why now ("Three times this week… you have a platform sync Thursday…"). Jay confirms / dismisses / reorders in the web app (this is also the false-positive review queue).
3. **Lesson design (on accept; auto for top-1).** Build a competence ladder (3–6 levels, each an outcome: "can follow the conversation" → "can explain the trade-offs" → "can teach it"). Write the current level's lesson in the profile's learning style and session length, grounded in cited web research for factual domains, using Jay's own evidence as the examples ("when Maya said 'rolling deployment' on Tuesday…"). Each lesson has beats: **check-in question → scenario → teach-back → tomorrow's mission**.
4. **Delivery — two surfaces, one loop.** Web app hosts the lesson reader (inline beats, a tutor you can push back on). The pendant is sensor + nudge + practice mic: alarms say a lesson is ready or hand you a mission ("In your 2pm, name the trade-off out loud"); teach-backs arrive by alarm, answered by voice note, graded Feynman-style.
5. **Field evidence (flagship).** For active skills, watch later conversations for the skill being used; an LLM judge decides whether it was used correctly; credit competence from real life ("Heard you explain rolling deployments to Maya today. Level 3."). Honeycomb cells fill from lessons + teach-backs + field evidence.
6. **Progress.** Honeycomb (cells = skills, fill = level), provenance on every cell, weekly brief written as a letter.

**Learning profile (web onboarding, ~3 min, conversational not a form):** learning style (story-driven / hands-on / Socratic / structured / analogy-first), session length (5/10/20 min), learning windows (e.g. commute, evenings), goals already known, off-limits topics (a nod to the topic-fencing Bee's FAQ admits it hasn't built). Adaptive refinement from grades is a stretch.

## Voice & anti-slop (non-negotiable)

- `VOICE.md` at repo root: the writing guide injected into every generation prompt. Principles: plain and warm, second person, specific over general, short paragraphs, examples from the reader's own life, narrative flow over headers/bullets (bullets only for genuine steps), no filler openers, no "delve/leverage/robust/in conclusion/it's worth noting", no exclamation-mark enthusiasm, no em-dash chains, no sycophancy, end on the next concrete thing to do. Include 3 before/after examples.
- `packages/core/src/voice.ts`: exports the guide text and a `proseLint(text)` that runs (a) deterministic checks — banned phrases, bullet ratio, header density, sentence-length monotony — and (b) a Sonnet 5 judge returning `{slopScore, reasons}`. Generations above threshold are regenerated once with the reasons appended.
- Applies to lesson bodies, briefs, tutor replies, nudge text, grading feedback, AND product copy in the web app.

## Architecture (changes to existing code)

```
rhubarb/
  VOICE.md
  packages/core/src/
    types.ts        — extend: Evidence, Skill, LadderLevel, Lesson, LessonSession, Practice, FieldEvidence, Profile
    db.ts           — new tables: evidence, skills, ladder_levels, lessons, lesson_sessions, practice, field_evidence, profile; keep items/cards/fsrs_state for Sparks
    detect.ts       — extend stage-1 cues for intent/struggle; add skill-term matcher for field-evidence candidates
    bee.ts          — add todayBrief(), listConversations()/getConversation() for the nightly sweep
    llm.ts          — AnthropicBedrockMantle client (region us-east-1); helpers: classify (Sonnet 5, structured output), write (Opus 5, streaming, adaptive thinking), judge (Opus 5)
    voice.ts        — guide + proseLint
    scheduling.ts   — keep FSRS for Spark recall + key-concept recall inside skills
  packages/daemon/src/
    index.ts        — orchestrator: stream consumer + timers (classify batch every 2 min, sweep nightly 02:00, reflection nightly 03:00, nudge scheduler, field-evidence judge hourly) + HTTP API + static dashboard
    pipeline/capture.ts     — utterance → evidence (stage-1) ; journal handling → practice answers
    pipeline/classify.ts    — stage-2 batch: evidence kinds, spark vs skill routing, skill-relevance tags
    pipeline/reflect.ts     — clustering, ranking, briefs (Opus 5)
    pipeline/lessons.ts     — ladder + lesson generation w/ research tool loop + proseLint
    pipeline/practice.ts    — teach-back/mission todos w/ alarm_at; journal → grade → level progress
    pipeline/field.ts       — field-evidence candidates → judge → credit
    api.ts                  — REST for the dashboard (profile, skills, lessons, sessions, tutor chat via SSE)
  packages/dashboard/       — Vite + React, built to dist and served by the daemon
    pages: Onboarding, Today, Skills, SkillDetail (ladder, evidence, field evidence), Lesson (reader + beats + tutor), Sparks, Honeycomb, Settings
  rhubarb-skill/SKILL.md     — agent skill exposing learning state via the daemon API
```

**LLM stack:** `@anthropic-ai/bedrock-sdk` → `new AnthropicBedrockMantle({ awsRegion: "us-east-1" })`. Opus 5 (`anthropic.claude-opus-5`) for reflection, lesson writing, tutor, grading, field judge — adaptive thinking, `output_config.effort` high for writing; streaming for lessons. Sonnet 5 (`anthropic.claude-sonnet-5`) for high-volume stage-2 classification and proseLint judge, `output_config.format` structured outputs for JSON. Prompt caching on the stable prefix (VOICE.md + profile). Web research: check `shared/platform-availability.md` in the claude-api skill for the `web_search_20260209` server tool on Bedrock at implementation time; if unavailable on Bedrock, use a Tavily search tool in a manual tool loop (Jay signs up for a free Tavily key). Never mock LLM output.

**Nudge channel:** Bee todos with `alarm_at` (validated). Text ≤ ~120 chars written in voice ("Your Kubernetes lesson is ready — 12 minutes, whenever you're at your desk."). Practice todos carry a marker id in text so answers match; practice completes/deletes the todo after grading.

**Answer matching:** journal READY events → most recent open practice within 6h window; fuzzy-dedupe the journal text against ambient utterances (existing `textSimilarity`).

**Field evidence:** each active skill stores a term list + a one-line "what competent use looks like"; classify batch tags utterances that hit terms; hourly judge (Opus 5) evaluates the surrounding utterance window and returns `{used, correct, note}`; credit + nudge.

## Status (end of Sep 12)

Built and running live: capture + evidence detection, stage-2 classifier, Sparks cards (dedupe), practice loop (alarm → voice note → Opus 5 grade → feedback alarm), nightly sweep + stakes, reflection (skills/ranking/briefs), ladders + lessons + beats, field evidence + judging, level progression, HTTP API (`packages/daemon/src/api.ts`), dashboard shell only. Commits through "full pipeline wired". Open: dashboard pages, nudge scheduling by learning windows, tutor chat, Tavily key, Google Calendar connected in Bee app.

## Dashboard & lesson time (the surfaces — NEXT)

Web app at `http://127.0.0.1:4242` (Vite/React in `packages/dashboard`, built to `dist`, served by the daemon; dev via `vite` with `/api` proxy). Serif, warm, honeycomb identity; every string of copy follows VOICE.md. Client-side router (hash or `react-router`), data via the existing `/api` routes plus the new ones below.

**Pages**
- **Today** (`/`): a short letter for the day (generated nightly by reflection, stored in kv `today_letter`; falls back to a plain status line) → today's lesson card (highest-priority active skill with a `ready` lesson) → due practice/recall list → "Reflect now" button. First visit with no profile redirects to Onboarding.
- **Onboarding** (`/welcome`): conversational, one question per screen, written in voice: name; how you like to learn (5 styles with one-line descriptions); session length (5/10/20); when you like to learn (free text + quick picks: commute / lunch / evening); goals you already have (free text list); topics Rhubarb should never touch. Saves via `PUT /api/profile`.
- **Board** (`/board`): ranked skills. Sections: *Proposed* (needs a decision: accept / dismiss), *Active* (level x of n, next lesson state), *Mastered*. Each row: name, priority, the brief, evidence count, "why" expands to the moments (quote, when, who). Accept → `POST /api/skills/:id/accept` (ladder + first lesson generate in background; row shows "writing your first lesson…" until `ready`). Reorder via priority nudge buttons (PUT priority) — drag is stretch.
- **Skill** (`/skills/:id`): ladder (levels with locked/current/done), lessons list, practice history with grades + feedback, field-evidence moments (credited ones highlighted: "Heard you use this on Tue with speaker_2"), evidence with provenance.
- **Lesson** (`/lessons/:id`): reader (markdown body) → beats inline in order; check-in + scenario answered as text in-page (stored in session responses, quick Sonnet feedback line); teach-back: "answer here" (text, graded same rubric) or "send to my pendant" (creates practice via alarm now+1m); mission: schedule for tomorrow morning (practice kind=mission with alarm at next learning window). "Done" → `POST /api/lessons/:id/complete` (marks lesson done; progression may advance). Tutor panel: chat scoped to this lesson, streamed (SSE) from Sonnet 5 with the lesson + skill + voice guide as cached system prefix.
- **Sparks** (`/sparks`): cards with title, paragraph, citations, when/where it was asked; recall due state.
- **Honeycomb** (`/honeycomb`): SVG hex grid; one cell per skill (active/mastered), fill = level/ladder length, hover → name + last field-evidence note; empty cells for proposed skills in outline.

**New API routes** (extend `api.ts`): `POST /api/lessons/:id/session` (start/get session), `PUT /api/lessons/:id/session` (responses), `POST /api/lessons/:id/beat/:idx/answer` (grade check-in/scenario/teachback text → returns feedback), `POST /api/lessons/:id/teachback/pendant`, `POST /api/lessons/:id/mission`, `POST /api/lessons/:id/complete`, `GET /api/lessons/:id/tutor` (SSE stream) + `POST /api/lessons/:id/tutor` (message), `PUT /api/skills/:id/priority`, `GET /api/today`.

**Lesson time (scheduler)**: profile `learningWindows` parsed into concrete daily times by a small Sonnet call at profile save (stored as `learning_slots` kv, e.g. `[{"dow":[1,2,3,4,5],"time":"20:00"}]`). `nextLearningSlot()` in daemon; lesson-ready and mission nudges are scheduled at the next slot instead of now+2m; the nightly reflection also writes the Today letter. One lesson per day is the default cadence; the Board lets the user start another on purpose.

**Order of work**: Onboarding + Today + Board first (that's the demo spine), then Lesson reader + beats + pendant hand-off, then Skill page, Honeycomb, Sparks, tutor chat last.

## Round 3 (Sep 12, approved): ranked board, slide-deck lessons, comprehension check, preview mode

**Context.** Dashboard v1 shipped (Today/Board/Skill/Lesson/Sparks/Honeycomb). Jay wants: (1) the Board to show *everything* Rhubarb thinks he should learn, ranked most→least important, with the top 3 spotlighted; (2) lessons that are genuinely designed — a series of slides/cards with diagrams, images from the web, structured chunks, and "learn more" links, not a text response; (3) a comprehension check after each lesson, AI-generated, well designed; (4) a preview mode with realistic fixture content so the UI can be refined visually without live data. Live demo still uses only real Bee data; preview is a design sandbox and is labeled as such.

**1. Board redesign** (`packages/dashboard/src/pages/Board.tsx`, `api.ts` `/api/skills` already returns priority)
- Sort all non-dismissed skills by priority desc (proposed + active + mastered together; dismissed under a "show dismissed" toggle).
- **Spotlight**: top 3 as large cards in a row — rank numeral, name, one-line "why" (first sentence of brief), priority meter, status chip, primary action (Yes teach me / Open lesson / Reread). Honey-tinted, the visual centerpiece.
- **Full ranking** below: numbered rows 4…n with name, priority bar, status chip, evidence count, brief expandable, accept/dismiss/↑↓.
- Priority meter component shared (`components/Meter.tsx`).

**2. Lesson decks** (data + generation + UI)
- Types (`core/src/types.ts`): `Slide` union — `cover {title, subtitle, hook}`, `text {heading, body(md), aside?}`, `keyidea {statement, why}`, `diagram {heading, mermaid, caption}`, `image {heading, query, url?, alt, caption, credit?}`, `example {heading, quote, when, who?, explanation}` (a moment from the reader's week), `steps {heading, steps[{title, body}]}`, `compare {heading, columns[{title, points[]}]}`, `learnmore {links[{title, url, why}]}`. `Deck {title, subtitle, minutes, slides[]}`. `QuizQuestion` union — `mcq {prompt, choices[], answer, explanation}`, `short {prompt, rubric}`. `Quiz {questions[]}` (5–7 questions). `Lesson` gains `deck: string` (JSON), `quiz: string` (JSON); `bodyMd` kept as the plain-prose rendering for tutor context/fallback.
- DB (`core/src/db.ts`): add columns via `ALTER TABLE lessons ADD COLUMN deck/quiz` guarded by `PRAGMA table_info`. `PracticeKind` gains `"quiz"`; quiz results stored as practice rows (grade JSON `{score, total, perQuestion}`), so progression (`progress.ts`) can treat quiz ≥ 80% like a strong teach-back.
- Generation (`daemon/src/pipeline/lessons.ts`): one Opus 5 `researchThenEmit` call returns `{deck, quiz, bodyMd, beats, citations}` with slide-level guidance in the role prompt: 8–14 slides; open with cover + hook; at least one `example` slide from real evidence; one `diagram` (Mermaid flowchart/sequence/state only, ≤ 12 nodes, no styling directives); 1–2 `image` slides given as search queries + captions; a `keyidea`; `learnmore` last with real URLs from research. Then server-side post-processing: **image resolution** (`daemon/src/pipeline/images.ts`: Wikimedia Commons search API — no key — then Tavily image search if `TAVILY_API_KEY`; HEAD-check the URL; drop the slide if nothing resolves), **link validation** (HEAD each learnmore/citation URL, drop dead ones), **Mermaid sanity** (strip code fences, ensure it starts with a known diagram keyword), **voice lint** on all prose slides (regenerate once with reasons).
- UI (`dashboard/src/pages/Lesson.tsx` → deck viewer): one slide at a time, ← → keys and buttons, progress bar with slide dots, per-kind renderers (`components/slides/*.tsx`), Mermaid rendered client-side (`mermaid` npm, render on mount, graceful fallback to caption), image slide with credit line, learn-more slide with outbound buttons. After the last slide: **Check your understanding** (quiz UI: mcq with instant reveal + explanation; short answers graded via `POST /api/lessons/:id/quiz` → judge; final score card in voice), then the existing beats (teach-back to pendant, mission) and "Done". Tutor panel stays.
- API (`daemon/src/api.ts`): `POST /api/lessons/:id/quiz` `{answers}` → grades mcq locally, short answers via Opus judge, stores practice row kind `quiz`, returns `{score, total, perQuestion, note}`.

**3. Preview mode** (design sandbox, no daemon needed)
- `dashboard/src/fixtures.ts`: hand-written realistic content in voice — a profile, 7 skills with briefs/priorities (Kubernetes rolling deployments, salary negotiation, conversational Japanese, reading a term sheet, …), one full deck (Kubernetes rolling deployments: cover, example from a "Maya on Tuesday" moment, text, diagram (Mermaid), image (verified Wikimedia URL), steps, compare, keyidea, learnmore) + quiz + beats, sparks, practice history, field evidence.
- `dashboard/src/api.ts`: if the hash starts with `#/preview`, every `api.*` call resolves from fixtures (mutations no-op and return fixtures). A persistent **"Preview — sample content, not your data"** banner. Routes mirror live ones: `#/preview/board`, `#/preview/lessons/1`, `#/preview/skills/1`, `#/preview/`, `#/preview/honeycomb`, `#/preview/sparks`; nav links keep the prefix while in preview. Entry: `#/preview` index page listing the surfaces. Dev loop: `npm run dev -w @rhubarb/dashboard` (Vite, hot reload) at `http://127.0.0.1:5173/#/preview` — no daemon or Bee needed.

**Order**: fixtures + preview plumbing first (so the UI can be judged immediately) → Board redesign → deck viewer + slide components + Mermaid → quiz UI → types/db/generation/images/links → quiz API + progression → rebuild, restart daemon, regenerate a real lesson to compare against the fixture.

**Verify**: preview renders every slide kind and the quiz with no daemon; `vite build` clean; live: accept a skill → deck with resolved image + rendered diagram + valid links; quiz submit stores a practice row and the score shows on the Skill page; lint passes on generated slide prose.

## Schedule (Sep 12 → Oct 23)

- **Wk1 rest (Sep 12–17):** VOICE.md + `voice.ts`; `llm.ts` Bedrock wiring + smoke test; evidence model + extended stage-1; stage-2 batch classifier (structured outputs); Sparks research cards end-to-end; profile store; daemon HTTP API skeleton + dashboard scaffold (Vite/React, served by daemon). Friction-log as we go.
- **Wk2 (Sep 18–24):** nightly sweep (`/v1/changes` + conversation reads) + `todayBrief` stakes; reflection pass (clustering, ranking, briefs); Skills + Today + Onboarding pages; nudge scheduler honoring learning windows.
- **Wk3 (Sep 25–Oct 1):** ladders + lesson generation with research + proseLint; Lesson reader with beats + tutor chat (SSE streaming); teach-back via pendant (practice todos → journal → grade → level progress); missions.
- **Wk4 (Oct 2–8):** field evidence end-to-end; Honeycomb + provenance + SkillDetail; Sparks page; rhubarb-skill. First full dogfood week.
- **Wk5 (Oct 9–15):** tune precision/prose on real data; design polish + empty/error states; README + architecture diagram; AWS credits request; stretch only if ahead (adaptive style, context-aware nudge timing).
- **Wk6 (Oct 16–23):** demo video (script → film live segments → edit <3 min); Devpost submission (description, product feedback, friction-log entries, feature requests, track = Bee, minis = OSS + AWS Builder); flip repo public; submit Oct 21–22.

Jay wears the Bee daily throughout — real evidence is demo material.

## Demo video v2 (3 min, live real data)

0:00 hook ("You ask dozens of questions a day…" → "Rhubarb turns your life into a curriculum — and hears you get better") → 0:15 real conversation on camera where Jay hedges about something work-adjacent → 0:40 Rhubarb's brief: ranked skills with the human-written "why now" → 1:05 open the lesson: narrative voice, Jay's own conversation as the example → 1:30 practice through the pendant: alarm buzzes locked phone, Jay answers aloud, graded live → 2:00 field evidence: a later real conversation where Jay explains it correctly → honeycomb cell fills, nudge on phone → 2:30 close: education priority, open source, friction log. Every beat shows live Bee data.

## Verification

- Unit tests (`node --test`): stage-1 cues incl. intent/struggle; `textSimilarity`; FSRS; proseLint deterministic checks with slop/clean fixtures; answer-matching window logic.
- LLM smoke tests against Bedrock on first wiring (classification JSON validity, a lesson generation passing proseLint).
- Weekly live protocol on real hardware: hedge in conversation → evidence < 60s; reflect → skill + brief; accept → lesson ready < 3 min; practice alarm → voice answer → grade < 2 min; scripted field-evidence conversation → credit within the hourly judge run.
- Demo dry-run Week 6 before filming.

## Submission checklist

- [ ] Public GitHub repo (flip from private), MIT visible in About, setup instructions, Bee tech at runtime in code
- [ ] Demo video < 3:00, public, English, live Bee data
- [ ] Description; Product Feedback; Friction Log entries (target full 10%); optional Feature Requests
- [ ] Track = Bee; minis = Open Source + AWS Builder; AWS credits requested by Oct 21
