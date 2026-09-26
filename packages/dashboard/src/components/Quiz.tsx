import { useState } from "react";
import type { Quiz } from "@rhubarb/core";
import type { QuizResult } from "../api";

export function QuizView({ quiz, onSubmit, onRetry, result }: { quiz: Quiz; onSubmit: (answers: Array<number | string | null>) => Promise<void>; onRetry?: (idx: number, text: string) => Promise<void>; result: QuizResult | null }) {
  const [answers, setAnswers] = useState<Array<number | string | null>>(quiz.questions.map(() => null));
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  // one more go per written answer, after the feedback
  const [retried, setRetried] = useState<Set<number>>(new Set());
  const [retrying, setRetrying] = useState<number | null>(null);

  const allAnswered = answers.every((a) => a !== null && a !== "");

  return (
    <section className="quiz">
      <p className="eyebrow">Check your understanding</p>
      <h2>{quiz.questions.length} questions, no timer.</h2>

      {quiz.questions.map((q, i) => {
        const a = answers[i];
        const shown = revealed.has(i);
        const per = result?.perQuestion[i];
        return (
          <div key={i} className={`q ${per ? (per.correct ? "right" : per.close ? "nearly" : "wrong") : ""}`}>
            <p className="q-num">{i + 1}</p>
            <p className="q-prompt">{q.prompt}</p>
            {q.kind === "mcq" ? (
              <>
                <div className="choices">
                  {q.choices.map((c, j) => {
                    const chosen = a === j;
                    const isAnswer = shown && j === q.answer;
                    return (
                      <button
                        key={j}
                        className={`choice ${chosen ? "on" : ""} ${isAnswer ? "answer" : ""} ${shown && chosen && !isAnswer ? "miss" : ""}`}
                        disabled={shown || Boolean(result)}
                        onClick={() => {
                          setAnswers((arr) => arr.map((v, k) => (k === i ? j : v)));
                          setRevealed((s) => new Set(s).add(i));
                        }}
                      >
                        <span className="choice-letter">{String.fromCharCode(65 + j)}</span>
                        {c}
                      </button>
                    );
                  })}
                </div>
                {shown && <p className={a === q.answer ? "feedback good" : "feedback"}>{q.explanation}</p>}
              </>
            ) : (
              <>
                <textarea
                  rows={3}
                  value={typeof a === "string" ? a : ""}
                  disabled={Boolean(result) && (per?.correct || retried.has(i) || !onRetry)}
                  onChange={(e) => setAnswers((arr) => arr.map((v, k) => (k === i ? e.target.value : v)))}
                  placeholder="A sentence or two in your own words. There's no wrong wording, only a missing idea."
                />
                {per?.note && <p className={per.correct ? "feedback good" : "feedback"}>{per.note.replace(/[*_`]/g, "")}</p>}
                {per && !per.correct && onRetry && !retried.has(i) && (
                  <div className="actions compact retry">
                    <button
                      className="small"
                      disabled={retrying !== null || typeof a !== "string" || !a.trim()}
                      onClick={async () => {
                        setRetrying(i);
                        try {
                          await onRetry(i, String(a));
                          setRetried((s) => new Set(s).add(i));
                        } finally {
                          setRetrying(null);
                        }
                      }}
                    >
                      {retrying === i ? "Reading it…" : "Try once more"}
                    </button>
                    <span className="muted small">Add the missing piece above. The better of your two goes on the record.</span>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {result ? (
        <div className="scorecard">
          <p className="score">
            {Number.isInteger(result.score) ? result.score : result.score.toFixed(1)} of {result.total}
          </p>
          <p>{result.note}</p>
        </div>
      ) : (
        <div className="actions end">
          <button
            className="primary"
            disabled={!allAnswered || busy}
            onClick={async () => {
              setBusy(true);
              await onSubmit(answers);
              setBusy(false);
            }}
          >
            {busy ? "Reading your answers…" : "See how I did"}
          </button>
        </div>
      )}
    </section>
  );
}
