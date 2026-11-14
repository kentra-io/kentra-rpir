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

# --- list subcommand: sessions file parsing ----------------------------

proj2="$root/project2"
change=rpir/changes/2026-10-11-demo
change2=rpir/changes/2026-10-11-demo2
mkdir -p "$proj2/$change/.local" "$proj2/$change2/.local"
map="$proj2/$change/.local/sessions"

# A session registered for plan then implement lists once, joined as
# "plan+implement", with a real transcript resolved.
sidA=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
slug2=$(printf '%s' "$proj2" | sed 's/[^A-Za-z0-9]/-/g')
mkdir -p "$CLAUDE_CONFIG_DIR/projects/$slug2"
printf 'a\n' > "$CLAUDE_CONFIG_DIR/projects/$slug2/$sidA.jsonl"
printf '%s plan\n' "$sidA" >> "$map"
printf '%s implement\n' "$sidA" >> "$map"

# Another change's sessions file is not read.
sidB=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
printf '%s spec\n' "$sidB" > "$proj2/$change2/.local/sessions"

# CRLF tolerated, runs of whitespace between fields.
sidC=cccccccc-cccc-cccc-cccc-cccccccccccc
printf '%s\r\n' "$sidC     review" >> "$map"

# An older session registered spec then plan lists as "spec+plan".
sidOld=99999999-9999-9999-9999-999999999999
printf '%s spec\n' "$sidOld" >> "$map"
printf '%s plan\n' "$sidOld" >> "$map"

listing=$(sh "$script" list --project "$proj2" --change "$change")
checkeq "a session registered plan then implement lists once as plan+implement" \
  "$(printf '%s\n' "$listing" | awk -v s="$sidA" '$1==s{print $2}')" "plan+implement"
checkeq "the plan+implement session's transcript is resolved" \
  "$(printf '%s\n' "$listing" | awk -v s="$sidA" '$1==s{print $3}')" "$CLAUDE_CONFIG_DIR/projects/$slug2/$sidA.jsonl"
check "another change's sessions are not listed" \
  sh -c "! printf '%s\n' \"$listing\" | grep -q '^$sidB '"
checkeq "a review session on a CRLF line with collapsed spaces is parsed" \
  "$(printf '%s\n' "$listing" | awk -v s="$sidC" '$1==s{print $2}')" "review"
check "a session with no transcript prints - as the path" \
  sh -c "printf '%s\n' \"$listing\" | awk -v s='$sidC' '\$1==s{print \$3}' | grep -qx -- -"
checkeq "an old session registered spec then plan lists as spec+plan" \
  "$(printf '%s\n' "$listing" | awk -v s="$sidOld" '$1==s{print $2}')" "spec+plan"
checkeq "an absolute --change reads the same file" \
  "$(sh "$script" list --project "$proj2" --change "$proj2/$change" | wc -l | tr -d ' ')" "$(printf '%s\n' "$listing" | wc -l | tr -d ' ')"
checkeq "a change with no sessions file lists nothing" \
  "$(sh "$script" list --project "$proj2" --change rpir/changes/none)" ""

# --- current subcommand -------------------------------------------------

proj3="$root/project3"
out=$(sh "$script" current --project "$proj3")
rc=$?
check "current exits 1 when no change has a sessions file" test "$rc" -eq 1
checkeq "current prints nothing when no change has a sessions file" "$out" ""

mkdir -p "$proj3/rpir/changes/old/.local" "$proj3/rpir/changes/new/.local"
printf 's-old plan\n' > "$proj3/rpir/changes/old/.local/sessions"
printf 's-new plan\n' > "$proj3/rpir/changes/new/.local/sessions"
touch -t 202601010000 "$proj3/rpir/changes/old/.local/sessions"
checkeq "current without --session picks the newest sessions file" \
  "$(sh "$script" current --project "$proj3")" "rpir/changes/new"
checkeq "current picks the change holding --session, though older" \
  "$(sh "$script" current --project "$proj3" --session s-old)" "rpir/changes/old"
checkeq "current falls back to the newest for an unknown --session" \
  "$(sh "$script" current --project "$proj3" --session s-none)" "rpir/changes/new"
printf 's-old implement\n' >> "$proj3/rpir/changes/new/.local/sessions"
checkeq "a session in several changes resolves to the newest file" \
  "$(sh "$script" current --project "$proj3" --session s-old)" "rpir/changes/new"

[ "$fails" -eq 0 ] && echo "all sessions tests passed"
exit "$fails"
