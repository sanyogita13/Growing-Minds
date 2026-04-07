import Link from "next/link";
import { LogoutButton } from "../components/logout-button";

export default function HomePage() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="pill">HireSight AI</div>
        <h1>Resume intelligence for hiring teams.</h1>
        <p className="muted">
          Score candidates against role requirements, monitor HR activity,
          and make faster shortlist decisions with explainable AI.
        </p>
        <div className="grid">
          <Link href="/login">Login</Link>
          <Link href="/admin">Admin Dashboard</Link>
          <Link href="/hr">HR Dashboard</Link>
          <LogoutButton />
        </div>
      </aside>

      <section className="content">
        <div className="panel hero">
          <div className="pill">Multi-tenant SaaS</div>
          <h2>Realtime ranking, explainable scoring, and team governance.</h2>
          <p className="muted">
            Designed for secure enterprise onboarding, bulk resume processing,
            semantic fit analysis, and subscription-ready growth.
          </p>
        </div>
      </section>
    </main>
  );
}
