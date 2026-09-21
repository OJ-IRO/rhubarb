import { useEffect, useState } from "react";
import { api, type Listening } from "../api";

const FRESH_MS = 10 * 60_000;

function ago(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const days = Math.round(hr / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function describe(l: Listening | null, now: number): { tone: "live" | "quiet" | "wait" | "down"; line: string; detail: string } {
  if (!l) return { tone: "wait", line: "Checking on your Bee", detail: "Asking Rhubarb whether it can hear your Bee." };
  if (l.state === "down") return { tone: "down", line: "Can't hear your Bee", detail: "The connection dropped and Rhubarb is trying again. If it stays like this, check that your Bee is on and that the Bee proxy is running." };
  if (l.state === "connecting") return { tone: "wait", line: "Connecting to your Bee", detail: "This takes a few seconds after Rhubarb starts." };
  if (l.lastHeardAt === null) return { tone: "quiet", line: "Connected, nothing heard yet", detail: "Rhubarb is connected. Say something near your Bee and this will change within a minute." };
  const since = now - l.lastHeardAt;
  if (since <= FRESH_MS) return { tone: "live", line: `Listening · heard you ${ago(since)}`, detail: "Your Bee is connected and Rhubarb is hearing it." };
  return { tone: "quiet", line: `Connected · quiet since ${ago(since)}`, detail: "Connected, but nothing has been said for a while. Bee also stops recording after a stretch of silence." };
}

/**
 * Whether Rhubarb can hear the Bee right now. A product built on listening has to show that it
 * is listening, and has to say so plainly when it isn't.
 */
export function ListeningLight() {
  const [l, setL] = useState<Listening | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .status()
        .then((s) => live && setL(s.listening))
        .catch(() => live && setL({ state: "down", lastHeardAt: null, since: Date.now() }));
    void load();
    const poll = setInterval(load, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      live = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const d = describe(l, now);
  return (
    <p className={`listening ${d.tone}`} title={d.detail} data-tour="listening" role="status">
      <span className="listening-dot" aria-hidden="true" />
      <span>{d.line}</span>
    </p>
  );
}
