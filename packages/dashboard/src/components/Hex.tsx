import { useId } from "react";

/**
 * The honeycomb's visual language in small pieces, so every page speaks it: a cell with a wall
 * you can see the side of, honey as the one strong colour, and thin amber edges.
 */

// Pointy-top hexagon in a 100 x 100 box.
const HEX = "50,4 90,27 90,73 50,96 10,73 10,27";

type Tone = "honey" | "wax" | "ink";

/** A rank or a step number, sitting in a cell with a little depth under it. */
export function HexBadge({ n, tone = "wax", size = 40 }: { n: number | string; tone?: Tone; size?: number }) {
  return (
    <span className={`hexbadge ${tone}`} style={{ width: size, height: size * 1.08 }} aria-hidden="true">
      <svg viewBox="0 0 100 108" width="100%" height="100%">
        <polygon className="hex-wall" points={HEX} transform="translate(0 8)" />
        <polygon className="hex-face" points={HEX} />
      </svg>
      <span className="hexbadge-n">{n}</span>
    </span>
  );
}

/**
 * Where someone stands on a ladder, as a row of cells: honey for levels passed, a half-filled
 * cell for the one in progress, empty wax for the ones ahead. `level` counts from 0.
 */
export function HexLevels({ level, total, mastered = false, size = 16 }: { level: number; total: number; mastered?: boolean; size?: number }) {
  const clip = useId();
  if (!total) return null;
  const label = mastered ? `All ${total} levels done` : `Level ${Math.min(level + 1, total)} of ${total}`;
  return (
    <span className="hexlevels" role="img" aria-label={label} title={label}>
      {Array.from({ length: total }, (_, i) => {
        const state = mastered || i < level ? "done" : i === level ? "current" : "ahead";
        return (
          <svg key={i} viewBox="0 0 100 100" width={size} height={size} className={`hexlevel ${state}`}>
            <polygon className="hex-face" points={HEX} />
            {state === "current" && (
              <>
                <clipPath id={`${clip}-${i}`}>
                  <polygon points={HEX} />
                </clipPath>
                <rect className="hex-honey" x="0" y="52" width="100" height="48" clipPath={`url(#${clip}-${i})`} />
                <polygon className="hex-rim" points={HEX} />
              </>
            )}
          </svg>
        );
      })}
    </span>
  );
}

/** One rung of a ladder: passed, in progress, or still ahead. */
export function HexNode({ state }: { state: "done" | "current" | "locked" }) {
  return (
    <span className={`hexnode ${state}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" width="26" height="26">
        <polygon className="hex-face" points={HEX} />
        {state === "done" && <path className="hex-tick" d="M32 52 L45 65 L70 37" />}
        {state === "current" && <polygon className="hex-core" points={HEX} transform="translate(50 50) scale(0.42) translate(-50 -50)" />}
      </svg>
    </span>
  );
}

/** Three cells of comb, one of them full. Replaces the emoji, which looks different on every system. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brandmark" viewBox="0 0 120 112" width={size} height={size * 0.93} aria-hidden="true">
      <polygon className="bm-wax" points="60,4 84,18 84,46 60,60 36,46 36,18" />
      <polygon className="bm-wax" points="36,50 60,64 60,92 36,106 12,92 12,64" />
      <polygon className="bm-honey" points="84,50 108,64 108,92 84,106 60,92 60,64" />
    </svg>
  );
}

/** Shown while a page's data is on its way. It fades in late, so a fast load never flashes it. */
export function Loading({ label = "One moment" }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading-cells" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <svg key={i} viewBox="0 0 100 100" width="18" height="18" style={{ animationDelay: `${i * 160}ms` }}>
            <polygon points={HEX} />
          </svg>
        ))}
      </span>
      <span className="muted small">{label}</span>
    </div>
  );
}
