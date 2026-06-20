import { Component } from "react";

/**
 * Production-safe Error Boundary.
 *
 * Catches any unhandled render / lifecycle errors in its subtree and
 * shows a graceful fallback instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * Optional props:
 *   fallback  – custom ReactNode to render on error
 *   onError   – (error, info) => void  callback (e.g. send to Sentry)
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Forward to an external logger if provided (e.g. Sentry.captureException)
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info);
    }

    // Always log to console so errors surface in production monitoring
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  handleReset() {
    this.setState({ hasError: false, error: null });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Prefer a caller-supplied fallback
    if (this.props.fallback) {
      return this.props.fallback;
    }

    // Default fallback UI — intentionally minimal so it works without any
    // CSS framework or router context being available.
    const styles = {
      wrapper: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#0f0f0f",
        color: "#f5f5f5",
        gap: "1rem",
      },
      title: {
        fontSize: "1.5rem",
        fontWeight: 600,
        margin: 0,
      },
      message: {
        fontSize: "0.95rem",
        color: "#a1a1a1",
        margin: 0,
        maxWidth: "36ch",
        lineHeight: 1.6,
      },
      detail: {
        fontSize: "0.8rem",
        color: "#666",
        background: "#1a1a1a",
        border: "1px solid #2a2a2a",
        borderRadius: "8px",
        padding: "0.75rem 1rem",
        maxWidth: "480px",
        wordBreak: "break-word",
        textAlign: "left",
      },
      button: {
        marginTop: "0.5rem",
        padding: "0.6rem 1.4rem",
        borderRadius: "8px",
        border: "none",
        background: "#6366f1",
        color: "#fff",
        fontSize: "0.9rem",
        fontWeight: 500,
        cursor: "pointer",
      },
    };

    const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV === "development";

    return (
      <div style={styles.wrapper} role="alert">
        <p style={styles.title}>Something went wrong</p>
        <p style={styles.message}>
          An unexpected error occurred. Try refreshing the page — if the problem
          persists, please contact support.
        </p>

        {/* Show raw error only in development to avoid leaking internals */}
        {isDev && this.state.error && (
          <pre style={styles.detail}>
            {this.state.error.toString()}
          </pre>
        )}

        <button style={styles.button} onClick={this.handleReset}>
          Try again
        </button>
        <button
          style={{ ...styles.button, background: "#27272a" }}
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    );
  }
}
