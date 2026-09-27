# Handoff

OJ, this is everything you need to pick this up. Ten minutes to read, and you can be running the UI five minutes after that without any hardware.

## What this is

Rhubarb listens to your day through the Bee wearable, works out which skills your life is asking you to build, ranks them, teaches them with lessons written around your own conversations, has you practise out loud through the Bee, and then credits you when it hears you use the skill for real. The name is the theatre word for background chatter: "most of your day is rhubarb, some of it is worth learning."

It's our entry for the Bee track of Amazon's [Build, Ship, Shape hackathon](https://amazonappdev2026.devpost.com/). First place is $12,000. We're also entering the Open Source and AWS Builder mini challenges.

## The rules that bind us

- **Deadline is October 23, 12:00pm Pacific. We submit on the 21st or 22nd.** AWS credit requests close October 21.
- The demo video and the code must show **live, real data from a Bee device** doing something useful. Sample data in the video is a disqualifier. That's why preview mode wears a black banner.
- Video under three minutes, public repo with the MIT license visible, a written description, and product feedback on the Bee developer tools.
- Judging is four equal parts: technical implementation, design, potential impact, quality of the idea. On top of that, **friction log entries are worth up to a 10% bonus.** Every time the Bee CLI or API surprises you, write it in `FRICTION-LOG.md` in the format that's there. Only log what actually happened.
- The repo stays private until we submit.

`docs/PLAN.md` has the full plan, schedule, and demo script. `docs/BEE-CAPABILITIES.md` is the research on what Bee already does and what its API allows, so we don't rebuild their features.

## Run it without any hardware

```
npm install
npm run dev -w @rhubarb/dashboard
```

Open http://127.0.0.1:5173/#/preview/board. Preview mode serves hand-written sample content from `packages/dashboard/src/fixtures.ts`, so every screen works with no daemon, no Bee, and no AWS: the ranked board, a full lesson deck, the quiz, the skill page, sparks, the honeycomb. This is where UI work happens. Hot reload is on.

To push real captured speech through the pipeline without a Bee, build first (`npm run build`), then `node packages/daemon/dist/scripts/replay.js docs/spike-stream.log`. That log is a genuine recording of stream events from Jay's device on September 12. Classification and card writing need AWS credentials.

## Run it live

You need a Bee, or an Apple Watch running the Bee app. Then:

1. In the Bee app, Settings, tap **Version** five times. That unlocks Developer Mode.
2. `npm i -g @beeai/cli && bee login`, and approve the pairing on your phone.
3. Your own AWS credentials (`aws configure`) with Bedrock access in `us-east-1` to `anthropic.claude-opus-5` and `anthropic.claude-sonnet-5`. Don't share keys through the repo.
4. Optional: `TAVILY_API_KEY` in your environment gives lessons real web citations and better images. Without it, images come from Wikimedia Commons and answers come from the model's own knowledge.
5. `npm install && npm run build && ./scripts/start.sh`, then open http://127.0.0.1:4242.

Data lives in `~/.rhubarb/rhubarb.db`, logs in `~/.rhubarb/logs/`. `./scripts/stop.sh` stops everything.

## Where things are

```
packages/core/src
  bee.ts         REST client (through bee proxy) and the supervised `bee stream` consumer
  detect.ts      cheap first-pass detection: questions, hedges, struggles, stated intent
  llm.ts         Bedrock client; classify() for structured output, write() for prose, judge()
  voice.ts       loads VOICE.md, lints prose, model judge for slop
  db.ts          SQLite schema and every query
packages/daemon/src
  index.ts       wires it all together: stream, timers, API
  pipeline/      capture, classify, sparks, reflect, lessons, images, practice, field, progress, schedule, sweep, tutor, letter
  api.ts         the HTTP API the dashboard talks to
packages/dashboard/src
  pages/         Today, Board, Skill, Lesson, Sparks, Honeycomb, Onboarding
  components/    Deck (slide renderers), Quiz, Mermaid, Meter
  fixtures.ts    preview-mode sample content
```

## Things we already paid to learn

- `bee proxy` rejects `Content-Type: application/json`. It wants `application/json; charset=utf-8`. `BeeClient` handles it.
- Bedrock rejects both `output_config.format` and `strict` tools, so `classify()` forces a single tool call and validates the result with zod, retrying once.
- Bee deletes short conversations on its servers a few seconds after processing them. If we don't catch utterances live from the stream, they're gone. The nightly `/v1/changes` sweep only recovers long ones.
- `bee stream` dies roughly every ninety minutes. `BeeStreamConsumer` respawns it. `/v1/changes` sometimes returns a 500; we keep the old cursor and try again the next night.
- A voice note shows up twice: once as a journal, then again about twenty seconds later as ordinary overheard speech. `capture.ts` drops the echo.
- Bee's own assistant already answers questions asked directly into a voice note. Our ground is what it can't do: questions and gaps from ordinary conversation, lessons, spoken practice, and field evidence.
- Opus 5 on Bedrock takes over a minute even for one line. Short text (nudges, feedback, tutor replies) goes to Sonnet 5 through `write({ quick: true })`. Opus is for lessons, reflection, and grading.
- Never run the daemon as a background job inside a Claude Code session. The session reaps it under memory pressure. Use `scripts/start.sh`.

## What's done

Live capture, classification, spark cards, the practice loop through the Bee (alarm, spoken answer, grade, feedback alarm), nightly sweep, reflection into ranked skills with briefs, ladders, lesson decks with diagrams and sourced images and a quiz, field evidence judging, level progression, the whole dashboard, preview mode, and start/stop scripts. The capture, spark, and alarm paths have been proven on the real device.

## What's next, in order

Status as of September 20. Items 3, 4 and 6 from the original list are done.

1. **The first real end-to-end run of the main path.** Done on 2026-09-26 against Claude Opus 5 and Sonnet 5, on a scratch copy: Jay's real captured speech plus three stated-intent lines about Japanese. Classification, a spark card, reflection into one skill with a brief, a six-rung ladder, an 11-card deck with a diagram, a 6-question check, four beats, and all nine lesson checks passing, in about two and a half minutes. Not yet done on the wearer's own data: the Bee has recorded nothing since pairing. Still the most important thing. Reflection, accepting a skill, and deck generation are built but have never run on real evidence. It needs a paired Bee (`bee login`) and either an Anthropic API key in `~/.rhubarb/env` or AWS credentials with Bedrock access (a new AWS account may sit at a zero token quota until AWS Support raises it). Wear it for a day, say a few true things about what you want to get better at, hit "Reflect now," accept a skill, and see what comes out. Expect to tune prompts in `reflect.ts` and `lessons.ts`.
2. **Who is speaking.** Bee's live stream carries no speaker label, so every line reaches the models as "someone". The nightly sweep's labels are now kept (they used to be thrown away). Still to do: work out which label is the wearer, using the voice-note echo that `capture.ts` already detects, and mark lines as the wearer's or someone else's. This protects field evidence, which is the pitch. Bee's onboarding includes owner voice training, so check on the first live run whether the API marks the owner's lines.
3. **UI polish**, in preview mode. Done so far: every screen checked at desktop and phone width, an error boundary, the Honeycomb rebuilt in three.js, the tutor's send button, quiz and copy fixes.
4. Connect Google Calendar in the Bee app so upcoming events feed the ranking; get a Tavily key.
5. Smaller backend items: the spark queue is in memory and lost on restart; a voice note is matched to a practice by timing alone; nothing schedules recall practice for due spark cards.
6. The demo video (script is in `docs/PLAN.md`) and the Devpost submission, including the placeholders still in `FEEDBACK.md`.

Also done, after studying a polished AI tutor's dashboard: a guided day-one Today with live step status and a goal box; a Settings page edited in place with nudge preferences the daemon honours (`profile.nudges`) and per-device reading comfort; a Looking back page (`GET /api/history`); "Coming up" on Today (`upcoming`, `nextSlot`); empty states that say what fills them; a floating "New here?" tab.

Also done: Sparks that ask for a guess before showing the answer; an Evidence page with a speech-free research copy; every lesson checked before it is shown, with made-up quotes cut (`docs/HOW-WE-KNOW.md`); a filter that drops private disclosures on arrival (`docs/SAFETY.md`). Not yet run against a real model: the second-reader lesson review and the guess judge.

Also done: a listening light, a privacy page with forget controls, undo for setting a skill aside, a first-run look-around, and the person's name removed from everywhere but settings.

Done since the first handoff: `rhubarb-skill/SKILL.md`; 49 tests (`npm test`); launchd install and uninstall scripts; a hardening pass over the daemon (see the commit "Harden the daemon and fix the learning loop's logic errors" for the list).

## Where it runs now

Since 2026-09-27 the wearer's Rhubarb runs on Railway (project `rhubarb`, service `rhubarb`, a 5GB volume at `/data`, region asia-southeast1) at https://rhubarb-production.up.railway.app, behind the access token. The Bee login, Anthropic key and Tavily key are Railway variables. Deploy with `railway up --service rhubarb --detach` from the repo; watch with `railway logs --service rhubarb --deployment`. Railway injects `PORT` (8080), and the domain must target that port. The Mac copy is uninstalled so the phone gets one set of alarms; run it locally only for development, and never both at once against the same Bee.

## House rules

Everything Rhubarb says to a person, including button labels, follows `VOICE.md`, and generated text is checked against it before anyone sees it. If you write a prompt, put `voiceGuide()` in the system blocks the way the existing ones do. No tokens, `.env` files, or databases in git. Commit small and say what changed.
