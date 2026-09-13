# 🐝 Waggle

**The first screenless tutor.** You ask dozens of questions a day and answer almost none of them. Waggle turns your life into a curriculum.

Named for the [waggle dance](https://en.wikipedia.org/wiki/Waggle_dance) — how bees teach each other.

Built for the Bee track of the [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/).

## What it does

Waggle listens to your day through the [Bee](https://bee.computer) wearable's real-time developer API and closes a full learning loop through the device itself:

1. **Curiosity capture** — questions and wonderings you voice out loud are caught live from the Bee's utterance stream (with a durable retrospective sweep as backstop)
2. **Knowledge-gap detection** — Waggle also notices what you *almost* know: hedges and misstatements ("I think it's like 70%…?")
3. **Research** — an agent (Claude on Amazon Bedrock) researches each one and writes an answer card with citations
4. **Spaced repetition** — the FSRS algorithm schedules reviews of concepts from *your own life*
5. **Teach-back through the pendant** — a quiz arrives as a Bee todo alarm → you answer *out loud* as a voice note → Waggle grades your explanation Feynman-style → your mastery honeycomb fills in

Every concept carries **provenance**: when you learned it, where you were, and who explained it to you.

## Architecture

```
packages/core      — shared types, SQLite store, FSRS scheduling, Bee client
packages/daemon    — capture pipeline: SSE stream + changes sweeper → detectors → research agent → quiz writer → voice-note grader
packages/dashboard — local web app: learning feed, honeycomb mastery map, provenance
waggle-skill/      — agent skill exposing your learning state to any AI agent
```

Bee access runs through the official [`@beeai/cli`](https://github.com/bee-computer/bee-cli) (`bee proxy` + SSE stream). All Bee data stays on your machine in SQLite; only research queries leave it.

## Setup

1. Bee app → Settings → tap **Version** 5× to enable Developer Mode
2. `npm i -g @beeai/cli && bee login` (approve the pairing in the Bee app)
3. AWS credentials with Bedrock access to Claude in `us-east-1` (`aws configure`); optional `TAVILY_API_KEY` for web-sourced citations and images
4. `npm install && npm run build`
5. `./scripts/start.sh` — starts the Bee proxy and the Waggle daemon detached; logs in `~/.waggle/logs/`
6. Open http://127.0.0.1:4242 and answer the six onboarding questions

`./scripts/stop.sh` stops both. Design preview with sample content (no Bee needed): http://127.0.0.1:4242/#/preview/board

## License

[MIT](LICENSE)
