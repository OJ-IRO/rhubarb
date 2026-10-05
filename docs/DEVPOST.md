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
| Mini challenges | Open Source. (AWS Builder only if the app runs on Amazon Bedrock by submission day; today it calls Claude through Anthropic's API.) |
| Video | **[YOU]** YouTube link, public, under 3:00 |
| Try it out | https://github.com/OJ-IRO/rhubarb (public on submission day) · https://rhubarb-demo.vercel.app (a guided demo with sample content; the real app holds private conversations, so it isn't public) |
| Built with | bee, bee-cli, typescript, node.js, react, vite, sqlite, claude, three.js, mermaid, tavily, railway, vercel |
| Team | **[YOU]** OJ, plus Jay if he agrees (he started the project on 2026-09-11) |

---

## About the project

### Inspiration

I'm learning Japanese while living in Osaka. Every day I have exactly the conversations I'm
trying to learn from: a clerk at a tax-free counter, a delivery driver asking where my building
is, a station announcement I half catch. By dinner they're gone. Classes teach from a textbook's
week, not mine, and nothing ever checks whether what I learned shows up when I actually talk.

The Bee hears all of it. So the question became: what if the tutor started from my real day,
and measured progress by whether I use the thing for real?

### What it does

Rhubarb is a tutor that listens through the Bee.

1. **It listens.** It reads the Bee's live transcript as it happens. It keeps text, never audio,
   and drops private moments (health, passwords read aloud, someone in crisis) the instant they
   arrive, before any AI sees them.
2. **It notices** the moments worth learning from: a question I asked, a line I didn't follow,
   Japanese I heard or said, something I got wrong. Saying "Hey Rhubarb, teach me…" starts a
   lesson straight away.
3. **It checks with me first.** Every evening it writes up what it thinks happened, as claims I
   mark Right or Not quite, and asks a couple of questions. Speech recognition mishears and can't
   tell voices apart, so nothing is suggested until I've confirmed what really happened.
4. **It suggests and teaches.** From what I confirmed, it suggests what to learn. When I say yes,
   and how much I already know, it writes a short lesson built around my own words, like the
   exact sentence the tax-free clerk said to me. A second AI checks every lesson for factual
   mistakes before I see it, and anything it isn't sure of is shown to me, not hidden.
5. **Practice comes through the Bee.** An alarm arrives on my phone; I answer out loud into the
   Bee; it tells me what I got and what to add.
6. **It hears me get better.** Later conversations are checked for the skill being used for
   real. Asking a shop 「免税できますか」 on my own, days after the lesson, counts as progress.
   Not a streak, not time in the app: real use.

Also: quick answers to passing curiosities ("why does the Tempozan Ferris wheel change colour?",
guess first, then the answer), where each moment happened (a landmark or neighbourhood only,
never an address, nothing near home), reading help per plan (romaji and English for a beginner,
none for someone fluent), a day-by-day look back, and the power to forget a moment, a day, or
everything.

### How we built it

- **Bee at the core.** `bee login` and `bee proxy` for the API, and `bee stream --json` as a
  supervised child process for the live transcript, voice notes and todo events. Short
  conversations are deleted on Bee's side minutes after they end, so live capture is the only
  way to keep them; a nightly pass over `/v1/changes` recovers anything the stream missed.
- **Bee as the two-way channel.** Practice prompts, "your lesson is ready" and "heard you use it"
  arrive as Bee todos with alarms, which buzz a locked phone. Practice answers come back as Bee
  voice notes. Conversation locations and place clusters give each moment its place, and the
  calendar brief raises the priority of skills with something coming up.
- **The pipeline.** A cheap first pass flags candidate moments; Claude sorts them; an evening
  review is written for the learner to confirm; proposals and lessons are made only from what
  they confirmed. Lessons are card decks with a diagram, a real photo and sources, written with
  web research (Tavily), then read by a second model for factual errors and checked by code
  for invented quotes, length and broken links.
- **Stack.** TypeScript on Node, SQLite, a React dashboard, a three.js honeycomb for progress.
  It runs on a small private server (Railway) so it never sleeps; the judges' demo is a static
  site (Vercel). 68 automated tests.
- **Cost under control.** Every Claude call is metered by purpose with a daily cap; a full
  lesson costs about $0.67.
- **An Agent Skill** (`rhubarb-skill/SKILL.md`) lets Claude read what you're learning, so other
  assistants can pitch their help at your level.

### Challenges we ran into

- **Bee silently deletes short conversations,** which are exactly the useful ones (a counter
  exchange is twenty seconds long). Live capture had to be the backbone, with a supervisor that
  restarts the stream, which drops about every ninety minutes.
- **The nightly transcript has different ids from the live one,** so recovering missed lines
  double-counted everything until we matched lines by time and text.
- **No speaker labels.** Every line arrives as "Unknown". A friend's question could become my
  lesson. The evening review, where the learner confirms what happened, is the answer we built.
- **Mishearing.** Bee heard "Osaka" as "Old Southfield", and a lesson came out about the wrong
  Ferris wheel. Now any moment can be corrected and the lesson rewritten from the fixed words.
- **Runaway cost.** An early version could spend about $5 on one lesson, rewriting it from
  scratch whenever the fact-checker disagreed over a detail. Metering every call, capping each
  day, and correcting disputed facts in place cut a lesson to about $0.67.
- **Pairing.** A new Bee failed to pair for two days with a generic error.

### Accomplishments we're proud of

- It works on real life. In four days the Bee heard 3,043 lines; Rhubarb noticed 148 moments,
  proposed 9 plans and wrote 5 fact-checked lessons, in Japanese and English, from Osaka to
  Hakata.
- Bee transcribes Japanese well enough to learn from: station announcements, clerks, my own lines.
- The learner stays in charge: nothing is proposed from a day until they've looked it over, and
  anything can be corrected or forgotten.

### What we learned

A first reading of someone's day is a guess. The product got much better the moment it started
asking before assuming. And measuring learning by real use, not by quiz scores, changes what you
build.

### What's next for Rhubarb

- Telling the wearer's voice from everyone else's.
- A phone-only mode, so it works without the wearable.
- Taking it to adult English learners in community colleges and workforce programs: the same
  loop, with real-world use as the measure of progress.

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
come back "Unknown" on every line; `/v1/changes` sometimes returns a 500 with an HTML body; the
proxy rejects a bare `application/json` content type; and stream events use camelCase where REST
uses snake_case.

**Bee device and app.** Japanese transcription was better than expected. Pairing a new Bee failed
for two days with an error that didn't say whether the fault was Bluetooth, the phone or the
account. The docs send you to "the Version row in Settings" for Developer Mode; it's under About.

**Claude (Anthropic API; Amazon Bedrock tried first).** Claude Opus writes the lessons and
reviews, Sonnet sorts moments. Structured output through a single tool call was reliable. On
Bedrock, a brand-new AWS account was refused the newest models and sat at a zero-token daily
quota, so we moved to Anthropic's API to keep building; the code switches back with one
environment variable.

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
- [ ] Track: Bee · Mini: Open Source (and AWS Builder only if on Bedrock)
- [ ] Submit by Oct 22 (deadline Oct 23, 12:00pm PDT)
