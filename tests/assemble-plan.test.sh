#!/bin/sh
# Tests for scripts/assemble-plan.sh. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
script="$here/scripts/assemble-plan.sh"
fails=0
check() { # check <description> <command...>
  desc=$1; shift
  if "$@"; then echo "ok   - $desc"; else echo "FAIL - $desc"; fails=$((fails + 1)); fi
}

root=$(mktemp -d "${TMPDIR:-/tmp}/rpir-assemble.XXXXXX")
trap 'rm -rf "$root"' EXIT

draft="$root/draft"
mkdir -p "$draft/milestones"
printf 'schemaVersion: 0.3.0\nmilestones:\n' > "$draft/head.yaml"
# No trailing newline on the first fragment: assembly must still separate them.
printf '  - number: 1\n    slug: a' > "$draft/milestones/01-a.yaml"
printf '  - number: 2\n    slug: b\n' > "$draft/milestones/02-b.yaml"
printf '# premises:\n#   PL1 | normal | verified | docs: x | y\n' > "$draft/tail.yaml"

# 1. Assembles head, fragments in name order, tail.
sh "$script" "$draft" "$root/plan.yaml"
check "exit 0" test $? -eq 0
expected="$root/expected.yaml"
printf 'schemaVersion: 0.3.0\nmilestones:\n  - number: 1\n    slug: a\n  - number: 2\n    slug: b\n# premises:\n#   PL1 | normal | verified | docs: x | y\n' > "$expected"
check "head, fragments in order, tail" cmp -s "$expected" "$root/plan.yaml"

# 2. No tail is fine.
rm "$draft/tail.yaml"
sh "$script" "$draft" "$root/plan2.yaml"
check "no tail: exit 0" test $? -eq 0
check "no tail: ends with the last fragment" sh -c "tail -n 1 '$root/plan2.yaml' | grep -qx '    slug: b'"

# 3. A head that does not end with milestones: is rejected.
printf 'schemaVersion: 0.3.0\n' > "$draft/head.yaml"
sh "$script" "$draft" "$root/plan3.yaml" 2>"$root/err3"
check "bad head: exit 1" test $? -eq 1
check "bad head: names the rule" grep -q 'must end with a line "milestones:"' "$root/err3"
check "bad head: no output written" test ! -e "$root/plan3.yaml"

# 4. No fragments is rejected.
printf 'schemaVersion: 0.3.0\nmilestones:\n' > "$draft/head.yaml"
rm "$draft"/milestones/*.yaml
sh "$script" "$draft" "$root/plan4.yaml" 2>"$root/err4"
check "no fragments: exit 1" test $? -eq 1

# 5. Usage.
sh "$script" 2>/dev/null
check "no args: exit 2" test $? -eq 2

[ "$fails" -eq 0 ] || { echo "$fails assemble-plan test(s) failed"; exit 1; }
