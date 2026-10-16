#!/bin/sh
# Pins the first line of each implement prompt template. The milestone
# graph mod (hooks/tracker.ts) maps Agent dispatches to milestones by
# these lines, and hooks/test/tracker.test.ts holds them as constants:
# the templates, the tracker, its test and this script change together.
# Usage: sh tests/check-templates.sh [template dir]
#   no argument: checks skills/implement, the test file's constants, and
#   self-tests that a changed template fails. With a dir: checks only the
#   two templates in it. POSIX sh; run from anywhere.
set -u
cd "$(dirname "$0")/.." || exit 1

impl_line='You are implementing milestone M{{number}} `{{slug}}` of the change "{{title}}".'
verify_line='You are verifying milestone M{{number}} `{{slug}}` of the change "{{title}}".'
test_file=hooks/test/tracker.test.ts

check_one() { # check_one <template file> <expected first line>
  if [ "$(head -n 1 "$1")" = "$2" ]; then
    echo "ok   - first line of $1"
    return 0
  fi
  echo "FAIL - first line of $1 changed; update hooks/tracker.ts, $test_file and tests/check-templates.sh with it"
  return 1
}

check_dir() { # check_dir <dir>
  rc=0
  check_one "$1/implementer-prompt.md" "$impl_line" || rc=1
  check_one "$1/verifier-prompt.md" "$verify_line" || rc=1
  return $rc
}

if [ $# -gt 0 ]; then
  check_dir "$1"
  exit $?
fi

fails=0
check_dir skills/implement || fails=1
for line in "$impl_line" "$verify_line"; do
  if grep -qF -- "$line" "$test_file"; then
    echo "ok   - $test_file holds: $line"
  else
    echo "FAIL - $test_file does not hold: $line"
    fails=1
  fi
done

# Self-test: a template whose first line changed fails, naming it. The
# copies are built from the expected lines, so the self-test does not
# depend on the real templates.
tmp=$(mktemp -d "${TMPDIR:-/tmp}/rpir-templates.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
printf '%s\n' "$impl_line" > "$tmp/implementer-prompt.md"
{ echo 'You are verifying milestone M{{number}} of the change "{{title}}".'
  tail -n +2 skills/implement/verifier-prompt.md; } > "$tmp/verifier-prompt.md"
out=$(sh tests/check-templates.sh "$tmp" 2>&1)
rc=$?
if [ "$rc" -eq 1 ] && echo "$out" | grep -q 'FAIL - first line of .*verifier-prompt.md changed' \
  && ! echo "$out" | grep -q 'FAIL - first line of .*implementer-prompt.md'; then
  echo "ok   - a changed template fails and is named"
else
  echo "FAIL - self-test: changed verifier template gave exit $rc: $out"
  fails=1
fi

exit $fails
