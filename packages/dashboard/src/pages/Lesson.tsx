import { useEffect, useRef, useState } from "react";
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
  const [missionAt, setMissionAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.lesson(id).then(async (v) => {
      setView(v);
      await api.startSession(id);
      window.scrollTo(0, 0);
    });
  }, [id]);

  useEffect(() => window.scrollTo(0, 0), [stage]);

  if (!view) return null;
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
          {skill && <Link to={`/skills/${skill.id}`}>{skill.name}</Link>} · level {lesson.levelIdx + 1}
          {ladder.length ? ` of ${ladder.length}` : ""}
          <span className="stage-tabs">
            {(["deck", "quiz", "practice"] as Stage[]).map((s) => (
              <button key={s} className={stage === s ? "tab on" : "tab"} onClick={() => setStage(s)}>
                {s === "deck" ? "Lesson" : s === "quiz" ? "Check" : "Practice"}
              </button>
            ))}
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
                <p className="muted small">Say it out loud into your pendant. Rhubarb grades the explanation, not the vocabulary.</p>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={sentToPendant}
                    onClick={async () => {
                      await api.teachbackToPendant(id);
                      setSentToPendant(true);
                    }}
                  >
                    {sentToPendant ? "Sent. Your phone will buzz in a minute." : "Send to my pendant"}
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
                    {missionAt ? `Reminder set for ${new Date(missionAt).toLocaleString()}` : "Remind me on my pendant"}
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

      <Tutor lessonId={id} initial={view.session ? (JSON.parse(view.session.tutor) as Msg[]) : []} />
    </div>
  );
}

interface Msg {
  role: "user" | "assistant";
  content: string;
}

function Tutor({ lessonId, initial }: { lessonId: number; initial: Msg[] }) {
  const [history, setHistory] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [open, setOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [history]);

  async function send() {
    const text = draft.trim();
    if (!text || streaming) return;
    const next: Msg[] = [...history, { role: "user", content: text }];
    setHistory([...next, { role: "assistant", content: "" }]);
    setDraft("");
    setStreaming(true);
    let acc = "";
    await api.tutor(lessonId, next, (t) => {
      acc += t;
      setHistory([...next, { role: "assistant", content: acc }]);
    });
    setStreaming(false);
  }

  return (
    <aside className={open ? "tutor open" : "tutor"}>
      <button className="tutor-toggle" onClick={() => setOpen(!open)}>
        {open ? "Close" : "Push back"}
      </button>
      {open && (
        <>
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
          />
        </>
      )}
    </aside>
  );
}
