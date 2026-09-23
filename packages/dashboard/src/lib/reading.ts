/**
 * Reading comfort is a per-device preference: it lives in this browser, not in the profile,
 * because the same person may want large type on a laptop and not on a phone.
 */
export interface Reading {
  /** a wide, plain sans with generous spacing, for anyone who finds the serif hard going */
  easierFont: boolean;
  /** larger type and looser lines everywhere */
  largerText: boolean;
}

const KEY = "rhubarb.reading.v1";

export function readReading(): Reading {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { easierFont: false, largerText: false, ...(JSON.parse(raw) as Partial<Reading>) };
  } catch {
    /* no storage, defaults */
  }
  return { easierFont: false, largerText: false };
}

export function applyReading(r: Reading): void {
  const root = document.documentElement;
  root.classList.toggle("easier-font", r.easierFont);
  root.classList.toggle("larger-text", r.largerText);
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* fine */
  }
}
