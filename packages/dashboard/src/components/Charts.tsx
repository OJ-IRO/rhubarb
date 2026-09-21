import { useEffect, useRef, useState } from "react";

/**
 * Two small charts, drawn at true pixel size so text never scales with the box.
 * One series each, so there is no legend: the heading names the series. Values are in ink, never
 * in the series colour. Every mark has a hover or focus tooltip, and each chart has a table behind it.
 */

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const shortDate = (at: number | string) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });

interface Tip {
  x: number;
  y: number;
  title: string;
  value: string;
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 70), Math.max(width - 70, 70));
  return (
    <div className="chart-tip" style={{ left, top: tip.y }} role="tooltip">
      <strong>{tip.value}</strong>
      <span>{tip.title}</span>
    </div>
  );
}

/** Spoken answers, scored 0 to 5, oldest on the left. */
export function ScoreLine({ points, label }: { points: Array<{ at: number; score: number }>; label: string }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const H = 210;
  const pad = { l: 28, r: 44, t: 14, b: 28 };
  const iw = Math.max(width - pad.l - pad.r, 10);
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (s: number) => pad.t + ih - (s / 5) * ih;
  const last = points.length - 1;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={label}>
          {[0, 1, 2, 3, 4, 5].map((s) => (
            <g key={s}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(s)} y2={y(s)} className="chart-grid" />
              <text x={pad.l - 8} y={y(s) + 4} textAnchor="end" className="chart-axis">
                {s}
              </text>
            </g>
          ))}
          {points.length > 1 && <polyline className="chart-line" points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")} />}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.score)} r={i === last ? 6 : 5} className="chart-dot" />
              {/* a bigger, invisible target so the dot is easy to hit */}
              <circle
                cx={x(i)}
                cy={y(p.score)}
                r={14}
                fill="transparent"
                tabIndex={0}
                aria-label={`${shortDate(p.at)}: ${p.score} of 5`}
                onMouseEnter={() => setTip({ x: x(i), y: y(p.score), title: shortDate(p.at), value: `${p.score} of 5` })}
                onMouseLeave={() => setTip(null)}
                onFocus={() => setTip({ x: x(i), y: y(p.score), title: shortDate(p.at), value: `${p.score} of 5` })}
                onBlur={() => setTip(null)}
              />
            </g>
          ))}
          {points.length > 0 && (
            <text x={x(last) + 12} y={y(points[last].score) + 5} className="chart-value">
              {points[last].score}
            </text>
          )}
          {points.length > 0 && (
            <>
              <text x={x(0)} y={H - 6} textAnchor="start" className="chart-axis">
                {shortDate(points[0].at)}
              </text>
              {points.length > 1 && (
                <text x={x(last)} y={H - 6} textAnchor="end" className="chart-axis">
                  {shortDate(points[last].at)}
                </text>
              )}
            </>
          )}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/** Real-world uses credited each week. */
export function WeekBars({ weeks, label }: { weeks: Array<{ weekStart: string; credited: number }>; label: string }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const H = 190;
  const pad = { l: 28, r: 12, t: 22, b: 28 };
  const iw = Math.max(width - pad.l - pad.r, 10);
  const ih = H - pad.t - pad.b;
  const max = Math.max(...weeks.map((w) => w.credited), 1);
  const top = Math.max(max, 3);
  const band = iw / Math.max(weeks.length, 1);
  const bw = Math.min(24, band * 0.6);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const weekOf = (s: string) => {
    const [yy, mm, dd] = s.split("-").map(Number);
    return new Date(yy, mm - 1, dd).getTime();
  };
  const peak = weeks.reduce((best, w, i) => (w.credited >= weeks[best].credited ? i : best), 0);

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={label}>
          {[0, top].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(v)} y2={y(v)} className="chart-grid" />
              <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="chart-axis">
                {v}
              </text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const cx = pad.l + band * i + band / 2;
            const h = Math.max(pad.t + ih - y(w.credited), w.credited > 0 ? 2 : 0);
            const title = `week of ${shortDate(weekOf(w.weekStart))}`;
            const value = `${w.credited} ${w.credited === 1 ? "use" : "uses"}`;
            const show = () => setTip({ x: cx, y: y(w.credited), title, value });
            return (
              <g key={w.weekStart}>
                {/* rounded at the data end, square on the baseline */}
                {h > 0 && <path className="chart-bar" d={`M${cx - bw / 2},${pad.t + ih} v${-(h - Math.min(4, h))} q0,${-Math.min(4, h)} ${Math.min(4, h)},${-Math.min(4, h)} h${bw - 2 * Math.min(4, h)} q${Math.min(4, h)},0 ${Math.min(4, h)},${Math.min(4, h)} v${h - Math.min(4, h)} z`} />}
                {i === peak && w.credited > 0 && (
                  <text x={cx} y={y(w.credited) - 7} textAnchor="middle" className="chart-value">
                    {w.credited}
                  </text>
                )}
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" tabIndex={0} aria-label={`${title}: ${value}`} onMouseEnter={show} onMouseLeave={() => setTip(null)} onFocus={show} onBlur={() => setTip(null)} />
                <text x={cx} y={H - 6} textAnchor="middle" className="chart-axis">
                  {shortDate(weekOf(w.weekStart))}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}
