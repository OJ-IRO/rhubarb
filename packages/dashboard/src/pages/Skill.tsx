import { useEffect, useState } from "react";
import { api, when, type SkillDetail } from "../api";
import { HexLevels, HexNode, Loading } from "../components/Hex";
import { Link } from "../router";

// The detector's internal words mean little to the person reading their own week.
const KIND_LABEL: Record<string, string> = {
  question: "you asked",
  gap: "you weren't sure",
  struggle: "you didn't follow",
  intent: "you said you wanted this",
  exposure: "it kept coming up around you",
  stake: "coming up on your calendar",
};

export function SkillPage({ id }: { id: number }) {
  const [d, setD] = useState<SkillDetail | null>(null);
  useEffect(() => {
    api.skill(id).then(setD);
  }, [id]);
  if (!d) return <Loading />;
  const { skill, ladder, evidence, lessons, practice, fieldEvidence } = d;

  return (
    <div>
      <p className="eyebrow">
        <Link to="/board">Board</Link> / skill
      </p>
      <h1 className="title">{skill.name}</h1>
      {ladder.length > 0 && (
        <p className="lesson-meta">
          <HexLevels level={skill.level} total={ladder.length} mastered={skill.status === "mastered"} size={18} />
          <span>{skill.status === "mastered" ? "Every level passed" : `Level ${Math.min(skill.level + 1, ladder.length)} of ${ladder.length}`}</span>
        </p>
      )}
      <p className="brief">{skill.brief}</p>

      <section>
        <p className="eyebrow">The ladder</p>
        <ol className="ladder">
          {ladder.map((l) => {
            const lesson = lessons.find((x) => x.levelIdx === l.idx);
            return (
              <li key={l.id} className={`rung ${l.status}`}>
                <HexNode state={l.status === "done" ? "done" : l.status === "current" ? "current" : "locked"} />
                <div>
                  <strong>{l.title}</strong>
                  <p className="muted">{l.outcome}</p>
                </div>
                {lesson ? (
                  <Link to={`/lessons/${lesson.id}`} className="button small">
                    {lesson.status === "done" ? "Reread" : "Open"}
                  </Link>
                ) : (
                  <span className="muted small">{l.status === "locked" ? "locked" : l.status === "done" ? "passed" : "writing…"}</span>
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
                  <strong>{p.kind === "teachback" ? "Teach it back" : p.kind === "mission" ? "Mission" : p.kind === "quiz" ? "Quiz" : "Recall"}</strong> · {p.prompt}
                </p>
                {p.answerText && <p className="quote">"{p.answerText}"</p>}
                {g ? (
                  <p>
                    <span className="score-pill">{g.score} of 5</span>
                    {g.feedback}
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
              · {KIND_LABEL[e.kind] ?? e.kind} · {when(e.spokenAt)}
              {e.speakerLabel ? ` · ${e.speakerLabel}` : ""}
              {e.place ? ` · ${e.place}` : ""}
            </span>
          </p>
        ))}
      </section>
    </div>
  );
}
