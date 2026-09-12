import { useEffect, useState } from "react";
import { api, type SkillRow } from "../api";
import { Meter, StatusChip } from "../components/Meter";
import { Link } from "../router";

function firstSentence(s: string): string {
  const m = s.match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : s;
}

function Action({ s, busy, onAccept }: { s: SkillRow; busy: boolean; onAccept: () => void }) {
  if (s.status === "proposed")
    return (
      <button className="primary" disabled={busy} onClick={onAccept}>
        {busy ? "Starting…" : "Yes, teach me this"}
      </button>
    );
  if (s.status === "active" && s.lessonReady && s.lessonId)
    return (
      <Link to={`/lessons/${s.lessonId}`} className="button primary">
        Open the lesson
      </Link>
    );
  if (s.status === "active") return <span className="muted">Writing your next lesson…</span>;
  return (
    <Link to={`/skills/${s.id}`} className="button">
      Look back
    </Link>
  );
}

export function Board() {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = () => api.skills().then(setSkills);
  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  if (!skills) return null;
  const ranked = skills.filter((s) => s.status !== "dismissed").sort((a, b) => b.priority - a.priority);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    await fn();
    await load();
    setBusy(null);
  }

  return (
    <div className="board">
      <h1 className="title">The board</h1>
      <p className="muted lead">Everything your days have asked you to learn, in the order Waggle would take them.</p>

      {ranked.length === 0 && (
        <p className="muted">Nothing here yet. It fills in after Waggle has heard a day or two, or when you reflect from the Today page.</p>
      )}

      {top.length > 0 && (
        <section className="spotlight">
          {top.map((s, i) => (
            <article key={s.id} className={`spot spot-${i + 1}`}>
              <div className="spot-rank">{i + 1}</div>
              <StatusChip status={s.status} />
              <h2>
                <Link to={`/skills/${s.id}`}>{s.name}</Link>
              </h2>
              <p className="spot-why">{firstSentence(s.brief)}</p>
              <Meter value={s.priority} />
              <p className="muted small">
                {s.evidenceCount} moments{s.status === "active" ? ` · level ${s.level + 1} of ${s.ladderLength || "?"}` : ""}
              </p>
              <div className="actions">
                <Action s={s} busy={busy === s.id} onAccept={() => act(s.id, () => api.acceptSkill(s.id))} />
                {s.status === "proposed" && (
                  <button className="ghost small" disabled={busy === s.id} onClick={() => act(s.id, () => api.dismissSkill(s.id))}>
                    Not this
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {rest.length > 0 && (
        <section className="ranking">
          <p className="eyebrow">The rest, in order</p>
          {rest.map((s, i) => {
            const idx = i + 4;
            const expanded = open === s.id;
            return (
              <article key={s.id} className="rank-row">
                <div className="rank-num">{idx}</div>
                <div className="rank-main">
                  <div className="rank-head">
                    <h3>
                      <Link to={`/skills/${s.id}`}>{s.name}</Link>
                    </h3>
                    <StatusChip status={s.status} />
                    <span className="muted small">{s.evidenceCount} moments</span>
                  </div>
                  <Meter value={s.priority} />
                  <p className={expanded ? "brief" : "brief clamp"} onClick={() => setOpen(expanded ? null : s.id)}>
                    {s.brief}
                  </p>
                  <div className="actions compact">
                    <Action s={s} busy={busy === s.id} onAccept={() => act(s.id, () => api.acceptSkill(s.id))} />
                    {s.status === "proposed" && (
                      <button className="ghost small" disabled={busy === s.id} onClick={() => act(s.id, () => api.dismissSkill(s.id))}>
                        Not this
                      </button>
                    )}
                    <span className="spacer" />
                    <button className="ghost small" title="Move up" onClick={() => act(s.id, () => api.setPriority(s.id, Math.min(100, s.priority + 10)))}>
                      ↑
                    </button>
                    <button className="ghost small" title="Move down" onClick={() => act(s.id, () => api.setPriority(s.id, Math.max(0, s.priority - 10)))}>
                      ↓
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
