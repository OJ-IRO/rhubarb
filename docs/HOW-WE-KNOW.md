# How Rhubarb knows whether it's working

An AI tutor can answer every question you have without you learning a thing. Reading a good answer feels like learning. Mostly it isn't. So the question Rhubarb has to answer is not "did you open the lesson" but "can you do something now that you couldn't before, and do you do it when it counts?"

This page is the method: what Rhubarb asks of the learner, what it measures, and what it holds its own lessons to.

**Read this first.** Rhubarb has not been evaluated. There is no study of it, no pilot, no effect size. What follows is the research its design leans on, and the instruments it has built so that an honest evaluation is possible. The numbers on the Evidence page are one person's record, not a finding.

## What the learner is asked to do, and why

| Rhubarb asks you to | Because |
|---|---|
| **Guess before you see an answer** (Sparks) | Trying to retrieve an answer you don't have yet improves how well you later learn it, even when the guess is wrong (Kornell, Hays & Bjork, 2009). |
| **Explain it out loud, in your own words** (teach-back, graded) | Explaining material to yourself builds understanding that reading does not (Chi, de Leeuw, Chiu & LaVancher, 1994). Speaking removes the option of nodding along. |
| **Come back to it days later** (recall on an FSRS schedule) | Retrieval practice beats re-reading for long-term retention (Roediger & Karpicke, 2006), and spacing that practice out beats massing it (Cepeda, Pashler, Vul, Wixted & Rohrer, 2006). |
| **Learn it from your own week** (lessons quote your moments) | Transfer depends on how close the learning context is to the context of use (Barnett & Ceci, 2002). Rhubarb teaches in the context of use, because that is where it found the gap. |
| **Take in one idea at a time** (card decks, checked for length) | Working memory is small, and material that overloads it isn't learned (Sweller, 1988). |

## What it measures

Every measure is something the learner did. None is time spent, streaks, or lessons opened.

1. **Spoken answer scores over time.** Each teach-back is graded 0 to 5 against a rubric written with the lesson. The Evidence page compares your earliest answers with your latest, and says nothing about a trend until there are at least four.
2. **Recall.** Of the things you were asked for again days later, how many you got.
3. **Check scores.** The quiz straight after a lesson. A weak signal on its own, since it measures the last ten minutes, which is why it is not the headline.
4. **Guess accuracy.** Reported, and explicitly not a target. A wrong guess still does its job.
5. **Use in real life.** The one that matters. When a skill you're studying comes up in a later real conversation, a judge decides whether *you* used it, and used it correctly. Hearing it doesn't count. Mentioning it doesn't count. The Evidence page shows how often the skill came up and how often it counted, so the ratio is visible.
6. **Days to real use.** For each skill, the time from the first moment it showed up as a gap to the first time it was used correctly. As far as we know, no other tutoring tool can see this number at all, because no other tool is present when the learning is used.

Known weakness, stated plainly: measure 5 depends on knowing which voice in a conversation is the learner's. Bee's live transcript does not label speakers. Until that is solved (see `HANDOFF.md`), a real-world credit is a strong hint, not a proof, and it is treated that way.

## What every lesson is held to

A lesson is checked before the learner sees it. Seven checks are code and cannot be talked round. Two are a second model reading the first one's work.

| Check | How | If it fails |
|---|---|---|
| **Your own words.** Every quote from your week traces to something Rhubarb actually heard. | Code. Token containment against the moments and their surrounding lines, tolerant of tidied grammar. | The slide is cut. A lesson never puts words in your mouth. |
| It teaches from a moment in your week | Code | Flagged |
| 6 to 14 cards | Code | Flagged |
| No card is a wall of text | Code, word count per card | Flagged |
| Every quiz question has exactly one markable answer | Code | Flagged |
| Further-reading links are real addresses, and alive | Code, plus a live request | Dead links are dropped |
| The diagram can be read at a glance | Code | Flagged |
| **The facts hold up** | A second model, told to be hard to please | Flagged and logged |
| **It teaches this level**, not the one below or above | A second model | Flagged |

On top of these, everything Rhubarb writes is linted against `VOICE.md` and rewritten once if it fails.

The results are stored with the lesson and shown to the learner under "What was checked". The Evidence page reports how many lessons passed every check.

## A copy for research

The Evidence page can save a learning record: counts, scores and dates. It contains no speech, no quotes, no names and no skill titles, and a test asserts that. Nothing is uploaded. It is a file, and sharing it is the learner's decision.

This is deliberate. Naturally occurring evidence of transfer is scarce in learning research precisely because it happens where researchers aren't. Rhubarb can record that it happened without recording what was said.

## References

- Barnett, S. M., & Ceci, S. J. (2002). When and where do we apply what we learn? A taxonomy for far transfer. *Psychological Bulletin, 128*(4), 612–637.
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin, 132*(3), 354–380.
- Chi, M. T. H., de Leeuw, N., Chiu, M.-H., & LaVancher, C. (1994). Eliciting self-explanations improves understanding. *Cognitive Science, 18*(3), 439–477.
- Kornell, N., Hays, M. J., & Bjork, R. A. (2009). Unsuccessful retrieval attempts enhance subsequent learning. *Journal of Experimental Psychology: Learning, Memory, and Cognition, 35*(4), 989–998.
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science, 17*(3), 249–255.
- Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science, 12*(2), 257–285.
