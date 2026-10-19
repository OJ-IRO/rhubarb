# Product Feedback: Bee Developer Platform

Product feedback for the Amazon "Build, Ship, Shape" hackathon, Bee track. The detailed friction
log, entry by entry, is in [FRICTION-LOG.md](FRICTION-LOG.md).

## Tools, APIs and SDKs used

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
aren't on the live stream, and REST lines read "Unknown" until voice recognition is set up, which the docs don't mention; `/v1/changes` sometimes returns a 500 with an HTML body; the
proxy rejects a bare `application/json` content type; and stream events use camelCase where REST
uses snake_case.

**Bee device and app.** Japanese transcription was better than expected. Pairing a new Bee failed
for two days with an error that didn't say whether the fault was Bluetooth, the phone or the
account. The docs send you to "the Version row in Settings" for Developer Mode; it's under About.

**Claude (Anthropic API; Amazon Bedrock tried first).** Claude Opus writes the lessons and
reviews, Sonnet sorts moments. Structured output through a single tool call was reliable. On
Bedrock, a brand-new AWS account was refused every model until an AWS Support case enabled Claude
Opus 4.6 and Sonnet 4.6 a day later (Opus 5 and Sonnet 5 still refused). Rhubarb now runs on Bedrock
first and falls back to Anthropic's API automatically.

**Tavily.** Search results good enough to cite in lessons; image search filled in the gaps
Wikimedia couldn't.

**Railway and Vercel.** Railway kept the listener running around the clock for about $5 a month;
its domain defaulted to the wrong port the first time. Vercel hosts the judges' demo.

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
