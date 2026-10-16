#!/bin/sh
# Creates a throwaway git project holding a four-milestone kentra-rpir plan,
# with a bare origin beside it, then runs the real implement skill on it
# with this repository loaded as the plugin.
#
# Usage: sh tests/demo/run-demo.sh [<dir>] [--print-only]
#   <dir>         where to create project/ and origin.git (default: a new temp dir);
#                 must be empty or absent
#   --print-only  create the repository and print the command; do not start Claude Code
set -eu

repo=$(cd "$(dirname "$0")/../.." && pwd)
fixture="$repo/tests/demo/fixture"
change=docs/changes/2026-10-16-demo-diamond

dir=
print_only=0
for arg in "$@"; do
  case $arg in
    --print-only) print_only=1 ;;
    -*) echo "run-demo.sh: unknown option $arg" >&2; exit 2 ;;
    *)
      if [ -n "$dir" ]; then echo "run-demo.sh: more than one directory given" >&2; exit 2; fi
      dir=$arg ;;
  esac
done

if [ -z "$dir" ]; then
  dir=$(mktemp -d "${TMPDIR:-/tmp}/rpir-demo.XXXXXX")
elif [ -e "$dir" ]; then
  if [ ! -d "$dir" ] || [ -n "$(ls -A "$dir")" ]; then
    echo "run-demo.sh: $dir must be an empty directory or absent" >&2
    exit 1
  fi
else
  mkdir -p "$dir"
fi
dir=$(cd "$dir" && pwd)
project="$dir/project"
origin="$dir/origin.git"

mkdir "$project"
# "fixture/." copies the dotfiles too.
cp -R "$fixture/." "$project/"
git -C "$project" init -q -b main
git -C "$project" config user.name "rpir demo"
git -C "$project" config user.email "demo@example.invalid"
# A global commit.gpgsign would otherwise fail the commit where no key is set up.
git -C "$project" config commit.gpgsign false
git -C "$project" add -A
git -C "$project" commit -q -m "demo: initial"

git init -q --bare "$origin"
git -C "$project" remote add origin "$origin"

echo "Demo project: $project"
echo "Command: claude --plugin-dir \"$repo\" \"/kentra-rpir:implement $change\""

if [ "$print_only" -eq 0 ]; then
  cd "$project"
  exec claude --plugin-dir "$repo" "/kentra-rpir:implement $change"
fi
