const UA = "Rhubarb/0.1 (open-source learning app; github.com/jdesai840/rhubarb)";
const TIMEOUT_MS = 6000;

async function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/** True if the URL answers 2xx/3xx to HEAD (or GET when HEAD is refused). */
export async function urlAlive(url: string): Promise<boolean> {
  if (!/^https?:\/\//.test(url)) return false;
  try {
    let res = await withTimeout(fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": UA } }));
    if (res.status === 405 || res.status === 403) res = await withTimeout(fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA, Range: "bytes=0-0" } }));
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

export interface ResolvedImage {
  url: string;
  credit: string;
}

interface CommonsPage {
  title: string;
  imageinfo?: Array<{ thumburl?: string; url?: string; thumbwidth?: number; thumbheight?: number }>;
}

/** Wikimedia Commons file search, no key required. Returns a ~1200px thumbnail. */
async function commonsImage(query: string): Promise<ResolvedImage | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: "6",
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: "1200",
    format: "json",
  });
  try {
    const res = await withTimeout(fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": UA } }));
    if (!res.ok) return null;
    const data = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
    const pages = Object.values(data.query?.pages ?? {});
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      const raw = ii?.thumburl ?? ii?.url;
      if (!raw) continue;
      const url = raw.split("?")[0];
      if (!/\.(jpe?g|png|webp)$/i.test(url)) continue;
      if ((ii?.thumbwidth ?? 0) > 0 && (ii?.thumbwidth ?? 0) < 400) continue;
      if (await urlAlive(url)) return { url, credit: `Wikimedia Commons, ${p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "")}` };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Tavily image search when a key is present (usually better topical matches than Commons). */
async function tavilyImage(query: string): Promise<ResolvedImage | null> {
  if (!process.env.TAVILY_API_KEY) return null;
  // Image queries come from the model too. A picture subject is a few words; anything longer is not one.
  if (query.length > 80) return null;
  try {
    const res = await withTimeout(
      fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, include_images: true, max_results: 3 }),
      })
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { images?: Array<string | { url: string; description?: string }> };
    for (const img of data.images ?? []) {
      const url = typeof img === "string" ? img : img.url;
      if (await urlAlive(url)) return { url, credit: new URL(url).hostname };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function resolveImage(query: string): Promise<ResolvedImage | null> {
  return (await tavilyImage(query)) ?? (await commonsImage(query));
}

const MERMAID_KINDS = /^(flowchart|graph|sequenceDiagram|stateDiagram(-v2)?|classDiagram|journey|timeline|mindmap)\b/;

/** Strip fences and reject anything that isn't a diagram we render. */
export function sanitizeMermaid(code: string): string | null {
  const cleaned = code
    .replace(/^```(mermaid)?\s*/i, "")
    .replace(/```\s*$/, "")
    .replace(/%%\{.*?\}%%/gs, "")
    .trim();
  return MERMAID_KINDS.test(cleaned) ? cleaned : null;
}
