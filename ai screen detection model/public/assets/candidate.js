const video = document.getElementById("camera");
const canvas = document.getElementById("analysis-canvas");
const statusList = document.getElementById("status-list");
const warningBox = document.getElementById("admin-warning");
const summary = document.getElementById("candidate-summary");
const fullscreenButton = document.getElementById("enter-fullscreen");
const context = canvas.getContext("2d", { willReadFrequently: true });

const token = new URLSearchParams(window.location.search).get("token");

const LEFT_EYE = { outer: 33, inner: 133, top: 159, bottom: 145, iris: [468, 469, 470, 471, 472] };
const RIGHT_EYE = { outer: 263, inner: 362, top: 386, bottom: 374, iris: [473, 474, 475, 476, 477] };
const FACE_AXES = { nose: 4, left: 234, right: 454, top: 10, bottom: 152 };

let session = null;
let mediaStream = null;
let audioAnalyser = null;
let audioData = null;
let previousFrame = null;
let telemetryInterval = 0;
let analysisInterval = 0;
let controlInterval = 0;
let telemetryInFlight = false;
let lastImmediateSendAt = 0;
let faceLandmarker = null;
let visionStatus = "Loading high-accuracy face model";
let lastVideoSignals = {
  facePresent: false,
  facesDetected: 0,
  gazeAwayScore: 0,
  headPoseScore: 0,
  phoneDetected: false,
  motionScore: 0,
};
const history = {
  gaze: [],
  pose: [],
  faces: [],
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pushHistory(bucket, value, limit = 6) {
  bucket.push(value);
  if (bucket.length > limit) {
    bucket.shift();
  }
  return average(bucket);
}

function averagePoint(points) {
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  };
}

function setStatuses(items) {
  statusList.innerHTML = items
    .map(
      (item) => `
      <div class="status-pill">
        <strong>${item.label}</strong>
        <div class="muted">${item.value}</div>
      </div>
    `,
    )
    .join("");
}

async function loadSession() {
  if (!token) {
    summary.textContent = "Missing secure invite token.";
    return;
  }

  const response = await fetch(`/api/session?token=${encodeURIComponent(token)}`);
  const payload = await response.json();
  if (!response.ok) {
    summary.textContent = payload.error || "Unable to load session.";
    return;
  }

  session = payload;
  summary.textContent = `${payload.candidateName} | ${new Date(payload.startsAt).toLocaleString()} | ${payload.monitoringProfile} profile`;
  warningBox.textContent = payload.controls.warning || "No admin warning.";
}

async function startMedia() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 960, height: 540, facingMode: "user" },
    audio: {
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    },
  });
  video.srcObject = mediaStream;
  await video.play();

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  audioAnalyser = audioContext.createAnalyser();
  audioAnalyser.fftSize = 512;
  audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
  source.connect(audioAnalyser);
}

async function loadVisionModel() {
  try {
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    );

    faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      },
      runningMode: "VIDEO",
      numFaces: 3,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });

    visionStatus = "MediaPipe face model active";
  } catch (error) {
    visionStatus = `Fallback mode: ${error.message}`;
  }
}

function getAudioSignals() {
  if (!audioAnalyser || !audioData) {
    return { audioLevel: 0, multipleVoices: false, promptAudioScore: 0 };
  }

  audioAnalyser.getByteFrequencyData(audioData);
  const avg = average(Array.from(audioData)) / 255;
  const highBands = Array.from(audioData.slice(Math.floor(audioData.length * 0.55)));
  const highAvg = average(highBands) / 255;
  const lowBands = Array.from(audioData.slice(0, Math.floor(audioData.length * 0.25)));
  const lowAvg = average(lowBands) / 255;

  return {
    audioLevel: Number(avg.toFixed(3)),
    multipleVoices: avg > 0.26 && highAvg > 0.15 && lowAvg > 0.08,
    promptAudioScore: Number(clamp(highAvg * 1.8).toFixed(3)),
  };
}

function browserSignals() {
  const widthGap = Math.abs(window.outerWidth - window.innerWidth);
  const heightGap = Math.abs(window.outerHeight - window.innerHeight);
  return {
    focused: document.hasFocus(),
    fullScreen: Boolean(document.fullscreenElement),
    visibilityState: document.visibilityState,
    screenShareActive: false,
    devtoolsLikelyOpen: widthGap > 220 || heightGap > 220,
  };
}

