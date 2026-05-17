import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

class AtsCrashBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Karm ATS startup crashed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f5f6fa",
            padding: 24,
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 16,
              boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(0,0,0,0.08)", fontSize: 16, fontWeight: 700, color: "#1a1d2e" }}>
              Karm. ATS
            </div>
            <div style={{ padding: 24 }}>
              <div
                style={{
                  background: "rgba(217,119,6,0.10)",
                  border: "1px solid rgba(217,119,6,0.22)",
                  borderRadius: 8,
                  color: "#d97706",
                  padding: "12px 14px",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                The ATS hit a frontend startup error. Refresh once after the latest deployment. If it still happens, open browser developer tools and share the first red console error.
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AtsCrashBoundary>
      <App />
    </AtsCrashBoundary>
  </React.StrictMode>
);
