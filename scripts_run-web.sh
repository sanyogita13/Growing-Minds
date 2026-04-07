#!/bin/zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/apps/web"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 20+ first."
  exit 1
fi

if [ ! -f ".env.local" ] && [ -f ".env.example" ]; then
  cp .env.example .env.local
fi

npm install
npm run dev
