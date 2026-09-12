import { useEffect, useState } from "react";
import { api, type Profile } from "./api";
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
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    api.profile().then(setProfile).catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    if (profile === null && route.path !== "/welcome") go("/welcome");
  }, [profile, route.path]);

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
    <div className="frame">
      <nav className="side">
        <Link to="/" className="brand">
          <span className="mark">🐝</span> Waggle
        </Link>
        {NAV.map(([to, label]) => (
          <Link key={to} to={to} className={route.path === to ? "navlink active" : "navlink"}>
            {label}
          </Link>
        ))}
        <div className="side-foot">
          <Link to="/welcome" className="navlink small">
            {profile ? `Settings · ${profile.name}` : "Set up"}
          </Link>
        </div>
      </nav>
      <main className="shell">{page}</main>
    </div>
  );
}
