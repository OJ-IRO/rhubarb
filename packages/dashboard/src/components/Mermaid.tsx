import { useEffect, useRef, useState } from "react";

let counter = 0;

/** Renders a Mermaid diagram client-side; falls back to nothing (caller shows the caption) on a parse error. */
export function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            primaryColor: "#f3d78a",
            primaryTextColor: "#1f1b14",
            primaryBorderColor: "#c98a0e",
            lineColor: "#6f6656",
            secondaryColor: "#fbf8f1",
            tertiaryColor: "#ffffff",
            fontFamily: "Iowan Old Style, Palatino, Georgia, serif",
            fontSize: "15px",
          },
        });
        const { svg } = await mermaid.render(`waggle-diagram-${++counter}`, code.trim());
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) return <p className="muted small">The diagram for this card didn't render; the caption below says what it showed.</p>;
  return <div ref={ref} className="mermaid-host" />;
}
