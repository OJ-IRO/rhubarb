import { useEffect, useState } from "react";
import { api, when, type Today as TodayData } from "../api";
import { Link } from "../router";

export function Today() {
  const [data, setData] = useState<TodayData | null>(null);
  const [reflecting, setReflecting] = useState(false);

  const load = () => api.today().then(setData);
  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  return (
    <div>
      <h1 className="title">
        {greeting}, {data.profile?.name ?? "there"}.
      </h1>

      {data.letter ? (
        <p className="letter">{data.letter}</p>
      ) : (
        <p className="letter muted">
          {data.active + data.proposed === 0
            ? "Nothing on the board yet. Wear the Bee through a normal day and let it hear what your week is asking of you. If you'd rather not wait, reflect now on what it has heard so far."
            : "No letter for today yet. Tonight's reflection writes one."}
        </p>
      )}

      {data.lesson ? (
        <section className="card lesson-card">
          <p className="eyebrow">Today's lesson</p>
          <h2>{data.lesson.skill.name}</h2>
          <p className="muted">Level {data.lesson.skill.level + 1}. About {data.profile?.sessionMinutes ?? 10} minutes.</p>
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

      {data.proposed > 0 && (
        <section className="card">
          <p className="eyebrow">Waiting on you</p>
          <p>
            {data.proposed === 1 ? "One skill" : `${data.proposed} skills`} on the board need a decision.{" "}
            <Link to="/board">Have a look.</Link>
          </p>
        </section>
      )}

      {(data.duePractice.length > 0 || data.dueCards.length > 0) && (
        <section className="card">
          <p className="eyebrow">Due</p>
          <ul className="plain">
            {data.duePractice.map((p) => (
              <li key={p.id}>
                <strong>{p.kind === "mission" ? "Mission" : p.kind === "teachback" ? "Teach it back" : "Recall"}</strong> · {p.prompt}
                <span className="muted"> · sent to your pendant {when(p.scheduledFor)}</span>
              </li>
            ))}
            {data.dueCards.map((d) => (
              <li key={d.cardId}>
                <strong>Recall</strong> · {d.card?.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.sparks.length > 0 && (
        <section className="card">
          <p className="eyebrow">Things you wondered lately</p>
          <ul className="plain">
            {data.sparks.map(({ card, item }) => (
              <li key={card.id}>
                {card.title} <span className="muted">· {when(item.spokenAt)}</span>
              </li>
            ))}
          </ul>
          <Link to="/sparks">All sparks</Link>
        </section>
      )}

      <div className="actions">
        <button
          className="ghost"
          disabled={reflecting}
          onClick={async () => {
            setReflecting(true);
            await api.reflect();
            setTimeout(() => {
              setReflecting(false);
              void load();
            }, 45_000);
          }}
        >
          {reflecting ? "Thinking about your week…" : "Reflect now"}
        </button>
      </div>
    </div>
  );
}
