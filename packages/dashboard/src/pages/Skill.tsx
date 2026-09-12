import { useEffect, useState } from "react";
import { api, when, type SkillDetail } from "../api";
import { Link } from "../router";

export function SkillPage({ id }: { id: number }) {
  const [d, setD] = useState<SkillDetail | null>(null);
  useEffect(() => {
    api.skill(id).then(setD);
  }, [id]);
  if (!d) return null;
  const { skill, ladder, evidence, lessons, practice, fieldEvidence } = d;

  return (
    <div>
      <p className="eyebrow">
        <Link to="/board">Board</Link> / skill
      </p>
      <h1 className="title">{skill.name}</h1>
      <p className="brief">{skill.brief}</p>

      <section>
        <p className="eyebrow">The ladder</p>
        <ol className="ladder">
          {ladder.map((l) => {
            const lesson = lessons.find((x) => x.levelIdx === l.idx);
            return (
              <li key={l.id} className={`rung ${l.status}`}>
                <div>
                  <strong>{l.title}</strong>
                  <p className="muted">{l.outcome}</p>
                </div>
                {lesson ? (
                  <Link to={`/lessons/${lesson.id}`} className="button small">
                    {lesson.status === "done" ? "Reread" : "Open"}
                  </Link>
                ) : (
                  <span className="muted small">{l.status === "locked" ? "locked" : "writing…"}</span>
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
                  <strong>{p.kind}</strong> · {p.prompt}
                </p>
                {p.answerText && <p className="quote">"{p.answerText}"</p>}
                {g ? (
                  <p>
                    <strong>{g.score}/5.</strong> {g.feedback}
                  </p>
                ) : (
                  <p className="muted">{p.status}</p>
                )}
              </article>
            );
          })}
        </section>
      )}

      <section>
        <p className="eyebrow">Why it's here</p>
        {evidence.map((e) => (
          <p key={e.id} className="moment">
            <span className="quote">"{e.text}"</span>
            <span className="muted">
              {" "}
              · {e.kind} · {when(e.spokenAt)}
              {e.speakerLabel ? ` · ${e.speakerLabel}` : ""}
              {e.place ? ` · ${e.place}` : ""}
            </span>
          </p>
        ))}
      </section>
    </div>
  );
}
