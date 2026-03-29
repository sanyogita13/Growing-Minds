import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, ".data");
const dataFile = path.join(dataDir, "state.json");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const APP_SECRET = process.env.APP_SECRET || "local-dev-secret";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const INVITE_TTL_MS = Number(process.env.INVITE_TTL_MS || 1000 * 60 * 60 * 24);
const ADMIN_SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 12);
const SSL_KEY_FILE = process.env.SSL_KEY_FILE || "";
const SSL_CERT_FILE = process.env.SSL_CERT_FILE || "";

const BROWSER_APPS = new Set(["Google Chrome", "Microsoft Edge", "Safari", "Brave Browser", "Arc"]);
const WEIGHTS = {
  face_missing: 0.28,
  multiple_faces: 0.24,
  phone_detected: 0.22,
  gaze_away_excessive: 0.14,
  head_pose_suspicious: 0.12,
  multiple_voices: 0.16,
  prompt_audio_detected: 0.12,
  app_switch_detected: 0.24,
  browser_navigation_detected: 0.22,
  tab_switch: 0.2,
  fullscreen_exit: 0.18,
  screen_share_detected: 0.25,
  devtools_opened: 0.08,
};

const state = {
  interviews: new Map(),
  admins: new Set(),
  adminSessions: new Map(),
  roomSubscribers: new Map(),
};

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadState() {
  try {
    if (!fs.existsSync(dataFile)) return;
    const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    (raw.interviews || []).forEach((interview) => {
      state.interviews.set(interview.id, interview);
    });
    (raw.adminSessions || []).forEach(([token, session]) => {
      if (session.expiresAt > Date.now()) {
        state.adminSessions.set(token, session);
      }
    });
  } catch {}
}

function persistState() {
  ensureDataDir();
  fs.writeFileSync(
    dataFile,
    JSON.stringify(
      {
        interviews: Array.from(state.interviews.values()),
        adminSessions: Array.from(state.adminSessions.entries()),
      },
      null,
      2,
    ),
  );
}

function saveInterview(interview) {
  state.interviews.set(interview.id, interview);
  persistState();
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function notFound(response) {
  json(response, 404, { error: "Not found" });
}

function serveFile(response, filePath) {
  const extension = path.extname(filePath);
  const contentType =
    extension === ".html"
      ? "text/html; charset=utf-8"
      : extension === ".css"
        ? "text/css; charset=utf-8"
        : extension === ".js"
          ? "application/javascript; charset=utf-8"
          : "text/plain; charset=utf-8";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      notFound(response);
      return;
    }
    response.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
    });
    response.end(data);
  });
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    request.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(buffer ? JSON.parse(buffer) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function getPublicBaseUrl(request) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/$/, "");
  const protoHeader = request?.headers["x-forwarded-proto"];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || "http";
  const hostHeader = request?.headers.host;
  if (hostHeader) return `${proto}://${hostHeader}`.replace(/\/$/, "");
  return `http://127.0.0.1:${PORT}`;
}

