# Safety

A wearable microphone hears the worst moments of a day along with the best. This is what Rhubarb does about that.

## It never has anyone's voice

Rhubarb receives text from Bee, never audio. There is no recording here to store, leak or replay: not of the wearer, and not of the people around them.

## Private moments are dropped on arrival

Some lines are never turned into anything, whatever the settings say (`packages/core/src/sensitive.ts`):

- someone in crisis or talking about harming themselves
- first-person health disclosures: a diagnosis, therapy, medication
- passwords, PINs, card and account numbers read aloud
- the wearer's own legal trouble
- intimate and family matters

The test is whether the line is a **personal disclosure**, not whether it touches a topic. "How do antidepressants work" is curiosity, and gets an answer. "My doctor put me on antidepressants" is private, and is dropped.

When a line is dropped: the stored words are blanked, no evidence is written, no model is sent the line, it is left out of the context sent with neighbouring moments, and the log records the category and never the words. All of that is covered by tests.

This filter is a floor. On top of it sit the off-limits topics the wearer sets, and the classifier's own instruction to treat such moments as noise.

## It won't put words in your mouth

Lessons quote the learner's own week. A quote that can't be traced to something actually heard is cut before the lesson is shown. See `docs/HOW-WE-KNOW.md`.

## Nothing of yours goes to a search engine

Web search is the one path by which speech could reach a third party, because a model writes the query with the wearer's words in front of it. A query that is long, or repeats any five words in a row of what the model was shown, is refused in code.

## What it isn't

Rhubarb teaches skills. It is not a therapist, a doctor, a lawyer or an emergency service, and it does not respond to a crisis it overhears: it has no way to do that well, and pretending otherwise would be worse than silence. The app says so, and points to local emergency services.

## Other people

Bee records whoever is near the wearer. Rhubarb indexes Bee's text, labels other speakers only as Bee does (anonymously), never tries to work out who they are, and will forget any moment, day, or everything on request, permanently. Recording laws vary by place, and consent from the people around you is the wearer's responsibility. Rhubarb is built for adults, and is not designed for use around children or in classrooms.

## Alarms

Rhubarb's nudges buzz a locked phone. Anything it starts on its own overnight, such as the nightly brief or a real-world credit found by the 3am sweep, waits until 8:30 in the morning. Lesson nudges land in the learning windows the wearer chose, and feedback on a spoken answer comes straight back, since they are plainly awake. No nudge contains the wearer's name, because no model is ever given it.
