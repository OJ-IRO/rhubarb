import { useEffect, useState } from "react";
import { api, type NudgePrefs, type Profile, type UsageSummary } from "../api";
import { Loading } from "../components/Hex";
import { Toast, type ToastState } from "../components/Toast";
import { applyReading, readReading, type Reading } from "../lib/reading";
import { Link } from "../router";
import { ListInput, STYLES, WINDOWS, splitWindows } from "./Onboarding";
import { useWhere } from "../lib/where";

const ALL: NudgePrefs = { lessons: true, feedback: true, credits: true, brief: true };

const NUDGE_ROWS: Array<{ key: keyof NudgePrefs; title: string; body: string }> = [
  { key: "lessons", title: "A lesson is ready", body: "Lands in one of your learning windows, never in the middle of a meeting." },
  { key: "feedback", title: "How you did", body: "The score and one line of feedback, a minute after you answer out loud." },
  { key: "credits", title: "Heard you use it", body: "When a real conversation shows you using a skill correctly." },
  { key: "brief", title: "Tonight's brief", body: "Once a day, when the board has something new for you to decide on. Never before 8:30 in the morning." },
];

/**
 * Everything about you, edited in place. Each section saves itself, so nothing is lost by
 * leaving halfway. The six-question walk-through on first run is the same data, asked once.
 */
const dollars = (n: number) => (n < 0.01 && n > 0 ? "under 1¢" : `$${n.toFixed(2)}`);

/**
 * What Claude has cost, and a daily cap. Lessons are the expensive part; the cap pauses them and
 * everything else that isn't cheap once the day's budget is spent. Nothing is lost: the work waits
 * until tomorrow.
 */
