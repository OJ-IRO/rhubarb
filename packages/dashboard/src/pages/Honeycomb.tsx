import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { api, type SkillRow } from "../api";
import type { CombCell } from "../components/Comb3D";
import { Loading } from "../components/Hex";
import { hexSpiral } from "../lib/hexLayout";
import { Link, cardClick, go } from "../router";

// three.js is only fetched when someone opens this page. The import is started as soon as the
// app loads so it is usually cached by the time anyone clicks; and while it is still on its way
// the page shows the loader, not the flat comb, so the comb never appears to change shape.
const load3D = () => import("../components/Comb3D");
const Comb3D = lazy(load3D);
if (typeof window !== "undefined") {
  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => void load3D().catch(() => undefined));
}

const R = 52; // hex radius of the flat comb, in SVG units

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function fillOf(s: SkillRow): number {
  if (s.status === "mastered") return 1;
  return s.ladderLength ? Math.min(s.level / s.ladderLength, 1) : 0;
}

function standing(s: SkillRow): string {
  if (s.status === "mastered") return "mastered";
  if (s.status === "proposed") return "waiting for your decision";
  return `level ${s.level + 1} of ${s.ladderLength || "?"}`;
}

function canWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The comb drawn flat. Used when WebGL isn't available, and while the 3D comb loads. */
function FlatComb({ cells, skills, onHover }: { cells: CombCell[]; skills: Map<number, SkillRow>; onHover: (id: number | null) => void }) {
  const reach = Math.max(...cells.map((c) => Math.hypot(c.x, c.y)), 0) * R + R * 1.25;
  return (
    <svg viewBox={`${-reach} ${-reach} ${2 * reach} ${2 * reach}`} className="comb" role="img" aria-label="Your skills as a honeycomb">
      {cells.map((c) => {
        const x = c.x * R;
        const y = c.y * R;
        const clipId = `clip-${c.id}`;
        return (
          <g key={c.id} onMouseEnter={() => onHover(c.id)} onMouseLeave={() => onHover(null)} onClick={() => go(`/skills/${c.id}`)} style={{ cursor: "pointer" }}>
            <title>{`${c.name}: ${standing(skills.get(c.id)!)}`}</title>
            <defs>
              <clipPath id={clipId}>
                <polygon points={hexPoints(x, y, R - 3)} />
              </clipPath>
            </defs>
            <polygon points={hexPoints(x, y, R - 3)} className={c.waiting ? "cell proposed" : "cell"} />
            <rect x={x - R} y={y + R - 2 * R * c.fill} width={2 * R} height={2 * R} className="honey" clipPath={`url(#${clipId})`} />
            <text x={x} y={y + 7} textAnchor="middle" className="cell-num">
              {cells.indexOf(c) + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Honeycomb() {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [flat, setFlat] = useState(() => !canWebGL());

  useEffect(() => {
    api.skills().then(setSkills);
  }, []);

  // Skills you've taken on sit at the heart of the comb; ones waiting on a decision ring them.
  const ordered = useMemo(
    () => (skills ? skills.filter((s) => s.status !== "dismissed").sort((a, b) => (a.status === "proposed" ? 1 : 0) - (b.status === "proposed" ? 1 : 0) || b.priority - a.priority) : []),
    [skills]
  );
  const cells = useMemo<CombCell[]>(() => {
    const pos = hexSpiral(ordered.length, 1);
    return ordered.map((s, i) => ({ id: s.id, name: s.name, x: pos[i].x, y: pos[i].y, fill: fillOf(s), waiting: s.status === "proposed" }));
  }, [ordered]);
  const byId = useMemo(() => new Map(ordered.map((s) => [s.id, s])), [ordered]);
  // Round the comb out to a whole ring (1, 7, 19, 37 cells…) with faint empty cells.
  const ghosts = useMemo(() => {
    let ring = 0;
    while (1 + 3 * ring * (ring + 1) < ordered.length) ring++;
    const full = Math.max(1 + 3 * ring * (ring + 1), 7);
    return hexSpiral(full, 1).slice(ordered.length);
  }, [ordered.length]);

  if (!skills) return <Loading />;
  const flatComb = <FlatComb cells={cells} skills={byId} onHover={setHover} />;

  return (
    <div>
      <h1 className="title">Honeycomb</h1>
      <p className="muted lead">One cell per skill. It fills as you climb the ladder, and it fills faster when Rhubarb hears you use the skill for real.</p>
      {cells.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Empty comb.</strong> A cell appears for each skill you say yes to on the board, and fills with honey as you climb its levels. It fills faster when Rhubarb hears you use the skill for real.
          </p>
          <Link to="/board" className="button">
            Go to the board
          </Link>
        </div>
      ) : (
        <div className="comb-layout">
          <div className="comb-stage">
            {flat ? (
              flatComb
            ) : (
              <Suspense fallback={<Loading label="Building your comb" />}>
                <Comb3D cells={cells} ghosts={ghosts} hovered={hover} onHover={setHover} onOpen={(id) => go(`/skills/${id}`)} onFail={() => setFlat(true)} />
              </Suspense>
            )}
          </div>
          {/* The key: the full name of every cell, where you stand, and how full it is. */}
          <ol className="comb-key" aria-label="What each cell is">
            {ordered.map((s, i) => (
              <li
                key={s.id}
                className={["clickable", hover === s.id ? "on" : "", s.status === "proposed" ? "waiting" : ""].join(" ").trim()}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                {...cardClick(`/skills/${s.id}`)}
              >
                <span className="comb-key-num">{i + 1}</span>
                <span className="comb-key-body">
                  <Link to={`/skills/${s.id}`}>{s.name}</Link>
                  <span className="muted small">{standing(s)}</span>
                  <span className="comb-key-fill" aria-hidden="true">
                    <span style={{ width: `${Math.round(fillOf(s) * 100)}%` }} />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
