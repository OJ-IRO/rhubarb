export function Meter({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="meter" title={label ?? `${Math.round(pct)} of 100`}>
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const text = status === "proposed" ? "needs a decision" : status === "active" ? "in progress" : status === "mastered" ? "done" : status;
  return <span className={`chip-status ${status}`}>{text}</span>;
}
