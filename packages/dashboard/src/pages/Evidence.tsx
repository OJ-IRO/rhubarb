import { useEffect, useState } from "react";
import { api, isPreview, type LearningProgress } from "../api";
import { ScoreLine, WeekBars } from "../components/Charts";
import { HexBadge, Loading } from "../components/Hex";
import { Meter } from "../components/Meter";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const one = (n: number) => n.toFixed(1);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** A sentence about the trend, said only when there is enough to say it honestly. */
function trend(scores: number[]): string {
  if (scores.length < 4) return "Too few spoken answers so far to call a trend. It takes four.";
  const half = Math.floor(scores.length / 2);
  const early = avg(scores.slice(0, half));
  const late = avg(scores.slice(-half));
  const n = half === 1 ? "answer" : `${half} answers`;
  if (late - early >= 0.5) return `Your first ${n} averaged ${one(early)} of 5. Your latest ${n} averaged ${one(late)}.`;
  if (early - late >= 0.5) return `Your first ${n} averaged ${one(early)} of 5 and your latest ${one(late)}. Harder levels score lower at first, so this can be a good sign.`;
  return `Holding steady around ${one(avg(scores))} of 5 across ${scores.length} spoken answers.`;
}

export function Evidence() {
  const [p, setP] = useState<LearningProgress | null>(null);
  useEffect(() => {
    api.progress().then(setP);
  }, []);
  if (!p) return <Loading />;

  const nothing = p.teachbacks.length + p.quizzes.length + p.recall.asked + p.guesses.made + p.field.heard === 0;
  const days = p.transfer.map((t) => t.days).sort((a, b) => a - b);

  function saveCopy() {
    // In preview there is no daemon to download from, so the same record is built here.
    const copy = { about: "Rhubarb learning record. Counts, scores and dates only. It contains no speech, no quotes, no names and no skill titles.", schema: 1, exportedAt: new Date().toISOString(), ...p };
    const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rhubarb-learning-record.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="evidence">
      <h1 className="title">Evidence</h1>
      <p className="muted lead">Whether any of this is working, in numbers. Every figure here comes from something you did, not from how long you spent in the app.</p>

      {nothing ? (
        <p className="muted">Nothing to show yet. It fills in as you answer out loud, take a check, and use what you've learned in real conversations.</p>
      ) : (
        <>
          <div className="glance" data-tour="evidence-top">
            <div className="glance-tile">
              <HexBadge n={p.field.credited} tone="honey" size={44} />
              <span>
                <strong>used for real</strong>
                <span className="muted">heard in your own conversations</span>
              </span>
            </div>
            <div className="glance-tile">
              <HexBadge n={p.levels.passed} size={44} />
              <span>
                <strong>{p.levels.passed === 1 ? "level" : "levels"} passed</strong>
                <span className="muted">{p.levels.mastered > 0 ? `${p.levels.mastered} ${p.levels.mastered === 1 ? "skill" : "skills"} finished` : `${p.levels.active} under way`}</span>
              </span>
            </div>
            <div className="glance-tile">
              <HexBadge n={p.teachbacks.length} size={44} />
              <span>
                <strong>explained out loud</strong>
                <span className="muted">graded spoken answers</span>
              </span>
            </div>
          </div>

          <section>
            <p className="eyebrow">Saying it out loud</p>
            <h2>Spoken answers, scored 0 to 5</h2>
            <p className="muted">{trend(p.teachbacks.map((t) => t.score))}</p>
            {p.teachbacks.length > 0 ? (
              <>
                <ScoreLine points={p.teachbacks} label="Scores for spoken answers over time, from oldest to newest" />
                <details className="chart-table">
                  <summary className="muted small">See these as a table</summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.teachbacks.map((t, i) => (
                        <tr key={i}>
                          <td>{new Date(t.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                          <td>{t.score} of 5</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            ) : (
              <p className="muted">No spoken answers yet. They come from the practice step at the end of a lesson.</p>
            )}
          </section>

          <section>
            <p className="eyebrow">Used for real</p>
            <h2>Times Rhubarb heard you use a skill correctly, by week</h2>
            <p className="muted">
              A skill you're learning came up in {p.field.heard} real {p.field.heard === 1 ? "conversation" : "conversations"}. {p.field.credited} {p.field.credited === 1 ? "was" : "were"} judged a correct use. The rest were you hearing it, mentioning it, or not quite there yet.
              {days.length > 0 && ` From first stumbling on a skill to using it for real took ${days.length === 1 ? `${days[0]} days` : `${days[0]} to ${days[days.length - 1]} days`}.`}
            </p>
            {p.field.byWeek.length > 0 ? (
              <>
                <WeekBars weeks={p.field.byWeek} label="Correct real-world uses of a skill, per week" />
                <details className="chart-table">
                  <summary className="muted small">See these as a table</summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Week of</th>
                        <th>Correct uses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.field.byWeek.map((w) => (
                        <tr key={w.weekStart}>
                          <td>{w.weekStart}</td>
                          <td>{w.credited}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            ) : (
              <p className="muted">None yet. This is the slow one, and the one that matters.</p>
            )}
          </section>

          <section>
            <p className="eyebrow">Remembering</p>
            <div className="meters">
              <div>
                <h3>
                  {p.recall.remembered} of {p.recall.asked} recalled
                </h3>
                <Meter value={pct(p.recall.remembered, p.recall.asked)} label={`${pct(p.recall.remembered, p.recall.asked)} percent recalled`} />
                <p className="muted small">Answers you were asked for again days later, and got.</p>
              </div>
              <div>
                <h3>
                  {p.guesses.close} of {p.guesses.made} guesses were close
                </h3>
                <Meter value={pct(p.guesses.close, p.guesses.made)} label={`${pct(p.guesses.close, p.guesses.made)} percent of guesses close`} />
                <p className="muted small">A low number here is fine. Guessing first helps the answer stick whether or not the guess is right.</p>
              </div>
              {p.quizzes.length > 0 && (
                <div>
                  <h3>{Math.round(avg(p.quizzes.map((q) => q.score)) * 100)}% on lesson checks</h3>
                  <Meter value={avg(p.quizzes.map((q) => q.score)) * 100} />
                  <p className="muted small">
                    Across {p.quizzes.length} {p.quizzes.length === 1 ? "check" : "checks"}, taken straight after the lesson.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section>
            <p className="eyebrow">Lessons held to a standard</p>
            <p>
              {p.lessons.reviewed === 0
                ? "No lessons have been checked yet."
                : `${p.lessons.passedEveryCheck} of ${p.lessons.reviewed} lessons passed every check.`}{" "}
              <span className="muted">
                Each lesson is checked before you see it: that every quote from your week is something you really said, that the facts hold up, that it fits your level, and that no card is a wall of text. Open a lesson and choose "What was checked" to see its results.
              </span>
            </p>
          </section>
        </>
      )}

      <section className="research">
        <p className="eyebrow">A copy for research</p>
        <p>
          Learning that shows up in real conversations is hard for researchers to see. If you want to share yours, this saves a record with counts, scores and dates. It has no speech, no quotes, no names and no skill titles. Nothing is sent anywhere: it's a file, and what you do with it is up to you.
        </p>
        {isPreview() ? (
          <button onClick={saveCopy}>Save a research copy</button>
        ) : (
          <a className="button" href="/api/progress/research-copy" download>
            Save a research copy
          </a>
        )}
      </section>
    </div>
  );
}
