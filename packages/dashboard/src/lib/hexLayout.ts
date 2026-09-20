/**
 * Spiral layout for pointy-top hexagons of radius r: the first cell sits in the
 * middle and later cells wind outward ring by ring, so the most important skill
 * is always at the heart of the comb.
 *
 * Each ring starts at the cell directly right of centre and walks
 * counter-clockwise. The six step directions must be in that order: a rotated
 * list walks off the ring and lands cells on top of each other.
 */
export function hexSpiral(n: number, r: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  if (n <= 0) return out;
  out.push({ x: 0, y: 0 });
  const w = Math.sqrt(3) * r;
  const steps: Array<[number, number]> = [
    [-w / 2, -1.5 * r],
    [-w, 0],
    [-w / 2, 1.5 * r],
    [w / 2, 1.5 * r],
    [w, 0],
    [w / 2, -1.5 * r],
  ];
  for (let ring = 1; out.length < n; ring++) {
    let x = w * ring;
    let y = 0;
    for (let side = 0; side < 6 && out.length < n; side++) {
      for (let step = 0; step < ring && out.length < n; step++) {
        out.push({ x, y });
        x += steps[side][0];
        y += steps[side][1];
      }
    }
  }
  return out;
}

/** Break a skill name into at most `maxLines` short lines for a cell label. */
export function wrapLabel(name: string, maxChars = 14, maxLines = 3): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:]+$/, "")}…`;
  return kept;
}
