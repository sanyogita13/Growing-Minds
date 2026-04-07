# Deployment

## Current Status

- Backend is runnable and tested locally with Python.
- Frontend is configured but cannot be built on this machine because `node` and `npm` are not installed.
- No cloud deployment CLI or authenticated hosting account is configured in this environment.

## Recommended Production Deployment

### Backend

- Platform: Render or Railway
- Runtime: Docker
- Source root: `apps/api`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`

Required environment variables:

- `SECRET_KEY`
- `ACCESS_TOKEN_TTL_MINUTES`
- `ALLOWED_ORIGINS`

### Frontend

- Platform: Vercel
- Root: `apps/web`

Required environment variables:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_WS_URL`

## Seed Credentials

- Admin: `admin@hiresight.ai` / `Admin@123`
- HR: `hr@hiresight.ai` / `Hr@12345`

Change these immediately for any real environment.

## Local Backend Run

```bash
cd "/Users/aditya/Documents/ai resume system"
chmod +x scripts/run-api.sh
./scripts/run-api.sh
```

## Local Frontend Run

```bash
cd "/Users/aditya/Documents/ai resume system"
chmod +x scripts/run-web.sh
./scripts/run-web.sh
```

If `node` is missing on your Mac, install Node.js 20+ first.

## Render Blueprint

Use [render.yaml](/Users/aditya/Documents/ai%20resume%20system/render.yaml) to create:

- `hiresight-api`
- `hiresight-web`

Then update the placeholder domains in the environment variables to the final generated service URLs.
