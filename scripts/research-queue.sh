#!/bin/sh
# research-queue.sh — the job queue for research jobs, one queue per Claude
# Code session. POSIX sh. add, next and done hold one lock for the whole queue
# directory (the directory <queue dir>/.lock, taken with mkdir); a queue file
# is rewritten atomically (temp file in the same directory, then mv).
#
#   research-queue.sh add  --session <id> --dir <report dir> <kind> <slug> <question>
#   research-queue.sh next --session <id> [--max <n>] [--stale <minutes>]
#   research-queue.sh done --session <id> <job id> [--agent <agent id>]
#   research-queue.sh list --session <id>
#
# Every subcommand also takes --project <root> (default: git toplevel, else pwd).
# Queue file: <root>/.kentra-rpir/research-queue/<session id>.tsv, one line per
# job, 9 tab-separated fields, "-" for an empty one:
#   id state kind report added started finished agent question
# state is queued, running, done or stale; kind is fact, premise or survey;
# times are epoch seconds from `date +%s`, or RESEARCH_QUEUE_NOW when set.
#
# add prints "<id>\t<report path>". The report path is <dir>/<slug>.md, or
# <slug>-2.md, <slug>-3.md, ... when the file exists or any job in any
# session's queue file already has that path. The report file itself is never created.
#
# next first marks every running job started more than <minutes> (default 60)
# ago as stale and prints "stale\t<id>\t<kind>\t<report>\t<question>" for it;
# then, if fewer than <n> (default 4) jobs run, it starts the queued job with
# the lowest id and prints "start\t<id>\t<kind>\t<report>\t<question>".
#
# done marks a job done in any state; exit 1 for an unknown id or no queue.
# list prints a header line and then the job lines in id order.
#
# A locked queue is retried once a second, RESEARCH_QUEUE_LOCK_TRIES times
# (default 10), then the call exits 1.
set -u

usage() {
  echo "kentra-rpir: usage: research-queue.sh add|next|done|list --session <id> [--project <root>] ..." >&2
  exit 2
}

die() { # die <exit code> <message>
  echo "kentra-rpir: research-queue.sh $cmd: $2" >&2
  exit "$1"
}

cmd="${1:-}"
if [ $# -ge 1 ]; then shift; fi
case "$cmd" in
  add|next|done|list) ;;
  *) usage ;;
esac

session=""; project=""; dir=""; max=4; stale=60; agent=""; have_agent=0
npos=0; p1=""; p2=""; p3=""
while [ $# -gt 0 ]; do
  case "$1" in
    --session|--project|--dir|--max|--stale|--agent)
      [ $# -ge 2 ] || die 2 "$1 needs a value"
      case "$1" in
        --session) session=$2 ;;
        --project) project=$2 ;;
        --dir) dir=$2 ;;
        --max) max=$2 ;;
        --stale) stale=$2 ;;
        --agent) agent=$2; have_agent=1 ;;
      esac
      shift 2 ;;
    --*) die 2 "unknown argument $1" ;;
    *)
      npos=$((npos + 1))
      case "$npos" in 1) p1=$1 ;; 2) p2=$1 ;; 3) p3=$1 ;; esac
      shift ;;
  esac
done

