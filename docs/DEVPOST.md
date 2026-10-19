# Devpost submission: Rhubarb (draft)

Paste each section into the matching Devpost field. Things only you can fill in are marked
**[YOU]**. Numbers are from the live server on 2026-10-03; refresh them the day you submit.

---

## Basics

| Field | Value |
|---|---|
| Project name | Rhubarb |
| Elevator pitch (200 characters) | A tutor that listens through your Bee, turns your real conversations into lessons, and hears you get better when you use what you learned. |
| Track | Bee |
| Mini challenges | Open Source, AWS Builder (Claude on Amazon Bedrock) |
| Video | **[YOU]** YouTube link, public, under 3:00 |
| Try it out | https://github.com/OJ-IRO/rhubarb (public on submission day) · https://rhubarb-demo.vercel.app (a guided demo with sample content; the real app holds private conversations, so it isn't public) |
| Built with | bee, bee-cli, amazon-bedrock, typescript, node.js, react, vite, sqlite, claude, three.js, mermaid, tavily, railway, vercel |
| Team | **[YOU]** OJ, plus Jay if he agrees (he started the project on 2026-09-11) |

---

## About the project

Paste everything below into the "About the project" field.

### Inspiration

Most of what you could learn from your day is gone by dinner: a word you didn't know, a question you couldn't answer, a clerk you couldn't follow. On a trip to Japan I wore a Bee and realised it hears all of it. What if a tutor started from your real day, and counted progress by whether you use what you learned?

### What it does

Rhubarb is a tutor that listens through your Bee and builds learning plans from your own day, for a language, a work skill, or anything you're curious about.

- **Listens:** reads the Bee's live transcript. Text only, never audio. Private moments are dropped before any AI sees them.
- **Checks with you:** every evening it shows what it thinks happened. You mark each finding right or not quite, and fix anything Bee misheard. Nothing is built on a guess.
- **Teaches:** suggests plans from what you confirmed. Say yes and how much you already know, and it writes a short lesson around your own words, fact-checked by a second AI.
- **Practises through the Bee:** your phone buzzes with a question, and you answer out loud into your Bee.
- **Hears you get better:** later conversations are checked for the skill used for real. That's the progress, not streaks.

Also: ask out loud to get a lesson on anything, quick "guess first" answers, places (a landmark, never your address), reading help per plan, a day-by-day look back, and forget anything.

### How we built it

- **Bee:** `bee stream --json` for the live transcript and voice notes, the Bee API to recover missed lines, todos with alarms to reach the phone, and conversation locations for places.
- **Claude on Amazon Bedrock:** Opus writes, fact-checks and grades; Sonnet sorts what was heard. Anthropic's API is an automatic fallback.
- **Stack:** TypeScript, Node, SQLite, React, three.js. Runs on Railway around the clock; the judges' demo is on Vercel. Tavily for sources, 68 tests, a daily cost cap.

### Challenges we ran into

- Bee deletes short conversations minutes after they end, so we capture everything live.
- The live stream drops about every 90 minutes, and nightly transcripts use different ids, so we built a supervisor and matching by time and text.
- Bee can mishear ("Osaka" became "Old Southfield") and doesn't always know who's speaking. That's why the evening check exists.
- A new AWS account couldn't call any model until AWS Support enabled them.

### Accomplishments that we're proud of

- It works on real life: in its first four days, 3,043 lines heard, 148 moments noticed, 9 plans and 5 fact-checked lessons, in Japanese and English.
- The learner stays in charge: confirm, correct, or forget anything.

### What we learned

A first reading of someone's day is a guess. Rhubarb got much better once it asked before assuming.

### What's next for Rhubarb

- Use Bee's voice recognition to tell your lines from everyone else's.
- A phone-only mode, no wearable needed.
- Bring it to adult English learners, with real-world use as the measure of progress.

---

## Product feedback (required: every tool used)

