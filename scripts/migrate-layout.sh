#!/bin/sh
# migrate-layout.sh — moves a project from the old kentra-rpir layout to rpir/.
# POSIX sh, no jq. Never commits; run it by hand, then review `git status`.
#
#   migrate-layout.sh [<project root>]     default: git toplevel, else pwd
#
# Prints one line per action and nothing when there is nothing to do (no
# .kentra-rpir.yaml and no .kentra-rpir/). Moves:
#   .kentra-rpir.yaml                 -> rpir/config.yaml (changesDir, research.dir and
#                                        research.index dropped; project: added when
#                                        absent; track: false when the old change folder
#                                        or config was gitignored)
#   <changesDir>/<change>/            -> rpir/changes/<change>/
#   <change>/research/spikes/         -> <change>/.local/spikes/
#   <research.dir>/spikes/            -> rpir/research/.local/spikes/
#   <research.dir>/, the index        -> rpir/research/, rpir/research/index.jsonl
#                                        (old path prefixes in the index are rewritten)
#   .kentra-rpir/sessions.map         -> <change>/.local/sessions, split per change
#   .kentra-rpir/reviewed/<change>/   -> <change>/.local/reviewed/
#   .kentra-rpir/implement-state*.json -> <change>/.local/implement-state.json
#   .kentra-rpir/research-queue/*.tsv -> <change>/.local/research-queue.tsv, or
#                                        rpir/research/.local/research-queue.tsv
# Old paths that are symlinks into rpir/ are removed, not copied through. .gitignore
# gets rpir/**/.local/ (and /rpir/ with track: false); the old entries leave it.
# Nothing is overwritten: identical files are deduplicated, and different content at
# a destination stops the run. The config, index, research and change moves are
# checked first, so that stop happens before anything moves. Running it twice is safe.
#
# Exit 0 done or nothing to do; 1 a conflict or a failed step; 2 bad root.
set -u

root=${1:-}
[ -n "$root" ] || root=$(git rev-parse --show-toplevel 2> /dev/null) || root=$(pwd)
cd "$root" 2> /dev/null || { echo "kentra-rpir: migrate-layout.sh: $root is not a directory" >&2; exit 2; }
root=$(pwd); rootp=$(pwd -P)
[ -f .kentra-rpir.yaml ] || [ -d .kentra-rpir ] || exit 0

tmp=$(mktemp "${TMPDIR:-/tmp}/rpir-migrate.XXXXXX") || exit 1
trap 'rm -f "$tmp"' EXIT
tab=$(printf '\t')
say() { printf '%s\n' "$*"; }
conflict() {
  echo "kentra-rpir: migrate-layout.sh: $1 and $2 both exist with different content; merge them by hand, then run again" >&2
  exit 1
}

