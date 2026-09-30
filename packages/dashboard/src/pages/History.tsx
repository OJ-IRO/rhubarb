import { useEffect, useState } from "react";
import { api, localDay, when, type DayDetail, type HistoryEntry } from "../api";
import { Loading } from "../components/Hex";
import { StatusChip } from "../components/Meter";
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

const KIND_LABEL: Record<string, string> = {
  question: "you asked",
  gap: "you weren't sure",
  struggle: "you didn't follow",
  intent: "you said you wanted this",
  exposure: "it came up around you",
  stake: "on your calendar",
};

/** "Today", "Yesterday", or "Sat 27" for a YYYY-MM-DD day. */
function shortDay(day: string): string {
  const today = localDay(Date.now());
  const yesterday = localDay(Date.now() - 86_400_000);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  const d = new Date(`${day}T12:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`;
}

function longDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** A row of days at the top: pick one to see what it held and what came of it. */
function DayTabs({ current }: { current?: string }) {
  const [days, setDays] = useState<Array<{ day: string; moments: number }> | null>(null);
  useEffect(() => {
    api.days().then(setDays);
  }, []);
  if (!days || days.length === 0) return null;
  return (
    <nav className="day-tabs" aria-label="Pick a day">
      <Link to="/history" className={current ? "day-tab" : "day-tab active"}>
        Everything
      </Link>
      {days.map((d) => (
        <Link key={d.day} to={`/history/${d.day}`} className={current === d.day ? "day-tab active" : "day-tab"}>
          {shortDay(d.day)}
        </Link>
      ))}
    </nav>
  );
}

const MOMENTS_SHOWN = 12;

/** One day: where you were, what Rhubarb noticed, and the plans and answers that came of it. */
function DayView({ day }: { day: string }) {
  const [d, setD] = useState<DayDetail | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    setD(null);
    setAll(false);
    api.day(day).then(setD);
  }, [day]);
  if (!d) return <Loading />;
  const moments = all ? d.moments : d.moments.slice(0, MOMENTS_SHOWN);

  return (
    <div className="day-view">
      <h2 className="day-title">{longDay(day)}</h2>
      <p className="muted">
        {d.utterances.toLocaleString()} {d.utterances === 1 ? "line" : "lines"} heard · {d.moments.length} {d.moments.length === 1 ? "moment" : "moments"} noticed
      </p>
      {d.places.length > 0 && (
        <p className="day-places">
          {d.places.map((p) => (
            <span key={p} className="chip-kind">
              {p}
            </span>
          ))}
        </p>
      )}

      <section>
        <p className="eyebrow">What came of it</p>
        {d.skills.length === 0 && d.sparks.length === 0 && <p className="muted">Nothing from this day turned into a plan or an answer yet.</p>}
        {d.skills.map((s) => (
          <article key={s.id} className="card day-plan">
            <div className="rank-head">
              <h3>
                <Link to={`/skills/${s.id}`}>{s.name}</Link>
              </h3>
              {s.kind === "topic" && <span className="chip-kind">One lesson</span>}
              <StatusChip status={s.status} />
            </div>
            <p className="muted small">
              {s.moments} {s.moments === 1 ? "moment" : "moments"} from this day
              {s.lessonId ? (
                <>
                  {" · "}
                  <Link to={`/lessons/${s.lessonId}`}>open the lesson</Link>
                </>
              ) : null}
            </p>
          </article>
        ))}
        {d.sparks.map(({ card }) => (
          <article key={card.id} className="card day-plan">
            <div className="rank-head">
              <h3>
                <Link to="/sparks">{card.title}</Link>
              </h3>
              <span className="chip-kind">Spark</span>
            </div>
          </article>
        ))}
      </section>

      <section>
        <p className="eyebrow">What Rhubarb noticed</p>
        {d.moments.length === 0 && <p className="muted">Nothing worth noting that day.</p>}
        {moments.map((m) => (
          <div key={m.id} className="moment">
            <p>
              <span className="quote">"{m.text}"</span>
              <span className="muted">
                {" "}
                · {KIND_LABEL[m.kind] ?? m.kind} · {when(m.spokenAt)}
                {m.place ? ` · ${m.place}` : ""}
              </span>
            </p>
          </div>
        ))}
        {d.moments.length > MOMENTS_SHOWN && (
          <button className="ghost small" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${d.moments.length}`}
          </button>
        )}
      </section>
    </div>
  );
}

/** Everything that has happened, newest first: what you finished, said, and used for real. Or one day at a time. */
export function History({ day }: { day?: string }) {
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    if (!day) api.history().then(setRows);
  }, [day]);
  if (day)
    return (
      <div className="history">
        <h1 className="title">Looking back</h1>
        <DayTabs current={day} />
        <DayView day={day} />
      </div>
    );
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
      <DayTabs />
      <p className="muted lead">What you've finished, said out loud, and used for real, newest first. Pick a day above to see what it held and what came of it.</p>
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
