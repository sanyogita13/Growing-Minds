import { AdminDashboard } from "../../components/admin-dashboard";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero-card" style={{ marginBottom: 22 }}>
        <span className="eyebrow">Admin Console</span>
        <h1 style={{ fontSize: 52, marginBottom: 10 }}>Live integrity dashboard</h1>
        <p className="subtle">
          Receive streaming alerts, review candidate risk scores, schedule interviews, and control
          active sessions in one place.
        </p>
      </section>
      <AdminDashboard />
    </main>
  );
}
