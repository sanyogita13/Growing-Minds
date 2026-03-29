export function CandidateRoom() {
  return (
    <div className="grid two-col">
      <section className="panel">
        <div className="feed-card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="eyebrow">Live Camera</span>
            <span>
              <span className="status-dot green" />
              Monitoring Active
            </span>
          </div>
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 28, marginBottom: 8 }}>Candidate Preview</h3>
            <p className="subtle">
              Webcam preview, face continuity verification, gaze monitoring, and audio capture
              run continuously during the session.
            </p>
          </div>
        </div>
      </section>
      <aside className="panel">
        <span className="eyebrow">Interview Status</span>
        <div className="list" style={{ flexDirection: "column", marginTop: 20 }}>
          <div>
            <span className="status-dot green" />
            Camera connected
          </div>
          <div>
            <span className="status-dot green" />
            Microphone healthy
          </div>
          <div>
            <span className="status-dot green" />
            Identity verified
          </div>
          <div>
            <span className="status-dot amber" />
            Full-screen locked
          </div>
        </div>
        <div className="tile" style={{ marginTop: 20 }}>
          <strong style={{ fontSize: 20 }}>Pre-interview checks</strong>
          <p className="subtle">
            Browser compatibility, permissions, bandwidth, and device readiness should be
            validated before joining the interview room.
          </p>
        </div>
      </aside>
    </div>
  );
}
