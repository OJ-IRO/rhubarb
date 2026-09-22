import { useEffect, useState } from "react";
import { api, when, type PrivacyView } from "../api";
import { HexBadge, Loading } from "../components/Hex";
import { Toast, type ToastState } from "../components/Toast";
import { Link } from "../router";

const KIND_LABEL: Record<string, string> = {
  question: "you asked",
  gap: "you weren't sure",
  struggle: "you didn't follow",
  intent: "you said you wanted this",
  exposure: "it kept coming up",
  stake: "on your calendar",
};

function dayName(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

const big = (n: number) => n.toLocaleString();

export function Privacy() {
  const [view, setView] = useState<PrivacyView | null>(null);
  const [askDay, setAskDay] = useState<string | null>(null);
  const [askAll, setAskAll] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    api.privacy().then(setView);
  }, []);

  if (!view) return <Loading />;
  const { summary, days, moments } = view;
  const empty = summary.utterances === 0 && summary.moments === 0 && summary.skills === 0;

  async function run(fn: () => Promise<PrivacyView>, done: string) {
    setBusy(true);
    try {
      setView(await fn());
      setToast({ message: done });
    } catch {
      setToast({ message: "That didn't go through. Nothing was changed." });
    } finally {
      setBusy(false);
      setAskDay(null);
      setAskAll(false);
      setWord("");
    }
  }

  return (
    <div className="privacy">
      <h1 className="title">Privacy and safety</h1>
      <p className="muted lead">What Rhubarb is holding, where your words go, what it refuses to learn from, and how to make it forget.</p>

      <section>
        <p className="eyebrow">Where your words go</p>
        <div className="where">
          <article className="card">
            <h3>Stays on this computer</h3>
            <p>
              Everything Rhubarb hears, notes and writes lives in one file on this machine. There is no Rhubarb account and no Rhubarb server. Nobody else can open this page: it only answers this computer.
            </p>
          </article>
          <article className="card">
            <h3>Leaves, to do the thinking</h3>
            <p>
              To sort a moment, write a lesson or grade an answer, Rhubarb sends the few lines involved to Claude, running in your own AWS account. If you've turned on web sources, it also searches for the subject of a lesson. Those searches are checked before they go: one that repeats what you said is refused.
            </p>
          </article>
          <article className="card">
            <h3>Not Rhubarb's to delete</h3>
            <p>Your Bee keeps its own copy with Bee. Forgetting something here removes it from Rhubarb only. To remove it from Bee too, delete it in the Bee app.</p>
          </article>
        </div>
        <p className="muted">
          Topics you never want turned into lessons are set in <Link to="/welcome">Settings</Link>. Rhubarb drops anything that touches them.
        </p>
      </section>

      <section>
        <p className="eyebrow">What Rhubarb won't touch</p>
        <div className="where" data-tour="privacy-top">
          <article className="card">
            <h3>It never has your voice</h3>
            <p>Rhubarb receives text from your Bee, never sound. There is no audio here to store, leak or replay, of you or of anyone near you.</p>
          </article>
          <article className="card">
            <h3>Private moments are left alone</h3>
            <p>
              A hard moment, something about your health, your own legal or family matters, a password or card number read aloud: Rhubarb drops these on arrival. The words aren't kept, no lesson is built on them, and no AI model ever sees them.
            </p>
          </article>
          <article className="card">
            <h3>It knows what it isn't</h3>
            <p>Rhubarb teaches skills. It is not a therapist, a doctor, a lawyer or an emergency service, and it won't act like one. If you or someone near you is in danger, call your local emergency number.</p>
          </article>
        </div>
        <p className="muted">It also won't put words in your mouth. Every quote from your week in a lesson is checked against what was actually heard, and cut if it can't be found.</p>
      </section>

      <section>
        <p className="eyebrow">What's here right now</p>
        {empty ? (
          <p className="muted">Nothing. Rhubarb isn't holding anything it has heard.</p>
        ) : (
          <>
            <div className="glance">
              <div className="glance-tile">
                <HexBadge n={summary.utterances > 999 ? `${Math.round(summary.utterances / 100) / 10}k` : summary.utterances} tone="honey" size={44} />
                <span>
                  <strong>lines of speech</strong>
                  <span className="muted">{summary.since ? `since ${new Date(summary.since).toLocaleDateString(undefined, { month: "long", day: "numeric" })}` : "none yet"}</span>
                </span>
              </div>
              <div className="glance-tile">
                <HexBadge n={summary.moments} size={44} />
                <span>
                  <strong>moments noted</strong>
                  <span className="muted">questions, gaps, things you said you wanted</span>
                </span>
              </div>
              <div className="glance-tile">
                <HexBadge n={summary.skills} size={44} />
                <span>
                  <strong>{summary.skills === 1 ? "skill" : "skills"}</strong>
                  <span className="muted">
                    {big(summary.lessons)} {summary.lessons === 1 ? "lesson" : "lessons"} · {big(summary.voiceNotes)} voice {summary.voiceNotes === 1 ? "note" : "notes"}
                  </span>
                </span>
              </div>
            </div>
          </>
        )}
      </section>

      {days.length > 0 && (
        <section>
          <p className="eyebrow">Forget a day</p>
          <p className="muted">Removes everything heard that day and anything built directly on it. Lessons already written may still quote it; erasing everything clears those too.</p>
          <ul className="forget-list">
            {days.map((d) => (
              <li key={d.day}>
                <span>
                  <strong>{dayName(d.day)}</strong>
                  <span className="muted">
                    {" "}
                    · {big(d.utterances)} lines · {d.moments} {d.moments === 1 ? "moment" : "moments"}
                  </span>
                </span>
                {askDay === d.day ? (
                  <span className="confirm">
                    <span className="muted small">This can't be undone.</span>
                    <button className="danger small" disabled={busy} onClick={() => run(() => api.forgetDay(d.day), `Forgot ${dayName(d.day)}.`)}>
                      Forget it
                    </button>
                    <button className="ghost small" onClick={() => setAskDay(null)}>
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button className="ghost small" onClick={() => setAskDay(d.day)}>
                    Forget this day
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {moments.length > 0 && (
        <section>
          <p className="eyebrow">Forget a moment</p>
          <p className="muted">The latest things Rhubarb took note of. Forgetting one removes the note, the words behind it, and any answer card made from it.</p>
          <ul className="forget-list moments">
            {moments.map((e) => (
              <li key={e.id}>
                <span>
                  <span className="quote">"{e.text}"</span>
                  <span className="muted small">
                    {" "}
                    · {KIND_LABEL[e.kind] ?? e.kind} · {when(e.spokenAt)}
                  </span>
                </span>
                <button className="ghost small" disabled={busy} aria-label={`Forget: ${e.text}`} onClick={() => run(() => api.forgetMoment(e.id), "Forgotten.")}>
                  Forget
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!empty && (
        <section className="danger-zone">
          <p className="eyebrow">Erase everything</p>
          <p>
            Removes all speech, moments, voice notes, skills, lessons and practice. Your settings stay, including your off-limits topics, so they keep being honoured. Nothing erased here comes back, even if Bee still has it.
          </p>
          {askAll ? (
            <div className="confirm-all">
              <label htmlFor="erase-word">
                Type <strong>erase</strong> to confirm. This can't be undone.
              </label>
              <input id="erase-word" value={word} onChange={(e) => setWord(e.target.value)} autoFocus autoComplete="off" />
              <div className="actions">
                <button className="danger" disabled={busy || word.trim().toLowerCase() !== "erase"} onClick={() => run(() => api.eraseEverything(), "Everything is erased.")}>
                  Erase everything
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setAskAll(false);
                    setWord("");
                  }}
                >
                  Keep it all
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAskAll(true)}>Erase everything…</button>
          )}
        </section>
      )}

      <Toast toast={toast} onDone={() => setToast(null)} ms={5000} />
    </div>
  );
}