function fallbackSignalsFromFrame(imageData) {
  const data = imageData.data;
  let totalLuminance = 0;
  let motion = 0;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
    totalLuminance += luminance;
    if (previousFrame) {
      motion += Math.abs(luminance - previousFrame[index / 4]);
    }
  }

  const pixels = data.length / 4;
  const averageBrightness = totalLuminance / pixels;
  const motionScore = previousFrame ? motion / pixels / 255 : 0;
  previousFrame = new Float32Array(pixels);

  for (let index = 0; index < data.length; index += 4) {
    previousFrame[index / 4] = (data[index] + data[index + 1] + data[index + 2]) / 3;
  }

  return {
    facePresent: averageBrightness > 18,
    facesDetected: averageBrightness > 18 ? 1 : 0,
    gazeAwayScore: Number(clamp(motionScore * 2.4).toFixed(3)),
    headPoseScore: Number(clamp(motionScore * 2.1).toFixed(3)),
    phoneDetected: averageBrightness > 210 && motionScore < 0.04,
    motionScore: Number(motionScore.toFixed(3)),
  };
}

function computeGazeScore(landmarks, eye) {
  const outer = landmarks[eye.outer];
  const inner = landmarks[eye.inner];
  const top = landmarks[eye.top];
  const bottom = landmarks[eye.bottom];
  const iris = averagePoint(eye.iris.map((index) => landmarks[index]));

  const minX = Math.min(outer.x, inner.x);
  const maxX = Math.max(outer.x, inner.x);
  const minY = Math.min(top.y, bottom.y);
  const maxY = Math.max(top.y, bottom.y);

  const horizontalRatio = clamp((iris.x - minX) / Math.max(0.001, maxX - minX));
  const verticalRatio = clamp((iris.y - minY) / Math.max(0.001, maxY - minY));

  const horizontalDeviation = Math.abs(horizontalRatio - 0.5) * 2;
  const verticalDeviation = Math.abs(verticalRatio - 0.5) * 2;

  return clamp(horizontalDeviation * 0.8 + verticalDeviation * 0.6);
}

function computeHeadPoseScore(landmarks) {
  const nose = landmarks[FACE_AXES.nose];
  const left = landmarks[FACE_AXES.left];
  const right = landmarks[FACE_AXES.right];
  const top = landmarks[FACE_AXES.top];
  const bottom = landmarks[FACE_AXES.bottom];

  const centerX = (left.x + right.x) / 2;
  const centerY = (top.y + bottom.y) / 2;
  const yaw = Math.abs(nose.x - centerX) / Math.max(0.001, Math.abs(right.x - left.x) / 2);
  const pitch = Math.abs(nose.y - centerY) / Math.max(0.001, Math.abs(bottom.y - top.y) / 2);

  return clamp(yaw * 0.9 + pitch * 0.55);
}

async function analyzeVideo() {
  if (!video.videoWidth || !video.videoHeight) {
    return lastVideoSignals;
  }

  const width = canvas.width;
  const height = canvas.height;
  context.drawImage(video, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const fallback = fallbackSignalsFromFrame(imageData);

  if (!faceLandmarker) {
    lastVideoSignals = fallback;
    return lastVideoSignals;
  }

  try {
    const detection = faceLandmarker.detectForVideo(video, performance.now());
    const landmarksList = detection.faceLandmarks || [];
    const facesDetected = landmarksList.length;
    const facePresent = facesDetected > 0;

    if (!facePresent) {
      lastVideoSignals = {
        ...fallback,
        facePresent: false,
        facesDetected: 0,
        gazeAwayScore: 1,
        headPoseScore: 1,
      };
      return lastVideoSignals;
    }

    const primary = landmarksList[0];
    const leftGaze = computeGazeScore(primary, LEFT_EYE);
    const rightGaze = computeGazeScore(primary, RIGHT_EYE);
    const smoothedGaze = pushHistory(history.gaze, clamp((leftGaze + rightGaze) / 2));
    const smoothedPose = pushHistory(history.pose, computeHeadPoseScore(primary));
    const smoothedFaces = Math.round(pushHistory(history.faces, facesDetected));

    lastVideoSignals = {
      facePresent,
      facesDetected: Math.max(facesDetected, smoothedFaces),
      gazeAwayScore: Number(smoothedGaze.toFixed(3)),
      headPoseScore: Number(smoothedPose.toFixed(3)),
      phoneDetected: fallback.phoneDetected,
      motionScore: fallback.motionScore,
    };

    return lastVideoSignals;
  } catch {
    lastVideoSignals = fallback;
    return lastVideoSignals;
  }
}

function buildPayload(reason = "interval") {
  const audioSignals = getAudioSignals();
  return {
    sessionId: session.id,
    candidateId: session.candidateId,
    timestamp: new Date().toISOString(),
    reason,
    browser: browserSignals(),
    localSignals: {
      ...lastVideoSignals,
      ...audioSignals,
    },
  };
}

function postPayload(body, urgent = false) {
  const serialized = JSON.stringify(body);

  if (urgent && navigator.sendBeacon) {
    navigator.sendBeacon("/api/telemetry", new Blob([serialized], { type: "application/json" }));
    return Promise.resolve();
  }

  return fetch("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: serialized,
    keepalive: urgent,
  });
}