function createSignedInviteToken(sessionId, expiresAt) {
  const payload = Buffer.from(JSON.stringify({ sessionId, expiresAt }), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", APP_SECRET).update(payload).digest("base64url");
  return `join_${payload}.${signature}`;
}

function parseSignedInviteToken(token) {
  if (!token?.startsWith("join_")) return null;
  const [payload, signature] = token.slice(5).split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", APP_SECRET).update(payload).digest("base64url");
  if (signature !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.sessionId || !parsed.expiresAt || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function createAdminAccessKey() {
  const token = `adm_${crypto.randomUUID()}`;
  state.adminSessions.set(token, {
    issuedAt: Date.now(),
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  });
  persistState();
  return token;
}

function isAuthorizedAdmin(url, request) {
  const bearer = request.headers.authorization?.replace("Bearer ", "") || "";
  const token = url.searchParams.get("auth") || bearer;
  const session = state.adminSessions.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    state.adminSessions.delete(token);
    persistState();
    return false;
  }
  return true;
}

function defaultInterviewPresence() {
  return {
    adminJoined: false,
    candidateJoined: false,
    adminReady: false,
    candidateReady: false,
    adminAudioLevel: 0,
    candidateAudioLevel: 0,
  };
}

function defaultInterviewPrecheck() {
  return {
    device: "pending",
    network: "pending",
    permissions: "pending",
    framing: "pending",
    completedAt: null,
  };
}

function createInterview(input, request) {
  const sessionId = `sess_${crypto.randomUUID()}`;
  const inviteExpiresAt = Date.now() + INVITE_TTL_MS;
  const token = createSignedInviteToken(sessionId, inviteExpiresAt);
  const publicBaseUrl = getPublicBaseUrl(request);
  const now = new Date().toISOString();
  const interview = {
    id: sessionId,
    token,
    candidateId: `cand_${crypto.randomUUID()}`,
    candidateName: input.candidateName,
    candidateEmail: input.candidateEmail,
    interviewerName: input.interviewerName,
    startsAt: input.startsAt,
    timeZone: input.timeZone,
    durationMinutes: Number(input.durationMinutes) || 45,
    monitoringProfile: input.monitoringProfile || "strict",
    status: "scheduled",
    createdAt: now,
    inviteExpiresAt,
    inviteUrl: `${publicBaseUrl}/room.html?role=candidate&token=${token}`,
    publicBaseUrl,
    risk: {
      score: 0,
      updatedAt: now,
      reasons: [],
      counts: {},
    },
    lastTelemetryAt: null,
    incidents: [],
    controls: {
      warning: "",
      ended: false,
      fullscreenRequired: true,
    },
    telemetry: {
      browser: null,
      localSignals: null,
      desktop: null,
    },
    chat: [],
    notes: [],
    precheck: defaultInterviewPrecheck(),
    presence: defaultInterviewPresence(),
    lastIncidentAt: {},
  };
  saveInterview(interview);
  broadcast({ type: "schedule_created", session: sanitizeInterview(interview) });
  return interview;
}

function sanitizeInterview(interview) {
  return {
    id: interview.id,
    token: interview.token,
    candidateId: interview.candidateId,
    candidateName: interview.candidateName,
    candidateEmail: interview.candidateEmail,
    interviewerName: interview.interviewerName,
    startsAt: interview.startsAt,
    timeZone: interview.timeZone,
    durationMinutes: interview.durationMinutes,
    monitoringProfile: interview.monitoringProfile,
    status: interview.status,
    createdAt: interview.createdAt,
    inviteExpiresAt: interview.inviteExpiresAt,
    inviteUrl: interview.inviteUrl,
    publicBaseUrl: interview.publicBaseUrl,
    shareReady: !/127\.0\.0\.1|localhost/.test(interview.publicBaseUrl),
    risk: interview.risk,
    lastTelemetryAt: interview.lastTelemetryAt,
    incidents: interview.incidents.slice(0, 60),
    controls: interview.controls,
    telemetry: interview.telemetry,
    chat: interview.chat.slice(-60),
    notes: interview.notes.slice(-60),
    precheck: interview.precheck || defaultInterviewPrecheck(),
    presence: interview.presence || defaultInterviewPresence(),
  };
}

function createIncident(interview, type, confidence, severity, evidence = {}) {
  const lastSeen = interview.lastIncidentAt?.[type];
  const now = Date.now();
  if (lastSeen && now - lastSeen < 1800) return null;
  interview.lastIncidentAt[type] = now;
  return {
    id: `evt_${crypto.randomUUID()}`,
    sessionId: interview.id,
    candidateId: interview.candidateId,
    candidateName: interview.candidateName,
    type,
    confidence,
    severity,
    timestamp: new Date().toISOString(),
    evidence,
  };
}

function subscribeRoom(sessionId, role, response) {
  const subscribers = state.roomSubscribers.get(sessionId) || new Set();
  const entry = { role, response };
  subscribers.add(entry);
  state.roomSubscribers.set(sessionId, subscribers);
  return () => {
    subscribers.delete(entry);
    if (!subscribers.size) state.roomSubscribers.delete(sessionId);
  };
}

function broadcastRoom(sessionId, message) {
  const subscribers = state.roomSubscribers.get(sessionId);
  if (!subscribers) return;
  const serialized = `data: ${JSON.stringify(message)}\n\n`;
  for (const subscriber of subscribers) {
    subscriber.response.write(serialized);
  }
}

function broadcast(message) {
  const serialized = `data: ${JSON.stringify(message)}\n\n`;
  for (const response of state.admins) {
    response.write(serialized);
  }
}

function resolveSessionByToken(token) {
  const invite = parseSignedInviteToken(token);
  if (!invite) return null;
  return state.interviews.get(invite.sessionId) || null;
}

function resolveSessionForRoom(url, request) {
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("sessionId");
  if (token) return resolveSessionByToken(token);
  if (sessionId && isAuthorizedAdmin(url, request)) return state.interviews.get(sessionId) || null;
  return null;
}

function updateRisk(interview, incidents) {
  const counts = { ...(interview.risk.counts || {}) };
  let raw = 0;
  for (const incident of incidents) {
    counts[incident.type] = (counts[incident.type] || 0) + 1;
    raw += (WEIGHTS[incident.type] || 0.05) * incident.confidence;
  }
  const eventScore = Math.min(100, Math.round(raw * 100));
  const smoothed = Math.round(interview.risk.score * 0.7 + eventScore * 0.3);
  const escalated =
    incidents.some((incident) => incident.severity === "critical") || eventScore >= 70
      ? Math.max(smoothed, eventScore)
      : smoothed;
  interview.risk = {
    score: escalated,
    updatedAt: new Date().toISOString(),
    reasons: incidents.slice(0, 5).map((incident) => ({
      type: incident.type,
      confidence: incident.confidence,
      severity: incident.severity,
    })),
    counts,
  };
  return interview.risk;
}

function publishSession(interview, extraMessage) {
  saveInterview(interview);
  const session = sanitizeInterview(interview);
  broadcast({ type: "risk_update", session });
  broadcastRoom(interview.id, { type: "session_update", session });
  if (extraMessage) {
    broadcastRoom(interview.id, extraMessage);
  }
}

function emitIncidents(interview, incidents) {
  for (const incident of incidents) {
    broadcast({ type: "incident", sessionId: interview.id, incident });
    broadcastRoom(interview.id, { type: "incident", incident });
  }
}

function ingestTelemetry(payload) {
  const interview = state.interviews.get(payload.sessionId);
  if (!interview) return null;
  interview.status = "live";
  interview.lastTelemetryAt = payload.timestamp;
  interview.presence.candidateJoined = true;
  if (typeof payload.localSignals?.audioLevel === "number") {
    interview.presence.candidateAudioLevel = payload.localSignals.audioLevel;
  }
  interview.telemetry = {
    browser: payload.browser,
    localSignals: payload.localSignals,
    desktop: interview.telemetry.desktop,
  };

  const incidents = [];
  const { browser, localSignals } = payload;
  if (!localSignals.facePresent) incidents.push(createIncident(interview, "face_missing", 0.95, "critical"));
  if (localSignals.facesDetected > 1) {
    incidents.push(
      createIncident(interview, "multiple_faces", Math.min(1, 0.75 + localSignals.facesDetected * 0.08), "critical", {
        facesDetected: localSignals.facesDetected,
      }),
    );
  }
  if (localSignals.gazeAwayScore > 0.6) {
    incidents.push(
      createIncident(interview, "gaze_away_excessive", localSignals.gazeAwayScore, "medium", {
        gazeAwayScore: localSignals.gazeAwayScore,
      }),
    );
  }
  if (localSignals.headPoseScore > 0.65) {
    incidents.push(
      createIncident(interview, "head_pose_suspicious", localSignals.headPoseScore, "medium", {
        headPoseScore: localSignals.headPoseScore,
      }),
    );
  }
  if (localSignals.phoneDetected) incidents.push(createIncident(interview, "phone_detected", 0.84, "high"));
  if (localSignals.multipleVoices) {
    incidents.push(
      createIncident(interview, "multiple_voices", Math.max(0.7, localSignals.audioLevel), "high", {
        audioLevel: localSignals.audioLevel,
      }),
    );
  }
  if (localSignals.promptAudioScore > 0.68) {
    incidents.push(
      createIncident(interview, "prompt_audio_detected", localSignals.promptAudioScore, "high", {
        promptAudioScore: localSignals.promptAudioScore,
      }),
    );
  }
  if (!browser.focused || browser.visibilityState === "hidden") {
    incidents.push(createIncident(interview, "tab_switch", 0.93, "high"));
  }
  if (!browser.fullScreen && interview.controls.fullscreenRequired) {
    incidents.push(createIncident(interview, "fullscreen_exit", 0.88, "medium"));
  }
  if (browser.screenShareActive) incidents.push(createIncident(interview, "screen_share_detected", 0.98, "critical"));
  if (browser.devtoolsLikelyOpen) incidents.push(createIncident(interview, "devtools_opened", 0.64, "low"));

  const filtered = incidents.filter(Boolean);
  updateRisk(interview, filtered);
  interview.incidents.unshift(...filtered);
  interview.incidents = interview.incidents.slice(0, 300);
  publishSession(interview);
  emitIncidents(interview, filtered);
  return { risk: interview.risk, incidents: filtered };
}

function ingestDesktopTelemetry(payload) {
  const interview = state.interviews.get(payload.sessionId);
  if (!interview) return null;
  interview.status = "live";
  interview.telemetry.desktop = payload;
  const incidents = [];
  const frontmostApp = payload.frontmostApp || "";
  const activeUrl = payload.tabUrl || "";
  if (frontmostApp && !BROWSER_APPS.has(frontmostApp)) {
    incidents.push(createIncident(interview, "app_switch_detected", 0.96, "critical", { frontmostApp }));
  }
  if (BROWSER_APPS.has(frontmostApp) && activeUrl && !activeUrl.includes(interview.token)) {
    incidents.push(
      createIncident(interview, "browser_navigation_detected", 0.94, "high", {
        frontmostApp,
        tabUrl: activeUrl,
        tabTitle: payload.tabTitle,
      }),
    );
  }
  const filtered = incidents.filter(Boolean);
  updateRisk(interview, filtered);
  interview.incidents.unshift(...filtered);
  interview.incidents = interview.incidents.slice(0, 300);
  publishSession(interview);
  emitIncidents(interview, filtered);
  return { risk: interview.risk, incidents: filtered };
}

function updateRoomPresence(sessionId, payload) {
  const interview = state.interviews.get(sessionId);
  if (!interview) return null;
  if (payload.role === "candidate") {
    if (typeof payload.joined === "boolean") interview.presence.candidateJoined = payload.joined;
    if (typeof payload.ready === "boolean") interview.presence.candidateReady = payload.ready;
    if (typeof payload.audioLevel === "number") interview.presence.candidateAudioLevel = payload.audioLevel;
    if (payload.precheck) {
      interview.precheck = { ...interview.precheck, ...payload.precheck };
    }
  }
  if (payload.role === "admin") {
    if (typeof payload.joined === "boolean") interview.presence.adminJoined = payload.joined;
    if (typeof payload.ready === "boolean") interview.presence.adminReady = payload.ready;
    if (typeof payload.audioLevel === "number") interview.presence.adminAudioLevel = payload.audioLevel;
  }
  publishSession(interview);
  return sanitizeInterview(interview);
}

function addRoomMessage(sessionId, message) {
  const interview = state.interviews.get(sessionId);
  if (!interview) return null;
  const entry = {
    id: `msg_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    authorRole: message.authorRole,
    authorName: message.authorName || (message.authorRole === "admin" ? "Admin" : interview.candidateName),
    text: String(message.text || "").trim().slice(0, 1500),
  };
  if (!entry.text) return null;
  interview.chat.push(entry);
  interview.chat = interview.chat.slice(-200);
  saveInterview(interview);
  broadcastRoom(sessionId, { type: "room_message", message: entry });
  return entry;
}

function addAdminNote(sessionId, noteText) {
  const interview = state.interviews.get(sessionId);
  if (!interview) return null;
  const entry = {
    id: `note_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    text: String(noteText || "").trim().slice(0, 2000),
  };
  if (!entry.text) return null;
  interview.notes.push(entry);
  interview.notes = interview.notes.slice(-200);
  saveInterview(interview);
  return entry;
}

function updateControl(sessionId, action) {
  const interview = state.interviews.get(sessionId);
  if (!interview) return null;
  if (action.type === "warn") {
    interview.controls.warning = action.message || "Please return your focus to the interview.";
  }
  if (action.type === "end") {
    interview.controls.ended = true;
    interview.status = "ended";
  }
  if (action.type === "toggle_fullscreen") {
    interview.controls.fullscreenRequired = Boolean(action.enabled);
  }
  if (action.type === "note") {
    addAdminNote(sessionId, action.text);
  }
  saveInterview(interview);
  const session = sanitizeInterview(interview);
  broadcast({ type: "control_update", session });
  broadcastRoom(interview.id, { type: "control_update", session });
  return interview;
}

function getAdminSnapshot() {
  const sessions = Array.from(state.interviews.values())
    .sort((a, b) => new Date(b.risk.updatedAt).getTime() - new Date(a.risk.updatedAt).getTime())
    .map(sanitizeInterview);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: sessions.length,
      live: sessions.filter((session) => session.status === "live").length,
      highRisk: sessions.filter((session) => session.risk.score >= 70).length,
      averageRisk: sessions.length ? Math.round(sessions.reduce((sum, session) => sum + session.risk.score, 0) / sessions.length) : 0,
    },
    sessions,
  };
}

