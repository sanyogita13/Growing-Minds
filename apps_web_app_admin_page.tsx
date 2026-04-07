"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AuthGuard } from "../../components/auth-guard";
import { LogoutButton } from "../../components/logout-button";
import { apiFetch, getStoredToken } from "../../lib/api";

type Metrics = {
  total_candidates: number;
  shortlisted: number;
  consider: number;
  rejected: number;
  total_jobs: number;
  average_score: number;
  average_skill_match: number;
  average_experience_fit: number;
};

type Activity = { id: string; actor: string; action: string; created_at: string };
type AnalyticsPoint = { label: string; candidates: number; average_score: number };

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPoint[]>([]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }
    apiFetch<Metrics>("/api/v1/dashboard/overview", {}, token).then(setMetrics).catch(console.error);
    apiFetch<{ items: Activity[] }>("/api/v1/activity", {}, token).then((response) => setActivity(response.items)).catch(console.error);
    apiFetch<{ items: AnalyticsPoint[] }>("/api/v1/analytics/jobs", {}, token)
      .then((response) => setAnalytics(response.items))
      .catch(console.error);
  }, []);

  return (
    <AuthGuard>
      <main className="shell">
        <aside className="sidebar">
          <div className="pill">Admin</div>
          <h1>Organization control center</h1>
          <p className="muted">Track hiring throughput, team activity, and overall candidate quality.</p>
          <div className="grid">
            <Link href="/admin/team">Team Management</Link>
            <Link href="/hr">Open HR Workspace</Link>
            <LogoutButton />
          </div>
        </aside>
        <section className="content grid">
          <section className="grid metrics">
            {[
              ["Total Candidates", metrics?.total_candidates ?? 0],
              ["Shortlisted", metrics?.shortlisted ?? 0],
              ["Consider", metrics?.consider ?? 0],
              ["Rejected", metrics?.rejected ?? 0],
              ["Active Jobs", metrics?.total_jobs ?? 0],
              ["Average Score", metrics?.average_score ?? 0],
              ["Avg Skill Match", metrics?.average_skill_match ?? 0],
              ["Avg Experience Fit", metrics?.average_experience_fit ?? 0],
            ].map(([label, value]) => (
              <article className="panel metricCard" key={String(label)}>
                <div className="muted">{label}</div>
                <h2>{value}</h2>
              </article>
            ))}
          </section>
          <section className="panel hero">
            <div className="pill">Analytics</div>
            <h2>Job performance overview</h2>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={analytics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" stroke="#a3a3a3" />
                  <YAxis stroke="#a3a3a3" />
                  <Tooltip contentStyle={{ background: "#121212", border: "1px solid rgba(255,255,255,0.08)" }} />
                  <Bar dataKey="average_score" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel hero">
            <div className="pill">Live Activity</div>
            <h2>Latest HR actions</h2>
            <div className="grid">
              {activity.map((item) => (
                <div className="panel metricCard" key={item.id}>
                  <strong>{item.actor}</strong>
                  <div>{item.action}</div>
                  <div className="muted">{new Date(item.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </main>
    </AuthGuard>
  );
}
