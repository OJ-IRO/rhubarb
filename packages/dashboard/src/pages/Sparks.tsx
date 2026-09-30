import { useEffect, useState } from "react";
import { api, when, type Card, type SparkRow } from "../api";
import { Loading } from "../components/Hex";
import { Link } from "../router";

type Row = SparkRow;

/** Enough rows to show the words without scrolling inside the box, on a phone as well. */
function rowsFor(text: string, min: number): number {
  const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 34)), 0);
  return Math.min(14, Math.max(min, lines + 1));
}

/**
 * Bee mishears. A spark answered from a misheard question answers the wrong question, so the
 * words can be fixed here and the answer written again from what was really said.
 */
function FixSaid({ row, onReload }: { row: Row; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.item.sourceText);
  const [context, setContext] = useState(row.context ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rw = row.rewrite ?? null;
  const writing = rw?.state === "writing";
  const unapplied = Boolean(row.editedAt) && (!rw || rw.state === "failed" || (rw.state === "done" && (row.editedAt ?? 0) > rw.at));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.fixSpark(row.card.id, { text, ...(row.context !== undefined && row.context !== null ? { context } : {}) });
      await onReload();
      setEditing(false);
    } catch {
      setError("That didn't save. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  async function again() {
    setError(null);
    try {
      await api.answerSparkAgain(row.card.id);
      await onReload();
    } catch {
      setError("That didn't start. Try again in a moment.");
    }
  }

  if (editing)
    return (
      <div className="moment-edit">
        <label htmlFor={`s-text-${row.card.id}`}>What was said</label>
        <textarea id={`s-text-${row.card.id}`} rows={rowsFor(text, 2)} value={text} onChange={(e) => setText(e.target.value)} />
        {row.context != null && (
          <>
            <label htmlFor={`s-ctx-${row.card.id}`}>The conversation around it</label>
            <textarea id={`s-ctx-${row.card.id}`} rows={rowsFor(context, 4)} value={context} onChange={(e) => setContext(e.target.value)} />
          </>
        )}
        {error && <p className="feedback">{error}</p>}
        <div className="actions compact">
          <button className="primary" disabled={saving || !text.trim()} onClick={() => void save()}>
            {saving ? "Saving…" : "Save the correction"}
          </button>
          <button className="ghost small" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );

  return (
    <div className="fix-said">
      {writing ? (
        <p className="muted small" role="status">Answering it again from your words. This takes a minute.</p>
      ) : unapplied ? (
        <p className="small">
          {rw?.state === "failed" ? `The last try didn't finish: ${rw.reason}. ` : "You corrected what was said. "}
          <button className="primary small" onClick={() => void again()}>
            Answer it again
          </button>
        </p>
      ) : rw?.state === "done" ? (
        <p className="muted small">Answered again from your corrected words.</p>
      ) : null}
      {!writing && (
        <button className="ghost small" onClick={() => setEditing(true)}>
          Fix what was said
        </button>
      )}
      {error && <p className="feedback">{error}</p>}
    </div>
  );
}

/**
 * A spark used to hand over the answer the moment you opened the page. Reading an answer feels
 * like learning and mostly isn't. Guessing first, even wrongly, is what makes the answer stay, so
 * the card asks before it tells. "Just show me" is always there: it's your curiosity, not a test.
 */
function Spark({ row, onChange, onLesson, onReload }: { row: Row; onChange: (c: Card) => void; onLesson: (skillId: number) => void; onReload: () => Promise<void> }) {
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
      <FixSaid row={row} onReload={onReload} />

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
  const reload = async () => setRows(await api.sparks());
  useEffect(() => {
    void reload();
  }, []);
  // While a spark is being answered again, check back until it's done.
  const writing = rows?.some((r) => r.rewrite?.state === "writing") ?? false;
  useEffect(() => {
    if (!writing) return;
    const t = setInterval(() => void reload(), 8_000);
    return () => clearInterval(t);
  }, [writing]);
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
          onReload={reload}
        />
      ))}
    </div>
  );
}
