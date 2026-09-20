import { useState } from "react";
import { HexLevels } from "../components/Hex";
import { api, type Profile } from "../api";

const STYLES: Array<{ id: Profile["style"]; name: string; blurb: string }> = [
  { id: "story", name: "Tell me a story", blurb: "A situation unfolds, the idea becomes necessary, you watch it work." },
  { id: "hands-on", name: "Let me try it", blurb: "Short explanation, then something to do right away, then what to notice." },
  { id: "socratic", name: "Ask me questions", blurb: "You think first, then the answer. Builds from what you already half-know." },
  { id: "structured", name: "Give it to me straight", blurb: "The idea, why it matters, how it works, where it breaks." },
  { id: "analogy", name: "Compare it to something", blurb: "One strong analogy carried all the way through, then where it stops holding." },
];

const WINDOWS = ["weekday mornings on the commute", "over lunch", "evenings after dinner", "Sunday mornings"];

export function Onboarding({ onDone, initial }: { onDone: (p: Profile) => void; initial: Profile | null }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name ?? "");
  const [style, setStyle] = useState<Profile["style"]>(initial?.style ?? "story");
  const [minutes, setMinutes] = useState<Profile["sessionMinutes"]>(initial?.sessionMinutes ?? 10);
  const [windows, setWindows] = useState(initial?.learningWindows ?? "");
  const [goals, setGoals] = useState((initial?.goals ?? []).join("\n"));
  const [offLimits, setOffLimits] = useState((initial?.offLimits ?? []).join("\n"));
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    const p: Profile = {
      name: name.trim() || "you",
      style,
      sessionMinutes: minutes,
      learningWindows: windows,
      goals: goals.split("\n").map((s) => s.trim()).filter(Boolean),
      offLimits: offLimits.split("\n").map((s) => s.trim()).filter(Boolean),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      onboardedAt: initial?.onboardedAt ?? null,
    };
    const saved = await api.saveProfile(p);
    setSaving(false);
    onDone(saved);
  }

  const steps = [
    <section key="name" className="ask">
      <h2>First, what should I call you?</h2>
      <p className="muted">Your Bee already knows. This is just how the lessons will address you.</p>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Jay" />
    </section>,
    <section key="style" className="ask">
      <h2>How do you like to be taught?</h2>
      <p className="muted">Pick the one that sounds like the teacher you actually learned from. You can change it later.</p>
      <div className="choices">
        {STYLES.map((s) => (
          <button key={s.id} className={style === s.id ? "choice on" : "choice"} onClick={() => setStyle(s.id)}>
            <strong>{s.name}</strong>
            <span>{s.blurb}</span>
          </button>
        ))}
      </div>
    </section>,
    <section key="minutes" className="ask">
      <h2>How long is a session?</h2>
      <p className="muted">Lessons are written to fit. Shorter is fine; your Bee carries the practice anyway.</p>
      <div className="choices row">
        {([5, 10, 20] as const).map((m) => (
          <button key={m} className={minutes === m ? "choice on" : "choice"} onClick={() => setMinutes(m)}>
            <strong>{m} minutes</strong>
          </button>
        ))}
      </div>
    </section>,
    <section key="when" className="ask">
      <h2>When do you actually have the time?</h2>
      <p className="muted">Lesson nudges land then, not in the middle of a meeting. Say it however you'd say it to a person.</p>
      <div className="chips">
        {WINDOWS.map((w) => (
          <button key={w} className="chip" onClick={() => setWindows((v) => (v ? `${v}, ${w}` : w))}>
            {w}
          </button>
        ))}
      </div>
      <textarea value={windows} onChange={(e) => setWindows(e.target.value)} placeholder="weekday evenings after 8, and Sunday mornings" rows={2} />
    </section>,
    <section key="goals" className="ask">
      <h2>Anything you already know you want to get better at?</h2>
      <p className="muted">One per line. Rhubarb will listen for these specifically. Leave it empty and it will work from what it hears.</p>
      <textarea value={goals} onChange={(e) => setGoals(e.target.value)} placeholder={"public speaking\nSpanish\nreading a balance sheet"} rows={4} />
    </section>,
    <section key="off" className="ask">
      <h2>Anything Rhubarb should never touch?</h2>
      <p className="muted">Topics it hears but must not turn into lessons or keep notes about. One per line.</p>
      <textarea value={offLimits} onChange={(e) => setOffLimits(e.target.value)} placeholder={"my health\nfamily finances"} rows={3} />
    </section>,
  ];

  const last = step === steps.length - 1;
  return (
    <div className="onboarding">
      <p className="eyebrow">
        <HexLevels level={step} total={steps.length} size={15} />
        <span>
          {step + 1} of {steps.length}
        </span>
      </p>
      {steps[step]}
      <div className="actions">
        {step > 0 && (
          <button className="ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {last ? (
          <button className="primary" disabled={saving} onClick={finish}>
            {saving ? "Saving…" : "Start listening"}
          </button>
        ) : (
          <button className="primary" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}
