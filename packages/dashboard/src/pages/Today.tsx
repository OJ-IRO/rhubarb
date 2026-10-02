import type { DayReview } from "@rhubarb/core";
import { useEffect, useState } from "react";
import { api, isPreview, localDay, when, type Today as TodayData } from "../api";
import { DaySelect, longDay } from "../components/DaySelect";
import { ReviewCard } from "../components/DayReview";
import { GettingStarted } from "../components/GettingStarted";
import { HexBadge, HexLevels, Loading } from "../components/Hex";
import { DayView } from "./History";
import { Link, go } from "../router";

const goToDay = (d: string) => go(d === localDay(Date.now()) ? "/" : `/day/${d}`);

/** An earlier day: its review, where you were, what was noticed, and what came of it. */
function PastDay({ day }: { day: string }) {
  return (
    <div>
      <div className="day-head">
        <h1 className="title">{longDay(day)}</h1>
        <DaySelect value={day} onChange={goToDay} />
      </div>
      <ReviewCard day={day} />
      <DayView day={day} heading={false} />
    </div>
  );
}

export function Today({ day }: { day?: string }) {
  if (day && day !== localDay(Date.now())) return <PastDay day={day} />;
  return <TodayPage />;
}

function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [open, setOpen] = useState<DayReview | null | undefined>(undefined);
  const [reflecting, setReflecting] = useState(false);

  const load = () => api.today().then(setData);
  useEffect(() => {
    api.openReview().then(setOpen).catch(() => setOpen(null));
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function reflect() {
    setReflecting(true);
    await api.reflect();
    setTimeout(() => {
      setReflecting(false);
      void load();
    }, isPreview() ? 1500 : 45_000);
  }

  if (!data) return <Loading />;
  const due = data.duePractice.length + data.dueCards.length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  return (
    <div>
      <div className="day-head">
        <h1 className="title">Good {greeting.toLowerCase()}.</h1>
        <DaySelect value={localDay(Date.now())} onChange={goToDay} />
      </div>

      {/* A day waiting on its review comes first: nothing below is built on it until it's checked. */}
      {open && <ReviewCard day={open.day} initial={open} onDone={() => setTimeout(() => void load(), 1500)} />}

      {data.letter ? (
        <p className="letter">{data.letter}</p>
      ) : data.active + data.proposed === 0 ? (
        <GettingStarted profile={data.profile} onReflect={reflect} reflecting={reflecting} onGoalsSaved={() => void load()} />
      ) : (
        <p className="letter muted">No letter for today yet. Tonight's reflection writes one.</p>
      )}

      {data.active + data.proposed > 0 && (
        <div className="glance">
          <Link to="/honeycomb" className="glance-tile">
            <HexBadge n={data.active} tone="honey" size={38} />
            <span>
              <strong>{data.active === 1 ? "skill" : "skills"} under way</strong>
              <span className="muted">See the comb</span>
            </span>
          </Link>
          <Link to="/board" className="glance-tile">
            <HexBadge n={data.proposed} size={38} />
            <span>
              <strong>{data.proposed === 1 ? "needs" : "need"} a decision</strong>
              <span className="muted">{data.proposed > 0 ? "Have a look at the board" : "Nothing waiting on you"}</span>
            </span>
          </Link>
          <div className="glance-tile">
            <HexBadge n={due} size={38} />
            <span>
              <strong>due today</strong>
              <span className="muted">{due > 0 ? "Listed below" : "You're clear"}</span>
            </span>
          </div>
        </div>
      )}

      {data.lesson ? (
        <section className="card lesson-card">
          <p className="eyebrow">Today's lesson</p>
          <h2>{data.lesson.skill.name}</h2>
          <p className="lesson-meta">
            <HexLevels level={data.lesson.skill.level} total={data.lesson.ladderLength ?? 0} size={18} />
            <span>
              Level {data.lesson.skill.level + 1}
              {data.lesson.ladderLength ? ` of ${data.lesson.ladderLength}` : ""} · about {data.profile?.sessionMinutes ?? 10} minutes
            </span>
          </p>
          <Link to={`/lessons/${data.lesson.lesson.id}`} className="button primary">
            Open the lesson
          </Link>
        </section>
      ) : data.active > 0 ? (
        <section className="card">
          <p className="eyebrow">Today's lesson</p>
          <p className="muted">Your next lesson is being written. It usually takes a couple of minutes.</p>
        </section>
      ) : null}

      {(data.duePractice.length > 0 || data.dueCards.length > 0) && (
        <section className="card">
          <p className="eyebrow">Due</p>
          <ul className="due-list">
            {data.duePractice.map((p) => (
              <li key={p.id}>
                <span className="due-kind">{p.kind === "mission" ? "Mission" : p.kind === "teachback" ? "Teach it back" : "Recall"}</span>
                <span>
                  {p.prompt}
                  <span className="muted"> · sent to your Bee {when(p.scheduledFor)}</span>
                </span>
              </li>
            ))}
            {data.dueCards.map((d) => (
              <li key={d.cardId}>
                <span className="due-kind">Recall</span>
                <span>{d.card?.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.sparks.length > 0 && (
        <section className="card">
          <p className="eyebrow">Things you wondered lately</p>
          <ul className="due-list">
            {data.sparks.map(({ card, item }) => (
              <li key={card.id}>
                <span className="due-kind">{new Date(item.spokenAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                <span>{card.title}</span>
              </li>
            ))}
          </ul>
          <Link to="/sparks">All sparks</Link>
        </section>
      )}

      {((data.upcoming ?? []).length > 0 || data.nextSlot) && (
        <section className="card">
          <p className="eyebrow">Coming up</p>
          <ul className="due-list">
            {(data.upcoming ?? []).map((p) => (
              <li key={p.id}>
                <span className="due-kind">{p.kind === "mission" ? "Mission" : p.kind === "teachback" ? "Teach it back" : "Recall"}</span>
                <span>
                  {p.prompt}
                  <span className="muted"> · your phone buzzes {when(p.scheduledFor)}</span>
                </span>
              </li>
            ))}
            {data.nextSlot && (
              <li>
                <span className="due-kind">Next slot</span>
                <span>
                  {when(data.nextSlot)}
                  <span className="muted"> · when a new lesson would land. Change it in </span>
                  <Link to="/settings">settings</Link>.
                </span>
              </li>
            )}
            <li>
              <span className="due-kind">Tonight</span>
              <span>
                Rhubarb reflects on the day around 3am<span className="muted"> · new skills for the board, and tomorrow's letter.</span>
              </span>
            </li>
          </ul>
        </section>
      )}

      {data.active + data.proposed > 0 && (
        <div className="actions">
          <button className="ghost" disabled={reflecting} onClick={reflect}>
            {reflecting ? "Thinking about your week…" : "Reflect now"}
          </button>
        </div>
      )}
    </div>
  );
}
