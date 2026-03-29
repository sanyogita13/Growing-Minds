const params = new URLSearchParams(window.location.search);
const role = params.get("role") || "candidate";
const token = params.get("token") || "";
const auth = params.get("auth") || "";
const sessionIdFromQuery = params.get("sessionId") || "";

const roleBadge = document.getElementById("room-role-badge");
const roomTitle = document.getElementById("room-title");
const roomSummary = document.getElementById("room-summary");
const secureContextNote = document.getElementById("secure-context-note");
const roomStatus = document.getElementById("room-status");
const roomWarning = document.getElementById("room-warning");
const incidentFeed = document.getElementById("incident-feed");
const alertOverlay = document.getElementById("alert-overlay");
const alertText = document.getElementById("alert-text");
const remoteVideo = document.getElementById("remote-video");
const localVideo = document.getElementById("local-video");
const joinCallButton = document.getElementById("join-call");
const fullscreenButton = document.getElementById("fullscreen-toggle");
const muteButton = document.getElementById("mute-toggle");
const cameraButton = document.getElementById("camera-toggle");
const readyButton = document.getElementById("ready-toggle");
const localLabel = document.getElementById("local-label");
const remoteLabel = document.getElementById("remote-label");
const localSpeaking = document.getElementById("local-speaking");
const remoteSpeaking = document.getElementById("remote-speaking");
const precheckGrid = document.getElementById("precheck-grid");
const chatFeed = document.getElementById("chat-feed");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

const LEFT_EYE = { outer: 33, inner: 133, top: 159, bottom: 145, iris: [468, 469, 470, 471, 472] };
const RIGHT_EYE = { outer: 263, inner: 362, top: 386, bottom: 374, iris: [473, 474, 475, 476, 477] };
const FACE_AXES = { nose: 4, left: 234, right: 454, top: 10, bottom: 152 };

let session = null;
let localStream = null;
let peerConnection = null;
let roomEvents = null;
let faceLandmarker = null;
let visionStatus = "Awaiting join";
let telemetryInterval = 0;
let analysisInterval = 0;
let refreshInterval = 0;
let audioAnalyser = null;
let audioData = null;
let previousFrame = null;
let telemetryInFlight = false;
let mediaReady = false;
let joined = false;
let ready = false;
let pendingSignal = null;
let lastVideoSignals = {
  facePresent: false,
  facesDetected: 0,
  gazeAwayScore: 0,
  headPoseScore: 0,
  phoneDetected: false,
  motionScore: 0,
};
const history = { gaze: [], pose: [], faces: [] };
const incidentState = [];

const canvas = document.createElement("canvas");
canvas.width = 320;
canvas.height = 240;
const context = canvas.getContext("2d", { willReadFrequently: true });

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pushHistory(bucket, value, limit = 6) {
  bucket.push(value);
  if (bucket.length > limit) bucket.shift();
  return average(bucket);
}

function averagePoint(points) {
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  };
}

function roomQuery() {
  const query = new URLSearchParams();
  if (role === "admin") {
    query.set("sessionId", session?.id || sessionIdFromQuery);
    query.set("auth", auth);
  } else {
    query.set("token", token);
  }
  return query.toString();
}