case "$session" in
  ''|*/*|*[[:space:]]*) die 2 "--session is required and must not contain / or whitespace" ;;
esac
case "$max" in ''|*[!0-9]*) die 2 "--max must be an integer" ;; esac
case "$stale" in ''|*[!0-9]*) die 2 "--stale must be an integer" ;; esac

if [ -z "$project" ]; then
  project=$(git rev-parse --show-toplevel 2>/dev/null) || project=$(pwd)
fi
qdir="$project/.kentra-rpir/research-queue"
qfile="$qdir/$session.tsv"
now="${RESEARCH_QUEUE_NOW:-$(date +%s)}"
tab=$(printf '\t')

lock() { # take the queue-dir lock; the EXIT trap releases it
  mkdir -p "$qdir" || die 1 "cannot create $qdir"
  tries="${RESEARCH_QUEUE_LOCK_TRIES:-10}"; tried=0
  until mkdir "$qdir/.lock" 2> /dev/null; do
    tried=$((tried + 1))
    [ "$tried" -lt "$tries" ] || die 1 "queue locked; remove $qdir/.lock if no other call is running"
    sleep 1
  done
  trap 'rmdir "$qdir/.lock" 2> /dev/null' EXIT
}

case "$cmd" in
  add)
    [ "$npos" -eq 3 ] || die 2 "expected <kind> <slug> <question>"
    [ -n "$dir" ] || die 2 "--dir is required"
    kind=$p1; slug=$p2
    case "$kind" in fact|premise|survey) ;; *) die 2 "kind must be fact, premise or survey" ;; esac
    [ -n "$slug" ] && [ -n "$p3" ] || die 2 "slug and question must not be empty"
    question=$(printf '%s' "$p3" | tr '\t\n' '  ')
    lock
    n=1; report="$dir/$slug.md"
    while :; do
      taken=1
      if [ ! -e "$report" ]; then
        if ! cat "$qdir"/*.tsv 2> /dev/null | awk -F "$tab" -v r="$report" '$4 == r { f = 1 } END { exit !f }'; then
          taken=0
        fi
      fi
      [ "$taken" -eq 0 ] && break
      n=$((n + 1)); report="$dir/$slug-$n.md"
    done
    id=1
    if [ -f "$qfile" ]; then
      id=$(awk -F "$tab" 'BEGIN { m = 0 } $1 + 0 > m { m = $1 + 0 } END { print m + 1 }' "$qfile")
    fi
    tmp=$(mktemp "$qdir/.$session.XXXXXX") || die 1 "cannot create a temp file in $qdir"
    if [ -f "$qfile" ]; then cat "$qfile" > "$tmp"; fi
    printf '%s\tqueued\t%s\t%s\t%s\t-\t-\t-\t%s\n' "$id" "$kind" "$report" "$now" "$question" >> "$tmp"
    mv "$tmp" "$qfile"
    printf '%s\t%s\n' "$id" "$report"
    ;;
  next)
    [ "$npos" -eq 0 ] || die 2 "unexpected argument $p1"
    [ -f "$qfile" ] || exit 0
    lock
    tmp=$(mktemp "$qdir/.$session.XXXXXX") || die 1 "cannot create a temp file in $qdir"
    awk -F "$tab" -v OFS="$tab" -v now="$now" -v max="$max" -v stale="$stale" -v out="$tmp" '
      NF == 0 { next }
      { n++; for (k = 1; k <= 9; k++) f[n, k] = $k }
      END {
        running = 0; pick = 0
        for (i = 1; i <= n; i++) {
          if (f[i, 2] == "running" && f[i, 6] != "-" && now - f[i, 6] > stale * 60) {
            f[i, 2] = "stale"
            print "stale", f[i, 1], f[i, 3], f[i, 4], f[i, 9]
          }
          if (f[i, 2] == "running") running++
        }
        if (running < max) {
          for (i = 1; i <= n; i++)
            if (f[i, 2] == "queued" && (!pick || f[i, 1] + 0 < f[pick, 1] + 0)) pick = i
          if (pick) {
            f[pick, 2] = "running"; f[pick, 6] = now
            print "start", f[pick, 1], f[pick, 3], f[pick, 4], f[pick, 9]
          }
        }
        for (i = 1; i <= n; i++) {
          line = f[i, 1]
          for (k = 2; k <= 9; k++) line = line OFS f[i, k]
          print line > out
        }
      }
    ' "$qfile" || { rm -f "$tmp"; die 1 "cannot update $qfile"; }
    [ -f "$tmp" ] || : > "$tmp"
    mv "$tmp" "$qfile"
    ;;
  done)
    [ "$npos" -eq 1 ] || die 2 "expected <job id>"
    [ -f "$qfile" ] || die 1 "no queue for session $session"
    lock
    if ! awk -F "$tab" -v id="$p1" '$1 "" == id "" { f = 1 } END { exit !f }' "$qfile"; then
      die 1 "unknown job id $p1"
    fi
    tmp=$(mktemp "$qdir/.$session.XXXXXX") || die 1 "cannot create a temp file in $qdir"
    awk -F "$tab" -v OFS="$tab" -v id="$p1" -v now="$now" -v agent="$agent" -v have_agent="$have_agent" '
      $1 "" == id "" { $2 = "done"; $7 = now; if (have_agent) $8 = (agent == "" ? "-" : agent) }
      { print }
    ' "$qfile" > "$tmp" || { rm -f "$tmp"; die 1 "cannot update $qfile"; }
    mv "$tmp" "$qfile"
    ;;
  list)
    [ "$npos" -eq 0 ] || die 2 "unexpected argument $p1"
    printf 'id\tstate\tkind\treport\tadded\tstarted\tfinished\tagent\tquestion\n'
    if [ -f "$qfile" ]; then cat "$qfile"; fi
    ;;
esac