function renderStatuses(body) {
  setStatuses([
    { label: "Vision model", value: visionStatus },
    { label: "Camera", value: mediaStream?.getVideoTracks().length ? "Connected" : "Unavailable" },
    { label: "Microphone", value: mediaStream?.getAudioTracks().length ? "Connected" : "Unavailable" },
    { label: "Window focus", value: body.browser.focused ? "Focused" : "Out of focus" },
    { label: "Fullscreen", value: body.browser.fullScreen ? "Enabled" : "Disabled" },
    { label: "Face presence", value: body.localSignals.facePresent ? "Detected" : "Missing" },
    { label: "Faces in frame", value: String(body.localSignals.facesDetected) },
    { label: "Gaze score", value: String(body.localSignals.gazeAwayScore) },
    { label: "Head pose score", value: String(body.localSignals.headPoseScore) },
    { label: "Audio level", value: `${Math.round(body.localSignals.audioLevel * 100)}%` },
  ]);
}

async function sendTelemetry(reason = "interval", urgent = false) {
  if (!session || !mediaStream || telemetryInFlight) {
    return;
  }

  telemetryInFlight = true;
  try {
    if (video.readyState >= 2) {
      await analyzeVideo();
    }

    const body = buildPayload(reason);
    await postPayload(body, urgent);
    renderStatuses(body);
  } finally {
    telemetryInFlight = false;
  }
}

async function refreshSessionControl() {
  if (!token) {
    return;
  }

  const response = await fetch(`/api/session?token=${encodeURIComponent(token)}`);
  const payload = await response.json();
  if (!response.ok) {
    return;
  }

  session = payload;
  warningBox.textContent = payload.controls.warning || "No admin warning.";

  if (payload.controls.ended) {
    warningBox.textContent = "Session ended by admin.";
    clearInterval(telemetryInterval);
    clearInterval(analysisInterval);
    clearInterval(controlInterval);
  }
}

function bindImmediateEvents() {
  const urgentReport = (reason) => {
    const now = Date.now();
    if (now - lastImmediateSendAt < 350 || !session) {
      return;
    }
    lastImmediateSendAt = now;
    sendTelemetry(reason, true);
  };

  window.addEventListener("blur", () => urgentReport("window_blur"));
  window.addEventListener("focus", () => urgentReport("window_focus"));
  window.addEventListener("pagehide", () => urgentReport("page_hide"));
  document.addEventListener("visibilitychange", () => urgentReport(`visibility_${document.visibilityState}`));
  document.addEventListener("fullscreenchange", () => urgentReport("fullscreen_change"));
}

fullscreenButton?.addEventListener("click", async () => {
  await document.documentElement.requestFullscreen();
  sendTelemetry("fullscreen_requested", true);
});

async function init() {
  await loadSession();
  if (!session) {
    return;
  }

  try {
    bindImmediateEvents();
    await startMedia();
    await loadVisionModel();
    await analyzeVideo();
    await sendTelemetry("session_start", true);

    analysisInterval = window.setInterval(() => {
      if (!telemetryInFlight) {
        analyzeVideo();
      }
    }, 350);

    telemetryInterval = window.setInterval(() => {
      sendTelemetry("realtime_tick");
    }, 700);

    controlInterval = window.setInterval(refreshSessionControl, 1200);
  } catch (error) {
    warningBox.textContent = `Media initialization failed: ${error.message}`;
  }
}

init();
