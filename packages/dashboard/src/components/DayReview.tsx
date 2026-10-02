import type { DayReview } from "@rhubarb/core";
import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
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

  const checks = r.findings.length + r.questions.length;
  return (
    <>
      <section className="card review-banner">
        <div>
          <p className="eyebrow">{label}</p>
          <p className="review-banner-line">
            <strong>
              {checks} quick {checks === 1 ? "check" : "checks"}
            </strong>{" "}
            <span className="muted">before Rhubarb suggests anything new.</span>
          </p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          Look it over
        </button>
      </section>
      {error && <p className="feedback">{error}</p>}
      {open && (
        <ReviewDialog
          review={r}
          moments={moments}
          onMoment={(m) => setMoments((all) => all.map((x) => (x.id === m.id ? m : x)))}
          onClose={async (next, done) => {
            setOpen(false);
            setR(next);
            await save(next, done);
          }}
        />
      )}
    </>
  );

  async function save(next: DayReview, done: boolean) {
    setError(null);
    try {
      const out = await api.saveReview(day, {
        findings: next.findings.map((f) => ({ id: f.id, verdict: f.verdict, correction: f.correction })),
        questions: next.questions.map((q) => ({ id: q.id, answer: q.answer })),
        done,
      });
      setR(out.review);
      if (done) {
        setResult(out.setAside?.length ? `Set aside: ${out.setAside.join(", ")}.` : "Thanks.");
        onDone?.();
      }
    } catch {
      setError("That didn't save. Try again in a moment.");
    }
  }
}

/**
 * The review, one thing at a time: each finding gets its own step (Right moves straight on; Not
 * quite asks what really happened), then the questions, then a summary. Closing keeps the answers.
 */
function ReviewDialog({ review, moments, onMoment, onClose }: { review: DayReview; moments: DayDetail["moments"]; onMoment: (m: DayDetail["moments"][number]) => void; onClose: (r: DayReview, done: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [r, setR] = useState(review);
  const firstOpen = r.findings.findIndex((f) => !f.verdict);
  const [step, setStep] = useState(firstOpen < 0 ? r.findings.length : firstOpen);
  const [heard, setHeard] = useState(false);
  const total = r.findings.length + (r.questions.length ? 1 : 0) + 1;
  const onQuestions = step === r.findings.length && r.questions.length > 0;
  const onSummary = step >= r.findings.length + (r.questions.length ? 1 : 0);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  useEffect(() => setHeard(false), [step]);

  const setF = (id: number, patch: Partial<DayReview["findings"][number]>) => setR((x) => ({ ...x, findings: x.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const next = () => setStep((s) => Math.min(s + 1, total - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const close = (done = false) => {
    ref.current?.close?.();
    onClose(r, done);
  };

  const f = step < r.findings.length ? r.findings[step] : null;
  const lines = f ? moments.filter((m) => f.momentIds.includes(m.id)) : [];
  const right = r.findings.filter((x) => x.verdict === "right").length;
  const wrong = r.findings.filter((x) => x.verdict === "wrong").length;
  const skipped = r.findings.length - right - wrong;

  return (
    <dialog ref={ref} className="review-dialog" aria-label="Review your day" onCancel={(e) => { e.preventDefault(); close(); }}>
      <div className="review-dialog-head">
        <span className="muted small">
          {step + 1} of {total}
        </span>
        <span className="review-progress" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < step ? "done" : i === step ? "now" : ""} />
          ))}
        </span>
        <button className="ghost small" onClick={() => close()} aria-label="Close and keep my answers">
          Close
        </button>
      </div>

      {f && (
        <div className="review-step">
          <p className="eyebrow">Is this what happened?</p>
          <p className="review-claim">{f.claim}</p>
          {f.unsure && <p className="muted small">Not sure: {f.unsure}</p>}
          {lines.length > 0 && (
            <button className="ghost small" onClick={() => setHeard(!heard)}>
              {heard ? "Hide what Bee heard" : "What Bee heard"}
            </button>
          )}
          {heard && <HeardLines lines={lines} onFixed={onMoment} />}
          {f.verdict === "wrong" && (
            <textarea
              autoFocus
              rows={3}
              aria-label="What really happened"
              placeholder="What really happened? Rhubarb will go by this."
              value={f.correction ?? ""}
              onChange={(e) => setF(f.id, { correction: e.target.value })}
            />
          )}
          <div className="review-choices">
            <button
              className={f.verdict === "right" ? "primary" : "choice-btn"}
              onClick={() => {
                setF(f.id, { verdict: "right", correction: null });
                next();
              }}
            >
              Right
            </button>
            <button className={f.verdict === "wrong" ? "primary" : "choice-btn"} onClick={() => setF(f.id, { verdict: "wrong" })}>
              Not quite
            </button>
            {f.verdict === "wrong" && (
              <button className="ghost small" onClick={next}>
                Next
              </button>
            )}
            {!f.verdict && (
              <button className="ghost small" onClick={next}>
                Skip
              </button>
            )}
          </div>
        </div>
      )}

      {onQuestions && (
        <div className="review-step">
          <p className="eyebrow">A few questions</p>
          {r.questions.map((q) => (
            <label key={q.id} className="review-q">
              <span>{q.text}</span>
              <input
                value={q.answer ?? ""}
                onChange={(e) => setR((x) => ({ ...x, questions: x.questions.map((y) => (y.id === q.id ? { ...y, answer: e.target.value } : y)) }))}
                placeholder="A word or two is plenty"
              />
            </label>
          ))}
          <div className="review-choices">
            <button className="primary" onClick={next}>
              Next
            </button>
          </div>
        </div>
      )}

      {onSummary && (
        <div className="review-step">
          <p className="eyebrow">That's it</p>
          <p className="review-claim">
            {right} confirmed{wrong ? `, ${wrong} corrected` : ""}
            {skipped ? `, ${skipped} skipped` : ""}.
          </p>
          <p className="muted">Rhubarb suggests what to learn from what you confirmed, and leaves the rest alone.</p>
          <div className="review-choices">
            <button className="primary" onClick={() => close(true)}>
              Done, suggest what to learn
            </button>
          </div>
        </div>
      )}

      {step > 0 && (
        <button className="ghost small review-back" onClick={back}>
          Back
        </button>
      )}
    </dialog>
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
