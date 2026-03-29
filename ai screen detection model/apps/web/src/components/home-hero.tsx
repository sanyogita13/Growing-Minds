export function HomeHero() {
  return (
    <section className="hero-card">
      <span className="eyebrow">AI Interview Integrity</span>
      <h1 className="headline">Real-time monitoring built for high-stakes interviews.</h1>
      <p className="subtle" style={{ maxWidth: 760, fontSize: 18 }}>
        Multimodal risk scoring across webcam, microphone, and browser activity with
        sub-second admin visibility, secure scheduling, and evidence-backed alerts.
      </p>
      <div className="cta-row" style={{ marginTop: 24 }}>
        <a className="button" href="/candidate">
          Candidate Interface
        </a>
        <a className="button secondary" href="/admin">
          Admin Dashboard
        </a>
      </div>
    </section>
  );
}
