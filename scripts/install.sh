#!/usr/bin/env bash
# Code Review Assistant — one-shot install & launch
# Usage:
#   curl -fsSL <raw-url>/scripts/install.sh | bash
#   OR: bash scripts/install.sh
# Optional:
#   REPO_URL=https://github.com/YOU/code-review-assistant.git bash scripts/install.sh

set -euo pipefail

REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
DIR="${DIR:-$HOME/code-review-assistant}"

if [[ -z "$REPO_URL" ]]; then
  REPO_URL="${GITHUB_REPO_URL:-https://github.com/noumanshakeil/code-review-assistant.git}"
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need git
need node
need npm

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Need Node.js 20+. Found: $(node -v)"
  exit 1
fi

echo "==> Clone $REPO_URL ($BRANCH) -> $DIR"
if [[ -d "$DIR/.git" ]]; then
  cd "$DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH" || git pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$DIR"
  cd "$DIR"
fi

echo "==> npm install"
npm install

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> Created .env (optional API key fallbacks)"
fi

echo "==> Smoke test"
npm run smoke

echo "==> Launching app (Electron). UI: http://127.0.0.1:43127"
echo "    On first launch, add an API key under Models & keys, then select a model."
npm run dev
