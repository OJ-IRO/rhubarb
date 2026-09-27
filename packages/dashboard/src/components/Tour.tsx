import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const KEY = "rhubarb.tour.v1";

interface Step {
  /** the page this step is about; the tour opens it */
  path: string;
  /** matches a data-tour attribute on that page; the ring points at it when it is on screen */
  target: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { path: "/", target: "listening", title: "It listens through your Bee", body: "What you're about to see is sample content: one made-up week, so you can see what a full Rhubarb looks like. Yours fills in as it hears you. This light says whether it can hear your Bee right now." },
  { path: "/board", target: "board-top", title: "You decide what's worth learning", body: "This is the board. It ranks what your days have asked of you, with the moments that put each skill there. Say yes to one, or set it aside." },
  { path: "/lessons/1", target: "lesson-stage", title: "A lesson, then out loud", body: "Lessons are built from your own conversations, a card at a time. Then your phone buzzes, you explain the idea into your Bee, and you get feedback the same way." },
  { path: "/evidence", target: "evidence-top", title: "It hears you get better", body: "When a later conversation shows you using a skill for real, that counts. This page keeps the score, in numbers you can check." },
  { path: "/privacy", target: "privacy-top", title: "Yours to forget", body: "Everything stays on your own machine, never with a company. This page shows what's held, what Rhubarb refuses to learn from, and lets you forget a moment, a day, or all of it." },
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
  const [from] = useState(() => window.location.hash || "#/");
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  // The ring glides when the step changes and snaps while you scroll. Gliding during a scroll
  // makes it lag its target and wobble.
  const [gliding, setGliding] = useState(true);
  const step = STEPS[i];

  const finish = useCallback(() => {
    try {
      localStorage.setItem(KEY, "done");
    } catch {
      /* fine */
    }
    onClose();
    // Back to where they were: their own app, or the preview's Today if they were already looking around.
    window.location.hash = from.startsWith("#/preview") ? "#/preview/" : "#/";
  }, [onClose, from]);

  // Each step opens the page it describes, in the sample content. Pointing at a real app that is
  // still empty taught nothing, and pointed at a lesson that did not exist yet.
  useEffect(() => {
    window.location.hash = `#/preview${step.path === "/" ? "/" : step.path}`;
  }, [step.path]);

  // Where the card sits: in whichever direction from the target has the most room, so it never
  // covers the thing it is pointing at. A target that fills the screen leaves the bottom-right corner.
  const [side, setSide] = useState<"bottom" | "top" | "right" | "corner">("bottom");

  useLayoutEffect(() => {
    // Each step brings its target into view once. Not on every scroll: that would fight the reader.
    let scrolled = false;
    const place = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) return setBox(null);
      let r = el.getBoundingClientRect();
      if (r.width === 0) return setBox(null);
      // Instant, not smooth: the page's own scroll reset on arrival would cancel a smooth scroll, and
      // the ring has to be measured after the move. Tall targets are aligned to their top edge.
      const offscreen = r.top < 60 || r.bottom > window.innerHeight - 60;
      if (offscreen && !scrolled) {
        scrolled = true;
        const tall = r.height > window.innerHeight * 0.6;
        el.scrollIntoView({ block: tall ? "start" : "center", behavior: "auto" });
        if (tall) window.scrollBy(0, -88); // room for the page header above a tall target
        r = el.getBoundingClientRect();
      }
      const room = { top: r.top, bottom: window.innerHeight - r.bottom, right: window.innerWidth - r.right };
      const need = { top: 300, bottom: 300, right: 420 };
      const fits = (["bottom", "top", "right"] as const).filter((k) => room[k] >= need[k]);
      setSide(fits.length ? fits.reduce((a, b) => (room[a] / need[a] >= room[b] / need[b] ? a : b)) : "corner");
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    setGliding(true);
    place();
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      setGliding(false);
      place();
      clearTimeout(settle);
      settle = setTimeout(() => setGliding(true), 200);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    // The thing being pointed at can change size after we measure it: the listening light starts
    // as "Checking on your Bee" and then becomes a longer line. Follow it.
    const ro = new ResizeObserver(place);
    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (target) ro.observe(target);
    ro.observe(document.body);
    // The page is still arriving when the step changes, so look again for a moment after.
    const again = [150, 400, 900, 1600].map((ms) => setTimeout(place, ms));
    return () => {
      again.forEach(clearTimeout);
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      clearTimeout(settle);
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
      {box && <div className={gliding ? "tour-ring" : "tour-ring snap"} style={{ top: box.top - 5, left: box.left - 5, width: box.width + 10, height: box.height + 10 }} aria-hidden="true" />}
      <aside className={`tour ${side}`} role="dialog" aria-label="A quick look around">
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
