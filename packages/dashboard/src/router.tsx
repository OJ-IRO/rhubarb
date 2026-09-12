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

export function href(path: string): string {
  return `#${isPreview() ? PREFIX : ""}${path === "/" && isPreview() ? "/" : path}`;
}

export function go(path: string): void {
  window.location.hash = href(path).slice(1);
}

export function Link({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href(to)} className={className}>
      {children}
    </a>
  );
}
