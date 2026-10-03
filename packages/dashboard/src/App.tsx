import { useEffect, useState } from "react";
import { api, isPreview, type Profile } from "./api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrandMark, Loading } from "./components/Hex";
import { ListeningLight } from "./components/Listening";
import { Tour, resetTour, tourSeen } from "./components/Tour";
import { History } from "./pages/History";
import { Learning } from "./pages/Learning";
import { Settings } from "./pages/Settings";
import { LessonPage } from "./pages/Lesson";
import { Onboarding } from "./pages/Onboarding";
import { SkillPage } from "./pages/Skill";
import { Sparks } from "./pages/Sparks";
import { Today } from "./pages/Today";
import { Link, go, match, useRoute } from "./router";

const NAV = [
  ["/", "Your day"],
  ["/learning", "Learning"],
  ["/sparks", "Sparks"],
  ["/history", "Looking back"],
] as const;

function titleFor(path: string): string {
  if (path === "/learning" || path === "/board" || path === "/honeycomb") return "Learning";
  if (path === "/sparks") return "Sparks";
  if (path === "/welcome") return "Set up";
  if (path === "/settings") return "Settings";
  if (path.startsWith("/history")) return "Looking back";
  if (path === "/privacy") return "Settings";
  if (path === "/evidence") return "Looking back";
  if (path.startsWith("/lessons")) return "Lesson";
  if (path.startsWith("/skills")) return "Skill";
  if (path.startsWith("/day/")) return "Your day";
  return "Your day";
}

/** Shown when the page loads but the Rhubarb service behind it isn't answering. */
function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="shell offline">
      <p className="brand">
        <BrandMark size={30} /> Rhubarb
      </p>
      <h1 className="title">Rhubarb isn't running yet.</h1>
      <p className="muted lead">This page is only the window. The part that listens to your Bee runs in the background, and it isn't answering.</p>
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
  // Old addresses still land somewhere sensible: the board and honeycomb are Learning now,
  // evidence lives in Looking back, privacy in Settings.
  else if (route.path === "/learning" || route.path === "/board" || route.path === "/honeycomb") page = <Learning />;
  else if (route.path === "/sparks") page = <Sparks />;
  else if (route.path === "/privacy") page = <Settings />;
  else if (route.path === "/evidence") page = <History />;
  else if (route.path === "/history") page = <History />;
  else if ((params = match("/history/:day", route.path))) page = <History day={params.day} />;
  else if ((params = match("/day/:day", route.path))) page = <Today day={params.day} />;
  else if (route.path === "/settings") page = <Settings />;
  else if ((params = match("/skills/:id", route.path))) page = <SkillPage id={Number(params.id)} />;
  else if ((params = match("/lessons/:id", route.path))) page = <LessonPage id={Number(params.id)} />;
  else page = <Today />;

  return (
    <div className={preview ? "frame preview" : "frame"}>
      {preview && (
        <div className="preview-banner">
          {import.meta.env.VITE_DEMO ? (
            <>
              Demo: one made-up week of sample content. The real Rhubarb runs privately on your own machine. <a href="https://github.com/OJ-IRO/rhubarb">Source and setup</a>
            </>
          ) : (
            <>
              Preview: sample content, not your data. <a href="#/">Back to the live app</a>
            </>
          )}
        </div>
      )}
      <nav className="side">
        <Link to="/" className="brand">
          <BrandMark /> Rhubarb
        </Link>
        {NAV.map(([to, label]) => (
          <Link key={to} to={to} className={route.path === to || (to === "/history" && (route.path.startsWith("/history/") || route.path === "/evidence")) || (to === "/learning" && (route.path === "/board" || route.path === "/honeycomb")) || (to === "/" && route.path.startsWith("/day/")) ? "navlink active" : "navlink"} tour={`nav-${label.toLowerCase()}`}>
            {label}
          </Link>
        ))}
        {(preview || route.path.startsWith("/lessons")) && (
          <Link to={preview ? "/lessons/1" : route.path} className={route.path.startsWith("/lessons") ? "navlink active small" : "navlink small"}>
            {preview ? "Sample lesson" : "This lesson"}
          </Link>
        )}
        <div className="side-foot">
          <ListeningLight />
          <Link to={profile ? "/settings" : "/welcome"} className={route.path === "/settings" || route.path === "/welcome" || route.path === "/privacy" ? "navlink active small" : "navlink small"}>
            {profile ? "Settings" : "Set up"}
          </Link>
        </div>
      </nav>
      <main className="shell">
        <ErrorBoundary key={route.path}>{page}</ErrorBoundary>
      </main>
      {touring && <Tour onClose={() => setTouring(false)} />}
      {!touring && (
        <button
          className="help-tab"
          onClick={() => {
            resetTour();
            setTouring(true);
          }}
        >
          New here?
        </button>
      )}
    </div>
  );
}
