#!/bin/sh
# Tests for scripts/research-queue.sh. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
script="$here/scripts/research-queue.sh"
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

root=$(mktemp -d "${TMPDIR:-/tmp}/rpir-queue.XXXXXX")
trap 'rm -rf "$root"' EXIT
proj="$root/proj"
mkdir -p "$proj"
rdir="$root/reports"
mkdir -p "$rdir"
tab=$(printf '\t')

q() { sh "$script" "$@" --project "$proj"; }
running() { # running <session>: number of running jobs
  q list --session "$1" | awk -F "$tab" '$2 == "running" { n++ } END { print n + 0 }'
}
field() { # field <session> <job id> <field number>
  q list --session "$1" | awk -F "$tab" -v id="$2" -v k="$3" '$1 == id { print $k }'
}
state() { field "$1" "$2" 2; }

A=sessA
B=sessB
export RESEARCH_QUEUE_NOW=1000

# --- session B: one job, snapshot taken before A is touched ---------------

outb=$(q add --session "$B" --dir "$rdir" fact b-job "question for B")
checkeq "B: first add prints id and report path" "$outb" "1${tab}$rdir/b-job.md"
b_list=$(q list --session "$B")
b_file=$(cat "$proj/.kentra-rpir/research-queue/$B.tsv")

# --- session A: five jobs, --max 2 ----------------------------------------

ids=""
for i in 1 2 3 4 5; do
  out=$(q add --session "$A" --dir "$rdir" survey "job$i" "question $i")
  ids="$ids $(printf '%s' "$out" | cut -f1)"
done
checkeq "A: ids are 1..5 in order" "$ids" " 1 2 3 4 5"
checkeq "A: ids are unique" "$(printf '%s\n' "$ids" | tr -s " " "\n" | grep . | sort -u | wc -l | tr -d ' ')" "5"
checkeq "A: all five start queued" \
  "$(q list --session "$A" | awk -F "$tab" '$2 == "queued" { n++ } END { print n + 0 }')" "5"

nx() { q next --session "$A" --max 2 "$@"; }

RESEARCH_QUEUE_NOW=1100
export RESEARCH_QUEUE_NOW
out=$(nx)
checkeq "next #1 starts job 1" "$out" "start${tab}1${tab}survey${tab}$rdir/job1.md${tab}question 1"
check "at most 2 running after next #1" test "$(running "$A")" -le 2
checkeq "job 1 started time recorded" "$(field "$A" 1 6)" "1100"

RESEARCH_QUEUE_NOW=1110
export RESEARCH_QUEUE_NOW
out=$(nx)
checkeq "next #2 starts job 2" "$out" "start${tab}2${tab}survey${tab}$rdir/job2.md${tab}question 2"
checkeq "2 running after next #2" "$(running "$A")" "2"

out=$(nx)
checkeq "next #3 with 2 running starts nothing" "$out" ""
checkeq "still 2 running after next #3" "$(running "$A")" "2"
checkeq "job 3 is still queued" "$(state "$A" 3)" "queued"

RESEARCH_QUEUE_NOW=1120
export RESEARCH_QUEUE_NOW
q "done" --session "$A" 1 --agent agent-one
check "done on job 1 exits 0" test $? -eq 0
checkeq "done records state" "$(state "$A" 1)" "done"
checkeq "done records agent" "$(field "$A" 1 8)" "agent-one"
checkeq "done records finished" "$(field "$A" 1 7)" "1120"
checkeq "1 running after done" "$(running "$A")" "1"

out=$(nx)
checkeq "next after done starts job 3" "$out" "start${tab}3${tab}survey${tab}$rdir/job3.md${tab}question 3"
check "at most 2 running after job 3 starts" test "$(running "$A")" -le 2

out=$(nx)
checkeq "next with 2 running again starts nothing" "$out" ""

# Job 2 started at 1110; 61 minutes later it is stale, job 3 (started 1120) too.
RESEARCH_QUEUE_NOW=$((1110 + 61 * 60))
export RESEARCH_QUEUE_NOW
out=$(nx --stale 60)
want="stale${tab}2${tab}survey${tab}$rdir/job2.md${tab}question 2
stale${tab}3${tab}survey${tab}$rdir/job3.md${tab}question 3
start${tab}4${tab}survey${tab}$rdir/job4.md${tab}question 4"
checkeq "stale jobs reported, next queued job starts in the freed slot" "$out" "$want"
checkeq "job 2 is stale" "$(state "$A" 2)" "stale"
checkeq "job 3 is stale" "$(state "$A" 3)" "stale"
checkeq "job 4 is running" "$(state "$A" 4)" "running"
check "at most 2 running after the stale call" test "$(running "$A")" -le 2

out=$(nx --stale 60)
checkeq "second call starts job 5 (one slot free)" "$out" "start${tab}5${tab}survey${tab}$rdir/job5.md${tab}question 5"
checkeq "2 running with jobs 4 and 5" "$(running "$A")" "2"

