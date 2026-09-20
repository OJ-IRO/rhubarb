---
name: rhubarb
description: Read what the user is learning in Rhubarb, a tutor that listens through their Bee wearable. Use when the user asks what they're learning, what's due today, how a skill is going, what they've wondered about lately, or when you want to fit your help to a skill they're already building. Reads a local API on 127.0.0.1:4242. Needs the Rhubarb daemon running on this machine.
---

# Rhubarb

Rhubarb listens to the user's day through a Bee wearable, works out which skills their life is asking them to build, teaches those skills, and credits them when it hears a skill used for real. This skill lets you read that learning state, so you can answer questions about it and pitch your own help at the right level.

Everything lives on the user's machine. The daemon serves a small HTTP API at `http://127.0.0.1:4242`. There is no key. It answers only requests addressed to this machine.

## Check it's running

```bash
curl -s -m 3 http://127.0.0.1:4242/api/status
```

You get `{ profile, skills, evidence, openPractice }`. If the call fails, the daemon isn't running. Tell the user to run `./scripts/start.sh` from their Rhubarb folder, and stop there. Don't start it yourself: it needs their Bee login and their AWS credentials.

## What to read

| The user wants to know | Call | What matters in the reply |
|---|---|---|
| What's on for today | `GET /api/today` | `letter` is a short note already written to them. `lesson` is today's lesson with its skill. `duePractice` and `dueCards` are waiting on them. `proposed` counts skills that need a yes or no. |
| What they're learning, in order | `GET /api/skills` | One row per skill, highest `priority` first. `status` is `proposed`, `active` or `mastered`. `level` counts from 0, so show `level + 1` of `ladderLength`. `brief` says why this skill, and why now, in their own moments. |
| How one skill is going | `GET /api/skills/<id>` | `ladder` has each level's `title` and `outcome`. `practice` has graded spoken answers with feedback. `fieldEvidence` rows with `credited: true` are times Rhubarb heard them use the skill correctly in a real conversation. |
| What they've wondered about | `GET /api/sparks` | Short answer cards for passing questions, each with the words they actually said. |
| What's waiting for an answer | `GET /api/practice` | Open spoken-practice prompts. They answer these out loud into the Bee, not by typing to you. |

```bash
curl -s http://127.0.0.1:4242/api/skills | jq '.[] | {id, name, status, level, ladderLength, priority}'
```

## How to use what you read

**Meet them at their level.** If they ask you about something they're studying, check the ladder first. Someone on "can follow the conversation" needs the plain version. Someone on "can teach it" wants the edge cases. The level's `outcome` tells you what they can already do.

**Use their moments.** The `brief` and the evidence quote real things they said. "You asked Maya about this on Tuesday" lands better than a generic example. Quote only what the API gave you, and never invent a moment.

**Let Rhubarb do the grading.** You can explain, quiz informally and answer follow-ups. Levels move only through Rhubarb's own spoken practice and field evidence, so never tell them they've passed a level.

**Match the voice.** Rhubarb writes plainly and warmly, in the second person, with short paragraphs and no cheerleading. If you relay its `letter`, `brief` or feedback, relay it as written.

## Privacy

This is a record of what someone said out loud, including things said near other people. Treat it that way.

- Read only what the question needs. "What's due today" does not need `/api/skills/<id>`, which carries transcript excerpts.
- Don't call `/api/evidence` unless the user asks to see the raw moments. It returns verbatim speech.
- Never send what you read to another service, put it in a search query, or write it to a file the user didn't ask for.
- The profile has `offLimits` topics. If a topic is listed there, don't raise it, even if it appears in older data.
- Other people in the transcripts are labelled `speaker_2` and the like. Don't guess who they are.

## Changing things

Three calls change state. Each one needs the user to have asked for it in this conversation.

| Action | Call | Note |
|---|---|---|
| Re-rank skills from recent evidence | `POST /api/reflect` | Runs a large model on their AWS bill and takes a minute or more. |
| Take on a proposed skill | `POST /api/skills/<id>/accept` | Writes a ladder and a first lesson. Also billed. |
| Turn a proposed skill down | `POST /api/skills/<id>/dismiss` | |

Say what the call will do and what it costs before you make it. Don't accept or dismiss on a guess about what they'd want: deciding what to learn is the user's call, and it is the part of Rhubarb they do themselves.
