# AI Model Pipeline

## Objective

Produce a continuously updated cheating risk score by combining video, audio, and browser activity signals with interpretable reasons.

## Modality Pipelines

### Video

- Face detection and tracking
- Face embedding consistency for identity continuity
- Eye gaze estimation
- Head pose estimation
- Multi-person detection
- Object detection for phone, notebook, or suspicious device presence
- Face absence / occlusion detection

Suggested models:

- Face detection: RetinaFace or BlazeFace
- Face embeddings: ArcFace
- Gaze/head pose: MediaPipe Face Mesh plus calibrated regressors
- Object detection: YOLOv8n or RT-DETR small

### Audio

- Voice activity detection
- Speaker overlap detection
- Secondary speaker classification
- Prompt-like or TTS-like audio detection
- Sudden background noise anomaly scoring

Suggested models:

- VAD: Silero VAD
- Speaker embeddings: ECAPA-TDNN
- Overlap detection: pyannote or streaming diarization
- Spectral anomaly model: lightweight CNN or conformer

### Browser / System Activity

- Tab switch count
- Window blur/focus events
- Full-screen exit events
- Clipboard and suspicious shortcut attempts where browser policy allows
- External display / screen share detection where platform APIs permit

## Fusion Strategy

Use late fusion with temporal smoothing instead of a single end-to-end monolith.

Reasons:

- easier calibration
- more robust debugging
- clearer compliance and auditability
- safer fallback behavior when one modality degrades

### Rolling Risk Formula

```text
risk_t =
  0.24 * identity_drift +
  0.18 * gaze_anomaly +
  0.12 * head_pose_anomaly +
  0.18 * multi_person_or_device +
  0.16 * audio_anomaly +
  0.12 * browser_activity
```

Then apply:

- exponential moving average
- stateful hysteresis for alerts
- adaptive thresholding per interview type

## Event Taxonomy

- `face_missing`
- `identity_mismatch`
- `multiple_faces`
- `phone_detected`
- `gaze_away_excessive`
- `head_pose_suspicious`
- `multiple_voices`
- `prompt_audio_detected`
- `tab_switch`
- `fullscreen_exit`
- `screen_share_detected`

## Accuracy Plan

To pursue `>=95% precision and recall`, evaluation must happen in layers:

1. Per-event offline metrics on labeled validation sets
2. End-to-end session-level metrics on replayed interviews
3. Threshold calibration by role, duration, and interview format
4. Production shadow mode before hard enforcement

## Latency Budget

- Browser telemetry capture: 5-20 ms
- Gateway transport: 10-30 ms
- Inference on lightweight models: 30-80 ms
- Fusion and alert fanout: 10-20 ms
- Total target: 55-150 ms

## Training Data Guidance

- real interview posture and lighting variation
- laptops at different heights and angles
- multilingual audio and accent variation
- benign edge cases like note-taking or temporary glances
- explicit cheating examples with phones, second screens, whispers, and prompts

## Human-in-the-Loop

The platform should support:

- configurable confidence thresholds
- rapid incident replay for reviewers
- false positive feedback collection
- model version tagging on every incident