async function api(path, method = "GET", body) {
  const response = await fetch(`${path}${path.includes("?") ? "&" : "?"}${roomQuery()}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

async function loadRoomState() {
  session = await api("/api/room-state");
  roleBadge.textContent = role === "admin" ? "Admin Live Room" : "Candidate Live Room";
  roomTitle.textContent =
    role === "admin" ? `Interview with ${session.candidateName}` : `Interview with ${session.interviewerName}`;
  roomSummary.textContent =
    role === "admin"
      ? "Ask questions in realtime while the system monitors candidate activity and streams overlays."
      : "Complete the pre-checks, join the call, and stay visible throughout the interview.";
  localLabel.textContent = role === "admin" ? "Admin camera" : "Your camera";
  remoteLabel.textContent = role === "admin" ? session.candidateName : session.interviewerName;
  roomWarning.textContent = session.controls.warning || "No current warning.";
  ready = role === "admin" ? session.presence.adminReady : session.presence.candidateReady;
  readyButton.textContent = ready ? "Ready confirmed" : "Mark ready";
  renderPrecheck();
  renderStatus();
  renderIncidents();
  renderChat();
}

async function startLocalMedia() {
  if (mediaReady) return;
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 960, height: 540, facingMode: "user" },
    audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  });
  localVideo.srcObject = localStream;
  await localVideo.play();

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(localStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  audioData = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);
  audioAnalyser = analyser;
  mediaReady = true;
}

async function loadVisionModel() {
  if (role !== "candidate") {
    visionStatus = "Monitoring disabled for admin";
    return;
  }
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
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    visionStatus = "MediaPipe face model active";
  } catch (error) {
    visionStatus = `Fallback mode: ${error.message}`;
  }
}

async function ensureMediaReady() {
  if (mediaReady) return;
  await startLocalMedia();
  await loadVisionModel();
  secureContextNote.textContent = "Camera and microphone are active for this session.";
  await updatePresence({ joined: true });
}

function getAudioSignals() {
  if (!audioAnalyser || !audioData) {
    return { audioLevel: 0, multipleVoices: false, promptAudioScore: 0 };
  }
  audioAnalyser.getByteFrequencyData(audioData);
  const values = Array.from(audioData);
  const avg = average(values) / 255;
  const highAvg = average(values.slice(Math.floor(values.length * 0.55))) / 255;
  const lowAvg = average(values.slice(0, Math.floor(values.length * 0.25))) / 255;
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
    if (previousFrame) motion += Math.abs(luminance - previousFrame[index / 4]);
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
  return clamp(Math.abs(horizontalRatio - 0.5) * 1.6 + Math.abs(verticalRatio - 0.5) * 1.2);
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
  if (role !== "candidate" || !mediaReady || !localVideo.videoWidth || !localVideo.videoHeight) return;
  context.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const fallback = fallbackSignalsFromFrame(imageData);
  if (!faceLandmarker) {
    lastVideoSignals = fallback;
    return;
  }
  try {
    const detection = faceLandmarker.detectForVideo(localVideo, performance.now());
    const landmarksList = detection.faceLandmarks || [];
    if (!landmarksList.length) {
      lastVideoSignals = { ...fallback, facePresent: false, facesDetected: 0, gazeAwayScore: 1, headPoseScore: 1 };
      return;
    }
    const primary = landmarksList[0];
    const gaze = pushHistory(
      history.gaze,
      clamp((computeGazeScore(primary, LEFT_EYE) + computeGazeScore(primary, RIGHT_EYE)) / 2),
    );
    const pose = pushHistory(history.pose, computeHeadPoseScore(primary));
    const faces = Math.round(pushHistory(history.faces, landmarksList.length));
    lastVideoSignals = {
      facePresent: true,
      facesDetected: Math.max(landmarksList.length, faces),
      gazeAwayScore: Number(gaze.toFixed(3)),
      headPoseScore: Number(pose.toFixed(3)),
      phoneDetected: fallback.phoneDetected,
      motionScore: fallback.motionScore,
    };
  } catch {
    lastVideoSignals = fallback;
  }
}

async function updatePresence(partial = {}) {
  if (!session) return;
  const audioSignals = getAudioSignals();
  session = await api("/api/room-presence", "POST", {
    sessionId: session.id,
    token,
    role,
    audioLevel: audioSignals.audioLevel,
    ...partial,
  });
  renderStatus();
}

async function sendTelemetry(reason = "tick", urgent = false) {
  if (role !== "candidate" || !session || telemetryInFlight || !mediaReady) return;
  telemetryInFlight = true;
  try {
    await analyzeVideo();
    const audioSignals = getAudioSignals();
    const body = {
      sessionId: session.id,
      candidateId: session.candidateId,
      timestamp: new Date().toISOString(),
      reason,
      audioLevel: audioSignals.audioLevel,
      browser: browserSignals(),
      localSignals: {
        ...lastVideoSignals,
        ...audioSignals,
      },
    };
    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: urgent,
    });
    await updatePresence({ joined: true, audioLevel: audioSignals.audioLevel });
  } finally {
    telemetryInFlight = false;
  }
}

function renderStatus() {
  const desktop = session?.telemetry?.desktop;
  const isCandidate = role === "candidate";
  roomStatus.innerHTML = [
    { label: "Role", value: role },
    {
      label: "Detection stack",
      value: isCandidate ? `Web live | ${desktop?.frontmostApp ? "Desktop agent linked" : "Browser-only mode"}` : "Admin observation mode",
    },
    { label: "Vision", value: visionStatus },
    { label: "Risk score", value: `${session?.risk?.score || 0}` },
    { label: "Faces in frame", value: `${lastVideoSignals.facesDetected}` },
    { label: "Gaze score", value: `${lastVideoSignals.gazeAwayScore}` },
    { label: "Head pose", value: `${lastVideoSignals.headPoseScore}` },
    { label: "Desktop app", value: desktop?.frontmostApp || "No desktop agent" },
    { label: "Candidate ready", value: session?.presence?.candidateReady ? "Ready" : "Pending" },
    { label: "Admin ready", value: session?.presence?.adminReady ? "Ready" : "Pending" },
  ]
    .map((item) => `<div class="status-pill"><strong>${item.label}</strong><div class="muted">${item.value}</div></div>`)
    .join("");

  localSpeaking.textContent = `${role} ${audioLevelLabel(role === "candidate" ? session?.presence?.candidateAudioLevel : session?.presence?.adminAudioLevel)}`;
  remoteSpeaking.textContent =
    role === "candidate"
      ? `Admin ${audioLevelLabel(session?.presence?.adminAudioLevel)}`
      : `Candidate ${audioLevelLabel(session?.presence?.candidateAudioLevel)}`;
}

function audioLevelLabel(level = 0) {
  if (level > 0.22) return "speaking";
  if (level > 0.08) return "active";
  return "silent";
}

function renderPrecheck() {
  const precheck = session?.precheck || {};
  precheckGrid.innerHTML = [
    { label: "Permissions", value: precheck.permissions },
    { label: "Device", value: precheck.device },
    { label: "Network", value: precheck.network },
    { label: "Framing", value: precheck.framing },
  ]
    .map((item) => `<div class="status-pill"><strong>${item.label}</strong><div class="muted">${item.value}</div></div>`)
    .join("");
}

function renderIncidents() {
  incidentFeed.innerHTML = incidentState.length
    ? incidentState
        .slice(0, 8)
        .map(
          (incident) =>
            `<div class="alert-card"><strong>${incident.type}</strong><div class="muted">${new Date(incident.timestamp).toLocaleTimeString()} | ${Math.round(incident.confidence * 100)}%</div></div>`,
        )
        .join("")
    : `<div class="status-pill"><strong>Alert feed</strong><div class="muted">No incidents yet.</div></div>`;
}

function renderChat() {
  const messages = session?.chat || [];
  chatFeed.innerHTML = messages.length
    ? messages
        .slice(-40)
        .map(
          (message) => `
          <div class="chat-message ${message.authorRole === role ? "chat-own" : ""}">
            <strong>${message.authorName}</strong>
            <div>${message.text}</div>
            <div class="muted">${new Date(message.createdAt).toLocaleTimeString()}</div>
          </div>
        `,
        )
        .join("")
    : `<div class="status-pill"><strong>Chat</strong><div class="muted">No messages yet.</div></div>`;
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function showOverlay(text) {
  alertText.textContent = text;
  alertOverlay.classList.remove("hidden");
  clearTimeout(showOverlay.timeoutId);
  showOverlay.timeoutId = setTimeout(() => alertOverlay.classList.add("hidden"), 2800);
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  if (localStream) {
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  }
  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    remoteVideo.srcObject = remoteStream;
  };
  peerConnection.onicecandidate = async (event) => {
    if (!event.candidate || !session) return;
    await sendSignal({ type: "ice-candidate", candidate: event.candidate });
  };
}

async function sendSignal(description) {
  if (!session) return;
  const query = new URLSearchParams();
  if (role === "admin") {
    query.set("sessionId", session.id);
    query.set("auth", auth);
  } else {
    query.set("token", token);
  }
  await fetch(`/api/room-signal?${query.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: session.id,
      fromRole: role,
      targetRole: role === "admin" ? "candidate" : "admin",
      description,
      token,
    }),
  });
}