function Spend({ onSaved }: { onSaved: (msg: string) => void }) {
  const [u, setU] = useState<UsageSummary | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    api.usage().then((x) => {
      setU(x);
      setDraft(String(x.budget));
    });
  }, []);
  if (!u) return null;
  const over = u.budget > 0 && u.today >= u.budget;

  async function saveBudget() {
    const usd = Number(draft);
    if (!Number.isFinite(usd) || usd < 0) return;
    const { budget } = await api.setBudget(usd);
    setU({ ...u!, budget });
    onSaved(budget === 0 ? "No daily cap. Every call still gets counted here." : `Daily budget set to $${budget.toFixed(2)}.`);
  }

  return (
    <section>
      <p className="eyebrow">What Claude costs</p>
      <div className="spend-tiles">
        <div className={over ? "spend-tile over" : "spend-tile"}>
          <span className="muted small">Today</span>
          <strong>{dollars(u.today)}</strong>
          {u.budget > 0 && <span className="muted small">of ${u.budget.toFixed(2)}</span>}
        </div>
        <div className="spend-tile">
          <span className="muted small">Last 7 days</span>
          <strong>{dollars(u.week)}</strong>
        </div>
        <div className="spend-tile">
          <span className="muted small">Since counting began</span>
          <strong>{dollars(u.total)}</strong>
        </div>
      </div>
      {u.byPurpose.length > 0 ? (
        <table className="spend-table">
          <caption className="muted small">The last 7 days, by what it was for</caption>
          <tbody>
            {u.byPurpose.map((r) => (
              <tr key={r.purpose}>
                <th scope="row">{r.purpose}</th>
                <td className="muted small">{r.calls} {r.calls === 1 ? "call" : "calls"}</td>
                <td>{dollars(r.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted small">Nothing counted yet. Every call to Claude from now on shows up here with what it was for.</p>
      )}
      <label htmlFor="budget">Daily budget, in dollars</label>
      <div className="budget-row">
        <input id="budget" type="number" min={0} step={0.5} inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button onClick={() => void saveBudget()} disabled={draft === String(u.budget) || draft === ""}>
          Save
        </button>
      </div>
      <p className="muted small">
        Once a day's spend reaches this, lessons, answers and proposals wait until tomorrow. Sorting what Bee heard keeps going a little past it, so nothing is lost. 0 means no cap. Prices are Anthropic's list prices.
      </p>
    </section>
  );
}

export function Settings() {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [reading, setReading] = useState<Reading>(readReading);
  const [toast, setToast] = useState<ToastState | null>(null);
  const where = useWhere();

  useEffect(() => {
    api.profile().then(setP);
  }, []);

  if (p === undefined) return <Loading />;
  if (p === null)
    return (
      <div>
        <h1 className="title">Nothing set up yet.</h1>
        <Link to="/welcome" className="button primary">
          Set up Rhubarb
        </Link>
      </div>
    );

  async function save(patch: Partial<Profile>, said = "Saved.") {
    const next = { ...p!, ...patch };
    setP(next);
    try {
      setP(await api.saveProfile(next));
      setToast({ message: said });
    } catch {
      setToast({ message: "That didn't save. Nothing was changed." });
      setP(p);
    }
  }

  const win = splitWindows(p.learningWindows);
  const nudges = { ...ALL, ...(p.nudges ?? {}) };
  const setReadingPref = (patch: Partial<Reading>) => {
    const next = { ...reading, ...patch };
    setReading(next);
    applyReading(next);
  };

  return (
    <div className="settings">
      <h1 className="title">Settings</h1>
      <p className="muted lead">How Rhubarb works with you. Each change saves on its own.</p>

      <section>
        <p className="eyebrow">You</p>
        <div className="setting-row">
          <label htmlFor="s-name">
            <strong>Your name</strong>
            <span className="muted">Shown here and nowhere else. Everywhere else, Rhubarb says "you."</span>
          </label>
          <input id="s-name" defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.name && save({ name: e.target.value.trim() })} />
        </div>
      </section>

      <section>
        <p className="eyebrow">How you learn</p>
        <div className="setting-row stacked">
          <strong>How you like to be taught</strong>
          <div className="choices" role="radiogroup" aria-label="Teaching style">
            {STYLES.map((s) => (
              <button key={s.id} role="radio" aria-checked={p.style === s.id} className={p.style === s.id ? "choice on" : "choice"} onClick={() => p.style !== s.id && save({ style: s.id }, `Lessons will ${s.name.toLowerCase()}.`)}>
                <strong>{s.name}</strong>
                <span>{s.blurb}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row stacked">
          <strong>How long a session is</strong>
          <div className="choices row" role="radiogroup" aria-label="Session length">
            {([5, 10, 20] as const).map((m) => (
              <button key={m} role="radio" aria-checked={p.sessionMinutes === m} className={p.sessionMinutes === m ? "choice on" : "choice"} onClick={() => p.sessionMinutes !== m && save({ sessionMinutes: m })}>
                <strong>{m} minutes</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row stacked">
          <strong>When you have the time</strong>
          <span className="muted">Lesson nudges land then.</span>
          <div className="chips" role="group" aria-label="When you have time">
            {WINDOWS.map((w) => {
              const on = win.picks.includes(w);
              return (
                <button key={w} className={on ? "chip on" : "chip"} aria-pressed={on} onClick={() => save({ learningWindows: [...(on ? win.picks.filter((x) => x !== w) : [...win.picks, w]), win.other].filter(Boolean).join(", ") })}>
                  {w}
                </button>
              );
            })}
          </div>
          <input defaultValue={win.other} placeholder="Other times, in your own words" aria-label="Other times" onBlur={(e) => e.target.value.trim() !== win.other && save({ learningWindows: [...win.picks, e.target.value.trim()].filter(Boolean).join(", ") })} />
        </div>
        <div className="setting-row stacked">
          <strong>Things you want to get better at</strong>
          <span className="muted">Rhubarb listens for these specifically.</span>
          <ListInput items={p.goals} onChange={(goals) => void save({ goals })} placeholder="public speaking, or reading a balance sheet" addLabel="Add" />
        </div>
      </section>

      <section>
        <p className="eyebrow">What reaches your phone</p>
        <p className="muted">Each of these is an alarm on your phone through your Bee. Practice prompts you ask for yourself always come.</p>
        <ul className="toggles">
          {NUDGE_ROWS.map((row) => (
            <li key={row.key}>
              <span>
                <strong>{row.title}</strong>
                <span className="muted">{row.body}</span>
              </span>
              <button role="switch" aria-checked={nudges[row.key]} aria-label={row.title} className={nudges[row.key] ? "switch on" : "switch"} onClick={() => save({ nudges: { ...nudges, [row.key]: !nudges[row.key] } }, nudges[row.key] ? "Off. Your phone stays quiet for that." : "On.")}>
                <span className="switch-knob" />
              </button>
            </li>
          ))}
        </ul>
        <button className="ghost small" onClick={() => save({ nudges: { lessons: false, feedback: false, credits: false, brief: false } }, "All quiet. Practice you ask for still comes.")}>
          Pause them all
        </button>
      </section>

      <section>
        <p className="eyebrow">Reading comfort</p>
        <p className="muted">These stay on this device.</p>
        <ul className="toggles">
          <li>
            <span>
              <strong>Easier-to-read type</strong>
              <span className="muted">A plain, wide typeface with more room between letters and lines.</span>
            </span>
            <button role="switch" aria-checked={reading.easierFont} aria-label="Easier-to-read type" className={reading.easierFont ? "switch on" : "switch"} onClick={() => setReadingPref({ easierFont: !reading.easierFont })}>
              <span className="switch-knob" />
            </button>
          </li>
          <li>
            <span>
              <strong>Larger text</strong>
              <span className="muted">Everything a step bigger.</span>
            </span>
            <button role="switch" aria-checked={reading.largerText} aria-label="Larger text" className={reading.largerText ? "switch on" : "switch"} onClick={() => setReadingPref({ largerText: !reading.largerText })}>
              <span className="switch-knob" />
            </button>
          </li>
        </ul>
      </section>

      <section>
        <p className="eyebrow">Off limits</p>
        <span className="muted">Topics Rhubarb hears but must never turn into lessons or keep notes about.</span>
        <ListInput items={p.offLimits} onChange={(offLimits) => void save({ offLimits }, "Rhubarb will leave that alone.")} placeholder="my health, or family finances" addLabel="Add" />
      </section>

      <Spend onSaved={(message) => setToast({ message })} />

      <section>
        <p className="eyebrow">Where things happened</p>
        <ul className="toggles">
          <li>
            <span>
              <strong>Name the place</strong>
              <span className="muted">
                Moments and lessons say where a conversation happened, like "Osaka Castle Park, Osaka". Only a landmark or a neighbourhood, never an address, and never anywhere near home. Turning this off forgets every place already saved.
              </span>
            </span>
            <button
              role="switch"
              aria-checked={p.usePlaces !== false}
              aria-label="Name the place"
              className={p.usePlaces !== false ? "switch on" : "switch"}
              onClick={() => save({ usePlaces: p.usePlaces === false }, p.usePlaces === false ? "On. New conversations get a place." : "Off. Every saved place is forgotten.")}
            >
              <span className="switch-knob" />
            </button>
          </li>
        </ul>
      </section>

      <section>
        <p className="eyebrow">Your Bee and your data</p>
        <p>
          Everything Rhubarb holds is on {where.hosted ? where.name : "this computer"}. See what it has, and forget any of it, on the <Link to="/privacy">privacy page</Link>. To connect a different Bee, run <code>bee login</code> {where.hosted ? "on the server" : "in a terminal"} and restart Rhubarb.
        </p>
      </section>

      <Toast toast={toast} onDone={() => setToast(null)} ms={3000} />
    </div>
  );
}
