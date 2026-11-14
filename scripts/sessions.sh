#!/bin/sh
# sessions.sh — the one place that parses <change folder>/.local/sessions and
# finds Claude Code session transcripts for a kentra-rpir change. POSIX sh.
# The file holds one "<session id> <stage>" per line; its location is the
# change. Stages are plan, implement and review; an entry from an older
# version (stage spec) is listed as-is.
#
#   sessions.sh list --project <root> --change <change folder>
#   sessions.sh current --project <root> [--session <id>]
#   sessions.sh transcript --project <root> <session id>
#
# <change folder> is relative to <root> or absolute.
#
# list prints one line per distinct session in the change's sessions file, in
# first-appearance order:
#   <session id> <stages> <transcript path or ->
# A session registered under several stages lists them joined by "+" in file
# order (e.g. "plan+implement"). Parsing: CRLF tolerated, runs of whitespace
# between fields.
#
# current prints the change folder (rpir/changes/<name>) whose sessions file
# holds <session id>; when several do, the one with the newest sessions file.
# Without a match or without --session, it prints the change whose sessions
# file is newest. It exits 1 printing nothing when no change has one.
#
# transcript prints the transcript path for <session id> and exits 0, or
# exits 1 with nothing on stdout.
set -u

# find_transcript <project root> <session id>: prints the transcript path on
# stdout and returns 0, or prints nothing and returns 1.
find_transcript() {
  proj=$1; id=$2
  base="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
  slug=$(printf '%s' "$proj" | sed 's/[^A-Za-z0-9]/-/g')
  direct="$base/$slug/$id.jsonl"
  if [ -f "$direct" ]; then
    printf '%s\n' "$direct"
    return 0
  fi
  found=$(find "$base" -maxdepth 2 -name "$id.jsonl" 2>/dev/null | head -n 1)
  if [ -n "$found" ] && [ -f "$found" ]; then
    printf '%s\n' "$found"
    return 0
  fi
  return 1
}

cmd="${1:-}"
if [ $# -ge 1 ]; then shift; fi

case "$cmd" in
  list)
    project=""; change=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --project) [ $# -ge 2 ] || exit 2; project=$2; shift 2 ;;
        --change) [ $# -ge 2 ] || exit 2; change=$2; shift 2 ;;
        *) echo "kentra-rpir: sessions.sh list: unknown argument $1" >&2; exit 2 ;;
      esac
    done
    if [ -z "$project" ] || [ -z "$change" ]; then
      echo "kentra-rpir: sessions.sh list: --project and --change are required" >&2
      exit 2
    fi
    case "$change" in /*) map="$change/.local/sessions" ;; *) map="$project/$change/.local/sessions" ;; esac
    [ -f "$map" ] || exit 0
    grouped=$(awk '
      {
        sub(/\r$/, "")
        if (NF < 1) next
        id = $1; st = $2
        if (!(id in seen)) { order[++n] = id; seen[id] = 1; stages[id] = "" }
        if (st != "") {
          already = 0
          m = split(stages[id], parts, "+")
          for (i = 1; i <= m; i++) if (parts[i] == st) already = 1
          if (!already) stages[id] = (stages[id] == "" ? st : stages[id] "+" st)
        }
      }
      END {
        for (i = 1; i <= n; i++) print order[i], stages[order[i]]
      }
    ' "$map")
    [ -n "$grouped" ] || exit 0
    printf '%s\n' "$grouped" | while IFS=' ' read -r id stg; do
      if tpath=$(find_transcript "$project" "$id"); then
        printf '%s %s %s\n' "$id" "$stg" "$tpath"
      else
        printf '%s %s -\n' "$id" "$stg"
      fi
    done
    ;;
  current)
    project=""; sid=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --project) [ $# -ge 2 ] || exit 2; project=$2; shift 2 ;;
        --session) [ $# -ge 2 ] || exit 2; sid=$2; shift 2 ;;
        *) echo "kentra-rpir: sessions.sh current: unknown argument $1" >&2; exit 2 ;;
      esac
    done
    if [ -z "$project" ]; then
      echo "kentra-rpir: sessions.sh current: --project is required" >&2
      exit 2
    fi
    # ls -t sorts newest first; a change folder name holds no whitespace
    newest=$(ls -t "$project"/rpir/changes/*/.local/sessions 2>/dev/null | head -n 1)
    [ -n "$newest" ] || exit 1
    pick=$newest
    if [ -n "$sid" ]; then
      for f in $(ls -t "$project"/rpir/changes/*/.local/sessions 2>/dev/null); do
        if awk -v id="$sid" '{ sub(/\r$/, "") } $1 == id { f = 1 } END { exit !f }' "$f"; then
          pick=$f
          break
        fi
      done
    fi
    printf 'rpir/changes/%s\n' "$(basename "$(dirname "$(dirname "$pick")")")"
    ;;
  transcript)
    project=""; sid=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --project) [ $# -ge 2 ] || exit 2; project=$2; shift 2 ;;
        *) sid=$1; shift ;;
      esac
    done
    if [ -z "$project" ] || [ -z "$sid" ]; then
      echo "kentra-rpir: sessions.sh transcript: --project and a session id are required" >&2
      exit 2
    fi
    if path=$(find_transcript "$project" "$sid"); then
      printf '%s\n' "$path"
      exit 0
    fi
    exit 1
    ;;
  *)
    echo "kentra-rpir: usage: sessions.sh list --project <root> --change <folder> | sessions.sh current --project <root> [--session <id>] | sessions.sh transcript --project <root> <session id>" >&2
    exit 2
    ;;
esac
