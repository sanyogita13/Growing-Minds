import type {
  DetectionEvent,
  RiskSnapshot,
  ScheduleInterviewInput,
  TelemetryPayload,
} from "@ai-monitor/contracts";
import { buildRiskSnapshot } from "../../inference/src/risk-engine";

interface SessionRecord {
  id: string;
  candidateId: string;
  candidateName: string;
  risk: RiskSnapshot;
  incidents: DetectionEvent[];
}

const sessions = new Map<string, SessionRecord>();
const subscribers = new Set<(message: GatewayMessage) => void>();

type GatewayMessage =
  | { type: "risk_update"; payload: RiskSnapshot }
  | { type: "incident"; payload: DetectionEvent }
  | { type: "schedule_created"; payload: ScheduleInterviewInput & { sessionId: string } };

export function createInterviewSession(input: {
  candidateId: string;
  candidateName: string;
}): SessionRecord {
  const sessionId = `sess_${crypto.randomUUID()}`;
  const risk: RiskSnapshot = {
    sessionId,
    candidateId: input.candidateId,
    riskScore: 0,
    updatedAt: new Date().toISOString(),
    reasons: [],
  };

  const session = {
    id: sessionId,
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    risk,
    incidents: [],
  };

  sessions.set(sessionId, session);
  return session;
}

export function scheduleInterview(input: ScheduleInterviewInput) {
  const session = createInterviewSession({
    candidateId: `cand_${crypto.randomUUID()}`,
    candidateName: input.candidateName,
  });

  broadcast({
    type: "schedule_created",
    payload: { ...input, sessionId: session.id },
  });

  return session;
}

export function ingestTelemetry(payload: TelemetryPayload) {
  const session = sessions.get(payload.sessionId);
  if (!session) {
    throw new Error(`Unknown session: ${payload.sessionId}`);
  }

  const { snapshot, incidents } = buildRiskSnapshot(payload);
  session.risk = snapshot;
  session.incidents.unshift(...incidents);

  broadcast({ type: "risk_update", payload: snapshot });
  incidents.forEach((incident) => broadcast({ type: "incident", payload: incident }));

  return { risk: snapshot, incidents };
}

export function subscribe(listener: (message: GatewayMessage) => void) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function getDashboardState() {
  return Array.from(sessions.values()).map((session) => ({
    sessionId: session.id,
    candidateId: session.candidateId,
    candidateName: session.candidateName,
    risk: session.risk,
    incidents: session.incidents.slice(0, 10),
  }));
}

function broadcast(message: GatewayMessage) {
  subscribers.forEach((listener) => listener(message));
}
