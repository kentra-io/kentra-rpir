#!/bin/sh
# Tests for scripts/commit-change.sh. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
script="$here/scripts/commit-change.sh"
fails=0
check() { # check <description> <command...>
  desc=$1; shift
  if "$@"; then echo "ok   - $desc"; else echo "FAIL - $desc"; fails=$((fails + 1)); fi
}

root=$(mktemp -d "${TMPDIR:-/tmp}/rpir-commit.XXXXXX")
trap 'rm -rf "$root"' EXIT

repo="$root/repo"
mkdir -p "$repo"
git -C "$repo" init -q
git -C "$repo" config user.email test@example.com
git -C "$repo" config user.name "Test User"

change=docs/changes/2026-10-11-demo
mkdir -p "$repo/$change"
echo "spec" > "$repo/$change/spec.md"
git -C "$repo" add -A
git -C "$repo" commit -q -m init

# 1. A change folder holding an embedded repository blocks the commit.
mkdir -p "$repo/$change/research/spikes/x"
echo "spike output" > "$repo/$change/research/spikes/x/file.txt"
git -C "$repo/$change/research/spikes/x" init -q

stdout1="$root/cc-stdout1"; stderr1="$root/cc-stderr1"
(cd "$repo" && sh "$script" "$change" "add demo") >"$stdout1" 2>"$stderr1"
rc=$?
check "embedded repo exits 1" test "$rc" -eq 1
check "embedded repo message names the offending path" grep -q 'research/spikes/x' "$stderr1"
check "embedded repo: nothing staged" sh -c "cd '$repo' && git diff --cached --quiet"

rm -rf "$repo/$change/research/spikes/x/.git"

# 2. A clean change folder commits successfully, touching only the given
# paths. An unrelated file that was already staged (e.g. by another skill
# step) must NOT be swept into this commit, and must remain staged
# afterwards — the commit is pathspec-scoped, not a blanket `git commit`.
echo "extra" > "$repo/notes.txt"
echo "unrelated" > "$repo/unrelated.txt"
git -C "$repo" add unrelated.txt

stdout2="$root/cc-stdout2"; stderr2="$root/cc-stderr2"
(cd "$repo" && sh "$script" "$change" "add demo" notes.txt) >"$stdout2" 2>"$stderr2"
rc2=$?
check "clean commit exits 0" test "$rc2" -eq 0

files=$(cd "$repo" && git show --name-only --pretty=format: HEAD | sed '/^$/d')
check "commit touched at least one file" sh -c "[ -n '$files' ]"
outside=0
for f in $files; do
  case "$f" in
    "$change"/*) ;;
    notes.txt) ;;
    *) outside=1 ;;
  esac
done
check "commit's paths are only the change folder and the extra path" test "$outside" -eq 0
check "the change folder's spike file is in the commit" sh -c "printf '%s\n' \"$files\" | grep -qx '$change/research/spikes/x/file.txt'"
check "the extra path is in the commit" sh -c "printf '%s\n' \"$files\" | grep -qx 'notes.txt'"
check "an unrelated already-staged file is not swept into the commit" \
  sh -c "! printf '%s\n' \"$files\" | grep -qx 'unrelated.txt'"
check "the unrelated file remains staged after the commit" \
  sh -c "cd '$repo' && git diff --cached --name-only | grep -qx 'unrelated.txt'"

[ "$fails" -eq 0 ] && echo "all commit-change tests passed"
exit "$fails"
