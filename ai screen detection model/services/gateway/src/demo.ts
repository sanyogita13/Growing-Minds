import type { ScheduleInterviewInput, TelemetryPayload } from "@ai-monitor/contracts";
import { getDashboardState, ingestTelemetry, scheduleInterview, subscribe } from "./server";

const input: ScheduleInterviewInput = {
  candidateEmail: "candidate@example.com",
  candidateName: "Demo Candidate",
  interviewerName: "Admin",
  startsAt: new Date().toISOString(),
  timeZone: "Asia/Kolkata",
  durationMinutes: 45,
  monitoringProfile: "strict",
};

const session = scheduleInterview(input);

subscribe((message) => {
  console.log("Realtime event", message.type);
});

const telemetry: TelemetryPayload = {
  sessionId: session.id,
  candidateId: session.candidateId,
  timestamp: new Date().toISOString(),
  browser: {
    focused: false,
    fullScreen: false,
    visibilityState: "hidden",
  },
  localSignals: {
    facePresent: true,
    facesDetected: 1,
    gazeAwayScore: 0.74,
    headPoseScore: 0.33,
    phoneDetected: false,
    multipleVoices: true,
  },
};

ingestTelemetry(telemetry);

console.log(JSON.stringify(getDashboardState(), null, 2));
