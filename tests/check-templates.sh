#!/bin/sh
# Pins the first line of the lead and verifier prompt templates. The milestone
# graph mod (hooks/tracker.ts) maps Agent dispatches to milestones by
# these lines, and hooks/test/tracker.test.ts holds them as constants:
# the templates, the tracker, its test and this script change together.
# Also checks that the listed config keys exist in templates/config.yaml and
# templates/user-config.yaml, and that the audit prompt holds its output slots.
# Also checks that plugin.json's version is at least 0.7.0 (semver compare).
# Usage: sh tests/check-templates.sh [template dir | --config <yaml file> | --user-config <yaml file> | --prompt <file> | --version <plugin.json>]
#   no argument: checks skills/implement, the test file's constants, the
#   config keys and the audit prompt's slots, fails while docs/retro-backlog.md
#   exists, and self-tests that a changed
#   template, a missing key or a missing slot fails. With a dir: checks only
#   the two templates in it. With --config or --user-config: checks only the
#   project or user keys against that file. With --prompt: checks only the
#   slots in that file. With --version: checks only the version in that file.
#   POSIX sh; run from anywhere.
set -u
cd "$(dirname "$0")/.." || exit 1

# shellcheck disable=SC2016 # the backticks are prompt text, not command substitution
lead_line='You are leading milestone M{{number}} `{{slug}}` of the change "{{title}}".'
# shellcheck disable=SC2016 # the backticks are prompt text, not command substitution
verify_line='You are verifying milestone M{{number}} `{{slug}}` of the change "{{title}}".'
test_file=hooks/test/tracker.test.ts
config_file=templates/config.yaml
user_config_file=templates/user-config.yaml
prompt_file=skills/implement/audit-prompt.md

# One dotted key per line; append a line to add a key.
config_keys='research.standalone
research.maxParallel
research.maxLookups
research.staleMinutes
roles.lead
roles.review-orchestrator
implement.maxParallel
implement.cacheWindowMinutes
audit.skill
audit.args'

user_config_keys='audit.skill
audit.args'

prompt_slots='{{worktree}}
{{base}}
{{head}}
{{auditFile}}'

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

check_config() { # check_config <yaml file> <keys, one per line>
  rc=0
  while IFS= read -r key; do
    if has_key "$1" "$key"; then
      echo "ok   - config key $key"
    else
      echo "FAIL - config key $key missing from $1"
      rc=1
    fi
  done <<EOT
$2
EOT
  return $rc
}

check_prompt() { # check_prompt <file>
  rc=0
  while IFS= read -r slot; do
    if grep -qF -- "$slot" "$1"; then
      echo "ok   - prompt slot $slot"
    else
      echo "FAIL - prompt slot $slot missing from $1"
      rc=1
    fi
  done <<EOT
$prompt_slots
EOT
  return $rc
}

min_version=0.7.0

check_version() { # check_version <plugin.json>
  v=$(sed -n 's/.*"version"[ \t]*:[ \t]*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/p' "$1" | head -n 1)
  if [ -n "$v" ] && awk -v v="$v" -v m="$min_version" 'BEGIN {
    split(v, a, "."); split(m, b, ".")
    for (i = 1; i <= 3; i++) { if (a[i] + 0 > b[i] + 0) exit 0; if (a[i] + 0 < b[i] + 0) exit 1 }
  }'; then
    echo "ok   - version $v in $1 is at least $min_version"
    return 0
  fi
  echo "FAIL - version ${v:-unreadable} in $1 is below $min_version"
  return 1
}

if [ "${1:-}" = "--version" ]; then
  check_version "${2:?usage: check-templates.sh --version <plugin.json>}"
  exit $?
fi

if [ "${1:-}" = "--config" ]; then
  check_config "${2:?usage: check-templates.sh --config <yaml file>}" "$config_keys"
  exit $?
fi

if [ "${1:-}" = "--user-config" ]; then
  check_config "${2:?usage: check-templates.sh --user-config <yaml file>}" "$user_config_keys"
  exit $?
fi

if [ "${1:-}" = "--prompt" ]; then
  check_prompt "${2:?usage: check-templates.sh --prompt <file>}"
  exit $?
fi

if [ $# -gt 0 ]; then
  check_dir "$1"
  exit $?
fi

fails=0
if [ -e docs/retro-backlog.md ]; then
  echo "FAIL - docs/retro-backlog.md still exists; import it with improvements.mjs import and delete it"
  fails=1
else
  echo "ok   - docs/retro-backlog.md is gone"
fi
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

# Self-test: a full copy passes; a copy without one key's line fails, naming it.
self_test_config() { # self_test_config <mode flag> <yaml file> <keys> <label>
  check_config "$2" "$3" || fails=1
  cp "$2" "$tmp/full.yaml"
  if sh tests/check-templates.sh "$1" "$tmp/full.yaml" >/dev/null 2>&1; then
    echo "ok   - a full $4 copy passes"
  else
    echo "FAIL - self-test: full $4 copy failed"
    fails=1
  fi
  while IFS= read -r key; do
    awk -v section="${key%%.*}" -v name="${key#*.}" '
      /^[^ \t#]/ { in_section = ($0 ~ "^" section ":") }
      in_section && $0 ~ "^[ \t]+" name ":" { next }
      { print }
    ' "$2" > "$tmp/missing.yaml"
    out=$(sh tests/check-templates.sh "$1" "$tmp/missing.yaml" 2>&1)
    rc=$?
    if [ "$rc" -eq 1 ] && echo "$out" | grep -q "FAIL - config key $key missing"; then
      echo "ok   - a $4 copy without $key fails and names it"
    else
      echo "FAIL - self-test: $4 copy without $key gave exit $rc: $out"
      fails=1
    fi
  done <<EOT
$3
EOT
}
self_test_config --config "$config_file" "$config_keys" config
self_test_config --user-config "$user_config_file" "$user_config_keys" user-config

check_prompt "$prompt_file" || fails=1
if sh tests/check-templates.sh --prompt "$prompt_file" >/dev/null 2>&1; then
  echo "ok   - a full prompt copy passes"
else
  echo "FAIL - self-test: full prompt copy failed"
  fails=1
fi
while IFS= read -r slot; do
  grep -vF -- "$slot" "$prompt_file" > "$tmp/missing.md"
  out=$(sh tests/check-templates.sh --prompt "$tmp/missing.md" 2>&1)
  rc=$?
  if [ "$rc" -eq 1 ] && echo "$out" | grep -qF "FAIL - prompt slot $slot missing"; then
    echo "ok   - a prompt copy without $slot fails and names it"
  else
    echo "FAIL - self-test: prompt copy without $slot gave exit $rc: $out"
    fails=1
  fi
done <<EOT
$prompt_slots
EOT

check_version .claude-plugin/plugin.json || fails=1
for want in "0.6.9 1" "0.7.0 0" "0.7.1 0" "0.10.0 0"; do
  set -- $want
  sed "s/\"version\": \"[0-9.]*\"/\"version\": \"$1\"/" .claude-plugin/plugin.json > "$tmp/plugin.json"
  out=$(sh tests/check-templates.sh --version "$tmp/plugin.json" 2>&1)
  rc=$?
  if [ "$rc" -eq "$2" ] && { [ "$2" -eq 0 ] || echo "$out" | grep -q "FAIL - version $1"; }; then
    echo "ok   - version $1 gives exit $2"
  else
    echo "FAIL - self-test: version $1 gave exit $rc: $out"
    fails=1
  fi
done

exit $fails
