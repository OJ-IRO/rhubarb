import { useEffect, useState } from "react";
import { api, isPreview, type Profile } from "./api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Board } from "./pages/Board";
import { Honeycomb } from "./pages/Honeycomb";
import { LessonPage } from "./pages/Lesson";
import { Onboarding } from "./pages/Onboarding";
import { SkillPage } from "./pages/Skill";
import { Sparks } from "./pages/Sparks";
import { Today } from "./pages/Today";
import { Link, go, match, useRoute } from "./router";

const NAV = [
  ["/", "Today"],
  ["/board", "Board"],
  ["/sparks", "Sparks"],
  ["/honeycomb", "Honeycomb"],
] as const;

export function App() {
  const route = useRoute();
  const preview = isPreview();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    api.profile().then(setProfile).catch(() => setProfile(null));
  }, [preview]);

  useEffect(() => {
    if (!preview && profile === null && route.path !== "/welcome") go("/welcome");
  }, [profile, route.path, preview]);

  if (profile === undefined) return <main className="shell" />;

  let page: React.ReactNode;
  let params: Record<string, string> | null;
  if (route.path === "/welcome") page = <Onboarding onDone={(p) => { setProfile(p); go("/"); }} initial={profile} />;
  else if (route.path === "/board") page = <Board />;
  else if (route.path === "/sparks") page = <Sparks />;
  else if (route.path === "/honeycomb") page = <Honeycomb />;
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
          <span className="mark">🐝</span> Rhubarb
        </Link>
        {NAV.map(([to, label]) => (
          <Link key={to} to={to} className={route.path === to ? "navlink active" : "navlink"}>
            {label}
          </Link>
        ))}
        <Link to="/lessons/1" className={route.path.startsWith("/lessons") ? "navlink active small" : "navlink small"}>
          {preview ? "Sample lesson" : "Current lesson"}
        </Link>
        <div className="side-foot">
          <Link to="/welcome" className="navlink small">
            {profile ? `Settings · ${profile.name}` : "Set up"}
          </Link>
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
    </div>
  );
}
