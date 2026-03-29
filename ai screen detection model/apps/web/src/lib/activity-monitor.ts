import type { TelemetryPayload } from "@ai-monitor/contracts";

interface ActivityMonitorOptions {
  sessionId: string;
  candidateId: string;
  onTelemetry: (payload: TelemetryPayload) => void;
}

export function startActivityMonitor(options: ActivityMonitorOptions) {
  const emit = () => {
    options.onTelemetry({
      sessionId: options.sessionId,
      candidateId: options.candidateId,
      timestamp: new Date().toISOString(),
      browser: {
        focused: document.hasFocus(),
        fullScreen: Boolean(document.fullscreenElement),
        visibilityState: document.visibilityState,
      },
      localSignals: {
        facePresent: true,
        facesDetected: 1,
        gazeAwayScore: 0.15,
        headPoseScore: 0.11,
        phoneDetected: false,
        multipleVoices: false,
      },
    });
  };

  const interval = window.setInterval(emit, 1000);
  window.addEventListener("blur", emit);
  document.addEventListener("visibilitychange", emit);
  document.addEventListener("fullscreenchange", emit);

  return () => {
    clearInterval(interval);
    window.removeEventListener("blur", emit);
    document.removeEventListener("visibilitychange", emit);
    document.removeEventListener("fullscreenchange", emit);
  };
}