async function joinCall() {
  if (joined) return;
  await ensureMediaReady();
  await runPrechecks();
  await createPeerConnection();
  if (role === "admin") {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendSignal({ type: "offer", sdp: offer });
  } else if (pendingSignal) {
    const signal = pendingSignal;
    pendingSignal = null;
    await handleSignal(signal);
  }
  joined = true;
  joinCallButton.textContent = "Connected";
  joinCallButton.disabled = true;
  await updatePresence({ joined: true });
  if (role === "candidate") {
    await analyzeVideo();
    await sendTelemetry("room_joined", true);
    if (!analysisInterval) analysisInterval = window.setInterval(() => analyzeVideo(), 350);
    if (!telemetryInterval) telemetryInterval = window.setInterval(() => sendTelemetry("realtime_tick"), 700);
    if (!refreshInterval) refreshInterval = window.setInterval(loadRoomState, 1600);
  } else if (!refreshInterval) {
    refreshInterval = window.setInterval(() => updatePresence({ joined: true }), 1800);
  }
}

async function handleSignal(message) {
  if (!message.description || message.fromRole === role) return;
  if (role === "candidate" && !mediaReady && message.description.type === "offer") {
    pendingSignal = message;
    roomWarning.textContent = "Admin is ready. Press Join call to grant camera/microphone access and connect.";
    return;
  }
  if (!peerConnection) {
    await createPeerConnection();
  }
  const description = message.description;
  if (description.type === "offer") {
    if (!mediaReady) {
      await ensureMediaReady();
    }
    await peerConnection.setRemoteDescription(description.sdp);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await sendSignal({ type: "answer", sdp: answer });
    joined = true;
    joinCallButton.textContent = "Connected";
    joinCallButton.disabled = true;
    if (!analysisInterval && role === "candidate") analysisInterval = window.setInterval(() => analyzeVideo(), 350);
    if (!telemetryInterval && role === "candidate") telemetryInterval = window.setInterval(() => sendTelemetry("realtime_tick"), 700);
    if (!refreshInterval) refreshInterval = window.setInterval(() => loadRoomState(), 1600);
    return;
  }
  if (description.type === "answer") {
    await peerConnection.setRemoteDescription(description.sdp);
    return;
  }
  if (description.type === "ice-candidate" && description.candidate) {
    try {
      await peerConnection.addIceCandidate(description.candidate);
    } catch {}
  }
}

