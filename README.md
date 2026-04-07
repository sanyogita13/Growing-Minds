# AI Resume Analysis and HR Management System

Production-oriented SaaS blueprint for a multi-tenant HR platform that ingests resumes, evaluates candidates against job requirements, and provides live dashboards for recruiters and admins.

## Stack

- Frontend: Next.js 15, React, TypeScript, Tailwind CSS, Recharts
- Backend: FastAPI, Pydantic, SQLAlchemy, WebSockets, Celery/RQ-compatible worker pattern
- AI: Resume parsing + embedding similarity + LLM explanation layer
- Data: PostgreSQL, Redis, S3-compatible object storage
- Auth: JWT + RBAC + tenant isolation

## Workspace Layout

- `docs/system-design.md`: architecture diagram, API shape, AI flow, UI structure
- `docs/database-schema.sql`: relational schema for multi-tenant SaaS
- `apps/api/app/main.py`: FastAPI app with REST and WebSocket examples
- `apps/api/app/schemas.py`: request/response models
- `apps/api/app/services/scoring.py`: weighted candidate scoring logic
- `apps/api/app/services/ai.py`: AI pipeline orchestration example
- `apps/web/app/...`: sample Next.js pages and UI shell
- `apps/web/components/...`: dashboard and analysis components

## Product Capabilities

- Multi-tenant organization onboarding
- Admin and HR role management
- Job requirement creation with weighted criteria
- Bulk resume upload for PDF/DOCX
- Resume parsing and skill extraction
- Semantic job-to-resume matching
- Bias-aware scoring pipeline
- Live processing status and score updates
- Candidate leaderboard and recommendation outputs
- Premium-ready interview question generation and export hooks

## Scoring Weights

- Skill match: 40%
- Experience relevance: 30%
- Education fit: 15%
- Additional factors: 15%

## Recommended Production Extensions

- Queue workers for heavy parsing workloads
- Background OCR for image-based PDFs
- Audit trails for HR decisions
- Payment/billing integration for subscriptions
- Dedicated model evaluation pipeline for bias and drift monitoring

## Run Locally on macOS

### Backend

```bash
cd "/Users/aditya/Documents/ai resume system"
chmod +x scripts/run-api.sh
./scripts/run-api.sh
```

Backend URL: `http://127.0.0.1:8000`

### Frontend

Install Node.js 20+ first. Then run:

```bash
cd "/Users/aditya/Documents/ai resume system"
chmod +x scripts/run-web.sh
./scripts/run-web.sh
```

Frontend URL: `http://127.0.0.1:3000`

### Seed Logins

- Admin: `admin@hiresight.ai` / `Admin@123`
- HR: `hr@hiresight.ai` / `Hr@12345`
