import { HomeHero } from "../components/home-hero";

export default function HomePage() {
  return (
    <main className="page-shell">
      <HomeHero />
      <section className="grid three-col" style={{ marginTop: 24 }}>
        <div className="tile">
          <span className="eyebrow">Vision</span>
          <h3>Identity, gaze, pose, and device checks</h3>
          <p className="subtle">
            Continuous face continuity, head pose drift, multiple-person, and phone detection.
          </p>
        </div>
        <div className="tile">
          <span className="eyebrow">Audio</span>
          <h3>Overlap and prompt detection</h3>
          <p className="subtle">
            Monitor multiple voices, background prompting, and anomalous acoustic events.
          </p>
        </div>
        <div className="tile">
          <span className="eyebrow">Control</span>
          <h3>Browser activity and live admin alerts</h3>
          <p className="subtle">
            Capture tab switches, full-screen exit, and other integrity-breaking activity.
          </p>
        </div>
      </section>
    </main>
  );
}
