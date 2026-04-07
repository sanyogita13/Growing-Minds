#!/bin/zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/apps/api"

export PYTHONPATH="$ROOT_DIR/apps/api"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
fi

python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
