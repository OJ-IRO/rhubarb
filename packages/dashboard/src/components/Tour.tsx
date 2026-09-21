import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const KEY = "rhubarb.tour.v1";

interface Step {
  /** matches a data-tour attribute; the step points at that element when it is on screen */
  target: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { target: "listening", title: "It listens through your Bee", body: "This light tells you whether Rhubarb can hear your Bee right now. If it ever says it can't, nothing is being captured." },
  { target: "nav-board", title: "You decide what's worth learning", body: "The board ranks what your days have asked of you, with the moments that put each skill there. Say yes to one, or set it aside." },
  { target: "nav-today", title: "A lesson, then out loud", body: "Lessons are built from your own conversations. Then your phone buzzes, you explain the idea into your Bee, and you get feedback the same way." },
  { target: "nav-honeycomb", title: "It hears you get better", body: "When a later conversation shows you using a skill for real, that counts. The comb fills as you climb." },
  { target: "nav-privacy", title: "Yours to forget", body: "Everything stays on this computer. The privacy page shows what's held and lets you forget a moment, a day, or all of it." },
];

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "done";
  } catch {
    return true; // no storage, no nagging
  }
}

export function resetTour(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to reset */
  }
}

/** A five-card walk through the loop for someone opening Rhubarb cold. Skippable, and it never blocks the page. */
export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const step = STEPS[i];

  const finish = useCallback(() => {
    try {
      localStorage.setItem(KEY, "done");
    } catch {
      /* fine */
    }
    onClose();
  }, [onClose]);

  useLayoutEffect(() => {
    const place = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      setBox(r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    // The thing being pointed at can change size after we measure it: the listening light starts
    // as "Checking on your Bee" and then becomes a longer line. Follow it.
    const ro = new ResizeObserver(place);
    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (target) ro.observe(target);
    ro.observe(document.body);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const last = i === STEPS.length - 1;
  return (
    <>
      {box && <div className="tour-ring" style={{ top: box.top - 5, left: box.left - 5, width: box.width + 10, height: box.height + 10 }} aria-hidden="true" />}
      <aside className="tour" role="dialog" aria-label="A quick look around">
        <p className="eyebrow">
          <span>
            {i + 1} of {STEPS.length}
          </span>
        </p>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="actions">
          <button className="primary small" autoFocus onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? "Got it" : "Next"}
          </button>
          {i > 0 && (
            <button className="ghost small" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <span className="spacer" />
          {!last && (
            <button className="ghost small" onClick={finish}>
              Skip
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
