import { useEffect, useState } from "react";
import { api, isPreview, type Profile } from "./api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrandMark, Loading } from "./components/Hex";
import { ListeningLight } from "./components/Listening";
import { Tour, resetTour, tourSeen } from "./components/Tour";
import { Board } from "./pages/Board";
import { Evidence } from "./pages/Evidence";
import { Honeycomb } from "./pages/Honeycomb";
import { LessonPage } from "./pages/Lesson";
import { Onboarding } from "./pages/Onboarding";
import { Privacy } from "./pages/Privacy";
import { SkillPage } from "./pages/Skill";
import { Sparks } from "./pages/Sparks";
import { Today } from "./pages/Today";
import { Link, go, match, useRoute } from "./router";

const NAV = [
  ["/", "Today"],
  ["/board", "Board"],
  ["/sparks", "Sparks"],
  ["/honeycomb", "Honeycomb"],
  ["/evidence", "Evidence"],
] as const;

function titleFor(path: string): string {
  if (path === "/board") return "The board";
  if (path === "/sparks") return "Sparks";
  if (path === "/honeycomb") return "Honeycomb";
  if (path === "/welcome") return "Settings";
  if (path === "/privacy") return "Privacy and safety";
  if (path === "/evidence") return "Evidence";
  if (path.startsWith("/lessons")) return "Lesson";
  if (path.startsWith("/skills")) return "Skill";
  return "Today";
}

/** Shown when the page loads but the Rhubarb service behind it isn't answering. */
function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="shell offline">
      <p className="brand">
        <BrandMark size={30} /> Rhubarb
      </p>
      <h1 className="title">Rhubarb isn't running yet.</h1>
      <p className="muted lead">This page is only the window. The part that listens to your Bee runs in the background on this computer, and it isn't answering.</p>
      <ol className="offline-steps">
        <li>
          Open a terminal in your Rhubarb folder and run <code>./scripts/start.sh</code>
        </li>
        <li>Give it a few seconds, then try again.</li>
      </ol>
      <div className="actions">
        <button className="primary" onClick={onRetry}>
          Try again
        </button>
        <a className="button" href="#/preview/">
          Look around with sample content
        </a>
      </div>
      <p className="muted small">First time here? It needs a paired Bee and AWS access before it can start. The README walks through both.</p>
    </main>
  );
}

export function App() {
  const route = useRoute();
  const preview = isPreview();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  // "No profile yet" and "can't reach Rhubarb" are different problems. Treating a failed request
  // as a missing profile used to send people into onboarding, which then could not save.
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The look-around runs once, for someone who has a profile (or is in the preview) and hasn't seen it.
  const [touring, setTouring] = useState(false);
  useEffect(() => {
    if ((preview || profile) && !tourSeen()) setTouring(true);
  }, [preview, profile]);

  useEffect(() => {
    let cancelled = false;
    api
      .profile()
      .then((p) => {
        if (cancelled) return;
        setOffline(false);
        setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, [preview, attempt]);

  useEffect(() => {
    if (!preview && !offline && profile === null && route.path !== "/welcome") go("/welcome");
  }, [profile, route.path, preview, offline]);

  // A hash change doesn't reset scroll, so a new page used to open halfway down.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  useEffect(() => {
    document.title = `${titleFor(route.path)} · Rhubarb`;
  }, [route.path]);

  if (offline && !preview) return <Offline onRetry={() => setAttempt((n) => n + 1)} />;
  if (profile === undefined)
    return (
      <main className="shell">
        <Loading />
      </main>
    );

  let page: React.ReactNode;
  let params: Record<string, string> | null;
  if (route.path === "/welcome") page = <Onboarding onDone={(p) => { setProfile(p); go("/"); }} initial={profile} />;
  else if (route.path === "/board") page = <Board />;
  else if (route.path === "/sparks") page = <Sparks />;
  else if (route.path === "/honeycomb") page = <Honeycomb />;
  else if (route.path === "/privacy") page = <Privacy />;
  else if (route.path === "/evidence") page = <Evidence />;
  else if ((params = match("/skills/:id", route.path))) page = <SkillPage id={Number(params.id)} />;
  else if ((params = match("/lessons/:id", route.path))) page = <LessonPage id={Number(params.id)} />;
  else page = <Today />;

  return (
    <div className={preview ? "frame preview" : "frame"}>
      {preview && (
        <div className="preview-banner">
          Preview: sample content, not your data. <a href="#/">Back to the live app</a>
        </div>
      )}
      <nav className="side">
        <Link to="/" className="brand">
          <BrandMark /> Rhubarb
        </Link>
        {NAV.map(([to, label]) => (
          <Link key={to} to={to} className={route.path === to ? "navlink active" : "navlink"} tour={`nav-${label.toLowerCase()}`}>
            {label}
          </Link>
        ))}
        <Link to="/lessons/1" className={route.path.startsWith("/lessons") ? "navlink active small" : "navlink small"}>
          {preview ? "Sample lesson" : "Current lesson"}
        </Link>
        <div className="side-foot">
          <ListeningLight />
          <Link to="/privacy" className={route.path === "/privacy" ? "navlink active small" : "navlink small"} tour="nav-privacy">
            Privacy
          </Link>
          <Link to="/welcome" className={route.path === "/welcome" ? "navlink active small" : "navlink small"}>
            {profile ? "Settings" : "Set up"}
          </Link>
          <button
            className="navlink small linklike"
            onClick={() => {
              resetTour();
              setTouring(true);
            }}
          >
            Show me around
          </button>
          {!preview && (
            <a href="#/preview/board" className="navlink small">
              Design preview
            </a>
          )}
        </div>
      </nav>
      <main className="shell">
        <ErrorBoundary key={route.path}>{page}</ErrorBoundary>
      </main>
      {touring && route.path !== "/welcome" && <Tour onClose={() => setTouring(false)} />}
    </div>
  );
}
