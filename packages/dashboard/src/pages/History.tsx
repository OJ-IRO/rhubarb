import { useEffect, useState } from "react";
import { api, when, type HistoryEntry } from "../api";
import { Loading } from "../components/Hex";
import { Link } from "../router";

const KIND: Record<HistoryEntry["kind"], string> = { lesson: "lesson", answer: "out loud", credit: "for real", spark: "spark", level: "level" };

function dayOf(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** Everything that has happened, newest first: what you finished, said, and used for real. */
export function History() {
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    api.history().then(setRows);
  }, []);
  if (!rows) return <Loading />;

  const days: Array<{ day: string; items: HistoryEntry[] }> = [];
  for (const r of rows) {
    const day = dayOf(r.at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(r);
    else days.push({ day, items: [r] });
  }

  return (
    <div className="history">
      <h1 className="title">Looking back</h1>
      <p className="muted lead">What you've finished, said out loud, and used for real, newest first.</p>
      {rows.length === 0 && (
        <p className="muted">Nothing yet. This fills in the first time you finish a lesson, answer out loud, or use a skill in a real conversation.</p>
      )}
      {days.map((d) => (
        <section key={d.day}>
          <p className="eyebrow">{d.day}</p>
          <ul className="timeline">
            {d.items.map((e, i) => (
              <li key={i} className={`entry kind-${e.kind}`}>
                <span className="entry-kind">{KIND[e.kind]}</span>
                <span className="entry-body">
                  <strong>{e.skillId ? <Link to={`/skills/${e.skillId}`}>{e.title}</Link> : e.title}</strong>
                  <span>{e.detail}</span>
                  <span className="muted small">{when(e.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