function buildInterviewReport(sessionId) {
  const interview = state.interviews.get(sessionId);
  if (!interview) return null;
  return {
    generatedAt: new Date().toISOString(),
    session: sanitizeInterview(interview),
    summary: {
      totalIncidents: interview.incidents.length,
      criticalIncidents: interview.incidents.filter((incident) => incident.severity === "critical").length,
      lastRiskScore: interview.risk.score,
      topCategories: Object.entries(interview.risk.counts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    },
    incidents: interview.incidents,
    chat: interview.chat,
    notes: interview.notes,
    precheck: interview.precheck,
  };
}

const requestHandler = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/") return serveFile(response, path.join(publicDir, "index.html"));
  if (request.method === "GET" && pathname === "/candidate.html") return serveFile(response, path.join(publicDir, "candidate.html"));
  if (request.method === "GET" && pathname === "/admin.html") return serveFile(response, path.join(publicDir, "admin.html"));
  if (request.method === "GET" && pathname === "/room.html") return serveFile(response, path.join(publicDir, "room.html"));
  if (request.method === "GET" && pathname.startsWith("/assets/")) {
    const safePath = path.normalize(path.join(publicDir, pathname));
    if (!safePath.startsWith(publicDir)) return notFound(response);
    return serveFile(response, safePath);
  }

  if (request.method === "GET" && pathname === "/api/events") {
    if (!isAuthorizedAdmin(url, request)) return json(response, 401, { error: "Unauthorized" });
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    response.write(`data: ${JSON.stringify({ type: "snapshot", payload: getAdminSnapshot() })}\n\n`);
    state.admins.add(response);
    request.on("close", () => state.admins.delete(response));
    return;
  }

  if (request.method === "GET" && pathname === "/api/admin/state") {
    if (!isAuthorizedAdmin(url, request)) return json(response, 401, { error: "Unauthorized" });
    return json(response, 200, getAdminSnapshot());
  }

  if (request.method === "GET" && pathname === "/api/session") {
    const interview = resolveSessionByToken(url.searchParams.get("token"));
    if (!interview) return json(response, 404, { error: "Invalid or expired link" });
    return json(response, 200, sanitizeInterview(interview));
  }

  if (request.method === "GET" && pathname === "/api/room-state") {
    const interview = resolveSessionForRoom(url, request);
    if (!interview) return json(response, 401, { error: "Unauthorized room access" });
    return json(response, 200, sanitizeInterview(interview));
  }

  if (request.method === "GET" && pathname === "/api/room-events") {
    const interview = resolveSessionForRoom(url, request);
    if (!interview) return json(response, 401, { error: "Unauthorized room access" });
    const role = url.searchParams.get("role") || "unknown";
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    response.write(`data: ${JSON.stringify({ type: "session_update", session: sanitizeInterview(interview) })}\n\n`);
    const unsubscribe = subscribeRoom(interview.id, role, response);
    request.on("close", unsubscribe);
    return;
  }

  if (request.method === "GET" && pathname === "/api/report") {
    if (!isAuthorizedAdmin(url, request)) return json(response, 401, { error: "Unauthorized" });
    const report = buildInterviewReport(url.searchParams.get("sessionId"));
    if (!report) return json(response, 404, { error: "Unknown session" });
    return json(response, 200, report);
  }

  if (request.method === "POST" && pathname === "/api/admin-login") {
    try {
      const body = await parseBody(request);
      if ((body.password || "") !== ADMIN_PASSWORD) return json(response, 401, { error: "Invalid admin password" });
      return json(response, 200, { accessKey: createAdminAccessKey(), expiresInMs: ADMIN_SESSION_TTL_MS });
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  if (request.method === "POST" && pathname === "/api/schedule") {
    try {
      if (!isAuthorizedAdmin(url, request)) return json(response, 401, { error: "Unauthorized" });
      const interview = createInterview(await parseBody(request), request);
      return json(response, 201, sanitizeInterview(interview));
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  if (request.method === "POST" && pathname === "/api/telemetry") {
    try {
      const result = ingestTelemetry(await parseBody(request));
      if (!result) return json(response, 404, { error: "Unknown session" });
      return json(response, 200, result);
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  if (request.method === "POST" && pathname === "/api/desktop") {
    try {
      const result = ingestDesktopTelemetry(await parseBody(request));
      if (!result) return json(response, 404, { error: "Unknown session" });
      return json(response, 200, result);
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  if (request.method === "POST" && pathname === "/api/control") {
    try {
      if (!isAuthorizedAdmin(url, request)) return json(response, 401, { error: "Unauthorized" });
      const body = await parseBody(request);
      const interview = updateControl(body.sessionId, body);
      if (!interview) return json(response, 404, { error: "Unknown session" });
      return json(response, 200, sanitizeInterview(interview));
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  if (request.method === "POST" && pathname === "/api/room-signal") {
    try {
      const body = await parseBody(request);
      const queryUrl = new URL(request.url, `http://${request.headers.host}`);
      const authorized = resolveSessionForRoom(queryUrl, request) || (body.token && parseSignedInviteToken(body.token)?.sessionId === body.sessionId);
      if (!authorized) return json(response, 401, { error: "Unauthorized room access" });
      broadcastRoom(body.sessionId, {
        type: "signal",
        fromRole: body.fromRole,
        targetRole: body.targetRole,
        description: body.description,
      });
      return json(response, 200, { ok: true });
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  if (request.method === "POST" && pathname === "/api/room-message") {
    try {
      const body = await parseBody(request);
      const queryUrl = new URL(request.url, `http://${request.headers.host}`);
      const authorized = resolveSessionForRoom(queryUrl, request) || (body.token && parseSignedInviteToken(body.token)?.sessionId === body.sessionId);
      if (!authorized) return json(response, 401, { error: "Unauthorized room access" });
      const message = addRoomMessage(body.sessionId, body);
      if (!message) return json(response, 400, { error: "Message cannot be empty" });
      return json(response, 201, message);
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  if (request.method === "POST" && pathname === "/api/room-presence") {
    try {
      const body = await parseBody(request);
      const queryUrl = new URL(request.url, `http://${request.headers.host}`);
      const authorized = resolveSessionForRoom(queryUrl, request) || (body.token && parseSignedInviteToken(body.token)?.sessionId === body.sessionId);
      if (!authorized) return json(response, 401, { error: "Unauthorized room access" });
      return json(response, 200, updateRoomPresence(body.sessionId, body));
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }

  return notFound(response);
};

loadState();

if (state.interviews.size === 0) {
  createInterview(
    {
      candidateName: "Demo Candidate",
      candidateEmail: "candidate@example.com",
      interviewerName: "Admin",
      startsAt: new Date().toISOString(),
      timeZone: "Asia/Kolkata",
      durationMinutes: 45,
      monitoringProfile: "strict",
    },
    undefined,
  );
}

const listener =
  SSL_KEY_FILE && SSL_CERT_FILE
    ? https.createServer(
        {
          key: fs.readFileSync(SSL_KEY_FILE),
          cert: fs.readFileSync(SSL_CERT_FILE),
        },
        requestHandler,
      )
    : http.createServer(requestHandler);

listener.listen(PORT, HOST, () => {
  const protocol = SSL_KEY_FILE && SSL_CERT_FILE ? "https" : "http";
  console.log(`AI interview monitor running at ${protocol}://${HOST}:${PORT}`);
});
