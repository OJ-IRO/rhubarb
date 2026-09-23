import { useState } from "react";
import { HexLevels } from "../components/Hex";
import { api, type Profile } from "../api";

export const STYLES: Array<{ id: Profile["style"]; name: string; blurb: string }> = [
  { id: "story", name: "Tell me a story", blurb: "A situation unfolds, the idea becomes necessary, you watch it work." },
  { id: "hands-on", name: "Let me try it", blurb: "Short explanation, then something to do right away, then what to notice." },
  { id: "socratic", name: "Ask me questions", blurb: "You think first, then the answer. Builds from what you already half-know." },
  { id: "structured", name: "Give it to me straight", blurb: "The idea, why it matters, how it works, where it breaks." },
  { id: "analogy", name: "Compare it to something", blurb: "One strong analogy carried all the way through, then where it stops holding." },
];

export const WINDOWS = ["weekday mornings on the commute", "over lunch", "evenings after dinner", "Sunday mornings"];
const OTHER = "other";

/** The saved value is plain text ("over lunch, Sunday mornings, Fridays at 4"). Split it back into picks and an "other" part. */
export function splitWindows(saved: string): { picks: string[]; other: string } {
  const parts = saved.split(",").map((s) => s.trim()).filter(Boolean);
  const picks = parts.filter((p) => WINDOWS.includes(p));
  const other = parts.filter((p) => !WINDOWS.includes(p)).join(", ");
  return { picks, other };
}

/** A short list you build one entry at a time. Enter or Add puts it in; each entry has its own remove. */
export function ListInput({ items, onChange, placeholder, addLabel }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!items.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="listinput">
      {items.length > 0 && (
        <ul className="chips added" aria-label="Added so far">
          {items.map((it) => (
            <li key={it} className="chip on">
              <span>{it}</span>
              <button type="button" className="chip-x" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="listinput-row">
        <input
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <button type="button" disabled={!draft.trim()} onClick={add}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}

export function Onboarding({ onDone, initial }: { onDone: (p: Profile) => void; initial: Profile | null }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name ?? "");
  const [style, setStyle] = useState<Profile["style"]>(initial?.style ?? "story");
  const [minutes, setMinutes] = useState<Profile["sessionMinutes"]>(initial?.sessionMinutes ?? 10);
  const saved = splitWindows(initial?.learningWindows ?? "");
  const [picks, setPicks] = useState<string[]>(saved.picks);
  const [otherOn, setOtherOn] = useState(saved.other.length > 0);
  const [other, setOther] = useState(saved.other);
  const windows = [...picks, ...(otherOn ? [other.trim()] : [])].filter(Boolean).join(", ");
  const [goals, setGoals] = useState<string[]>(initial?.goals ?? []);
  const [offLimits, setOffLimits] = useState<string[]>(initial?.offLimits ?? []);
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    const p: Profile = {
      name: name.trim() || "you",
      style,
      sessionMinutes: minutes,
      learningWindows: windows,
      goals,
      offLimits,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      onboardedAt: initial?.onboardedAt ?? null,
    };
    const saved = await api.saveProfile(p);
    setSaving(false);
    onDone(saved);
  }

  const steps = [
    <section key="name" className="ask">
      <h2>First, what's your name?</h2>
      <p className="muted">It stays on this page. Everywhere else, Rhubarb just says "you."</p>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="given-name" />
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
      <div className="chips" role="group" aria-label="When you have time">
        {WINDOWS.map((w) => {
          const on = picks.includes(w);
          return (
            <button key={w} className={on ? "chip on" : "chip"} aria-pressed={on} onClick={() => setPicks((v) => (on ? v.filter((x) => x !== w) : [...v, w]))}>
              {w}
            </button>
          );
        })}
        <button className={otherOn ? "chip on" : "chip"} aria-pressed={otherOn} onClick={() => setOtherOn(!otherOn)}>
          {OTHER}
        </button>
      </div>
      {otherOn && <textarea autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="Fridays at 4, or whenever the kids are down" rows={2} aria-label="Other times" />}
      {!windows && <p className="muted small">Pick nothing and nudges come whenever a lesson is ready.</p>}
    </section>,
    <section key="goals" className="ask">
      <h2>Anything you already know you want to get better at?</h2>
      <p className="muted">Rhubarb will listen for these specifically. Leave it empty and it will work from what it hears.</p>
      <ListInput items={goals} onChange={setGoals} placeholder="public speaking, or reading a balance sheet" addLabel="Add" />
    </section>,
    <section key="off" className="ask">
      <h2>Anything Rhubarb should never touch?</h2>
      <p className="muted">Topics it hears but must not turn into lessons or keep notes about.</p>
      <ListInput items={offLimits} onChange={setOffLimits} placeholder="my health, or family finances" addLabel="Add" />
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
