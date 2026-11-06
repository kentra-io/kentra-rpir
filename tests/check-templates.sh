#!/bin/sh
# Pins the first line of the lead and verifier prompt templates. The milestone
# graph mod (hooks/tracker.ts) maps Agent dispatches to milestones by
# these lines, and hooks/test/tracker.test.ts holds them as constants:
# the templates, the tracker, its test and this script change together.
# Also checks that the listed config keys exist in templates/kentra-rpir.yaml.
# Usage: sh tests/check-templates.sh [template dir | --config <yaml file>]
#   no argument: checks skills/implement, the test file's constants and the
#   config keys, and self-tests that a changed template or a missing key
#   fails. With a dir: checks only the two templates in it. With --config:
#   checks only the keys against that file. POSIX sh; run from anywhere.
set -u
cd "$(dirname "$0")/.." || exit 1

# shellcheck disable=SC2016 # the backticks are prompt text, not command substitution
lead_line='You are leading milestone M{{number}} `{{slug}}` of the change "{{title}}".'
# shellcheck disable=SC2016 # the backticks are prompt text, not command substitution
verify_line='You are verifying milestone M{{number}} `{{slug}}` of the change "{{title}}".'
test_file=hooks/test/tracker.test.ts
config_file=templates/kentra-rpir.yaml

# One dotted key per line; append a line to add a key.
config_keys='research.standalone
research.maxParallel
research.maxLookups
research.staleMinutes
research.dir
research.index
roles.lead
implement.maxParallel
implement.cacheWindowMinutes'

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
  check_one "$1/lead-prompt.md" "$lead_line" || rc=1
  check_one "$1/verifier-prompt.md" "$verify_line" || rc=1
  return $rc
}

has_key() { # has_key <yaml file> <section.name>
  awk -v section="${2%%.*}" -v name="${2#*.}" '
    /^[^ \t#]/ { in_section = ($0 ~ "^" section ":") ; next }
    in_section && $0 ~ "^[ \t]+" name ":" { found = 1 }
    END { exit !found }
  ' "$1"
}

check_config() { # check_config <yaml file>
  rc=0
  while IFS= read -r key; do
    if has_key "$1" "$key"; then
      echo "ok   - config key $key"
    else
      echo "FAIL - config key $key missing from $1"
      rc=1
    fi
  done <<EOT
$config_keys
EOT
  return $rc
}

if [ "${1:-}" = "--config" ]; then
  check_config "${2:?usage: check-templates.sh --config <yaml file>}"
  exit $?
fi

if [ $# -gt 0 ]; then
  check_dir "$1"
  exit $?
fi

fails=0
check_dir skills/implement || fails=1
for line in "$lead_line" "$verify_line"; do
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
printf '%s\n' "$lead_line" > "$tmp/lead-prompt.md"
{ echo 'You are verifying milestone M{{number}} of the change "{{title}}".'
  tail -n +2 skills/implement/verifier-prompt.md; } > "$tmp/verifier-prompt.md"
out=$(sh tests/check-templates.sh "$tmp" 2>&1)
rc=$?
if [ "$rc" -eq 1 ] && echo "$out" | grep -q 'FAIL - first line of .*verifier-prompt.md changed' \
  && ! echo "$out" | grep -q 'FAIL - first line of .*lead-prompt.md'; then
  echo "ok   - a changed template fails and is named"
else
  echo "FAIL - self-test: changed verifier template gave exit $rc: $out"
  fails=1
fi

check_config "$config_file" || fails=1

# Self-test: a full copy passes; a copy without one key's line fails, naming it.
cp "$config_file" "$tmp/full.yaml"
if sh tests/check-templates.sh --config "$tmp/full.yaml" >/dev/null 2>&1; then
  echo "ok   - a full config copy passes"
else
  echo "FAIL - self-test: full config copy failed"
  fails=1
fi
while IFS= read -r key; do
  awk -v section="${key%%.*}" -v name="${key#*.}" '
    /^[^ \t#]/ { in_section = ($0 ~ "^" section ":") }
    in_section && $0 ~ "^[ \t]+" name ":" { next }
    { print }
  ' "$config_file" > "$tmp/missing.yaml"
  out=$(sh tests/check-templates.sh --config "$tmp/missing.yaml" 2>&1)
  rc=$?
  if [ "$rc" -eq 1 ] && echo "$out" | grep -q "FAIL - config key $key missing"; then
    echo "ok   - a config copy without $key fails and names it"
  else
    echo "FAIL - self-test: config copy without $key gave exit $rc: $out"
    fails=1
  fi
done <<EOT
$config_keys
EOT

exit $fails
