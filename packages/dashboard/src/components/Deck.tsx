import { useCallback, useEffect, useState } from "react";
import Markdown from "react-markdown";
import type { Deck, Slide } from "@rhubarb/core";
import { Mermaid } from "./Mermaid";

function SlideView({ s }: { s: Slide }) {
  switch (s.kind) {
    case "cover":
      return (
        <div className="slide cover">
          <p className="eyebrow">{s.subtitle}</p>
          <h1>{s.title}</h1>
          <p className="hook">{s.hook}</p>
        </div>
      );
    case "text":
      return (
        <div className="slide text">
          <h2>{s.heading}</h2>
          <div className="prose">
            <Markdown>{s.body}</Markdown>
          </div>
          {s.aside && <aside className="aside">{s.aside}</aside>}
        </div>
      );
    case "keyidea":
      return (
        <div className="slide keyidea">
          <p className="eyebrow">The idea to keep</p>
          <h2 className="statement">{s.statement}</h2>
          <p className="why">{s.why}</p>
        </div>
      );
    case "diagram":
      return (
        <div className="slide diagram">
          <h2>{s.heading}</h2>
          <Mermaid code={s.mermaid} />
          <p className="caption">{s.caption}</p>
        </div>
      );
    case "image":
      return (
        <div className="slide image">
          <h2>{s.heading}</h2>
          <SlideImage url={s.url} alt={s.alt} />
          <p className="caption">
            {s.caption}
            {s.credit && <span className="credit"> · {s.credit}</span>}
          </p>
        </div>
      );
    case "example":
      return (
        <div className="slide example">
          <p className="eyebrow">{s.heading}</p>
          <blockquote>
            "{s.quote}"
            <footer>
              {s.who ? `${s.who}, ` : ""}
              {s.when}
            </footer>
          </blockquote>
          <p>{s.explanation}</p>
        </div>
      );
    case "steps":
      return (
        <div className="slide steps">
          <h2>{s.heading}</h2>
          <ol>
            {s.steps.map((st, i) => (
              <li key={i}>
                <strong>{st.title}</strong>
                <p>{st.body}</p>
              </li>
            ))}
          </ol>
        </div>
      );
    case "compare":
      return (
        <div className="slide compare">
          <h2>{s.heading}</h2>
          <div className="columns">
            {s.columns.map((c, i) => (
              <div key={i} className="col">
                <h3>{c.title}</h3>
                <ul>
                  {c.points.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );
    case "learnmore":
      return (
        <div className="slide learnmore">
          <h2>Go further</h2>
          <div className="links">
            {s.links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="linkcard">
                <strong>{l.title}</strong>
                <span>{l.why}</span>
              </a>
            ))}
          </div>
        </div>
      );
  }
}

export function DeckViewer({ deck, onFinish }: { deck: Deck; onFinish: () => void }) {
  const [i, setI] = useState(0);
  const n = deck.slides.length;
  const last = i === n - 1;

  const next = useCallback(() => (last ? onFinish() : setI((x) => Math.min(n - 1, x + 1))), [last, n, onFinish]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  return (
    <div className="deck">
      <div className="deck-progress">
        {deck.slides.map((s, j) => (
          <button key={j} className={j === i ? "dot on" : j < i ? "dot done" : "dot"} onClick={() => setI(j)} title={`${j + 1}: ${s.kind}`} />
        ))}
      </div>
      <div className="deck-stage" data-tour="lesson-stage" key={i}>
        <SlideView s={deck.slides[i]} />
      </div>
      <div className="deck-nav">
        <button className="ghost" onClick={prev} disabled={i === 0}>
          ← Back
        </button>
        <span className="muted small">
          {i + 1} of {n} · about {deck.minutes} min
        </span>
        <button className="primary" onClick={next}>
          {last ? "Check my understanding →" : "Next →"}
        </button>
      </div>
      <p className="deck-hint muted small">The arrow keys turn the cards too.</p>
    </div>
  );
}

/** A picture that can fail. Links on the web die, and a broken-image icon mid-lesson looks like our bug. */
function SlideImage({ url, alt }: { url?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <div className="img-missing">{alt}</div>;
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
