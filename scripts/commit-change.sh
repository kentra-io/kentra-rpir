#!/bin/sh
# commit-change.sh — the planning stage's commit goes through this script so
# an embedded repository (e.g. a spike's own .git) never lands in a commit.
# Run with cwd at the project git root. POSIX sh.
#
#   commit-change.sh <change folder> <message> [extra path ...]
#
# 0. If cwd is not inside a git work tree, or rpir/ is gitignored, prints
#    "kentra-rpir: untracked mode (<reason>); nothing committed" and exits 0.
# 1. If `find <change folder> -mindepth 1 -name .git` (outside .local/) prints
#    anything, warns and exits 1 before staging anything.
# 2. If <change folder>/.local/ is non-empty and not gitignored, warns and
#    exits 1 before staging anything.
# 3. Runs `git add -- <change folder> <extra paths>`, capturing stderr. If
#    stderr contains "embedded git repository", resets the same paths, warns
#    and exits 1.
# 4. Runs `git commit -m <message> -- <change folder> <extra paths>` and
#    exits with git's status.
set -u

change="${1:-}"
message="${2:-}"
if [ -z "$change" ] || [ -z "$message" ]; then
  echo "kentra-rpir: usage: commit-change.sh <change folder> <message> [extra path ...]" >&2
  exit 1
fi
shift 2

reason=""
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  reason="not a git work tree"
elif git check-ignore -q --no-index rpir/.kentra-rpir-probe; then
  reason="rpir/ is gitignored"
fi
if [ -n "$reason" ]; then
  echo "kentra-rpir: untracked mode ($reason); nothing committed"
  exit 0
fi

# Spikes under .local/ may be repositories of their own; they are gitignored.
found=$(find "$change" -mindepth 1 -path "$change/.local" -prune -o -name .git -print 2>/dev/null | head -n 1)
if [ -n "$found" ]; then
  repo=$(dirname "$found")
  echo "kentra-rpir: $repo is a git repository inside the change folder; remove it and keep only the spike files" >&2
  exit 1
fi

# Machine-local state (spikes, sessions, queues) lives in <change>/.local/ and
# is never committed: refuse when .gitignore does not cover it.
if [ -d "$change/.local" ] && [ -n "$(ls -A "$change/.local" 2>/dev/null)" ]; then
  if ! git check-ignore -q --no-index "$change/.local/.kentra-rpir-probe"; then
    echo "kentra-rpir: $change/.local/ is not gitignored; add the line 'rpir/**/.local/' to .gitignore" >&2
    exit 1
  fi
fi

errout=$(mktemp "${TMPDIR:-/tmp}/kentra-rpir-commit.XXXXXX")
trap 'rm -f "$errout"' EXIT

git add -- "$change" "$@" 2>"$errout"

if grep -q 'embedded git repository' "$errout"; then
  repo=$(sed -n 's/.*embedded git repository:[[:space:]]*//p' "$errout" | head -n 1)
  [ -n "$repo" ] || repo="$change"
  git reset -q -- "$change" "$@"
  echo "kentra-rpir: $repo is a git repository inside the change folder; remove it and keep only the spike files" >&2
  exit 1
fi

[ -s "$errout" ] && cat "$errout" >&2

git commit -m "$message" -- "$change" "$@"
exit $?