**Bee CLI (`@beeai/cli` 0.7.3).** `bee login` took under a minute. `bee stream --json` is a
genuinely good integration surface: typed events, per-utterance text with `spoken_at`, and a
voice-note transcript about three seconds after the button is released. `bee proxy` removes the
private-CA problem for local apps. Two things hurt: the stream drops roughly every ninety minutes
and exits rather than reconnecting, and `bee` isn't on the PATH of a fresh shell under nvm.

**Bee developer API.** Todos with `alarm_at` are the standout: a real push with haptics on a
locked phone turns the Bee into a two-way channel with no extra hardware. Location clusters and
conversation locations were easy to use. Pain points: short conversations are deleted after
processing with no event or documentation; the realtime and final transcripts use different ids
and the REST conversation has no `conversation_uuid`, so the two can't be joined; speaker labels
aren't on the live stream, and REST lines read "Unknown" until the wearer sets up voice recognition; `/v1/changes` sometimes returns a 500 with an HTML body; the
proxy rejects a bare `application/json` content type; and stream events use camelCase where REST
uses snake_case.

**Bee device and app.** Japanese transcription was better than expected. Pairing a new Bee failed
for two days with an error that didn't say whether the fault was Bluetooth, the phone or the
account. The docs send you to "the Version row in Settings" for Developer Mode; it's under About.

**Claude (Amazon Bedrock, with Anthropic's API as fallback).** Claude Opus writes the lessons and
reviews, Sonnet sorts moments. Structured output through a single tool call was reliable. On
Bedrock, a brand-new AWS account was refused every model until an AWS Support case enabled Claude
Opus 4.6 and Sonnet 4.6 a day later (Opus 5 and Sonnet 5 still refused). Rhubarb now runs on Bedrock
first and falls back to Anthropic's API automatically.

**Tavily.** Search results good enough to cite in lessons; image search filled in the gaps
Wikimedia couldn't.

**Railway and Vercel.** Railway kept the listener running around the clock for about $5 a month;
its domain defaulted to the wrong port the first time. Vercel hosts the judges' demo.

---

## Friction log (up to 10% bonus)

The full log, with task, steps, expected vs actual, severity, workaround and suggestion for each
entry, is in the repo: `FRICTION-LOG.md`. Summary of the eleven entries:

| Date | Friction | Severity |
|---|---|---|
| 09-12 | `bee proxy` rejects POSTs with a bare `application/json` | Major |
| 09-12 | Short conversations are silently deleted after processing | Major |
| 09-12 | Voice notes are captured twice, once as ambient speech | Minor |
| 09-12 | `todo-created` isn't on the stream for todos made through the API | Minor |
| 09-12 | Stream uses camelCase where REST uses snake_case | Papercut |
| 09-13 to 09-19 | `bee stream` drops about every 90 minutes and exits | Major |
| 09-15 to 09-19 | `/v1/changes` intermittently returns 500 with an HTML body | Major |
| 09-22 | Pairing a new Bee Pioneer fails after the Bluetooth step | Blocker |
| 09-23 | Developer Mode docs point to the wrong place | Minor |
| 09-23 | `bee` isn't on the PATH after `npm i -g` under nvm | Papercut |
| 09-28 | The nightly transcript doesn't share ids with the live one | Major |

## Feature requests

1. **Speaker labels on the live stream**, with the owner's voice marked. The biggest unlock for
   anything that learns from what the wearer says.
2. **Stable ids** between the realtime and final transcripts, and `conversation_uuid` on REST
   conversations.
3. **A `conversation-discarded` event**, or a short grace period to read a conversation before
   it's deleted.
4. **Auto-reconnect in `bee stream`** with `Last-Event-ID` replay.
5. **Place names** (a business or landmark) on conversation locations, not only street addresses,
   so apps never need to handle a full address.
6. **A webhook option**, so a server doesn't have to keep a CLI process alive.

---

## Before you press submit

- [ ] Video uploaded, public, under 3:00, link pasted
- [ ] Repo flipped to public; MIT shows in the About section
- [ ] Numbers in "Accomplishments" refreshed
- [ ] Team decided (Jay)
- [ ] Track: Bee · Minis: Open Source and AWS Builder
- [ ] Submit by Oct 22 (deadline Oct 23, 12:00pm PDT)
