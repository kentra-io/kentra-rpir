#!/bin/sh
# Tests for scripts/stage-start.sh. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
script="$here/scripts/stage-start.sh"
fails=0
check() { # check <description> <command...>
  desc=$1; shift
  if "$@"; then echo "ok   - $desc"; else echo "FAIL - $desc"; fails=$((fails + 1)); fi
}
checkeq() { # checkeq <description> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (got [$2], want [$3])"; fails=$((fails + 1)); fi
}

root=$(mktemp -d "${TMPDIR:-/tmp}/rpir-stage-start.XXXXXX")
trap 'rm -rf "$root"' EXIT
export XDG_CONFIG_HOME="$root/xdg"
mkdir -p "$XDG_CONFIG_HOME/kentra-rpir"
echo "plugin: {}" > "$XDG_CONFIG_HOME/kentra-rpir/config.yaml"

# Old layout: exit 3, nothing written.
old="$root/old"
mkdir -p "$old/.kentra-rpir"
out=$(sh "$script" "$old"); rc=$?
checkeq "old layout exits 3" "$rc" "3"
case "$out" in *"migrate-layout.sh $old"*) echo "ok   - old layout names the migration script" ;; *) echo "FAIL - old layout message (got [$out])"; fails=$((fails + 1)) ;; esac
check "old layout writes no rpir/" test ! -e "$old/rpir"
oldfile="$root/oldfile"
mkdir -p "$oldfile"; : > "$oldfile/.kentra-rpir.yaml"
sh "$script" "$oldfile" >/dev/null; checkeq "old config file exits 3" "$?" "3"
mkdir -p "$old/rpir"; echo "project: x" > "$old/rpir/config.yaml"
sh "$script" "$old" >/dev/null; checkeq "old files beside rpir/config.yaml do not block" "$?" "0"

# Project id.
git init -q "$root/my-proj"
out=$(sh "$script" "$root/my-proj" | sed -n 1p)
checkeq "missing config prints config: new" "$out" "config: new"
checkeq "project id is the root's basename" "$(cat "$root/my-proj/rpir/config.yaml")" "project: my-proj"
printf 'project: edited\ntrack: true\n' > "$root/my-proj/rpir/config.yaml"
out=$(sh "$script" "$root/my-proj" | sed -n 1p)
checkeq "existing config prints config: existing" "$out" "config: existing"
checkeq "an edited project id is kept" "$(sed -n 1p "$root/my-proj/rpir/config.yaml")" "project: edited"
printf 'track: false\n' > "$root/my-proj/rpir/config.yaml"
sh "$script" "$root/my-proj" >/dev/null
checkeq "a missing project line is inserted first" "$(cat "$root/my-proj/rpir/config.yaml")" "project: my-proj
track: false"

# Mode.
checkeq "a git repo is tracked" "$(sh "$script" "$root/my-proj" | grep '^mode:')" "mode: tracked"
echo '/rpir/' > "$root/my-proj/.gitignore"
checkeq "rpir/ in .gitignore is untracked" "$(sh "$script" "$root/my-proj" | grep '^mode:')" "mode: untracked"
mkdir "$root/plain"
checkeq "a non-git dir is untracked" "$(sh "$script" "$root/plain" | grep '^mode:')" "mode: untracked"

# User config.
checkeq "an existing user config is named" "$(sh "$script" "$root/plain" | grep '^user-config:')" "user-config: $XDG_CONFIG_HOME/kentra-rpir/config.yaml"
rm "$XDG_CONFIG_HOME/kentra-rpir/config.yaml"
out=$(sh "$script" "$root/plain"); rc=$?
checkeq "a missing user config exits 0" "$rc" "0"
check "a missing user config prints user-config: missing" sh -c "printf '%s\n' \"\$1\" | grep -qx 'user-config: missing'" _ "$out"
check "the instructions name the template" sh -c "printf '%s\n' \"\$1\" | grep -q 'templates/user-config.yaml'" _ "$out"

[ "$fails" -eq 0 ] && echo "all stage-start tests passed"
exit "$fails"
