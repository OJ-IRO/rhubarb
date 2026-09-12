import { useEffect, useState } from "react";
import { api, type SkillRow } from "../api";
import { go } from "../router";

const R = 52; // hex radius

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/** Spiral hex layout: first cell in the middle, then rings outward. */
function positions(n: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  const w = Math.sqrt(3) * R;
  const dirs = [
    [w / 2, -1.5 * R],
    [-w / 2, -1.5 * R],
    [-w, 0],
    [-w / 2, 1.5 * R],
    [w / 2, 1.5 * R],
    [w, 0],
  ];
  for (let ring = 1; out.length < n; ring++) {
    let x = w * ring;
    let y = 0;
    for (let side = 0; side < 6 && out.length < n; side++) {
      for (let step = 0; step < ring && out.length < n; step++) {
        out.push({ x, y });
        x += dirs[side][0];
        y += dirs[side][1];
      }
    }
  }
  return out;
}

export function Honeycomb() {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [hover, setHover] = useState<SkillRow | null>(null);
  useEffect(() => {
    api.skills().then(setSkills);
  }, []);
  if (!skills) return null;

  const cells = [...skills].sort((a, b) => (a.status === "proposed" ? 1 : 0) - (b.status === "proposed" ? 1 : 0) || b.priority - a.priority);
  const pos = positions(Math.max(cells.length, 1));
  const size = 2 * R * (1 + Math.ceil(Math.sqrt(cells.length))) + R;

  return (
    <div>
      <h1 className="title">Honeycomb</h1>
      <p className="muted lead">One cell per skill. It fills as you climb the ladder, and it fills faster when Waggle hears you use the skill for real.</p>
      {cells.length === 0 && <p className="muted">Empty comb. It fills from the board.</p>}
      <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="comb">
        {cells.map((s, i) => {
          const { x, y } = pos[i];
          const fill = s.status === "mastered" ? 1 : s.ladderLength ? s.level / s.ladderLength : 0;
          const clipId = `clip-${s.id}`;
          const top = y + R - 2 * R * fill;
          return (
            <g key={s.id} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} onClick={() => go(`/skills/${s.id}`)} style={{ cursor: "pointer" }}>
              <defs>
                <clipPath id={clipId}>
                  <polygon points={hexPoints(x, y, R - 3)} />
                </clipPath>
              </defs>
              <polygon points={hexPoints(x, y, R - 3)} className={s.status === "proposed" ? "cell proposed" : "cell"} />
              <rect x={x - R} y={top} width={2 * R} height={2 * R} className="honey" clipPath={`url(#${clipId})`} />
              <text x={x} y={y + 4} textAnchor="middle" className="cell-label">
                {s.name.length > 18 ? `${s.name.slice(0, 17)}…` : s.name}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <p className="muted">
          <strong>{hover.name}</strong> · {hover.status === "mastered" ? "mastered" : hover.status === "proposed" ? "waiting for your decision" : `level ${hover.level + 1} of ${hover.ladderLength || "?"}`}
        </p>
      )}
    </div>
  );
}
