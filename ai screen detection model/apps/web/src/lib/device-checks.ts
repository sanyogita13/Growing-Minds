export interface DeviceCheckResult {
  camera: "ok" | "missing" | "blocked";
  microphone: "ok" | "missing" | "blocked";
  network: "stable" | "degraded";
}

export async function runDeviceChecks(): Promise<DeviceCheckResult> {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return {
      camera: "ok",
      microphone: "ok",
      network: navigator.onLine ? "stable" : "degraded",
    };
  } catch {
    return {
      camera: "blocked",
      microphone: "blocked",
      network: navigator.onLine ? "stable" : "degraded",
    };
  }
}
