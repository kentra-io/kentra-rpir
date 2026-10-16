#!/bin/sh
# The demo plan's check: every out/<name>.txt that exists holds exactly the line <name>.
cd "$(dirname "$0")" || exit 1
for name in alpha beta gamma delta; do
  f="out/$name.txt"
  [ -e "$f" ] || continue
  if ! printf '%s\n' "$name" | cmp -s - "$f"; then
    echo "check.sh: $f must hold exactly the line $name" >&2
    exit 1
  fi
done
echo ok
