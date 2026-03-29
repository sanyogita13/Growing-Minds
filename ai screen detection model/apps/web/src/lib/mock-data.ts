import type { DetectionEvent, RiskSnapshot } from "@ai-monitor/contracts";

export const mockSessions: Array<{
  sessionId: string;
  candidateName: string;
  risk: RiskSnapshot;
}> = [
  {
    sessionId: "sess_101",
    candidateName: "Aanya Patel",
    risk: {
      sessionId: "sess_101",
      candidateId: "cand_101",
      riskScore: 18,
      updatedAt: new Date().toISOString(),
      reasons: [{ type: "gaze_away_excessive", weight: 0.16, confidence: 0.3 }],
    },
  },
  {
    sessionId: "sess_102",
    candidateName: "Rohan Singh",
    risk: {
      sessionId: "sess_102",
      candidateId: "cand_102",
      riskScore: 83,
      updatedAt: new Date().toISOString(),
      reasons: [
        { type: "multiple_voices", weight: 0.12, confidence: 0.9 },
        { type: "tab_switch", weight: 0.12, confidence: 0.92 },
      ],
    },
  },
];

export const mockAlerts: DetectionEvent[] = [
  {
    id: "evt_1",
    sessionId: "sess_102",
    candidateId: "cand_102",
    type: "multiple_voices",
    severity: "high",
    confidence: 0.9,
    timestamp: new Date().toISOString(),
  },
  {
    id: "evt_2",
    sessionId: "sess_102",
    candidateId: "cand_102",
    type: "tab_switch",
    severity: "high",
    confidence: 0.92,
    timestamp: new Date().toISOString(),
  },
];
