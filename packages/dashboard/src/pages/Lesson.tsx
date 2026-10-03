import { useEffect, useRef, useState } from "react";
import { HexLevels, Loading } from "../components/Hex";
import type { Deck, LessonBeat, Quiz } from "@rhubarb/core";
import { api, type LessonView, type QuizResult } from "../api";
import { DeckViewer } from "../components/Deck";
import { QuizView } from "../components/Quiz";
import { Link, go } from "../router";

type Stage = "deck" | "quiz" | "practice";

export function LessonPage({ id }: { id: number }) {
  const [view, setView] = useState<LessonView | null>(null);
  const [stage, setStage] = useState<Stage>("deck");
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [sentToPendant, setSentToPendant] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const [missionAt, setMissionAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMissing(false);
    api
      .lesson(id)
      .then(async (v) => {
        setView(v);
        await api.startSession(id);
        window.scrollTo(0, 0);
      })
      .catch(() => setMissing(true));
  }, [id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage]);

  if (missing)
    return (
      <div>
        <h1 className="title">No lesson here yet.</h1>
        <p className="muted lead">Lessons are written when you say yes to a skill on the board. The first one takes a few minutes.</p>
        <Link to="/learning" className="button primary">
          Go to the board
        </Link>
      </div>
    );
  if (!view) return <Loading label="Opening your lesson" />;
  const { lesson, skill, ladder } = view;
  const deck = JSON.parse(lesson.deck) as Deck;
  const quiz = JSON.parse(lesson.quiz) as Quiz;
  const beats = JSON.parse(lesson.beats) as LessonBeat[];
  const teachback = beats.find((b) => b.kind === "teachback");
  const mission = beats.find((b) => b.kind === "mission");
  const hasDeck = Array.isArray(deck.slides) && deck.slides.length > 0;

  return (
    <div className="lesson-layout">
      <article className="lesson-main">
        <p className="eyebrow">
          <span>
            {skill && <Link to={`/skills/${skill.id}`}>{skill.name}</Link>} · level {lesson.levelIdx + 1}
            {ladder.length ? ` of ${ladder.length}` : ""}
          </span>
          <HexLevels level={lesson.levelIdx} total={ladder.length} size={14} />
          <span className="spacer" />
          <span className="stage-tabs">
            {(["deck", "quiz", "practice"] as Stage[]).map((s) => (
              <button key={s} className={stage === s ? "tab on" : "tab"} onClick={() => setStage(s)}>
                {s === "deck" ? "Lesson" : s === "quiz" ? "Check" : "Practice"}
              </button>
            ))}
            {/* Lives here, not floating over the page, where it used to sit on top of "Next". */}
            <button className={tutorOpen ? "tab pushback on" : "tab pushback"} aria-expanded={tutorOpen} onClick={() => setTutorOpen(!tutorOpen)}>
              Push back
            </button>
          </span>
        </p>

        {stage === "deck" &&
          (hasDeck ? (
            <DeckViewer deck={deck} onFinish={() => setStage("quiz")} />
          ) : (
            <div className="prose">
              <p className="muted">This lesson was written before decks existed; here's the text version.</p>
              {lesson.bodyMd.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <button className="primary" onClick={() => setStage("quiz")}>
                Check my understanding →
              </button>
            </div>
          ))}

        {stage === "quiz" &&
          (quiz.questions.length > 0 ? (
            <>
              <QuizView
                quiz={quiz}
                result={quizResult}
                onRetry={async (idx, text) => setQuizResult(await api.retryQuiz(id, idx, text))}
                onSubmit={async (answers) => {
                  const r = await api.submitQuiz(id, answers);
                  setQuizResult(r);
                }}
              />
              {quizResult && (
                <div className="actions end">
                  <button className="primary" onClick={() => setStage("practice")}>
                    On to practice →
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="muted">No check for this one. Straight to practice.</p>
          ))}

        {stage === "practice" && (
          <section className="practice-stage">
            {teachback && (
              <div className="beat">
                <p className="eyebrow">Teach it back</p>
                <p className="beat-prompt">{teachback.prompt}</p>
                <p className="muted small">Say it out loud into your Bee. Rhubarb grades the explanation, not the vocabulary.</p>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={sentToPendant}
                    onClick={async () => {
                      await api.teachbackToPendant(id);
                      setSentToPendant(true);
                    }}
                  >
                    {sentToPendant ? "Sent. Your phone will buzz in a minute." : "Send to my Bee"}
                  </button>
                </div>
              </div>
            )}
            {mission && (
              <div className="beat">
                <p className="eyebrow">Tomorrow's mission</p>
                <p className="beat-prompt">{mission.prompt}</p>
                <div className="actions">
                  <button
                    className="ghost"
                    disabled={Boolean(missionAt)}
                    onClick={async () => {
                      const r = await api.scheduleMission(id);
                      setMissionAt(r.at);
                    }}
                  >
                    {missionAt ? `Reminder set for ${new Date(missionAt).toLocaleString()}` : "Remind me on my phone"}
                  </button>
                </div>
              </div>
            )}
            <div className="actions end">
              <button
                className="primary"
                disabled={lesson.status === "done" || busy}
                onClick={async () => {
                  setBusy(true);
                  await api.completeLesson(id);
                  go(skill ? `/skills/${skill.id}` : "/");
                }}
              >
                {lesson.status === "done" ? "Finished" : "I'm done with this one"}
              </button>
            </div>
          </section>
        )}
      </article>

      <Checked review={lesson.review} />
      <p className="muted small misheard">
        Built on something Bee misheard? <Link to={`/skills/${lesson.skillId}`}>Fix what was said</Link> and have it written again.
      </p>

      <Tutor lessonId={id} initial={view.session ? (JSON.parse(view.session.tutor) as Msg[]) : []} open={tutorOpen} onClose={() => setTutorOpen(false)} />
    </div>
  );
}

interface Review {
  checks: Array<{ id: string; ok: boolean; detail: string }>;
}

/** What this lesson was held to before it was shown. Quiet when all is well, plain when it isn't. */
function Checked({ review }: { review: string | null }) {
  if (!review) return null;
  let r: Review;
  try {
    r = JSON.parse(review) as Review;
  } catch {
    return null;
  }
  if (!r.checks?.length) return null;
  const failed = r.checks.filter((c) => !c.ok).length;
  return (
    <details className="checked">
      <summary className="muted small">
        {failed === 0 ? `What was checked: all ${r.checks.length} passed` : `What was checked: ${failed} of ${r.checks.length} need a look`}
      </summary>
      <ul>
        {r.checks.map((c) => (
          <li key={c.id} className={c.ok ? "ok" : "not"}>
            <span aria-hidden="true">{c.ok ? "✓" : "!"}</span>
            <span>
              <span className="visually-hidden">{c.ok ? "Passed: " : "Needs a look: "}</span>
              {c.detail}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

interface Msg {
  role: "user" | "assistant";
  content: string;
}

function Tutor({ lessonId, initial, open, onClose }: { lessonId: number; initial: Msg[]; open: boolean; onClose: () => void }) {
  const [history, setHistory] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function send() {
    const text = draft.trim();
    if (!text || streaming) return;
    const next: Msg[] = [...history, { role: "user", content: text }];
    setHistory([...next, { role: "assistant", content: "" }]);
    setDraft("");
    setStreaming(true);
    let acc = "";
    try {
      await api.tutor(lessonId, next, (t) => {
        acc += t;
        setHistory([...next, { role: "assistant", content: acc }]);
      });
      if (!acc) throw new Error("empty reply");
    } catch {
      // Without this the streaming flag stayed set and the tutor never accepted another message.
      // Put their words back so nothing they typed is lost.
      setHistory([...history, { role: "assistant", content: "I couldn't get to that one. Your message is back in the box, so send it again in a moment." }]);
      setDraft(text);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <aside className={open ? "tutor open" : "tutor"} aria-label="Tutor" hidden={!open}>
      {open && (
        <>
          <div className="tutor-head">
            <strong>Push back</strong>
            <button className="ghost small" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="thread">
            {history.length === 0 && <p className="muted small">Ask why, disagree, or ask for a different example. The tutor knows this lesson and what you said this week.</p>}
            {history.map((m, i) => (
              <p key={i} className={m.role === "user" ? "msg me" : "msg"}>
                {m.content}
              </p>
            ))}
            <div ref={bottom} />
          </div>
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Wait, why does…"
            aria-label="Your message to the tutor"
          />
          <div className="tutor-send">
            <span className="muted small">{streaming ? "Thinking…" : "Enter sends. Shift and Enter for a new line."}</span>
            <button className="primary small" disabled={streaming || !draft.trim()} onClick={() => void send()}>
              Send
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
