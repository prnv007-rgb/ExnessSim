// src/App.tsx
import './App.css';
import React, { type JSX } from "react";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Signin from "./components/signin";
import Signup from "./components/signup";
import Dash from "./components/dash";
import DashboardWrapper from './components/wrapper';

/**
 * Simple React Error Boundary to isolate crashes inside Dash.
 * If Dash throws, the ErrorBoundary shows a small fallback UI
 * and prevents the entire DashboardPage from being removed.
 */
type EBState = { hasError: boolean; error?: Error | null; info?: React.ErrorInfo | null; };
class ErrorBoundary extends React.Component<{ children: React.ReactNode; name?: string }, EBState> {
  constructor(props: { children: React.ReactNode; name?: string }) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, info: null };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // you can send error & info to a logging service here
    // console.error("ErrorBoundary caught:", error, info);
    this.setState({ error, info });
  }
  reset = () => this.setState({ hasError: false, error: null, info: null });
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, borderRadius: 8, background: "#2b0b0b", color: "#ffdede" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{this.props.name ?? "Component"} error</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{String(this.state.error?.message ?? "An error occurred")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={this.reset} style={{ padding: "8px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 4 }}>Reload</button>
            <button onClick={() => window.location.reload()} style={{ padding: "8px 12px", background: "#444", color: "#fff", border: "none", borderRadius: 4 }}>Reload page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** render both Dash and DashboardWrapper on the /dashboard route */
function DashboardPage(): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 8 }}>
      {/* isolate Dash so its errors won't hide the wrapper */}
      <ErrorBoundary name="Dash">
        <Dash />
      </ErrorBoundary>

      {/* DashboardWrapper contains OrderForm / balances / notifications */}
      <DashboardWrapper />
    </div>
  );
}

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/signup" />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/signin" element={<Signin />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/signin" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