async function runPrechecks() {
  if (role !== "candidate" || !localStream) return;
  const tracks = {
    permissions: localStream.getVideoTracks().length && localStream.getAudioTracks().length ? "ok" : "blocked",
    device: localStream.getVideoTracks().length ? "camera+mic detected" : "camera missing",
    network: navigator.onLine ? "stable" : "offline",
    framing: lastVideoSignals.facePresent ? "face detected" : "adjust camera framing",
    completedAt: new Date().toISOString(),
  };
  session = await api("/api/room-presence", "POST", {
    sessionId: session.id,
    token,
    role,
    precheck: tracks,
    joined: true,
  });
  renderPrecheck();
}

function bindImmediateCandidateEvents() {
  if (role !== "candidate") return;
  const urgent = (reason) => sendTelemetry(reason, true);
  window.addEventListener("blur", () => urgent("window_blur"));
  document.addEventListener("visibilitychange", () => urgent(`visibility_${document.visibilityState}`));
  document.addEventListener("fullscreenchange", () => urgent("fullscreen_change"));
  window.addEventListener("pagehide", () => urgent("page_hide"));
}

async function connectRoomEvents() {
  roomEvents = new EventSource(`/api/room-events?role=${encodeURIComponent(role)}&${roomQuery()}`);
  roomEvents.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "session_update" || message.type === "control_update") {
      session = message.session;
      roomWarning.textContent = session.controls.warning || "No current warning.";
      renderPrecheck();
      renderStatus();
      renderChat();
      return;
    }
    if (message.type === "incident") {
      incidentState.unshift(message.incident);
      renderIncidents();
      showOverlay(`Alert: ${message.incident.type.replaceAll("_", " ")}`);
      return;
    }
    if (message.type === "room_message") {
      session.chat.push(message.message);
      renderChat();
      return;
    }
    if (message.type === "signal") {
      await handleSignal(message);
    }
  };
}

