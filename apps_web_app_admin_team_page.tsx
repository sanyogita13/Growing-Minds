"use client";

import { useEffect, useState } from "react";

import { AuthGuard } from "../../../components/auth-guard";
import { LogoutButton } from "../../../components/logout-button";
import { apiFetch, getStoredToken } from "../../../lib/api";

type Member = { id: string; full_name: string; role: string; email: string };

export default function TeamManagementPage() {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }
    apiFetch<{ items: Member[] }>("/api/v1/team-members", {}, token)
      .then((response) => setMembers(response.items))
      .catch(console.error);
  }, []);

  return (
    <AuthGuard>
      <main className="content">
        <div className="panel hero">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
            <div>
              <div className="pill">Team Management</div>
              <h1>Roles and permissions</h1>
            </div>
            <LogoutButton />
          </div>
          <div className="grid">
            {members.map((member) => (
              <div className="panel metricCard" key={member.id}>
                <strong>{member.full_name}</strong>
                <p className="muted">{member.email}</p>
                <span className="pill">{member.role}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
