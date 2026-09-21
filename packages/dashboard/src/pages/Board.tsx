import { useEffect, useState } from "react";
import { api, type Skill, type SkillRow } from "../api";
import { HexBadge, HexLevels, Loading } from "../components/Hex";
import { Meter, StatusChip } from "../components/Meter";
import { Toast, type ToastState } from "../components/Toast";
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

  const [aside, setAsideList] = useState<Skill[]>([]);
  const [showAside, setShowAside] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const load = () => Promise.all([api.skills().then(setSkills), api.dismissedSkills().then(setAsideList)]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  if (!skills) return <Loading />;
  const ranked = skills.filter((s) => s.status !== "dismissed").sort((a, b) => b.priority - a.priority);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  async function bringBack(id: number) {
    await api.restoreSkill(id);
    await load();
  }

  // One click should never be the end of something. Setting a skill aside can be taken straight
  // back from the toast, or later from the list at the foot of the board.
  async function setAside(s: SkillRow) {
    await act(s.id, () => api.dismissSkill(s.id));
    setToast({ message: `Set aside: ${s.name}.`, actionLabel: "Undo", onAction: () => void bringBack(s.id) });
  }

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    await fn();
    await load();
    setBusy(null);
  }

  return (
    <div className="board">
      <h1 className="title">The board</h1>
      <p className="muted lead">Everything your days have asked you to learn, in the order Rhubarb would take them.</p>

      {ranked.length === 0 && (
        <p className="muted">Nothing here yet. It fills in after Rhubarb has heard a day or two, or when you reflect from the Today page.</p>
      )}

      {top.length > 0 && (
        <section className="spotlight">
          {top.map((s, i) => (
            <article key={s.id} className={`spot spot-${i + 1}`}>
              <div className="spot-top">
                <HexBadge n={i + 1} tone={i === 0 ? "honey" : "wax"} size={42} />
                <StatusChip status={s.status} />
              </div>
              <h2>
                <Link to={`/skills/${s.id}`}>{s.name}</Link>
              </h2>
              <p className="spot-why">{firstSentence(s.brief)}</p>
              <Meter value={s.priority} />
              <p className="muted small spot-foot">
                {s.status !== "proposed" && <HexLevels level={s.level} total={s.ladderLength} mastered={s.status === "mastered"} size={15} />}
                <span>
                  {s.evidenceCount} moments{s.status === "active" ? ` · level ${s.level + 1} of ${s.ladderLength || "?"}` : ""}
                </span>
              </p>
              <div className="actions">
                <Action s={s} busy={busy === s.id} onAccept={() => act(s.id, () => api.acceptSkill(s.id))} />
                {s.status === "proposed" && (
                  <button className="ghost small" disabled={busy === s.id} onClick={() => setAside(s)}>
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
                <div className="rank-num">
                  <HexBadge n={idx} size={34} />
                </div>
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
                      <button className="ghost small" disabled={busy === s.id} onClick={() => setAside(s)}>
                        Not this
                      </button>
                    )}
                    <span className="spacer" />
                    <button className="ghost small" title="Move up" aria-label={`Move ${s.name} up`} onClick={() => act(s.id, () => api.setPriority(s.id, Math.min(100, s.priority + 10)))}>
                      ↑
                    </button>
                    <button className="ghost small" title="Move down" aria-label={`Move ${s.name} down`} onClick={() => act(s.id, () => api.setPriority(s.id, Math.max(0, s.priority - 10)))}>
                      ↓
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {aside.length > 0 && (
        <section className="set-aside">
          <button className="ghost small" aria-expanded={showAside} onClick={() => setShowAside(!showAside)}>
            {showAside ? "Hide" : "Show"} what you've set aside ({aside.length})
          </button>
          {showAside && (
            <ul className="forget-list">
              {aside.map((s) => (
                <li key={s.id}>
                  <span>
                    <strong>{s.name}</strong>
                    <span className="muted small"> · {firstSentence(s.brief)}</span>
                  </span>
                  <button className="ghost small" onClick={() => void bringBack(s.id)}>
                    Bring it back
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