async function sendChatMessage(text) {
  if (!text.trim() || !session) return;
  await api("/api/room-message", "POST", {
    sessionId: session.id,
    token,
    authorRole: role,
    authorName: role === "admin" ? "Admin" : session.candidateName,
    text,
  });
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
    fullscreenButton.textContent = "Exit fullscreen";
    if (role === "candidate") await sendTelemetry("fullscreen_entered", true);
    return;
  }
  await document.exitFullscreen();
  fullscreenButton.textContent = "Enter fullscreen";
  if (role === "candidate") await sendTelemetry("fullscreen_exited_by_user", true);
}

muteButton.addEventListener("click", () => {
  if (!localStream) return;
  const enabled = localStream.getAudioTracks()[0]?.enabled ?? true;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !enabled;
  });
  muteButton.textContent = enabled ? "Unmute mic" : "Mute mic";
});

cameraButton.addEventListener("click", () => {
  if (!localStream) return;
  const enabled = localStream.getVideoTracks()[0]?.enabled ?? true;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = !enabled;
  });
  cameraButton.textContent = enabled ? "Show camera" : "Hide camera";
});

fullscreenButton.addEventListener("click", () => {
  toggleFullscreen().catch((error) => {
    roomWarning.textContent = `Fullscreen failed: ${error.message}`;
  });
});

readyButton.addEventListener("click", async () => {
  ready = !ready;
  try {
    await updatePresence({ ready, joined: joined || mediaReady });
    readyButton.textContent = ready ? "Ready confirmed" : "Mark ready";
  } catch (error) {
    roomWarning.textContent = error.message;
  }
});

joinCallButton.addEventListener("click", () => {
  joinCall().catch((error) => {
    roomWarning.textContent = `Call join failed: ${error.message}`;
  });
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await sendChatMessage(chatInput.value);
    chatInput.value = "";
  } catch (error) {
    roomWarning.textContent = error.message;
  }
});

async function init() {
  try {
    await loadRoomState();
    bindImmediateCandidateEvents();
    await connectRoomEvents();
    document.addEventListener("fullscreenchange", () => {
      fullscreenButton.textContent = document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen";
    });
    if (!window.isSecureContext) {
      secureContextNote.textContent =
        "This page is not secure. Camera and microphone usually require HTTPS or localhost. On this laptop use 127.0.0.1, or expose the site over HTTPS for phone access.";
      roomWarning.textContent = "Camera access may be blocked because this page is not HTTPS or localhost.";
    }
    renderPrecheck();
    renderStatus();
    renderIncidents();
    renderChat();
  } catch (error) {
    roomWarning.textContent = error.message;
  }
}

init();
