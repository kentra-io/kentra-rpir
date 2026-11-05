#!/bin/sh
# Fails when the plugin's shipped files (skills, agents, templates, workflows,
# scripts) contain a forbidden term.
# Usage: sh tests/check-forbidden.sh [root]
#   no argument: checks the repo, then self-tests on scratch copies. With a
#   root: checks only that root. POSIX sh; run from anywhere.
set -u
cd "$(dirname "$0")/.." || exit 1
self="$PWD/tests/check-forbidden.sh"

# One extended regular expression per line, matched case-insensitively; append a line to add a term.
terms='(^|[^a-z])red[-/ ]green
(^|[^a-z])red runs?([^a-z]|$)
(^|[^a-z])test[- ]first'

check_root() { # check_root <root>
  dirs=
  for d in skills agents templates workflows scripts; do
    [ -d "$1/$d" ] && dirs="$dirs $1/$d"
  done
  rc=0
  [ -n "$dirs" ] || return 0
  while IFS= read -r term; do
    # $dirs is deliberately unquoted: it holds several paths
    hits=$(grep -rniE -e "$term" $dirs 2>/dev/null)
    if [ -n "$hits" ]; then
      printf '%s\n' "$hits" | while IFS= read -r hit; do
        echo "FAIL - forbidden term '$term': $hit"
      done
      rc=1
    else
      echo "ok   - no '$term'"
    fi
  done <<EOT
$terms
EOT
  return $rc
}

if [ $# -gt 0 ]; then
  check_root "$1"
  exit $?
fi

fails=0
check_root . || fails=1

tmp=$(mktemp -d "${TMPDIR:-/tmp}/rpir-forbidden.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

mkdir "$tmp/planted"
cp -R skills "$tmp/planted/skills"
target=$(find "$tmp/planted/skills" -type f | head -n 1)
echo 'Do a red run before the fix.' >> "$target"
out=$(sh "$self" "$tmp/planted" 2>&1)
rc=$?
if [ "$rc" -eq 1 ] && echo "$out" | grep -qF "$target"; then
  echo "ok   - a planted forbidden term fails and its file is named"
else
  echo "FAIL - self-test: planted term gave exit $rc: $out"
  fails=1
fi

mkdir "$tmp/clean"
cp -R skills "$tmp/clean/skills"
out=$(sh "$self" "$tmp/clean" 2>&1)
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "ok   - a copy without the planted term passes"
else
  echo "FAIL - self-test: clean copy gave exit $rc: $out"
  fails=1
fi

mkdir -p "$tmp/words/skills"
printf 'An ignored run.\nShow the latest first.\n' > "$tmp/words/skills/words.md"
out=$(sh "$self" "$tmp/words" 2>&1)
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "ok   - 'ignored run' and 'latest first' pass"
else
  echo "FAIL - self-test: 'ignored run' and 'latest first' gave exit $rc: $out"
  fails=1
fi

exit $fails
