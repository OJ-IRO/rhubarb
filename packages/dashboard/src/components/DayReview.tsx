import type { DayReview } from "@rhubarb/core";
import { useEffect, useState } from "react";
import { api, type DayDetail } from "../api";
import { shortDay } from "./DaySelect";

/**
 * Rhubarb's first reading of a day is a guess: the transcript mishears and can't tell voices apart.
 * So nothing is proposed from a day until its reader has marked each finding right or not, said
 * what really happened, and answered the few questions that decide what to learn.
 */
export function ReviewCard({ day, initial, onDone }: { day: string; initial?: DayReview | null; onDone?: () => void }) {
  const [r, setR] = useState<DayReview | null | undefined>(initial);
  const [moments, setMoments] = useState<DayDetail["moments"]>([]);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial === undefined) api.review(day).then(setR).catch(() => setR(null));
    else setR(initial);
    api.day(day).then((d) => setMoments(d.moments)).catch(() => undefined);
  }, [day, initial]);
  // While it's being written, check back.
  useEffect(() => {
    if (r?.status !== "building") return;
    const t = setInterval(() => void api.review(day).then(setR), 4000);
    return () => clearInterval(t);
  }, [r?.status, day]);

  if (r === undefined) return null;
  const short = shortDay(day);
  const label = short === "Today" || short === "Yesterday" ? `${short}'s review` : `Review of ${short}`;

  if (r === null)
    return (
      <section className="card review-card quiet">
        <p className="eyebrow">{label}</p>
        <p className="muted">Rhubarb writes this in the evening: what it thinks happened, for you to confirm before it suggests anything.</p>
        <button
          className="ghost small"
          onClick={async () => {
            await api.buildReview(day);
            setR({ day, status: "building", findings: [], questions: [], createdAt: Date.now(), doneAt: null });
          }}
        >
          Review this day now
        </button>
      </section>
    );

  if (r.status === "building")
    return (
      <section className="card review-card quiet" role="status">
        <p className="eyebrow">{label}</p>
        <p className="muted">Reading back through the day. This takes a minute.</p>
      </section>
    );

  if (r.status === "failed")
    return (
      <section className="card review-card quiet">
        <p className="eyebrow">{label}</p>
        <p className="muted">The review didn't get written: {r.reason}.</p>
        <button
          className="ghost small"
          onClick={async () => {
            await api.buildReview(day);
            setR({ ...r, status: "building" });
          }}
        >
          Try again
        </button>
      </section>
    );

  if (r.status === "done") {
    const right = r.findings.filter((f) => f.verdict === "right").length;
    const wrong = r.findings.filter((f) => f.verdict === "wrong").length;
    return (
      <section className="card review-card quiet">
        <p className="eyebrow">{label}</p>
        <p>
          {result ?? "Reviewed."} {right} confirmed{wrong ? `, ${wrong} corrected` : ""}. Suggestions come only from what you confirmed.
        </p>
      </section>
    );
  }

  const set = (id: number, patch: Partial<DayReview["findings"][number]>) => setR({ ...r, findings: r.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const answer = (id: number, text: string) => setR({ ...r, questions: r.questions.map((q) => (q.id === id ? { ...q, answer: text } : q)) });
  const marked = r.findings.filter((f) => f.verdict).length;

  async function save(done: boolean) {
    setSaving(true);
    setError(null);
    try {
      const out = await api.saveReview(day, {
        findings: r!.findings.map((f) => ({ id: f.id, verdict: f.verdict, correction: f.correction })),
        questions: r!.questions.map((q) => ({ id: q.id, answer: q.answer })),
        done,
      });
      setR(out.review);
      if (done) {
        setResult(out.setAside?.length ? `Set aside: ${out.setAside.join(", ")}.` : "Thanks.");
        onDone?.();
      }
    } catch {
      setError("That didn't save. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card review-card">
      <p className="eyebrow">{label}</p>
      <h2>Is this what happened?</h2>
      <p className="muted">
        Rhubarb's first reading of your day. Bee can mishear and can't tell voices apart, so nothing gets suggested until you've had a look.
      </p>

      <ol className="findings">
        {r.findings.map((f) => {
          const lines = moments.filter((m) => f.momentIds.includes(m.id));
          return (
            <li key={f.id} className={f.verdict ? `finding ${f.verdict}` : "finding"}>
              <p className="claim">{f.claim}</p>
              {f.unsure && <p className="muted small">Not sure: {f.unsure}</p>}
              <div className="verdict" role="group" aria-label="Is this right?">
                <button className={f.verdict === "right" ? "chip on" : "chip"} aria-pressed={f.verdict === "right"} onClick={() => set(f.id, { verdict: f.verdict === "right" ? null : "right" })}>
                  Right
                </button>
                <button className={f.verdict === "wrong" ? "chip on" : "chip"} aria-pressed={f.verdict === "wrong"} onClick={() => set(f.id, { verdict: f.verdict === "wrong" ? null : "wrong" })}>
                  Not quite
                </button>
                {lines.length > 0 && (
                  <button className="ghost small" onClick={() => setShown((s) => new Set(s.has(f.id) ? [...s].filter((x) => x !== f.id) : [...s, f.id]))}>
                    {shown.has(f.id) ? "Hide what Bee heard" : "What Bee heard"}
                  </button>
                )}
              </div>
              {f.verdict === "wrong" && (
                <textarea
                  rows={2}
                  aria-label="What really happened"
                  placeholder="What really happened? Rhubarb will go by this."
                  value={f.correction ?? ""}
                  onChange={(e) => set(f.id, { correction: e.target.value })}
                />
              )}
              {shown.has(f.id) && <HeardLines lines={lines} onFixed={(m) => setMoments((all) => all.map((x) => (x.id === m.id ? m : x)))} />}
            </li>
          );
        })}
      </ol>

      {r.questions.length > 0 && (
        <div className="review-questions">
          <p className="eyebrow">A few questions</p>
          {r.questions.map((q) => (
            <label key={q.id} className="review-q">
              <span>{q.text}</span>
              <input value={q.answer ?? ""} onChange={(e) => answer(q.id, e.target.value)} placeholder="A word or two is plenty" />
            </label>
          ))}
        </div>
      )}

      {error && <p className="feedback">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={saving} onClick={() => void save(true)}>
          {saving ? "Saving…" : marked === r.findings.length ? "Done, suggest what to learn" : `Done (${r.findings.length - marked} left unmarked)`}
        </button>
        <button className="ghost small" disabled={saving} onClick={() => void save(false)}>
          Save for later
        </button>
      </div>
    </section>
  );
}

/** The lines a finding rests on, each fixable where Bee misheard. */
function HeardLines({ lines, onFixed }: { lines: DayDetail["moments"]; onFixed: (m: DayDetail["moments"][number]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  return (
    <ul className="heard">
      {lines.map((m) =>
        editing === m.id ? (
          <li key={m.id}>
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="What was said" />
            <span className="actions compact">
              <button
                className="primary small"
                onClick={async () => {
                  onFixed(await api.editMoment(m.id, { text: draft }));
                  setEditing(null);
                }}
              >
                Save
              </button>
              <button className="ghost small" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </span>
          </li>
        ) : (
          <li key={m.id}>
            <span className="quote">"{m.text}"</span>
            {m.editedAt && <span className="muted small"> · corrected</span>}{" "}
            <button
              className="ghost small"
              onClick={() => {
                setDraft(m.text);
                setEditing(m.id);
              }}
            >
              Fix what was said
            </button>
          </li>
        )
      )}
    </ul>
  );
}
