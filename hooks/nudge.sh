#!/bin/sh
# SessionStart hook: prints the improvement nudge line, if any. Never fails the session.
script="$(dirname "$0")/../scripts/improvements.mjs"
command -v node >/dev/null 2>&1 || exit 0
out=$(node "$script" nudge --project "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null </dev/null) && [ -n "$out" ] && printf '%s\n' "$out"
exit 0
