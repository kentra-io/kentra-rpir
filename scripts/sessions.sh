#!/bin/sh
# sessions.sh — the one place that parses .kentra-rpir/sessions.map and finds
# Claude Code session transcripts for a kentra-rpir change (2.1.2, 2.1.3).
# POSIX sh.
#
#   sessions.sh list --project <root> --change <change folder>
#   sessions.sh transcript --project <root> <session id>
#
# list prints one line per distinct session registered to <change folder>, in
# first-appearance order:
#   <session id> <stages> <transcript path or ->
# A session registered under several stages lists them joined by "+" in map
# order (e.g. "spec+plan"). Map parsing: CRLF tolerated, runs of whitespace
# between fields, a literal (non-regex) match on the key field, and a line
# with no change field is ignored.
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
    map="$project/.kentra-rpir/sessions.map"
    [ -f "$map" ] || exit 0
    # Group map lines by session id, in first-appearance order, keeping only
    # lines registered to the given change (exact, literal comparison — not
    # a regex match), and joining each id's distinct stages with "+" in map
    # order. A line with no change field (NF < 2) is ignored.
    grouped=$(awk -v change="$change" '
      {
        sub(/\r$/, "")
        if (NF < 2) next
        id = $1; c = $2; st = $3
        if (c != change) next
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
    echo "kentra-rpir: usage: sessions.sh list --project <root> --change <folder> | sessions.sh transcript --project <root> <session id>" >&2
    exit 2
    ;;
esac
