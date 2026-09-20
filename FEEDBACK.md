# Product Feedback — Bee Developer Platform

Working notes for the mandatory hackathon Product Feedback section. Filled in continuously; finalized at submission.

## Tools / APIs / SDKs used
- `@beeai/cli` 0.7.3 (proxy, stream, login) — <notes>
- Bee developer API (`/v1/*` via proxy) — <notes>
- Bee SSE stream (`new-utterance`, `journal-*`, todo events) — <notes>
- Bee Agent Skill — <notes>
- Amazon Bedrock (Claude) — <notes>

## What worked well
- `bee login` pairing: under a minute, clear instructions, token persisted on macOS (issue #9 did not reproduce on 0.7.3)
- `bee stream --json` as a child process is a genuinely good integration surface: typed events, per-utterance text with `spoken_at`, and the `journal-text` event delivers a full voice-note transcript ~3s after the button is released
- Todo `alarm_at` fires a real push notification with haptics on a locked phone, which makes the Bee a two-way channel with zero extra hardware
- `bee proxy` removes the private-CA problem entirely for local integrations

## What needs improvement
- <fill as discovered>

## Onboarding experience
- <fill: Developer Mode discovery, pairing flow, docs quality>

## Would I build on this again?
- <fill at end>