# The boundary is "more than": exactly --stale minutes after the start is not stale.
RESEARCH_QUEUE_NOW=$((1110 + 61 * 60 + 60 * 60))
export RESEARCH_QUEUE_NOW
out=$(nx --stale 60)
checkeq "running jobs exactly at the threshold are not stale" "$out" ""
checkeq "jobs 4 and 5 still running at the threshold" "$(running "$A")" "2"
RESEARCH_QUEUE_NOW=$((RESEARCH_QUEUE_NOW + 1))
export RESEARCH_QUEUE_NOW
out=$(nx --stale 60)
want="stale${tab}4${tab}survey${tab}$rdir/job4.md${tab}question 4
stale${tab}5${tab}survey${tab}$rdir/job5.md${tab}question 5"
checkeq "one second past the threshold both go stale" "$out" "$want"
checkeq "none running after both go stale" "$(running "$A")" "0"

q "done" --session "$A" 2 --agent late-agent
checkeq "a stale job can still finish late" "$(state "$A" 2)" "done"
q "done" --session "$A" 5
checkeq "done without --agent leaves agent as is" "$(field "$A" 5 8)" "-"

check "B: list output byte-identical" test "$(q list --session "$B")" = "$b_list"
check "B: file byte-identical" test "$(cat "$proj/.kentra-rpir/research-queue/$B.tsv")" = "$b_file"

# --- add: report path collisions ------------------------------------------

C=sessC
: > "$rdir/exists.md"
out=$(q add --session "$C" --dir "$rdir" fact exists "q")
checkeq "slug whose .md exists on disk gets -2" "$out" "1${tab}$rdir/exists-2.md"
out=$(q add --session "$C" --dir "$rdir" fact exists "q")
checkeq "same slug again while queued gets -3" "$out" "2${tab}$rdir/exists-3.md"
out=$(q add --session "$C" --dir "$rdir" fact fresh "q")
out2=$(q add --session "$C" --dir "$rdir" fact fresh "q")
checkeq "fresh slug is used as is" "$out" "3${tab}$rdir/fresh.md"
checkeq "fresh slug collides with queued job" "$out2" "4${tab}$rdir/fresh-2.md"
check "add does not create the report file" test ! -e "$rdir/fresh.md"
: > "$rdir/fresh-2.md"
out=$(q add --session "$C" --dir "$rdir" fact fresh "q")
checkeq "first free suffix skips disk and queue collisions" "$out" "5${tab}$rdir/fresh-3.md"

# --- tab in a question ------------------------------------------------------

D=sessD
q add --session "$D" --dir "$rdir" premise tabq "left${tab}right
next" > /dev/null
dline=$(q list --session "$D" | tail -n +2)
checkeq "question with tab and newline is stored on one line" "$(printf '%s\n' "$dline" | wc -l | tr -d ' ')" "1"
checkeq "question's tab and newline are replaced with spaces" "$(printf '%s' "$dline" | cut -f9)" "left right next"
checkeq "stored line has 9 fields" "$(printf '%s' "$dline" | awk -F "$tab" '{ print NF }')" "9"

# --- errors and edge cases -------------------------------------------------

q "done" --session "$A" 99 2> /dev/null
checkeq "done on an unknown id exits 1" "$?" "1"
q "done" --session never-used 1 2> /dev/null
checkeq "done with no queue file exits 1" "$?" "1"
q add --session "$A" --dir "$rdir" rumor slug "q" 2> /dev/null
checkeq "a bad kind exits 2" "$?" "2"
q add --session "a/b" --dir "$rdir" fact slug "q" 2> /dev/null
checkeq "a session id with / exits 2" "$?" "2"
q add --session "a b" --dir "$rdir" fact slug "q" 2> /dev/null
checkeq "a session id with whitespace exits 2" "$?" "2"
q add --session "" --dir "$rdir" fact slug "q" 2> /dev/null
checkeq "an empty session id exits 2" "$?" "2"
sh "$script" list --project "$proj" 2> /dev/null
checkeq "a missing --session exits 2" "$?" "2"
q add --session "$A" fact slug "q" 2> /dev/null
checkeq "add without --dir exits 2" "$?" "2"
q add --session "$A" --dir "$rdir" fact slug 2> /dev/null
checkeq "add without a question exits 2" "$?" "2"
q next --session "$A" --max x 2> /dev/null
checkeq "a non-integer --max exits 2" "$?" "2"
q next --session "$A" --stale 1.5 2> /dev/null
checkeq "a non-integer --stale exits 2" "$?" "2"
sh "$script" bogus --session "$A" --project "$proj" 2> /dev/null
checkeq "an unknown subcommand exits 2" "$?" "2"
sh "$script" 2> /dev/null
checkeq "no subcommand exits 2" "$?" "2"

E=sessE
out=$(q next --session "$E")
checkeq "next with no queue file prints nothing" "$out" ""
checkeq "next with no queue file exits 0" "$(q next --session "$E" > /dev/null; echo $?)" "0"
checkeq "list with no queue file prints the header only" "$(q list --session "$E")" \
  "id${tab}state${tab}kind${tab}report${tab}added${tab}started${tab}finished${tab}agent${tab}question"
check "next with no queue file creates no file" test ! -e "$proj/.kentra-rpir/research-queue/$E.tsv"

[ "$fails" -eq 0 ] && echo "all research-queue tests passed"
exit "$fails"
