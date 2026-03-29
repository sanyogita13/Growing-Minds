import type { DetectionEvent, RiskSnapshot, TelemetryPayload } from "@ai-monitor/contracts";

const WEIGHTS = {
  face_missing: 0.24,
  multiple_faces: 0.18,
  phone_detected: 0.18,
  gaze_away_excessive: 0.16,
  head_pose_suspicious: 0.08,
  multiple_voices: 0.12,
  tab_switch: 0.12,
  fullscreen_exit: 0.12,
} as const;

export function buildRiskSnapshot(payload: TelemetryPayload): {
  snapshot: RiskSnapshot;
  incidents: DetectionEvent[];
} {
  const incidents: DetectionEvent[] = [];

  if (!payload.localSignals.facePresent) {
    incidents.push(createIncident(payload, "face_missing", 0.94, "critical"));
  }

  if (payload.localSignals.facesDetected > 1) {
    incidents.push(createIncident(payload, "multiple_faces", 0.91, "critical"));
  }

  if (payload.localSignals.phoneDetected) {
    incidents.push(createIncident(payload, "phone_detected", 0.88, "high"));
  }

  if (payload.localSignals.gazeAwayScore > 0.65) {
    incidents.push(
      createIncident(payload, "gaze_away_excessive", payload.localSignals.gazeAwayScore, "medium"),
    );
  }

  if (payload.localSignals.headPoseScore > 0.7) {
    incidents.push(
      createIncident(payload, "head_pose_suspicious", payload.localSignals.headPoseScore, "medium"),
    );
  }

  if (payload.localSignals.multipleVoices) {
    incidents.push(createIncident(payload, "multiple_voices", 0.9, "high"));
  }

  if (!payload.browser.focused || payload.browser.visibilityState === "hidden") {
    incidents.push(createIncident(payload, "tab_switch", 0.92, "high"));
  }

  if (!payload.browser.fullScreen) {
    incidents.push(createIncident(payload, "fullscreen_exit", 0.86, "medium"));
  }

  const reasons = incidents.map((incident) => ({
    type: incident.type,
    weight: weightFor(incident.type),
    confidence: incident.confidence,
  }));

  const rawRisk = reasons.reduce((sum, reason) => sum + reason.weight * reason.confidence, 0);
  const riskScore = Math.round(Math.min(1, rawRisk) * 100);

  return {
    snapshot: {
      sessionId: payload.sessionId,
      candidateId: payload.candidateId,
      riskScore,
      updatedAt: payload.timestamp,
      reasons,
    },
    incidents,
  };
}

function createIncident(
  payload: TelemetryPayload,
  type: DetectionEvent["type"],
  confidence: number,
  severity: DetectionEvent["severity"],
): DetectionEvent {
  return {
    id: `evt_${crypto.randomUUID()}`,
    sessionId: payload.sessionId,
    candidateId: payload.candidateId,
    type,
    confidence,
    severity,
    timestamp: payload.timestamp,
  };
}

function weightFor(type: DetectionEvent["type"]) {
  return WEIGHTS[type as keyof typeof WEIGHTS] ?? 0.05;
}
