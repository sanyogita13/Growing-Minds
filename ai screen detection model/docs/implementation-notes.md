# Implementation Notes

## What Is Already Built Here

- Shared event contracts for telemetry, incidents, risk, and scheduling
- Gateway session orchestration and live subscription model
- Risk engine that converts telemetry into scored incidents
- Browser activity monitoring hooks for anti-cheating telemetry
- Candidate and admin UI scaffold with modern visual system

## What Still Needs Real Production Work

- Actual WebRTC media transport and encrypted media pipeline
- Real CV and audio models replacing the stub analyzers
- Persistent PostgreSQL and Redis-backed storage
- Auth provider integration and secure invite workflows
- Calendar provider, email, SMS, and webhook integrations
- Browser hardening and kiosk constraints adapted per platform

## Production Hard Truths

- A browser alone cannot perfectly prevent all external device use.
- Screen-share and external-monitor detection is limited by browser APIs and OS policies.
- `>=95% precision` and `>=95% recall` must be validated empirically with the target environment.
- Full enforcement should follow a shadow-mode rollout to measure false positives.
