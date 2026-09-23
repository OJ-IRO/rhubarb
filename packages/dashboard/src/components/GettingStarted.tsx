import { useEffect, useState } from "react";
import { api, type Profile, type Status } from "../api";
import { HexNode } from "./Hex";
import { Link } from "../router";

const IDEAS = ["public speaking", "negotiating", "explaining technical work to non-engineers", "reading a balance sheet", "running a meeting", "a language for a trip", "giving feedback", "asking for what I want"];

/**
 * Day one. Nothing on the board, so instead of "nothing here" the page says exactly what gets
 * something here, with live status for each step, and takes a goal now so the first reflection
 * has something to aim at.
 */
export function GettingStarted({ profile, onReflect, reflecting, onGoalsSaved }: { profile: Profile | null; onReflect: () => void; reflecting: boolean; onGoalsSaved: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () => api.status().then((s) => live && setStatus(s)).catch(() => live && setStatus(null));
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const hearing = status?.listening?.state === "connected";
  const heard = (status?.evidence ?? 0) > 0 || (status?.listening?.lastHeardAt ?? null) !== null;
  const goals = profile?.goals ?? [];

  async function addGoal(text: string) {
    const v = text.trim();
    if (!v || !profile || goals.some((g) => g.toLowerCase() === v.toLowerCase())) return;
    setBusy(true);
    try {
      await api.saveProfile({ ...profile, goals: [...goals, v] });
      setDraft("");
      onGoalsSaved();
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    {
      done: hearing,
      title: hearing ? "Your Bee is connected" : "Connect your Bee",
      body: hearing ? "Rhubarb can hear it." : "Pair it in the Bee app, then run bee login on this computer. The light at the foot of the menu turns green when it's working.",
    },
    {
      done: heard,
      title: heard ? "It has heard you" : "Wear it through a normal day",
      body: heard ? "Moments from your conversations are being noted." : "Meetings, calls, dinner. Questions you ask and things you say you want to get better at become the raw material.",
    },
    {
      done: false,
      title: "Tonight it reflects",
      body: "Around 3am it turns what it heard into a ranked board of skills, and writes you a letter for the morning. If you'd rather not wait, reflect now.",
    },
  ];

  return (
    <div className="start">
      <p className="lead">Nothing on the board yet. Here is how it gets there.</p>
      <ol className="start-steps">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? "done" : ""}>
            <HexNode state={s.done ? "done" : i === steps.findIndex((x) => !x.done) ? "current" : "locked"} />
            <span>
              <strong>{s.title}</strong>
              <span className="muted">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      {profile && (
        <section className="card start-goal">
          <p className="eyebrow">Or give it a head start</p>
          <p>Tell Rhubarb one thing you already know you want to get better at. It listens for that specifically, and it gives tonight's reflection somewhere to begin.</p>
          {goals.length > 0 && (
            <ul className="chips added" aria-label="Your goals">
              {goals.map((g) => (
                <li key={g} className="chip on">
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="listinput-row">
            <input
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addGoal(draft);
                }
              }}
              placeholder="something like: negotiating"
              aria-label="A thing you want to get better at"
            />
            <button type="button" disabled={busy || !draft.trim()} onClick={() => void addGoal(draft)}>
              Add
            </button>
          </div>
          <div className="chips" aria-label="Common ones">
            {IDEAS.filter((i) => !goals.some((g) => g.toLowerCase() === i)).slice(0, 6).map((i) => (
              <button key={i} className="chip" disabled={busy} onClick={() => void addGoal(i)}>
                {i}
              </button>
            ))}
          </div>
          <p className="muted small">
            You can change these any time in <Link to="/settings">settings</Link>.
          </p>
        </section>
      )}

      <div className="actions">
        <button className="primary" disabled={reflecting || !heard} onClick={onReflect} title={heard ? undefined : "There is nothing to reflect on until it has heard you"}>
          {reflecting ? "Thinking about your week…" : "Reflect now"}
        </button>
        <a className="button" href="#/preview/">
          See what a full week looks like
        </a>
      </div>
    </div>
  );
}
