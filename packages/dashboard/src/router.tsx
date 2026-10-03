import { useEffect, useState } from "react";
import { isPreview } from "./api";

export interface Route {
  /** path with any "/preview" prefix removed */
  path: string;
}

const PREFIX = "/preview";

function parse(): Route {
  let hash = window.location.hash.replace(/^#/, "") || "/";
  hash = hash.split("?")[0];
  if (hash.startsWith(PREFIX)) hash = hash.slice(PREFIX.length) || "/";
  return { path: hash };
}

/** Tiny hash router. Preview mode is a URL prefix that every link preserves. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const a = path.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

/** In the public demo build every link stays inside the sample week. */
const DEMO = Boolean(import.meta.env.VITE_DEMO);

export function href(path: string): string {
  const inPreview = isPreview() || DEMO;
  return `#${inPreview ? PREFIX : ""}${path === "/" && inPreview ? "/" : path}`;
}

export function go(path: string): void {
  window.location.hash = href(path).slice(1);
}

export function Link({ to, children, className, tour }: { to: string; children: React.ReactNode; className?: string; tour?: string }) {
  return (
    <a href={href(to)} className={className} data-tour={tour}>
      {children}
    </a>
  );
}

/**
 * Make a whole card open a page when clicked anywhere, not just on its title text. Clicks on the
 * card's own buttons, links and fields still do their own thing.
 */
export function cardClick(path: string) {
  return {
    onClick: (e: { target: EventTarget | null }) => {
      if ((e.target as HTMLElement | null)?.closest("button, a, input, textarea, select, label, [data-noclick]")) return;
      go(path);
    },
    role: "link" as const,
    tabIndex: 0,
    onKeyDown: (e: { key: string; target: EventTarget | null }) => {
      if (e.key === "Enter" && e.target === (e as unknown as { currentTarget: EventTarget }).currentTarget) go(path);
    },
  };
}
