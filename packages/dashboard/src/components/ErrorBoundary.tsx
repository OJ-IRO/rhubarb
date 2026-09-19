import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown instead of the default card; used at the root, where there is no nav to fall back on. */
  bare?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken page from blanking the whole app. App keys this by route,
 * so moving to another page clears the error on its own.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Rhubarb page error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={this.props.bare ? "shell" : undefined}>
        <h1 className="title">This page broke.</h1>
        <p className="muted lead">The rest of Rhubarb is fine, and nothing you've learned is lost. Try the page again, or pick another one from the menu.</p>
        <div className="actions">
          <button className="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button className="ghost" onClick={() => window.location.reload()}>
            Reload Rhubarb
          </button>
        </div>
        <details className="error-detail">
          <summary className="muted small">What went wrong</summary>
          <pre>{error.message}</pre>
        </details>
      </div>
    );
  }
}
