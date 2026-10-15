#!/bin/sh
# Runs every test in this repository. POSIX sh; run from the repo root.
set -e
cd "$(dirname "$0")/.." || exit 1
sh tests/sessions.test.sh
sh tests/planning-log.test.sh
sh tests/commit-change.test.sh
sh tests/assemble-plan.test.sh
node tests/check-workflows.mjs
