#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMMIT_MSG="${1:-chore: verified checks and sync}"

echo "==> Running TypeScript lint (tsc --noEmit)..."
npm run lint

echo "==> Running production build (vite build)..."
npm run build

if command -v php >/dev/null 2>&1; then
  echo "==> Running PHP syntax checks (php -l)..."
  while IFS= read -r -d '' php_file; do
    php -l "$php_file"
  done < <(find php -type f -name '*.php' -print0)
else
  echo "==> Skipping php -l (php binary not installed in this environment)."
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Error: No 'origin' remote configured."
  echo "Add your repository first:"
  echo "  git remote add origin https://github.com/<your-username>/<your-repo>.git"
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" || -z "$BRANCH" ]]; then
  BRANCH="main"
fi

echo "==> Staging changes..."
git add -A

if git diff --cached --quiet; then
  echo "==> Working tree clean; no new commit needed."
else
  echo "==> Committing changes: $COMMIT_MSG"
  git commit -m "$COMMIT_MSG"
fi

echo "==> Pushing '$BRANCH' to origin..."
git push -u origin "$BRANCH"
echo "==> Done."
