import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";
import { applyReading, readReading } from "./lib/reading";

applyReading(readReading());

// A public demo build (VITE_DEMO=1) has no daemon behind it, so it lives in the sample week.
if (import.meta.env.VITE_DEMO && !window.location.hash.startsWith("#/preview")) window.location.hash = "#/preview/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary bare>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
