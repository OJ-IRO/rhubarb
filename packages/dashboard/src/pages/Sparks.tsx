import { useEffect, useState } from "react";
import { api, when, type Card, type SparkRow } from "../api";
import { Loading } from "../components/Hex";
import { Link } from "../router";

type Row = SparkRow;

/**
 * A spark used to hand over the answer the moment you opened the page. Reading an answer feels
 * like learning and mostly isn't. Guessing first, even wrongly, is what makes the answer stay, so
 * the card asks before it tells. "Just show me" is always there: it's your curiosity, not a test.
 */
function Spark({ row, onChange, onLesson }: { row: Row; onChange: (c: Card) => void; onLesson: (skillId: number) => void }) {
  const { card, item } = row;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function wholeStory() {
    setStarting(true);
    setFailed(false);
    try {
      onLesson((await api.sparkLesson(card.id)).skillId);
    } catch {
      setFailed(true);
    } finally {
      setStarting(false);
    }
  }
  const asked = card.guess !== null;
  const cites = JSON.parse(card.citations) as Array<{ title: string; url: string }>;

  async function submit(text: string) {
    setBusy(true);
    try {
      onChange(await api.guess(card.id, text));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card spark-card">
      <p className="eyebrow">
        {when(item.spokenAt)}
        {item.place ? ` · ${item.place}` : ""}
      </p>
      <h2>{card.title}</h2>
      <p className="said">You said: "{item.sourceText}"</p>

      {!asked ? (
        <div className="guess">
          <label htmlFor={`guess-${card.id}`}>Before you read the answer: what's your guess?</label>
          <textarea
            id={`guess-${card.id}`}
            rows={2}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
                e.preventDefault();
                void submit(draft);
              }
            }}
            placeholder="A rough guess is fine. Wrong is fine too."
          />
          <div className="actions">
            <button className="primary" disabled={busy || !draft.trim()} onClick={() => void submit(draft)}>
              {busy ? "Checking…" : "Check my guess"}
            </button>
            <button className="ghost" disabled={busy} onClick={() => void submit("")}>
              Just show me
            </button>
            <span className="muted small">Guessing first is what makes the answer stick, even when the guess is wrong.</span>
          </div>
        </div>
      ) : (
        <div className="reveal">
          {card.guess && (
            <p className={card.guessClose ? "feedback good" : "feedback"}>
              <span className="muted small">You guessed: "{card.guess}"</span>
              {card.guessNote && (
                <>
                  <br />
                  {card.guessNote}
                </>
              )}
            </p>
          )}
          <p className="answer">{card.answerMd}</p>
          {cites.length > 0 && (
            <p className="muted small">
              {cites.map((c, i) => (
                <span key={c.url}>
                  {i > 0 && " · "}
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.title}
                  </a>
                </span>
              ))}
            </p>
          )}
          <div className="spark-actions">
            {row.lessonSkillId ? (
              <>
                <Link to={`/skills/${row.lessonSkillId}`} className="button">
                  See the full lesson
                </Link>
                <span className="muted small">It takes a few minutes to write. Your Bee buzzes when it's ready.</span>
              </>
            ) : (
              <>
                <button className="ghost" disabled={starting} onClick={() => void wholeStory()}>
                  {starting ? "Starting…" : "Teach me the whole story"}
                </button>
                <span className="muted small">{failed ? "That didn't start. Try again in a moment." : "A paragraph not enough? Rhubarb writes one full lesson on it."}</span>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function Sparks() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    api.sparks().then(setRows);
  }, []);
  if (!rows) return <Loading />;

  return (
    <div>
      <h1 className="title">Sparks</h1>
      <p className="muted lead">Things you wondered out loud. Have a guess, then see the answer. Rhubarb will ask you about them again in a few days.</p>
      {rows.length === 0 && (
        <div className="empty">
          <p>
            <strong>None yet.</strong> The next time you wonder something out loud near your Bee, "I wonder how…" or "why do they…", it shows up here within a few minutes, with a place to guess before you see the answer.
          </p>
        </div>
      )}
      {rows.map((row) => (
        <Spark
          key={row.card.id}
          row={row}
          onChange={(card) => setRows((all) => (all ?? []).map((r) => (r.card.id === card.id ? { ...r, card } : r)))}
          onLesson={(skillId) => setRows((all) => (all ?? []).map((r) => (r.card.id === row.card.id ? { ...r, lessonSkillId: skillId } : r)))}
        />
      ))}
    </div>
  );
}
