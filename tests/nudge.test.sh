#!/bin/sh
# Tests for hooks/nudge.sh. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
hook="$here/hooks/nudge.sh"
imp="$here/scripts/improvements.mjs"
fails=0
checkeq() { # checkeq <description> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (got [$2], want [$3])"; fails=$((fails + 1)); fi
}

root=$(mktemp -d "${TMPDIR:-/tmp}/rpir-nudge.XXXXXX")
trap 'rm -rf "$root"' EXIT
export XDG_DATA_HOME="$root/data" XDG_CONFIG_HOME="$root/config"
mkdir -p "$XDG_CONFIG_HOME/kentra-rpir"
cfg="$XDG_CONFIG_HOME/kentra-rpir/config.yaml"
printf 'nudge:\n  days: 3\n  minFindings: 5\n' > "$cfg"

seq=0
rec() { # rec <scope> <project> <n>: n occurrences, one distinct change each
  i=0
  while [ "$i" -lt "$3" ]; do
    i=$((i + 1)); seq=$((seq + 1))
    printf '[{"project":"p","change":"c%s","findingId":"F1","findingRef":"x/spec-retro.md","date":"2026-06-01","pluginVersion":"0.9.0","count":1,"wallMinutes":0,"tokens":0,"userInterventions":0,"severity":"low","title":"Class A","problem":"p","fix":"f","complexity":"M"}]' "$seq" |
      node "$imp" record --scope "$1" --project "$2" >/dev/null || echo "record failed"
  done
}
hook() { CLAUDE_PROJECT_DIR="$1" sh "$hook"; }
back() { # back <registry dir>: move lastNudge 3 days and a minute into the past
  node -e '
    const fs = require("fs"), f = process.argv[1] + "/state.json", s = JSON.parse(fs.readFileSync(f));
    s.lastNudge = new Date(Date.parse(s.lastNudge) - 3 * 864e5 - 6e4).toISOString();
    fs.writeFileSync(f, JSON.stringify(s));' "$1"
}

p="$root/proj"; mkdir -p "$p"; reg="$p/rpir/improvements"
rec project "$p" 4
checkeq "4 occurrences: no output" "$(hook "$p")" ""
rec project "$p" 1
out=$(hook "$p")
checkeq "5th occurrence: one line" "$(printf '%s\n' "$out" | grep -c .)" "1"
case $out in */kentra-rpir:improve.*) echo "ok   - the line is the project line" ;; *) echo "FAIL - not the project line: $out"; fails=$((fails + 1)) ;; esac
checkeq "immediate rerun: no output" "$(hook "$p")" ""
back "$reg"
checkeq "3 days later: one line" "$(hook "$p" | grep -c .)" "1"
node "$imp" decide --scope project --project "$p" --id class-a --verdict defer >/dev/null || echo "decide failed"
back "$reg"
checkeq "after an improve run: no output" "$(hook "$p")" ""

rm "$cfg"
p2="$root/proj2"; mkdir -p "$p2"
rec project "$p2" 5
case $(hook "$p2") in */kentra-rpir:improve.*) echo "ok   - no config: defaults nudge" ;; *) echo "FAIL - no config: no project line"; fails=$((fails + 1)) ;; esac

p3="$root/proj3"; mkdir -p "$p3"
rec plugin "$p3" 5
printf 'plugin:\n  nudge: false\n' > "$cfg"
case $(hook "$p3") in *improve-plugin*) echo "FAIL - plugin line with nudge off"; fails=$((fails + 1)) ;; *) echo "ok   - plugin.nudge false: no plugin line" ;; esac
printf 'plugin:\n  nudge: true\n' > "$cfg"
case $(hook "$p3") in *improve-plugin*) echo "ok   - plugin.nudge true: plugin line" ;; *) echo "FAIL - no plugin line with nudge on"; fails=$((fails + 1)) ;; esac

bin="$root/bin"; mkdir -p "$bin"
ln -s "$(command -v dirname)" "$bin/dirname"
rm -rf "$p3/rpir"; rec project "$p3" 5
rm -f "$p3/rpir/improvements/state.json"
out=$(CLAUDE_PROJECT_DIR="$p3" PATH="$bin" /bin/sh "$hook"); rc=$?
checkeq "no node: exit 0, empty" "$rc:$out" "0:"

p4="$root/proj4"; mkdir -p "$p4"; rm -rf "$XDG_DATA_HOME"
out=$(hook "$p4"); rc=$?
checkeq "no registry: exit 0, empty" "$rc:$out" "0:"

cp "$here/templates/user-config.yaml" "$cfg"
checkeq "template parses" "$(node --input-type=module -e "
import { readUserConfig as r } from '$imp';
const c = r();
console.log([c['plugin.record'], c['plugin.nudge'], c['nudge.days'], c['nudge.minFindings']].join(','))")" "true,false,3,5"

checkeq "hooks.json" "$(node -e "
const h = require('$here/hooks/hooks.json'), s = h.hooks.SessionStart[0];
console.log(JSON.stringify(h.modules) === '[\"./register.tsx\"]' && s.matcher === 'startup|resume' && s.hooks[0].command.includes('hooks/nudge.sh'))")" "true"

[ "$fails" -eq 0 ] || { echo "$fails failed"; exit 1; }
