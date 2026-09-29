import { useEffect, useState } from "react";
import { api, when, type Evidence, type SkillDetail } from "../api";
import { HexLevels, HexNode, Loading } from "../components/Hex";
import { Link } from "../router";

// The detector's internal words mean little to the person reading their own week.
const KIND_LABEL: Record<string, string> = {
  question: "you asked",
  gap: "you weren't sure",
  struggle: "you didn't follow",
  intent: "you said you wanted this",
  exposure: "it kept coming up around you",
  stake: "coming up on your calendar",
};

/**
 * Speech recognition mishears. "Osaka" came back as "Old Southfield" once, and a lesson got
 * written about the wrong wheel. The wearer can correct any moment, the line and the lines
 * around it, and have the lesson written again from what they really said.
 */
/** Enough rows to show the words without scrolling inside the box, on a phone as well. */
function rowsFor(text: string, min: number): number {
  const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 34)), 0);
  return Math.min(16, Math.max(min, lines + 1));
}

function Moment({ e, onSaved }: { e: Evidence; onSaved: (e: Evidence) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(e.text);
  const [context, setContext] = useState(e.context ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.editMoment(e.id, { text, context }));
      setEditing(false);
    } catch {
      setError("That didn't save. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  if (editing)
    return (
      <div className="moment moment-edit">
        <label htmlFor={`m-text-${e.id}`}>What was said</label>
        <textarea id={`m-text-${e.id}`} rows={rowsFor(text, 3)} value={text} onChange={(x) => setText(x.target.value)} />
        <label htmlFor={`m-ctx-${e.id}`}>The conversation around it</label>
        <textarea id={`m-ctx-${e.id}`} rows={rowsFor(context, 6)} value={context} onChange={(x) => setContext(x.target.value)} />
        <p className="muted small">Fix any words Bee misheard. Lessons are written from exactly what's here.</p>
        {error && <p className="feedback">{error}</p>}
        <div className="actions compact">
          <button className="primary" disabled={saving || !text.trim()} onClick={() => void save()}>
            {saving ? "Saving…" : "Save the correction"}
          </button>
          <button
            className="ghost small"
            disabled={saving}
            onClick={() => {
              setText(e.text);
              setContext(e.context ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );

  return (
    <div className="moment">
      <p>
        <span className="quote">"{e.text}"</span>
        <span className="muted">
          {" "}
          · {KIND_LABEL[e.kind] ?? e.kind} · {when(e.spokenAt)}
          {e.speakerLabel ? ` · ${e.speakerLabel}` : ""}
          {e.place ? ` · ${e.place}` : ""}
        </span>
        {e.editedAt && <span className="chip-kind"> corrected</span>}
      </p>
      <button className="ghost small" onClick={() => setEditing(true)}>
        Fix what was said
      </button>
    </div>
  );
}

export function SkillPage({ id }: { id: number }) {
  const [d, setD] = useState<SkillDetail | null>(null);
  const [asking, setAsking] = useState(false);
  const [askFailed, setAskFailed] = useState(false);
  const writing = d?.rewrite?.state === "writing";
  useEffect(() => {
    api.skill(id).then(setD);
  }, [id]);
  // While a rewrite is running, check back until it has finished one way or the other.
  useEffect(() => {
    if (!writing) return;
    const t = setInterval(() => void api.skill(id).then(setD), 10_000);
    return () => clearInterval(t);
  }, [id, writing]);
  if (!d) return <Loading />;
  const { skill, ladder, evidence, lessons, practice, fieldEvidence } = d;
  const hasLesson = lessons.length > 0;
  const rw = d.rewrite ?? null;
  const lastEdit = Math.max(0, ...evidence.map((e) => e.editedAt ?? 0));
  // Corrections made after the last finished rewrite are the ones not yet in the lesson.
  const unapplied = lastEdit > 0 && (!rw || rw.state === "failed" || (rw.state === "done" && lastEdit > rw.at));

  async function rewrite() {
    setAsking(true);
    setAskFailed(false);
    try {
      await api.rewriteLesson(skill.id);
      setD(await api.skill(id));
    } catch {
      setAskFailed(true);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">
        <Link to="/board">Board</Link> / skill
      </p>
      <h1 className="title">{skill.name}</h1>
      {ladder.length > 0 && (
        <p className="lesson-meta">
          <HexLevels level={skill.level} total={ladder.length} mastered={skill.status === "mastered"} size={18} />
          <span>{skill.status === "mastered" ? "Every level passed" : `Level ${Math.min(skill.level + 1, ladder.length)} of ${ladder.length}`}</span>
        </p>
      )}
      <p className="brief">{skill.brief}</p>

      <section>
        <p className="eyebrow">The ladder</p>
        <ol className="ladder">
          {ladder.map((l) => {
            const lesson = lessons.find((x) => x.levelIdx === l.idx);
            return (
              <li key={l.id} className={`rung ${l.status}`}>
                <HexNode state={l.status === "done" ? "done" : l.status === "current" ? "current" : "locked"} />
                <div>
                  <strong>{l.title}</strong>
                  <p className="muted">{l.outcome}</p>
                </div>
                {lesson ? (
                  <Link to={`/lessons/${lesson.id}`} className="button small">
                    {lesson.status === "done" ? "Reread" : "Open"}
                  </Link>
                ) : (
                  <span className="muted small">{l.status === "locked" ? "locked" : l.status === "done" ? "passed" : "writing…"}</span>
                )}
              </li>
            );
          })}
          {ladder.length === 0 && <li className="muted">Building the ladder…</li>}
        </ol>
      </section>

      {fieldEvidence.length > 0 && (
        <section>
          <p className="eyebrow">Heard in the wild</p>
          {fieldEvidence.map((f) => {
            const v = f.verdict ? (JSON.parse(f.verdict) as { note?: string }) : null;
            return (
              <article key={f.id} className={f.credited ? "card credited" : "card"}>
                <p className="quote">"{f.text}"</p>
                <p className="muted">
                  {when(f.spokenAt)} {f.credited ? "· counted toward your level" : "· not quite a use of the skill"}
                </p>
                {v?.note && <p>{v.note}</p>}
              </article>
            );
          })}
        </section>
      )}

      {practice.length > 0 && (
        <section>
          <p className="eyebrow">Practice</p>
          {practice.map((p) => {
            const g = p.grade ? (JSON.parse(p.grade) as { score: number; feedback: string }) : null;
            return (
              <article key={p.id} className="card">
                <p>
                  <strong>{p.kind === "teachback" ? "Teach it back" : p.kind === "mission" ? "Mission" : p.kind === "quiz" ? "Quiz" : "Recall"}</strong> · {p.prompt}
                </p>
                {p.answerText && <p className="quote">"{p.answerText}"</p>}
                {g ? (
                  <p>
                    <span className="score-pill">{g.score} of 5</span>
                    {g.feedback}
                  </p>
                ) : (
                  <p className="muted">{p.status}</p>
                )}
              </article>
            );
          })}
        </section>
      )}

      <section id="moments">
        <p className="eyebrow">Why it's here</p>
        <p className="muted small">What Bee heard. If it misheard something, fix it here and the lesson can be written again from what you really said.</p>
        {evidence.map((e) => (
          <Moment
            key={e.id}
            e={e}
            onSaved={(saved) => setD({ ...d, evidence: evidence.map((x) => (x.id === saved.id ? saved : x)) })}
          />
        ))}
        {hasLesson && skill.status !== "proposed" && writing && (
          <div className="rewrite-banner" role="status">
            <p>
              Rewriting it from your corrections, started {when(new Date(rw!.at).toISOString())}. It takes a few minutes, and your Bee buzzes when it's ready. The current lesson stays here until then.
            </p>
          </div>
        )}
        {hasLesson && skill.status !== "proposed" && !writing && rw?.state === "done" && !unapplied && (
          <div className="rewrite-banner done" role="status">
            <p>Rewritten from your corrections, {when(new Date(rw.at).toISOString())}.</p>
            {rw.lessonId && (
              <Link to={`/lessons/${rw.lessonId}`} className="button primary">
                Open the new lesson
              </Link>
            )}
          </div>
        )}
        {hasLesson && skill.status !== "proposed" && !writing && unapplied && (
          <div className="rewrite-banner">
            {rw?.state === "failed" ? (
              <p>The last rewrite didn't finish: {rw.reason}. Your corrections are saved, so it can be tried again.</p>
            ) : (
              <p>You corrected what was said. Want the current lesson written again from your words?</p>
            )}
            <button className="primary" disabled={asking} onClick={() => void rewrite()}>
              {asking ? "Starting…" : rw?.state === "failed" ? "Try the rewrite again" : "Rewrite the lesson"}
            </button>
            {askFailed && <p className="feedback">That didn't start. Try again in a moment.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
