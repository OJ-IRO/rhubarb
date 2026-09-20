import { useEffect, useState } from "react";
import { api, when, type Card, type Item } from "../api";
import { Loading } from "../components/Hex";

export function Sparks() {
  const [rows, setRows] = useState<Array<{ card: Card; item: Item }> | null>(null);
  useEffect(() => {
    api.sparks().then(setRows);
  }, []);
  if (!rows) return <Loading />;

  return (
    <div>
      <h1 className="title">Sparks</h1>
      <p className="muted lead">Things you wondered out loud, answered. Rhubarb will ask you about them again in a few days.</p>
      {rows.length === 0 && <p className="muted">None yet. Wonder something out loud.</p>}
      {rows.map(({ card, item }) => {
        const cites = JSON.parse(card.citations) as Array<{ title: string; url: string }>;
        return (
          <article key={card.id} className="card spark-card">
            <p className="eyebrow">
              {when(item.spokenAt)}
              {item.speakerLabel ? ` · ${item.speakerLabel}` : ""}
            </p>
            <h2>{card.title}</h2>
            <p className="said">You said: "{item.sourceText}"</p>
            <p className="answer">{card.answerMd}</p>
            {cites.length > 0 && (
              <p className="muted small">
                {cites.map((c, i) => (
                  <span key={c.url}>
                    {i > 0 && " · "}
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.title}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
