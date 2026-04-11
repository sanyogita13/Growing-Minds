"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { apiFetch, setStoredToken } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("hr@hiresight.ai");
  const [password, setPassword] = useState("Hr@12345");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<{ access_token: string; user: { role: string } }>(
        "/api/v1/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
      );
      setStoredToken(response.access_token);
      router.push(response.user.role === "admin" ? "/admin" : "/hr");
    } catch (submissionError) {
      setError("Login failed. Use the seeded admin or HR account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="content" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 80 }}>
      <div className="panel hero">
        <div className="pill">Sign in</div>
        <h1>Access your hiring workspace</h1>
        <p className="muted">Use the seeded Admin or HR account for the local demo.</p>
        <form className="grid" onSubmit={handleSubmit}>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Work email" style={inputStyle} />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            style={inputStyle}
          />
          {error ? <p style={{ color: "#9f2d2d", margin: 0 }}>{error}</p> : null}
          <button style={buttonStyle} disabled={loading} type="submit">
            {loading ? "Signing in..." : "Continue"}
          </button>
        </form>
        <div className="grid" style={{ marginTop: 16 }}>
          <div className="panel metricCard">
            <strong>Admin</strong>
            <div className="muted">admin@hiresight.ai / Admin@123</div>
          </div>
          <div className="panel metricCard">
            <strong>HR</strong>
            <div className="muted">hr@hiresight.ai / Hr@12345</div>
          </div>
        </div>
      </div>
    </main>
  );
}

const inputStyle = {
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255, 255, 255, 0.1)",
  background: "rgba(255, 255, 255, 0.03)",
  color: "#f5f5f5",
};

const buttonStyle = {
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "#f5f5f5",
  color: "#050505",
  cursor: "pointer",
};
