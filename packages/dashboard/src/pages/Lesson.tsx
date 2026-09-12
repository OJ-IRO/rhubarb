import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { api, type LessonBeat, type LessonView } from "../api";
import { Link, go } from "../router";

const BEAT_LABEL: Record<LessonBeat["kind"], string> = {
  checkin: "Quick check",
  scenario: "Work it through",
  teachback: "Teach it back",
  mission: "Tomorrow",
};

export function LessonPage({ id }: { id: number }) {
  const [view, setView] = useState<LessonView | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sentToPendant, setSentToPendant] = useState(false);
  const [missionAt, setMissionAt] = useState<string | null>(null);

  useEffect(() => {
    api.lesson(id).then(async (v) => {
      setView(v);
      const session = await api.startSession(id);
      setResponses(JSON.parse(session.responses) as Record<string, string>);
    });
  }, [id]);

  if (!view) return null;
  const { lesson, skill, ladder } = view;
  const beats = JSON.parse(lesson.beats) as LessonBeat[];
  const level = ladder.find((l) => l.idx === lesson.levelIdx);
  const citations = JSON.parse(lesson.citations) as Array<{ title: string; url: string }>;

  async function answer(idx: number) {
    const text = responses[idx] ?? "";
    if (!text.trim()) return;
    setBusy(`beat-${idx}`);
    await api.saveResponses(id, responses);
    const r = await api.answerBeat(id, idx, text);
    setFeedback((f) => ({ ...f, [idx]: r.score !== undefined ? `${r.score}/5. ${r.feedback}` : r.feedback }));
    setBusy(null);
  }

  return (
    <div className="lesson-layout">
      <article className="reader">
        <p className="eyebrow">
          {skill && <Link to={`/skills/${skill.id}`}>{skill.name}</Link>} · level {lesson.levelIdx + 1}
          {ladder.length ? ` of ${ladder.length}` : ""}
        </p>
        <h1 className="title">{level?.title ?? "Lesson"}</h1>
        {level && <p className="muted lead">By the end: {level.outcome}</p>}

        <div className="prose">
          <Markdown>{lesson.bodyMd}</Markdown>
        </div>

        {citations.length > 0 && (
          <p className="muted small">
            Sources:{" "}
            {citations.map((c, i) => (
              <span key={c.url}>
                {i > 0 && ", "}
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.title}
                </a>
              </span>
            ))}
          </p>
        )}

        <section className="beats">
          {beats.map((b, idx) => (
            <div key={idx} className="beat">
              <p className="eyebrow">{BEAT_LABEL[b.kind]}</p>
              <p className="beat-prompt">{b.prompt}</p>

              {(b.kind === "checkin" || b.kind === "scenario" || b.kind === "teachback") && (
                <>
                  <textarea
                    rows={b.kind === "checkin" ? 2 : 4}
                    value={responses[idx] ?? ""}
                    onChange={(e) => setResponses((r) => ({ ...r, [idx]: e.target.value }))}
                    placeholder={b.kind === "teachback" ? "Explain it in your own words, or send it to your pendant and say it out loud." : "Your answer"}
                  />
                  <div className="actions">
                    <button className="primary small" disabled={busy === `beat-${idx}`} onClick={() => answer(idx)}>
                      {busy === `beat-${idx}` ? "Reading…" : "Check"}
                    </button>
                    {b.kind === "teachback" && (
                      <button
                        className="ghost small"
                        disabled={sentToPendant}
                        onClick={async () => {
                          await api.teachbackToPendant(id);
                          setSentToPendant(true);
                        }}
                      >
                        {sentToPendant ? "Sent. Your phone will buzz in a minute." : "Send to my pendant"}
                      </button>
                    )}
                  </div>
                  {feedback[idx] && <p className="feedback">{feedback[idx]}</p>}
                </>
              )}

              {b.kind === "mission" && (
                <div className="actions">
                  <button
                    className="ghost small"
                    disabled={Boolean(missionAt)}
                    onClick={async () => {
                      const r = await api.scheduleMission(id);
                      setMissionAt(r.at);
                    }}
                  >
                    {missionAt ? `Reminder set for ${new Date(missionAt).toLocaleString()}` : "Remind me on my pendant"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>

        <div className="actions end">
          <button
            className="primary"
            disabled={lesson.status === "done" || busy === "done"}
            onClick={async () => {
              setBusy("done");
              await api.completeLesson(id);
              go(skill ? `/skills/${skill.id}` : "/");
            }}
          >
            {lesson.status === "done" ? "Finished" : "I'm done with this one"}
          </button>
        </div>
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
    <aside className="tutor">
      <p className="eyebrow">Push back</p>
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
    </aside>
  );
}
