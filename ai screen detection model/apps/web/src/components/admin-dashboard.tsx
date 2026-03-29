import { mockAlerts, mockSessions } from "../lib/mock-data";

export function AdminDashboard() {
  return (
    <div className="grid" style={{ gap: 22 }}>
      <section className="grid three-col">
        <div className="tile stat">
          <span className="subtle">Active interviews</span>
          <strong>12</strong>
        </div>
        <div className="tile stat">
          <span className="subtle">High-risk sessions</span>
          <strong>2</strong>
        </div>
        <div className="tile stat">
          <span className="subtle">Avg alert latency</span>
          <strong>88 ms</strong>
        </div>
      </section>

      <section className="grid two-col">
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className="eyebrow">Live Sessions</span>
              <h2 style={{ marginBottom: 8 }}>Candidate risk board</h2>
            </div>
            <div className="risk-ring">
              <div style={{ textAlign: "center" }}>
                <div className="subtle">Peak Risk</div>
                <strong style={{ fontSize: 34 }}>83</strong>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            {mockSessions.map((session) => (
              <div className="session-item" key={session.sessionId}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{session.candidateName}</strong>
                  <span>{session.risk.riskScore}/100</span>
                </div>
                <div className="subtle" style={{ marginTop: 6 }}>
                  {session.risk.reasons.map((reason) => reason.type).join(", ") || "No active risks"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <span className="eyebrow">Alert Stream</span>
          <h2 style={{ marginBottom: 8 }}>Latest incidents</h2>
          {mockAlerts.map((alert) => (
            <div className="alert-item" key={alert.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{alert.type}</strong>
                <span>{alert.severity}</span>
              </div>
              <div className="subtle" style={{ marginTop: 6 }}>
                Confidence {Math.round(alert.confidence * 100)}% at{" "}
                {new Date(alert.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid two-col">
        <div className="panel">
          <span className="eyebrow">Scheduling</span>
          <h2>Create interview slot</h2>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <input placeholder="Candidate name" />
            <input placeholder="Candidate email" />
            <input placeholder="Date and time" />
            <select defaultValue="Asia/Kolkata">
              <option>Asia/Kolkata</option>
              <option>UTC</option>
              <option>America/New_York</option>
            </select>
          </div>
          <div className="cta-row" style={{ marginTop: 18 }}>
            <button className="button">Send secure invite</button>
          </div>
        </div>

        <div className="panel">
          <span className="eyebrow">Controls</span>
          <h2>Session actions</h2>
          <div className="cta-row">
            <button className="button secondary">Warn candidate</button>
            <button className="button secondary">Review evidence</button>
            <button className="button secondary">End session</button>
          </div>
        </div>
      </section>
    </div>
  );
}
