#!/bin/sh
# Runs every test in this repository. POSIX sh; run from the repo root.
set -e
cd "$(dirname "$0")/.." || exit 1
sh tests/sessions.test.sh
sh tests/planning-log.test.sh
sh tests/commit-change.test.sh
sh tests/assemble-plan.test.sh
node tests/check-workflows.mjs

# The mod: validate the plugin, then run its tests on a staged copy.
# `claude plugin test <dir>` runs every *.test.ts(x) under <dir>,
# gitignored spike plugins included, so the copy holds only the mod.
if command -v claude >/dev/null 2>&1; then
  claude plugin validate .
  mod=$(mktemp -d "${TMPDIR:-/tmp}/rpir-mod.XXXXXX")
  trap 'rm -rf "$mod"' EXIT
  mkdir -p "$mod/.claude-plugin"
  cp .claude-plugin/plugin.json "$mod/.claude-plugin/plugin.json"
  cp -R hooks types "$mod/"
  claude plugin test "$mod"
else
  echo "skipping mod checks: claude not on PATH"
fi
