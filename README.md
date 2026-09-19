# 🐝 Rhubarb

**Most of your day is rhubarb. Some of it is worth learning.**

In British theatre and radio, "rhubarb, rhubarb" is what background actors mutter to simulate the hum of conversation. It's the word for ambient chatter, and ambient chatter is what this runs on. Rhubarb listens to your day through the [Bee](https://bee.computer) wearable, works out which skills your life is actually asking you to build, ranks them, and teaches them to you until you're good at them. Then it listens for you using them.

Built for the Bee track of the [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/).

## What it does

1. **Listens.** Questions you ask out loud, facts you hedge on, things you say you want to get better at, jargon you're around but never use, and what's coming up on your calendar all become evidence, each with when, where, and who.
2. **Reflects.** Every night (or when you ask) it clusters that evidence into skills and ranks them, with a short note for each explaining why this, and why now, in terms of what you actually said.
3. **Teaches.** Accept a skill and it builds a ladder from "can follow the conversation" to "can teach it," then writes each lesson as a deck of cards in the way you like to be taught: your own moments as the examples, a diagram, sourced images, further reading, and a check on whether it landed.
4. **Practices through the pendant.** A prompt arrives as an alarm on your phone. You hold the Bee's button and explain the idea out loud. Your explanation is graded and the feedback comes back the same way.
5. **Hears you get better.** When a later conversation shows you using the skill correctly, that counts toward your level. Competence is measured in your life, not in the app.

Passing curiosity ("I wonder how bees make honey") takes a lighter path: a one-paragraph answer card, and a recall prompt a few days later.

Everything Rhubarb writes follows [`VOICE.md`](VOICE.md) and is checked against it before you see it.

## Architecture

```
packages/core      — types, SQLite store, Bee client + stream consumer, detectors, FSRS scheduling, Bedrock LLM layer, voice lint
packages/daemon    — capture → classify → reflect → lessons → practice → field evidence; HTTP API; serves the dashboard
packages/dashboard — local web app (Vite + React): Today, Board, Skill, Lesson decks + quiz + tutor, Sparks, Honeycomb, preview mode
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

**No Bee?** The design preview runs on sample content with no hardware and no daemon: `npm run dev -w @rhubarb/dashboard`, then http://127.0.0.1:5173/#/preview/board. See [`HANDOFF.md`](HANDOFF.md) for the full tour.

## License

[MIT](LICENSE)
