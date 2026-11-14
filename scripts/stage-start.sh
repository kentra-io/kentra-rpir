#!/bin/sh
# stage-start.sh — every kentra-rpir stage (plan, implement, review, research)
# runs this first. POSIX sh.
#
#   stage-start.sh <project root>
#
# Prints, in order:
#   config: new | existing      rpir/config.yaml now holds the project id
#   mode: tracked | untracked   untracked: root is no git work tree, or rpir/ is gitignored
#   user-config: <path>         or "user-config: missing" and instructions to follow
#
# Exit 3, writing nothing, when the project uses the old layout
# (.kentra-rpir.yaml or .kentra-rpir/ without rpir/config.yaml).
set -u

root="${1:-}"
if [ -z "$root" ] || [ ! -d "$root" ]; then
  echo "kentra-rpir: usage: stage-start.sh <project root>" >&2
  exit 2
fi
here=$(cd "$(dirname "$0")" && pwd)
config="$root/rpir/config.yaml"

if [ ! -f "$config" ] && { [ -e "$root/.kentra-rpir.yaml" ] || [ -e "$root/.kentra-rpir" ]; }; then
  echo "kentra-rpir: this project uses the old layout; run sh $here/migrate-layout.sh $root and start again"
  exit 3
fi

id=$(basename "$(cd "$root" && pwd)")
if [ ! -f "$config" ]; then
  mkdir -p "$root/rpir" || exit 1
  printf 'project: %s\n' "$id" > "$config"
  echo "config: new"
else
  if ! grep -q '^project:' "$config"; then
    tmp=$(mktemp "$root/rpir/.config.XXXXXX") || exit 1
    { printf 'project: %s\n' "$id"; cat "$config"; } > "$tmp" && mv "$tmp" "$config"
  fi
  echo "config: existing"
fi

if ! git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || (cd "$root" && git check-ignore -q --no-index rpir/.kentra-rpir-probe); then
  echo "mode: untracked"
else
  echo "mode: tracked"
fi

user_config="${XDG_CONFIG_HOME:-$HOME/.config}/kentra-rpir/config.yaml"
if [ -f "$user_config" ]; then
  echo "user-config: $user_config"
else
  cat <<EOT
user-config: missing
Set up the user config before going on. Ask the user these questions in one message:
1. Record plugin findings from retros? Default yes, recorded silently.
2. Nudge about plugin findings at session start? Default no.
3. The path of the plugin source. Ask only when the answer to 2 is yes.
4. A default audit skill, e.g. ponytail:ponytail-audit? Default none.
Then write $user_config from $here/../templates/user-config.yaml, with the answers in place of the defaults.
EOT
fi
