#!/bin/sh
# commit-change.sh — the spec and plan commits go through this script so an
# embedded repository (e.g. a spike's own .git) never lands in a commit
# (E4). Run with cwd at the project git root. POSIX sh.
#
#   commit-change.sh <change folder> <message> [extra path ...]
#
# 1. If `find <change folder> -mindepth 1 -name .git` prints anything, warns
#    and exits 1 before staging anything.
# 2. If <change folder>/research/spikes/ is non-empty and not gitignored,
#    warns and exits 1 before staging anything.
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

found=$(find "$change" -mindepth 1 -name .git 2>/dev/null | head -n 1)
if [ -n "$found" ]; then
  repo=$(dirname "$found")
  echo "kentra-rpir: $repo is a git repository inside the change folder; remove it and keep only the spike files" >&2
  exit 1
fi

# Spikes live in <change>/research/spikes/ and are never committed: refuse
# when the project's .gitignore does not cover them.
if [ -d "$change/research/spikes" ] && [ -n "$(ls -A "$change/research/spikes" 2>/dev/null)" ]; then
  probe="$change/research/spikes/.kentra-rpir-probe"
  if ! git check-ignore -q --no-index "$probe"; then
    echo "kentra-rpir: $change/research/spikes/ is not gitignored; add the line '<changesDir>/*/research/spikes/' to .gitignore" >&2
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
