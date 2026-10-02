import { useEffect, useState } from "react";
import { api, localDay } from "../api";

/** "Today", "Yesterday", or "Tue 29" for a YYYY-MM-DD day. */
export function shortDay(day: string): string {
  if (day === localDay(Date.now())) return "Today";
  if (day === localDay(Date.now() - 86_400_000)) return "Yesterday";
  const d = new Date(`${day}T12:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function longDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** A dropdown of the days Rhubarb has heard, newest first. Today is always there. */
export function DaySelect({ value, onChange, everything, label = "Day" }: { value: string; onChange: (day: string) => void; everything?: string; label?: string }) {
  const [days, setDays] = useState<string[] | null>(null);
  useEffect(() => {
    api
      .days()
      .then((d) => setDays(d.map((x) => x.day)))
      .catch(() => setDays([]));
  }, []);
  const today = localDay(Date.now());
  const list = [...new Set([today, ...(days ?? [])])].sort().reverse();
  return (
    <label className="day-select">
      <span className="visually-hidden">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {everything && <option value="">{everything}</option>}
        {list.map((d) => (
          <option key={d} value={d}>
            {shortDay(d)}
          </option>
        ))}
      </select>
    </label>
  );
}
