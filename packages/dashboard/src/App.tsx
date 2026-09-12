import { useEffect, useState } from "react";

interface Status {
  profile: { name: string } | null;
  skills: number;
  evidence: number;
  openPractice: number;
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="shell">
      <header className="masthead">
        <span className="mark">🐝</span>
        <h1>Waggle</h1>
      </header>
      {error && <p className="muted">Can't reach the daemon: {error}</p>}
      {status && (
        <p className="muted">
          {status.profile ? `Listening for ${status.profile.name}.` : "Not set up yet."} {status.evidence} moments noticed,{" "}
          {status.skills} skills on the board, {status.openPractice} practice prompts open.
        </p>
      )}
    </main>
  );
}
