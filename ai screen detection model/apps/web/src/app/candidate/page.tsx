import { CandidateRoom } from "../../components/candidate-room";

export default function CandidatePage() {
  return (
    <main className="page-shell">
      <section className="hero-card" style={{ marginBottom: 22 }}>
        <span className="eyebrow">Candidate Portal</span>
        <h1 style={{ fontSize: 52, marginBottom: 10 }}>Secure interview room</h1>
        <p className="subtle">
          Join with a secure invite, complete device checks, and remain visible throughout the
          session.
        </p>
      </section>
      <CandidateRoom />
    </main>
  );
}
