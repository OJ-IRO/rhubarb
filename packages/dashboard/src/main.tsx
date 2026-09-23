import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";
import { applyReading, readReading } from "./lib/reading";

applyReading(readReading());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary bare>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
