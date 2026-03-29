const summaryNode = document.getElementById("summary");
const sessionsNode = document.getElementById("sessions");
const alertsNode = document.getElementById("alerts");
const scheduleForm = document.getElementById("schedule-form");
const inviteOutput = document.getElementById("invite-output");
const auth = new URLSearchParams(window.location.search).get("auth");

if (!auth) {
  window.location.href = "/";
}

const state = {
  sessions: new Map(),
  alerts: [],
};

function buildWhatsAppShare(url) {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(url)}`;
}

async function downloadReport(sessionId) {
  const response = await fetch(`/api/report?auth=${encodeURIComponent(auth)}&sessionId=${encodeURIComponent(sessionId)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Unable to export report.");
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `${sessionId}-report.json`;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

function buildShareStatus(session) {
  if (session.shareReady) {
    return "Share-ready link";
  }
  return "Local-only link. Set PUBLIC_BASE_URL to your LAN IP or public domain before sharing to other devices.";
}

function renderSummary(summary) {
  summaryNode.innerHTML = `
    <div class="stat-card">
      <div class="microcopy">Total sessions</div>
      <div class="risk">${summary.total}</div>
      <div class="metric-trace"></div>
    </div>
    <div class="stat-card">
      <div class="microcopy">Live sessions</div>
      <div class="risk">${summary.live}</div>
      <div class="metric-trace"></div>
    </div>
    <div class="stat-card">
      <div class="microcopy">High risk</div>
      <div class="risk">${summary.highRisk}</div>
      <div class="metric-trace"></div>
    </div>
    <div class="stat-card surface-dark">
      <div class="microcopy">Average risk</div>
      <div class="risk">${summary.averageRisk}</div>
      <div class="microcopy">rolling command-center average</div>
    </div>
  `;
}

function recomputeSummary() {
  const sessions = Array.from(state.sessions.values());
  return {
    total: sessions.length,
    live: sessions.filter((session) => session.status === "live").length,
    highRisk: sessions.filter((session) => session.risk.score >= 70).length,
    averageRisk: sessions.length
      ? Math.round(sessions.reduce((sum, session) => sum + session.risk.score, 0) / sessions.length)
      : 0,
  };
}

function renderSessions() {
  const sessions = Array.from(state.sessions.values());
  sessionsNode.innerHTML = sessions
    .map(
      (session) => `
      <div class="session-card">
        <div class="header-row">
          <div>
            <strong>${session.candidateName}</strong>
            <div class="muted">${session.candidateEmail}</div>
          </div>
          <div class="risk">${session.risk.score}</div>
        </div>
        <div class="session-meta">
          <div class="meta-row"><span class="muted">Status</span><strong>${session.status}</strong></div>
          <div class="meta-row"><span class="muted">Last telemetry</span><strong>${session.lastTelemetryAt ? new Date(session.lastTelemetryAt).toLocaleTimeString() : "Never"}</strong></div>
          <div class="meta-row"><span class="muted">Top reasons</span><strong>${session.risk.reasons.map((r) => r.type).join(", ") || "No active risks"}</strong></div>
          <div class="meta-row"><span class="muted">Presence</span><strong>candidate ${session.presence?.candidateJoined ? "joined" : "pending"} | admin ${session.presence?.adminJoined ? "joined" : "pending"}</strong></div>
          <div class="meta-row"><span class="muted">Pre-check</span><strong>${session.precheck?.permissions || "pending"} / ${session.precheck?.network || "pending"} / ${session.precheck?.framing || "pending"}</strong></div>
          <div class="meta-row"><span class="muted">Desktop app</span><strong>${session.telemetry.desktop?.frontmostApp || "No desktop agent"}</strong></div>
          <div class="meta-row"><span class="muted">Browser tab</span><strong>${session.telemetry.desktop?.tabTitle || "Unknown"}</strong></div>
          <div class="meta-row"><span class="muted">Share state</span><strong>${buildShareStatus(session)}</strong></div>
        </div>
        <div class="muted" style="margin-top:12px;">Secure link: <a href="${session.inviteUrl}" target="_blank">${session.inviteUrl}</a></div>
        <div class="actions" style="margin-top:14px;">
          <a class="button" href="/room.html?role=admin&sessionId=${encodeURIComponent(session.id)}&auth=${encodeURIComponent(auth)}" target="_blank">Join live room</a>
          <a class="button secondary" href="${buildWhatsAppShare(session.inviteUrl)}" target="_blank">Send via WhatsApp</a>
          <button class="button secondary" data-copy-link="${session.inviteUrl}">Copy invite</button>
          <button class="button secondary" data-report-id="${session.id}">Export report</button>
          <button class="button secondary" data-note-id="${session.id}">Add note</button>
          <button class="button secondary" data-action="warn" data-id="${session.id}">Warn candidate</button>
          <button class="button secondary" data-action="toggle_fullscreen" data-id="${session.id}" data-enabled="${!session.controls.fullscreenRequired}">
            ${session.controls.fullscreenRequired ? "Disable fullscreen lock" : "Enable fullscreen lock"}
          </button>
          <button class="button secondary" data-action="end" data-id="${session.id}">End session</button>
        </div>
      </div>
    `,
    )
    .join("");
}

function renderAlerts() {
  alertsNode.innerHTML =
    state.alerts.length === 0
      ? `<div class="alert-card"><div class="muted">No incidents yet.</div></div>`
      : state.alerts
          .slice(0, 25)
          .map(
            (alert) => `
            <div class="alert-card">
              <div class="alert-row">
                <div class="timeline-dot"></div>
                <div>
                  <strong>${alert.type}</strong>
                  <div class="muted">${alert.candidateName} at ${new Date(alert.timestamp).toLocaleTimeString()}</div>
                  <div class="muted">Confidence ${Math.round(alert.confidence * 100)}%</div>
                </div>
                <span class="severity-chip severity-pill-${alert.severity}">${alert.severity}</span>
              </div>
            </div>
          `,
          )
          .join("");
}

async function loadSnapshot() {
  const response = await fetch(`/api/admin/state?auth=${encodeURIComponent(auth)}`);
  if (response.status === 401) {
    window.location.href = "/";
    return;
  }
  const payload = await response.json();
  renderSummary(payload.summary);
  payload.sessions.forEach((session) => state.sessions.set(session.id, session));
  renderSummary(recomputeSummary());
  renderSessions();
  state.alerts = payload.sessions.flatMap((session) => session.incidents).slice(0, 25);
  renderAlerts();
}

document.addEventListener("click", async (event) => {
  const reportButton = event.target.closest("button[data-report-id]");
  if (reportButton) {
    try {
      await downloadReport(reportButton.dataset.reportId);
      reportButton.textContent = "Downloaded";
      setTimeout(() => {
        reportButton.textContent = "Export report";
      }, 1200);
    } catch {
      reportButton.textContent = "Export failed";
    }
    return;
  }

  const noteButton = event.target.closest("button[data-note-id]");
  if (noteButton) {
    const text = window.prompt("Add interviewer note");
    if (!text) {
      return;
    }
    await fetch(`/api/control?auth=${encodeURIComponent(auth)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: noteButton.dataset.noteId,
        type: "note",
        text,
      }),
    });
    return;
  }

  const copyButton = event.target.closest("button[data-copy-link]");
  if (copyButton) {
    const link = copyButton.dataset.copyLink;
    try {
      await navigator.clipboard.writeText(link);
      copyButton.textContent = "Copied";
      setTimeout(() => {
        copyButton.textContent = "Copy invite";
      }, 1200);
    } catch {
      copyButton.textContent = "Copy failed";
    }
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const sessionId = button.dataset.id;
  const payload = { sessionId, type: action };
  if (action === "warn") {
    payload.message = "Admin warning: stay centered, keep focus on the interview, and avoid switching screens.";
  }
  if (action === "toggle_fullscreen") {
    payload.enabled = button.dataset.enabled === "true";
  }

  await fetch(`/api/control?auth=${encodeURIComponent(auth)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    if (response.status === 401) {
      window.location.href = "/";
    }
  });
});

scheduleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(scheduleForm);
  const body = Object.fromEntries(data.entries());
  body.startsAt = new Date(body.startsAt).toISOString();

  const response = await fetch(`/api/schedule?auth=${encodeURIComponent(auth)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    inviteOutput.textContent = payload.error || "Unable to create interview.";
    return;
  }

  inviteOutput.innerHTML = `
    <strong>Secure invite created</strong><br />
    Candidate: ${payload.candidateName}<br />
    Start: ${new Date(payload.startsAt).toLocaleString()} (${payload.timeZone})<br />
    Share status: ${payload.shareReady ? "Share-ready link" : "Local-only link. Set PUBLIC_BASE_URL first for mobile/other devices."}<br />
    Join link: <a href="${payload.inviteUrl}" target="_blank">${payload.inviteUrl}</a><br />
    <span class="actions" style="margin-top:12px;">
      <a class="button secondary" href="${buildWhatsAppShare(payload.inviteUrl)}" target="_blank">Send via WhatsApp</a>
      <button class="button secondary" id="copy-last-invite" type="button">Copy invite</button>
    </span>
  `;

  const copyInviteButton = document.getElementById("copy-last-invite");
  copyInviteButton?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(payload.inviteUrl);
    copyInviteButton.textContent = "Copied";
    setTimeout(() => {
      copyInviteButton.textContent = "Copy invite";
    }, 1200);
  });
});

const stream = new EventSource(`/api/events?auth=${encodeURIComponent(auth)}`);
stream.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "snapshot") {
    const payload = message.payload;
    renderSummary(payload.summary);
    payload.sessions.forEach((session) => state.sessions.set(session.id, session));
    renderSessions();
    state.alerts = payload.sessions.flatMap((session) => session.incidents).slice(0, 25);
    renderAlerts();
    return;
  }

  if (message.type === "risk_update" || message.type === "control_update" || message.type === "schedule_created") {
    state.sessions.set(message.session.id, message.session);
    renderSummary(recomputeSummary());
    renderSessions();
    return;
  }

  if (message.type === "incident") {
    state.alerts.unshift(message.incident);
    renderAlerts();
  }
};

loadSnapshot();
