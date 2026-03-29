export type EventType =
  | "face_missing"
  | "identity_mismatch"
  | "multiple_faces"
  | "phone_detected"
  | "gaze_away_excessive"
  | "head_pose_suspicious"
  | "multiple_voices"
  | "prompt_audio_detected"
  | "tab_switch"
  | "fullscreen_exit"
  | "screen_share_detected";

export interface DetectionEvent {
  id: string;
  sessionId: string;
  candidateId: string;
  type: EventType;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  timestamp: string;
  evidence?: Record<string, unknown>;
}

export interface RiskSnapshot {
  sessionId: string;
  candidateId: string;
  riskScore: number;
  updatedAt: string;
  reasons: Array<{
    type: EventType;
    weight: number;
    confidence: number;
  }>;
}

export interface ScheduleInterviewInput {
  candidateEmail: string;
  candidateName: string;
  interviewerName: string;
  startsAt: string;
  timeZone: string;
  durationMinutes: number;
  monitoringProfile: "standard" | "strict";
}

export interface TelemetryPayload {
  sessionId: string;
  candidateId: string;
  timestamp: string;
  browser: {
    focused: boolean;
    fullScreen: boolean;
    visibilityState: "visible" | "hidden";
  };
  localSignals: {
    facePresent: boolean;
    facesDetected: number;
    gazeAwayScore: number;
    headPoseScore: number;
    phoneDetected: boolean;
    multipleVoices: boolean;
  };
}
