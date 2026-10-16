#!/bin/sh
# Tests for tests/demo/run-demo.sh --print-only. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
fails=0
check() { # check <description> <command...>
  desc=$1; shift
  if "$@"; then echo "ok   - $desc"; else echo "FAIL - $desc"; fails=$((fails + 1)); fi
}

tmp=$(mktemp -d "${TMPDIR:-/tmp}/rpir-demo-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
tmp=$(cd "$tmp" && pwd)
project="$tmp/project"
plan="$project/docs/changes/2026-10-16-demo-diamond/plan.yaml"

out=$(sh "$here/tests/demo/run-demo.sh" "$tmp" --print-only 2>&1)
check "run-demo.sh exits 0" test $? -eq 0
check "prints the project path" sh -c 'printf "%s\n" "$1" | grep -qF "Demo project: $2"' _ "$out" "$project"
check "prints the claude command" sh -c 'printf "%s\n" "$1" | grep -qF "claude --plugin-dir \"$2\" \"/kentra-rpir:implement docs/changes/2026-10-16-demo-diamond\""' _ "$out" "$here"

if command -v milestoned-plan-dag >/dev/null 2>&1; then
  check "the plan validates" milestoned-plan-dag validate "$plan"
else
  echo "skip - plan validation: milestoned-plan-dag not on PATH"
fi
check "clean working tree" test -z "$(git -C "$project" status --porcelain)"
check "one commit" test "$(git -C "$project" rev-list --count HEAD)" = 1
check "origin is the bare repo" test "$(git -C "$project" remote get-url origin)" = "$tmp/origin.git"
check "sh check.sh prints ok" test "$(cd "$project" && sh check.sh)" = ok

# Spec requirement 15: the fixture's contents.
spec="$project/docs/changes/2026-10-16-demo-diamond/spec.md"
cfg="$project/.kentra-rpir.yaml"
check "spec is status: planned" grep -qx 'status: planned' "$spec"
check "Haiku implementer" grep -qF 'implementer: { agent: "kentra-rpir:implementer", model: haiku }' "$cfg"
check "Haiku verifier" grep -qF 'model: haiku }' "$cfg"
check "no pull request" grep -qF 'openPullRequest: false' "$cfg"
check "four milestones" test "$(grep -c '^  - number:' "$plan")" = 4
check "two depend on alpha" test "$(grep -c 'depends-on: \[alpha\]' "$plan")" = 2
check "delta joins beta and gamma" grep -qF 'depends-on: [beta, gamma]' "$plan"

# With no directory, a new temporary one is made.
dout=$(sh "$here/tests/demo/run-demo.sh" --print-only 2>&1)
dproj=$(printf '%s\n' "$dout" | sed -n 's/^Demo project: //p')
check "default dir holds a project" test -d "$dproj/.git"
[ -n "$dproj" ] && rm -rf "$(dirname "$dproj")"

[ "$fails" -eq 0 ] || { echo "demo.test.sh: $fails check(s) failed"; exit 1; }
echo "demo.test.sh: ok"
