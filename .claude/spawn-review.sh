#!/usr/bin/env bash
set -euo pipefail

PR="${1:-$(gh pr view --json number -q .number 2>/dev/null || true)}"
if [ -z "${PR:-}" ]; then
  echo "spawn-review: no open PR for the current branch (pass a PR number)" >&2
  exit 1
fi

exec claude -p "/review-cms674 ${PR}" \
  --model opus \
  --allowedTools Read Grep Glob Task \
    "Bash(gh:*)" "Bash(git diff:*)" "Bash(git log:*)" \
    "Bash(pnpm test:*)" "Bash(pnpm typecheck:*)" "Bash(pnpm build:*)" \
  --disallowedTools Edit Write NotebookEdit
