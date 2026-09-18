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
  # Prefer GitHub if the agent finished publishing; otherwise Origin (Cursor).
  if [[ -n "${GITHUB_REPO_URL:-}" ]]; then
    REPO_URL="$GITHUB_REPO_URL"
  else
    REPO_URL="https://origin.cursor.com/git/muhammad-nouman-shakeel/tmp-00ab0fa27f64d78e.git"
    BRANCH="${BRANCH:-main}"
    echo "NOTE: Using Cursor Origin remote (no GitHub URL configured yet)."
    echo "      After the agent publishes to GitHub, re-run with:"
    echo "      REPO_URL=https://github.com/<you>/code-review-assistant.git bash scripts/install.sh"
  fi
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
  echo "==> Created .env (edit for API keys; Mock works with none)"
fi

echo "==> Detect Cursor / agent CLIs"
for b in cursor cursor-agent claude codex; do
  if command -v "$b" >/dev/null 2>&1; then echo "  $b: $(command -v "$b")"; else echo "  $b: not found"; fi
done

echo "==> Smoke test"
npm run smoke

echo "==> Launching app (Electron). UI: http://127.0.0.1:43127"
echo "    Models & keys → choose Cursor CLI (if installed) or paste API keys / keep Mock."
npm run dev