getkey() { # getkey top|research <key>: a value of .kentra-rpir.yaml, comment and quotes removed
  [ -f .kentra-rpir.yaml ] || return 0
  awk -v sect="$1" -v key="$2" '
    /^[^ \t#]/ { cur = ($0 ~ /^research:/) ? "research" : "top" }
    cur == sect && (sect == "top" ? $0 ~ ("^" key ":") : $0 ~ ("^[ \t]+" key ":")) {
      sub(/^[^:]*:[ \t]*/, ""); sub(/(^|[ \t]+)#.*$/, ""); sub(/[ \t]+$/, ""); print; exit
    }' .kentra-rpir.yaml | tr -d "\"'"
}
norm() { v=${1#./}; printf '%s' "${v%/}"; }

v=$(getkey top changesDir);   cdir=$(norm "${v:-docs/changes}")
v=$(getkey research dir);     rdir=$(norm "${v:-docs/research}")
v=$(getkey research index);   ridx=$(norm "${v:-$rdir/index.jsonl}")

# A partly migrated project (config already moved) keeps whatever sits at the default old paths.
trees=1
[ ! -f .kentra-rpir.yaml ] && [ -f rpir/config.yaml ] && trees=0

ignored=0
if git check-ignore -q --no-index "$cdir/x" 2> /dev/null || git check-ignore -q --no-index .kentra-rpir.yaml 2> /dev/null; then
  ignored=1
fi

# awk helper: literal (not regex) prefix replacement
REP='function rep(s, a, b,   i, out) { out = ""; while ((i = index(s, a)) > 0) { out = out substr(s, 1, i - 1) b; s = substr(s, i + length(a)) } return out s }'

into_rpir() { # into_rpir <symlink>: it resolves into rpir/
  t=$(cd -P "$1" 2> /dev/null && pwd -P) || return 1
  case "$t" in "$rootp"/rpir|"$rootp"/rpir/*) return 0 ;; esac
  return 1
}

DRY=1
mvt() { # mvt <src> <dest>: merge src into dest; with DRY=1 only look for conflicts
  [ "$1" = "$2" ] && return 0
  [ -e "$1" ] || [ -L "$1" ] || return 0
  if [ -L "$1" ] && into_rpir "$1"; then
    [ "$DRY" = 1 ] || { rm "$1" && say "removed symlink $1 (it points into rpir/)"; }
    return 0
  fi
  if [ -d "$1" ] && [ ! -L "$1" ]; then
    if [ -e "$2" ] && [ ! -d "$2" ]; then conflict "$1" "$2"; fi
    for e in "$1"/* "$1"/.[!.]*; do
      [ -e "$e" ] || [ -L "$e" ] || continue
      mvt "$e" "$2/${e##*/}"
    done
    [ "$DRY" = 1 ] || rmdir "$1" 2> /dev/null
    return 0
  fi
  if [ -e "$2" ] || [ -L "$2" ]; then
    cmp -s "$1" "$2" || conflict "$1" "$2"
    [ "$DRY" = 1 ] || { rm "$1" && say "removed $1 (same content as $2)"; }
    return 0
  fi
  [ "$DRY" = 1 ] || { mkdir -p "$(dirname "$2")" && mv "$1" "$2" && say "moved $1 to $2"; }
}

mvindex() {
  dest=rpir/research/index.jsonl
  [ -f "$ridx" ] || return 0
  [ "$ridx" = "$dest" ] && return 0
  [ "$ridx" -ef "$dest" ] && return 0
  awk -v ca="$cdir/" -v ra="$rdir/" "$REP"'{ print rep(rep($0, ca, "rpir/changes/"), ra, "rpir/research/") }' "$ridx" > "$tmp"
  if [ -e "$dest" ]; then
    cmp -s "$tmp" "$dest" || conflict "$ridx" "$dest"
    [ "$DRY" = 1 ] || { rm "$ridx" && say "removed $ridx (same content as $dest)"; }
    return 0
  fi
  [ "$DRY" = 1 ] || { mkdir -p rpir/research && cat "$tmp" > "$dest" && rm "$ridx" && say "moved $ridx to $dest, with its paths rewritten"; }
}

trees() {
  [ "$trees" = 1 ] || return 0
  mvindex
  mvt "$rdir" rpir/research
  mvt "$cdir" rpir/changes
}

# Which file the new config is made from: the old one, else the one already in rpir/.
if [ -f .kentra-rpir.yaml ] && [ -f rpir/config.yaml ]; then
  cmp -s .kentra-rpir.yaml rpir/config.yaml || conflict .kentra-rpir.yaml rpir/config.yaml
fi

trees
DRY=0

# Config
[ -f .kentra-rpir.yaml ] || ignored=0
src=""
if [ -f rpir/config.yaml ]; then src=rpir/config.yaml; elif [ -f .kentra-rpir.yaml ]; then src=.kentra-rpir.yaml; fi
hdr=""
if [ -z "$src" ] || ! grep -q '^project:' "$src"; then hdr="project: $(basename "$root")"
fi
{
  [ -z "$hdr" ] || printf '%s\n' "$hdr"
  if [ "$ignored" = 1 ] && { [ -z "$src" ] || ! grep -q '^track:' "$src"; }; then echo "track: false"; fi
  [ -z "$src" ] || awk -v tr="$ignored" '
    /^[^ \t#]/ { inres = ($0 ~ /^research:/) }
    /^changesDir:/ { next }
    inres && /^[ \t]+(dir|index):/ { next }
    tr && /^track:/ { print "track: false"; next }
    { print }' "$src"
} > "$tmp"
if [ ! -f rpir/config.yaml ] || ! cmp -s "$tmp" rpir/config.yaml; then
  if [ "$src" = rpir/config.yaml ] && [ -z "$hdr" ]; then :; else
    mkdir -p rpir && cat "$tmp" > rpir/config.yaml && say "wrote rpir/config.yaml"
  fi
fi
if [ -f .kentra-rpir.yaml ]; then rm .kentra-rpir.yaml && say "removed .kentra-rpir.yaml"; fi

trees
for s in rpir/changes/*/research/spikes; do
  [ -d "$s" ] && mvt "$s" "${s%/research/spikes}/.local/spikes"
done
[ ! -d rpir/research/spikes ] || mvt rpir/research/spikes rpir/research/.local/spikes

# Machine-local state
old=.kentra-rpir
map=$old/sessions.map
for q in "$old"/research-queue/*.tsv; do
  [ -f "$q" ] || continue
  sid=${q##*/}; sid=${sid%.tsv}
  f=$(awk -v s="$sid" '$1 == s { f = $2 } END { print f }' "$map" 2> /dev/null)
  n=${f%/}; n=${n##*/}
  if [ -n "$n" ] && [ -d "rpir/changes/$n" ]; then dest=rpir/changes/$n/.local/research-queue.tsv; else dest=rpir/research/.local/research-queue.tsv; fi
  mkdir -p "${dest%/*}"
  base=0; renum=0
  if [ -s "$dest" ]; then
    renum=1; base=$(awk -F "$tab" '$1 + 0 > m { m = $1 + 0 } END { print m + 0 }' "$dest")
  fi
  awk -F "$tab" -v OFS="$tab" -v base="$base" -v renum="$renum" -v ca="$cdir/" -v ra="$rdir/" "$REP"'
    NF == 0 { next }
    { n++; if (renum) $1 = base + n; $4 = rep(rep($4, ca, "rpir/changes/"), ra, "rpir/research/"); print }' "$q" >> "$dest" &&
    rm "$q" && say "moved $q to $dest"
done
rmdir "$old/research-queue" 2> /dev/null

if [ -f "$map" ]; then
  while read -r sid folder stage; do
    [ -n "$sid" ] || continue
    n=${folder%/}; n=${n##*/}
    if [ -d "rpir/changes/$n" ]; then
      mkdir -p "rpir/changes/$n/.local"
      grep -qxF "$sid $stage" "rpir/changes/$n/.local/sessions" 2> /dev/null || echo "$sid $stage" >> "rpir/changes/$n/.local/sessions"
    else
      say "dropped session $sid: change folder $folder does not exist"
    fi
  done < "$map"
  rm "$map" && say "split $map into the changes' .local/sessions"
fi

for r in "$old"/reviewed/*; do
  [ -d "$r" ] || continue
  n=${r##*/}
  if [ -d "rpir/changes/$n" ]; then mvt "$r" "rpir/changes/$n/.local/reviewed"; fi
done
rmdir "$old/reviewed" 2> /dev/null

for f in "$old"/implement-state*.json; do
  [ -f "$f" ] || continue
  b=${f##*/}
  if [ "$b" = implement-state.json ]; then
    n=$(sed -n 's/.*"change"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$f" | head -n 1)
  else
    n=${b#implement-state.}; n=${n%.json}
  fi
  n=${n%/}; n=${n##*/}
  if [ -n "$n" ] && [ -d "rpir/changes/$n" ]; then mvt "$f" "rpir/changes/$n/.local/implement-state.json"; fi
done

if [ -d "$old" ]; then
  if rmdir "$old" 2> /dev/null; then say "removed $old/"; else say "left in $old/: $(ls -A "$old" | tr '\n' ' ')"; fi
fi

# .gitignore
: > "$tmp"
[ ! -f .gitignore ] || grep -vxF -e .kentra-rpir/ -e /.kentra-rpir/ -e .kentra-rpir.yaml -e /.kentra-rpir.yaml -e "$cdir/*/research/spikes/" -e "$rdir/spikes/" .gitignore > "$tmp"
want='rpir/**/.local/'
grep -q '^track:[[:space:]]*false' rpir/config.yaml 2> /dev/null && want="$want
/rpir/"
printf '%s\n' "$want" | while read -r w; do grep -qxF "$w" "$tmp" || echo "$w" >> "$tmp"; done
if [ ! -f .gitignore ] || ! cmp -s "$tmp" .gitignore; then cat "$tmp" > .gitignore && say "updated .gitignore"; fi
exit 0
