#!/bin/sh
# Tests for scripts/sessions.sh. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
script="$here/scripts/sessions.sh"
fails=0
check() { # check <description> <command...>
  desc=$1; shift
  if "$@"; then echo "ok   - $desc"; else echo "FAIL - $desc"; fails=$((fails + 1)); fi
}
checkeq() { # checkeq <description> <actual> <expected>
  desc=$1; actual=$2; expected=$3
  if [ "$actual" = "$expected" ]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc (got [$actual], want [$expected])"
    fails=$((fails + 1))
  fi
}

root=$(mktemp -d "${TMPDIR:-/tmp}/rpir-sessions.XXXXXX")
trap 'rm -rf "$root"' EXIT
export CLAUDE_CONFIG_DIR="$root/claude"

# --- transcript subcommand ---------------------------------------------

proj="$root/pro.ject_1"
slug=$(printf '%s' "$proj" | sed 's/[^A-Za-z0-9]/-/g')
mkdir -p "$CLAUDE_CONFIG_DIR/projects/$slug"

sid1=11111111-1111-1111-1111-111111111111
printf 'line one\n' > "$CLAUDE_CONFIG_DIR/projects/$slug/$sid1.jsonl"
path1=$(sh "$script" transcript --project "$proj" "$sid1")
checkeq "transcript finds <slug>/<id>.jsonl by the slug rule" "$path1" "$CLAUDE_CONFIG_DIR/projects/$slug/$sid1.jsonl"

sid2=22222222-2222-2222-2222-222222222222
othersluged="$CLAUDE_CONFIG_DIR/projects/-some-other-shortened-slug"
mkdir -p "$othersluged"
printf 'line two\n' > "$othersluged/$sid2.jsonl"
path2=$(sh "$script" transcript --project "$proj" "$sid2")
checkeq "transcript falls back to find for another slug" "$path2" "$othersluged/$sid2.jsonl"

sid3=33333333-3333-3333-3333-333333333333
out3=$(sh "$script" transcript --project "$proj" "$sid3")
rc3=$?
check "transcript exits 1 for a missing transcript" test "$rc3" -eq 1
checkeq "transcript prints nothing for a missing transcript" "$out3" ""

# --- list subcommand: map parsing ---------------------------------------

proj2="$root/project2"
mkdir -p "$proj2/.kentra-rpir"
change=docs/changes/2026-10-11-demo
change2=docs/changes/2026-10-11-demo2
map="$proj2/.kentra-rpir/sessions.map"

# A session registered for several stages (spec then plan) lists once,
# joined as "spec+plan", with a real transcript resolved.
sidA=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
slug2=$(printf '%s' "$proj2" | sed 's/[^A-Za-z0-9]/-/g')
mkdir -p "$CLAUDE_CONFIG_DIR/projects/$slug2"
printf 'a\n' > "$CLAUDE_CONFIG_DIR/projects/$slug2/$sidA.jsonl"
printf '%s %s spec\n' "$sidA" "$change" >> "$map"
printf '%s %s plan\n' "$sidA" "$change" >> "$map"

# Only the given change's sessions are listed.
sidB=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
printf '%s %s spec\n' "$sidB" "$change2" >> "$map"

# CRLF tolerated, runs of whitespace between fields.
sidC=cccccccc-cccc-cccc-cccc-cccccccccccc
printf '%s\r\n' "$sidC    $change     review" >> "$map"

# A line with no change field is ignored (standalone).
sidD=dddddddd-dddd-dddd-dddd-dddddddddddd
printf '%s\n' "$sidD" >> "$map"

# The LAST map line for a session has an empty change field, after an
# earlier line for the same session had a valid one: the malformed line is
# ignored (and only that line), so the session is still listed from its
# earlier valid registration.
sidE=eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee
printf '%s %s spec\n' "$sidE" "$change" >> "$map"
printf '%s\n' "$sidE" >> "$map"

# A literal (non-regex) match on the key field: a decoy change value that
# would wrongly match the real one if '.' were treated as a regex wildcard
# (dot-as-any-char) instead of compared literally.
changedot="docs/changes/2026.10-11-demo3"
decoychange="docs/changes/2026X10-11-demo3"
sidDecoy=11111111-dddd-dddd-dddd-111111111111
sidReal=22222222-dddd-dddd-dddd-222222222222
printf '%s %s spec\n' "$sidDecoy" "$decoychange" >> "$map"
printf '%s %s plan\n' "$sidReal" "$changedot" >> "$map"

listing=$(sh "$script" list --project "$proj2" --change "$change")
checkeq "spec+plan joined for one session" \
  "$(printf '%s\n' "$listing" | awk -v s="$sidA" '$1==s{print $2}')" "spec+plan"
checkeq "spec+plan session's transcript resolved" \
  "$(printf '%s\n' "$listing" | awk -v s="$sidA" '$1==s{print $3}')" "$CLAUDE_CONFIG_DIR/projects/$slug2/$sidA.jsonl"
check "only the given change's sessions are listed (decoy change excluded)" \
  sh -c "! printf '%s\n' \"$listing\" | grep -q '^$sidB '"
checkeq "CRLF + collapsed-space map line parsed" \
  "$(printf '%s\n' "$listing" | awk -v s="$sidC" '$1==s{print $2}')" "review"
check "empty change field (standalone line) listed nowhere" \
  sh -c "! printf '%s\n' \"$listing\" | grep -q '^$sidD '"
check "a session with no transcript prints - as the path" \
  sh -c "printf '%s\n' \"$listing\" | awk -v s='$sidC' '\$1==s{print \$3}' | grep -qx -- -"
checkeq "empty change field on the last line does not drop the earlier valid registration" \
  "$(printf '%s\n' "$listing" | awk -v s="$sidE" '$1==s{print $2}')" "spec"

listingdot=$(sh "$script" list --project "$proj2" --change "$changedot")
check "literal match: real session (literal dot) is listed" \
  sh -c "printf '%s\n' \"$listingdot\" | grep -q '^$sidReal '"
check "literal match: decoy (regex-wildcard-matchable) session is not listed" \
  sh -c "! printf '%s\n' \"$listingdot\" | grep -q '^$sidDecoy '"

[ "$fails" -eq 0 ] && echo "all sessions tests passed"
exit "$fails"
