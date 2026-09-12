import { useState } from "react";
import type { Quiz } from "@waggle/core";
import type { QuizResult } from "../api";

export function QuizView({ quiz, onSubmit, result }: { quiz: Quiz; onSubmit: (answers: Array<number | string | null>) => Promise<void>; result: QuizResult | null }) {
  const [answers, setAnswers] = useState<Array<number | string | null>>(quiz.questions.map(() => null));
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

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
          <div key={i} className={`q ${per ? (per.correct ? "right" : "wrong") : ""}`}>
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
                        <span className="letter">{String.fromCharCode(65 + j)}</span>
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
                  disabled={Boolean(result)}
                  onChange={(e) => setAnswers((arr) => arr.map((v, k) => (k === i ? e.target.value : v)))}
                  placeholder="A couple of sentences in your own words."
                />
                {per?.note && <p className="feedback">{per.note}</p>}
              </>
            )}
          </div>
        );
      })}

      {result ? (
        <div className="scorecard">
          <p className="score">
            {result.score} of {result.total}
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
