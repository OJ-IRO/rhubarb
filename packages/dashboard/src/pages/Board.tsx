import { useEffect, useState } from "react";
import { api, type SkillRow } from "../api";
import { Link } from "../router";

export function Board() {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => api.skills().then(setSkills);
  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  if (!skills) return null;
  const proposed = skills.filter((s) => s.status === "proposed");
  const active = skills.filter((s) => s.status === "active");
  const mastered = skills.filter((s) => s.status === "mastered");

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    await fn();
    await load();
    setBusy(null);
  }

  return (
    <div>
      <h1 className="title">The board</h1>
      <p className="muted lead">What your days are asking you to learn, in the order Waggle would take them.</p>

      {skills.length === 0 && (
        <p className="muted">Nothing here yet. It fills in after Waggle has heard a day or two, or when you reflect from the Today page.</p>
      )}

      {proposed.length > 0 && (
        <section>
          <p className="eyebrow">Needs a decision</p>
          {proposed.map((s, i) => (
            <article key={s.id} className="card skill">
              <div className="skill-head">
                <span className="rank">{i + 1}</span>
                <h2>{s.name}</h2>
                <span className="muted">{s.evidenceCount} moments</span>
              </div>
              <p className="brief">{s.brief}</p>
              <div className="actions">
                <button className="primary" disabled={busy === s.id} onClick={() => act(s.id, () => api.acceptSkill(s.id))}>
                  {busy === s.id ? "Starting…" : "Yes, teach me this"}
                </button>
                <button className="ghost" disabled={busy === s.id} onClick={() => act(s.id, () => api.dismissSkill(s.id))}>
                  Not this
                </button>
                <span className="spacer" />
                <button className="ghost small" onClick={() => act(s.id, () => api.setPriority(s.id, s.priority + 10))} title="Move up">
                  ↑
                </button>
                <button className="ghost small" onClick={() => act(s.id, () => api.setPriority(s.id, Math.max(0, s.priority - 10)))} title="Move down">
                  ↓
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {active.length > 0 && (
        <section>
          <p className="eyebrow">In progress</p>
          {active.map((s) => (
            <article key={s.id} className="card skill">
              <div className="skill-head">
                <h2>
                  <Link to={`/skills/${s.id}`}>{s.name}</Link>
                </h2>
                <span className="muted">
                  level {s.level + 1} of {s.ladderLength || "?"}
                </span>
              </div>
              <p className="brief">{s.brief}</p>
              <div className="actions">
                {s.lessonReady && s.lessonId ? (
                  <Link to={`/lessons/${s.lessonId}`} className="button primary">
                    Open the lesson
                  </Link>
                ) : (
                  <span className="muted">Writing your next lesson…</span>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {mastered.length > 0 && (
        <section>
          <p className="eyebrow">Done</p>
          {mastered.map((s) => (
            <article key={s.id} className="card skill">
              <h2>
                <Link to={`/skills/${s.id}`}>{s.name}</Link>
              </h2>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
