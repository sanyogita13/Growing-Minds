# AI Interview Monitoring and Cheating Detection System

This repository contains a production-oriented starter architecture for a real-time interview monitoring platform that combines:

- webcam and microphone monitoring
- browser and system activity telemetry
- multimodal risk scoring
- live admin alerts
- interview scheduling and candidate authentication

The design targets sub-200 ms event latency for alert propagation and a path toward high-precision detection through modality-specific models plus calibrated fusion.

## Monorepo Layout

```text
apps/
  web/                  Next.js frontend for candidate and admin UI
docs/                   Architecture, AI pipeline, and wireframes
services/
  gateway/              HTTP/WebSocket API and orchestration layer
  inference/            Real-time multimodal scoring pipeline
  notifications/        Email/SMS/webhook dispatch contracts
shared/
  contracts/            Shared TypeScript contracts and event schemas
```

## Core Capabilities

- Candidate authentication and secure session join
- Pre-interview device and network checks
- Real-time webcam/audio/activity monitoring
- Continuous risk scoring with explainable event factors
- Live alert delivery to admin dashboard
- Time-zone aware interview scheduling
- Audit logging and privacy-aware retention controls

## Recommended Tech Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, Framer Motion, Recharts
- Realtime: WebSocket gateway with typed event contracts
- Backend: Node.js, Fastify, Redis, PostgreSQL
- AI Inference: Python, PyTorch, OpenCV, MediaPipe, ONNX Runtime
- Scheduling: PostgreSQL, Google Calendar API, background workers
- Notifications: SendGrid, Twilio, webhooks
- Infra: Docker, Kubernetes, AWS EKS or ECS, S3, RDS, ElastiCache

## Accuracy Strategy

The requested `>=95% precision` and `>=95% recall` is not something to promise from architecture alone. It requires:

- a labeled dataset that represents the actual interview environment
- careful per-modality evaluation
- calibration on production-like data
- human review workflows for edge cases

This starter system is designed to support that target through:

- modality-specific scores instead of one opaque model
- temporal smoothing and adaptive thresholds
- explainable event factors for auditability
- offline training and online calibration hooks

## Getting Started

This repository now includes a runnable local prototype in addition to the architecture scaffold.

Primary entry points:

- [server.mjs](/Users/aditya/Documents/ai resume system/ai screen detection model/server.mjs)
- [docs/architecture.md](/Users/aditya/Documents/ai resume system/ai screen detection model/docs/architecture.md)
- [docs/ai-pipeline.md](/Users/aditya/Documents/ai resume system/ai screen detection model/docs/ai-pipeline.md)
- [docs/ui-wireframes.md](/Users/aditya/Documents/ai resume system/ai screen detection model/docs/ui-wireframes.md)
- [apps/web/src/app/page.tsx](/Users/aditya/Documents/ai resume system/ai screen detection model/apps/web/src/app/page.tsx)
- [services/gateway/src/server.ts](/Users/aditya/Documents/ai resume system/ai screen detection model/services/gateway/src/server.ts)
- [services/inference/src/risk-engine.ts](/Users/aditya/Documents/ai resume system/ai screen detection model/services/inference/src/risk-engine.ts)

### Run The Prototype

```bash
npm start
```

For links that must open on another device or from WhatsApp, start the server with a shareable base URL:

```bash
PUBLIC_BASE_URL="http://YOUR_LAPTOP_IP:3000" npm start
```

Example:

```bash
PUBLIC_BASE_URL="http://192.168.1.23:3000" npm start
```

If you keep using `127.0.0.1` or `localhost`, the link will only work on the same machine.

Then open:

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/admin.html`

What the runnable prototype includes:

- interview slot creation with secure join links
- candidate webcam and microphone checks
- browser focus, visibility, fullscreen, and devtools heuristics
- webcam frame analysis with optional `FaceDetector` support
- continuous telemetry posting and server-side risk scoring
- live admin updates over Server-Sent Events
- admin warning and end-session controls

### macOS Desktop Agent

For stronger app and tab-switch detection on macOS, run the local agent in a second terminal:

```bash
npm run agent:macos -- --token <join_token>
```

You can copy the token from the candidate invite link:

```text
http://127.0.0.1:3000/candidate.html?token=join_xxx
```

This agent reports:

- frontmost application changes
- active browser tab URL/title changes
- navigation away from the interview page

## Security and Privacy Notes

- Use JWT or OAuth for all session-bound APIs.
- Encrypt media streams with DTLS-SRTP and TLS 1.3 in transit.
- Store only derived events by default; record raw media only when policy allows it.
- Maintain audit logs for alerts, admin actions, and scheduling changes.
- Provide configurable retention and deletion workflows.
