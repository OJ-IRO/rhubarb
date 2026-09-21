# 🐝 Rhubarb

**Most of your day is rhubarb. Some of it is worth learning.**

In British theatre and radio, "rhubarb, rhubarb" is what background actors mutter to simulate the hum of conversation. It's the word for ambient chatter, and ambient chatter is what this runs on. Rhubarb listens to your day through the [Bee](https://bee.computer) wearable, works out which skills your life is actually asking you to build, ranks them, and teaches them to you until you're good at them. Then it listens for you using them.

Built for the Bee track of the [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/).

## Why it's different

Every AI tutor waits for you to sit down and ask it something. That leaves out the hard part, which is knowing what to ask. It also has no way to find out whether anything it taught you ever got used.

Rhubarb starts at the other end. It finds what you need from the day you actually had, and it keeps listening afterwards, so it can tell the difference between a lesson you finished and a skill you use. That second part is the measure no other tutor can see, because no other tutor is there when it happens.

It also doesn't hand you answers. It asks for your guess first, makes you explain things out loud, and asks again days later. How that is grounded, what gets measured, and what every lesson is checked against is in [`docs/HOW-WE-KNOW.md`](docs/HOW-WE-KNOW.md). What it refuses to learn from is in [`docs/SAFETY.md`](docs/SAFETY.md).

## What it does

1. **Listens.** Questions you ask out loud, facts you hedge on, things you say you want to get better at, jargon you're around but never use, and what's coming up on your calendar all become evidence, each with when, where, and who.
2. **Reflects.** Every night (or when you ask) it clusters that evidence into skills and ranks them, with a short note for each explaining why this, and why now, in terms of what you actually said.
3. **Teaches.** Accept a skill and it builds a ladder from "can follow the conversation" to "can teach it," then writes each lesson as a deck of cards in the way you like to be taught: your own moments as the examples, a diagram, sourced images, further reading, and a check on whether it landed.
4. **Practices through the Bee.** A prompt arrives as an alarm on your phone. You hold the Bee's button and explain the idea out loud. Your explanation is graded and the feedback comes back the same way.
5. **Hears you get better.** When a later conversation shows you using the skill correctly, that counts toward your level. Competence is measured in your life, not in the app.

Passing curiosity ("I wonder how bees make honey") takes a lighter path: an answer card that asks for your guess before it shows you anything, and a recall prompt a few days later.

Everything Rhubarb writes follows [`VOICE.md`](VOICE.md) and is checked against it before you see it.

## Yours to see, and to forget

A product that listens has to earn it, so three things are always on screen or one click away.

- **A listening light.** The sidebar says whether Rhubarb can hear your Bee right now, when it last heard you, and says so plainly when it can't.
- **A privacy page.** It shows what is held on your machine and what leaves it, and lets you forget a moment, a day, or everything. Forgotten lines stay forgotten, even when the nightly sweep finds them on Bee's servers again.
- **A guard on web searches.** Searches are the one place your speech could reach a third party, because a model writes the query with your words in front of it. Any query that repeats five words in a row of what you said is refused in code, not by instruction.

Your name is shown on the settings page and nowhere else, and it is never sent to a model.

## Architecture

```
packages/core      — types, SQLite store, Bee client + stream consumer, detectors, FSRS scheduling, Bedrock LLM layer, voice lint
packages/daemon    — capture → classify → reflect → lessons → practice → field evidence; HTTP API; serves the dashboard
packages/dashboard — local web app (Vite + React): Today, Board, Skill, Lesson decks + quiz + tutor, Sparks, a three.js Honeycomb, Evidence, Privacy and safety, preview mode
rhubarb-skill/      — an Agent Skill that reads your learning state from the local API
docs/              — Bee capability research, the plan, hardware spike results, a real captured event log for replay
```

Bee access runs through the official [`@beeai/cli`](https://github.com/bee-computer/bee-cli) (`bee proxy` for REST, `bee stream` for live events). Models run on Amazon Bedrock. All Bee data stays on your machine in SQLite; only research queries and model calls leave it.

## Setup

1. Bee app → Settings → tap **Version** 5× to enable Developer Mode
2. `npm i -g @beeai/cli && bee login` (approve the pairing in the Bee app)
3. AWS credentials with Bedrock access to Claude in `us-east-1` (`aws configure`); optional `TAVILY_API_KEY` for web-sourced citations and images
4. `npm install && npm run build`
5. `./scripts/start.sh` starts the Bee proxy and the Rhubarb daemon detached; logs in `~/.rhubarb/logs/`
6. Open http://127.0.0.1:4242 and answer the six onboarding questions

`./scripts/stop.sh` stops both.

To keep Rhubarb running across reboots on macOS, use `./scripts/install-launchd.sh` instead of `start.sh` (`--dry-run` shows what it would install; `./scripts/uninstall-launchd.sh` removes it). Keys such as `TAVILY_API_KEY` go in `~/.rhubarb/env`, never in the repo.

## Tests

`npm test` runs 47 tests with no Bee, no AWS and no network: the first-pass detector, echo and term matching, the writing-style lint, storage, level progression, practice answer matching, quiet hours, forgetting, the web-search guard, the private-speech filter, the made-up-quote check, learning progress, and the API's handling of hostile requests.

## For agents

[`rhubarb-skill/SKILL.md`](rhubarb-skill/SKILL.md) is an Agent Skill. It lets any agent read what you're learning, what's due and how a skill is going from the local API, so it can pitch its help at your level. It reads only what a question needs, and it changes nothing without being asked.

**No Bee?** The design preview runs on sample content with no hardware and no daemon: `npm run dev -w @rhubarb/dashboard`, then http://127.0.0.1:5173/#/preview/board. See [`HANDOFF.md`](HANDOFF.md) for the full tour.

## License

[MIT](LICENSE)
