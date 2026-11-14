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
running() { # running <change name>: number of running jobs
  q list --change "rpir/changes/$1" | awk -F "$tab" '$2 == "running" { n++ } END { print n + 0 }'
}
field() { # field <change name> <job id> <field number>
  q list --change "rpir/changes/$1" | awk -F "$tab" -v id="$2" -v k="$3" '$1 == id { print $k }'
}
state() { field "$1" "$2" 2; }

A=sessA
B=sessB
export RESEARCH_QUEUE_NOW=1000

# --- session B: one job, snapshot taken before A is touched ---------------

outb=$(q add --change "rpir/changes/$B" --dir "$rdir" fact b-job "question for B")
checkeq "B: first add prints id and report path" "$outb" "1${tab}$rdir/b-job.md"
b_list=$(q list --change "rpir/changes/$B")
b_file=$(cat "$proj/rpir/changes/$B/.local/research-queue.tsv")

# --- session A: five jobs, --max 2 ----------------------------------------

ids=""
for i in 1 2 3 4 5; do
  out=$(q add --change "rpir/changes/$A" --dir "$rdir" survey "job$i" "question $i")
  ids="$ids $(printf '%s' "$out" | cut -f1)"
done
checkeq "A: ids are 1..5 in order" "$ids" " 1 2 3 4 5"
checkeq "A: ids are unique" "$(printf '%s\n' "$ids" | tr -s " " "\n" | grep . | sort -u | wc -l | tr -d ' ')" "5"
checkeq "A: all five start queued" \
  "$(q list --change "rpir/changes/$A" | awk -F "$tab" '$2 == "queued" { n++ } END { print n + 0 }')" "5"

nx() { q next --change "rpir/changes/$A" --max 2 "$@"; }

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
q "done" --change "rpir/changes/$A" 1 --agent agent-one
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

q "done" --change "rpir/changes/$A" 2 --agent late-agent
checkeq "a stale job can still finish late" "$(state "$A" 2)" "done"
q "done" --change "rpir/changes/$A" 5
checkeq "done without --agent leaves agent as is" "$(field "$A" 5 8)" "-"

check "B: list output byte-identical" test "$(q list --change "rpir/changes/$B")" = "$b_list"
check "B: file byte-identical" test "$(cat "$proj/rpir/changes/$B/.local/research-queue.tsv")" = "$b_file"

# --- standalone queue: no --change ------------------------------------------

out=$(q add --dir "$rdir" fact solo "q")
checkeq "add without --change queues a standalone job" "$out" "1${tab}$rdir/solo.md"
check "standalone queue lives in rpir/research/.local" test -f "$proj/rpir/research/.local/research-queue.tsv"
out=$(q add --change "rpir/changes/sessC9" --dir "$rdir" fact solo "q")
checkeq "report path uniqueness spans the standalone and change queues" "$out" "1${tab}$rdir/solo-2.md"
check "an absolute --change reaches the same queue file" test -f "$proj/rpir/changes/sessC9/.local/research-queue.tsv"
checkeq "absolute --change lists the same job" "$(sh "$script" list --change "$proj/rpir/changes/sessC9" | tail -n +2 | cut -f4)" "$rdir/solo-2.md"

# --- add: report path collisions ------------------------------------------

C=sessC
: > "$rdir/exists.md"
out=$(q add --change "rpir/changes/$C" --dir "$rdir" fact exists "q")
checkeq "slug whose .md exists on disk gets -2" "$out" "1${tab}$rdir/exists-2.md"
out=$(q add --change "rpir/changes/$C" --dir "$rdir" fact exists "q")
checkeq "same slug again while queued gets -3" "$out" "2${tab}$rdir/exists-3.md"
out=$(q add --change "rpir/changes/$C" --dir "$rdir" fact fresh "q")
out2=$(q add --change "rpir/changes/$C" --dir "$rdir" fact fresh "q")
checkeq "fresh slug is used as is" "$out" "3${tab}$rdir/fresh.md"
checkeq "fresh slug collides with queued job" "$out2" "4${tab}$rdir/fresh-2.md"
check "add does not create the report file" test ! -e "$rdir/fresh.md"
: > "$rdir/fresh-2.md"
out=$(q add --change "rpir/changes/$C" --dir "$rdir" fact fresh "q")
checkeq "first free suffix skips disk and queue collisions" "$out" "5${tab}$rdir/fresh-3.md"

# Two sessions adding the same slug to one --dir get different report paths.
out=$(q add --change rpir/changes/sessC2 --dir "$rdir" fact shared "q")
out2=$(q add --change rpir/changes/sessD2 --dir "$rdir" fact shared "q")
checkeq "first session gets <slug>.md" "$out" "1${tab}$rdir/shared.md"
checkeq "second session gets <slug>-2.md" "$out2" "1${tab}$rdir/shared-2.md"

# --- concurrent adds and the lock -------------------------------------------

P=sessP
for i in 1 2 3 4 5 6; do
  RESEARCH_QUEUE_LOCK_TRIES=30 q add --change "rpir/changes/$P" --dir "$rdir" fact par "q$i" > /dev/null &
done
wait
checkeq "6 concurrent adds leave 6 lines" "$(q list --change "rpir/changes/$P" | tail -n +2 | wc -l | tr -d ' ')" "6"
checkeq "6 concurrent adds have 6 distinct ids"   "$(q list --change "rpir/changes/$P" | tail -n +2 | cut -f1 | sort -u | wc -l | tr -d ' ')" "6"
checkeq "6 concurrent adds have 6 distinct report paths"   "$(q list --change "rpir/changes/$P" | tail -n +2 | cut -f4 | sort -u | wc -l | tr -d ' ')" "6"

lockdir="$proj/rpir/changes/$A/.local/.lock"
check "no lock left after normal calls" test ! -e "$lockdir"
: > "$lockdir"
err=$(RESEARCH_QUEUE_LOCK_TRIES=1 q "done" --change "rpir/changes/$A" 1 2>&1 > /dev/null)
checkeq "done on a held lock exits 1" "$(RESEARCH_QUEUE_LOCK_TRIES=1 q "done" --change "rpir/changes/$A" 1 > /dev/null 2>&1; echo $?)" "1"
case "$err" in *"$lockdir"*) echo "ok   - lock error names the lock dir" ;; *) echo "FAIL - lock error names the lock dir (got [$err])"; fails=$((fails + 1)) ;; esac
check "a failed call leaves the foreign lock in place" test -e "$lockdir"
rm "$lockdir"
q "done" --change "rpir/changes/$A" 1
checkeq "done works once the lock is removed" "$?" "0"
check "no lock left after done" test ! -e "$lockdir"

# --- tab in a question ------------------------------------------------------

D=sessD
q add --change "rpir/changes/$D" --dir "$rdir" premise tabq "normal: left${tab}right
next" > /dev/null
dline=$(q list --change "rpir/changes/$D" | tail -n +2)
checkeq "question with tab and newline is stored on one line" "$(printf '%s\n' "$dline" | wc -l | tr -d ' ')" "1"
checkeq "question's tab and newline are replaced with spaces" "$(printf '%s' "$dline" | cut -f9)" "normal: left right next"
checkeq "stored line has 9 fields" "$(printf '%s' "$dline" | awk -F "$tab" '{ print NF }')" "9"

# --- premise priority prefix ------------------------------------------------

E=sessPfx
q add --change "rpir/changes/$E" --dir "$rdir" premise nopfx "no prefix" 2> /dev/null
checkeq "a premise without a priority prefix exits 2" "$?" "2"
checkeq "a refused premise queues nothing" "$(q list --change "rpir/changes/$E" 2> /dev/null | tail -n +2 | wc -l | tr -d ' ')" "0"
q add --change "rpir/changes/$E" --dir "$rdir" premise pcrit "critical: x" > /dev/null
checkeq "a critical: premise is queued" "$?" "0"
q add --change "rpir/changes/$E" --dir "$rdir" premise pnorm "normal: y" > /dev/null
checkeq "a normal: premise is queued" "$?" "0"
checkeq "both prefixed premises are listed" "$(q list --change "rpir/changes/$E" | tail -n +2 | wc -l | tr -d ' ')" "2"

# --- errors and edge cases -------------------------------------------------

q "done" --change "rpir/changes/$A" 99 2> /dev/null
checkeq "done on an unknown id exits 1" "$?" "1"
q "done" --change rpir/changes/never-used 1 2> /dev/null
checkeq "done with no queue file exits 1" "$?" "1"
q add --change "rpir/changes/$A" --dir "$rdir" rumor slug "q" 2> /dev/null
checkeq "a bad kind exits 2" "$?" "2"
q add --change "rpir/changes/$A" fact slug "q" 2> /dev/null
checkeq "add without --dir exits 2" "$?" "2"
q add --change "rpir/changes/$A" --dir "$rdir" fact slug 2> /dev/null
checkeq "add without a question exits 2" "$?" "2"
q next --change "rpir/changes/$A" --max x 2> /dev/null
checkeq "a non-integer --max exits 2" "$?" "2"
q next --change "rpir/changes/$A" --stale 1.5 2> /dev/null
checkeq "a non-integer --stale exits 2" "$?" "2"
sh "$script" bogus --change "rpir/changes/$A" --project "$proj" 2> /dev/null
checkeq "an unknown subcommand exits 2" "$?" "2"
sh "$script" 2> /dev/null
checkeq "no subcommand exits 2" "$?" "2"

E=sessE
out=$(q next --change "rpir/changes/$E")
checkeq "next with no queue file prints nothing" "$out" ""
checkeq "next with no queue file exits 0" "$(q next --change "rpir/changes/$E" > /dev/null; echo $?)" "0"
checkeq "list with no queue file prints the header only" "$(q list --change "rpir/changes/$E")" \
  "id${tab}state${tab}kind${tab}report${tab}added${tab}started${tab}finished${tab}agent${tab}question"
check "next with no queue file creates no file" test ! -e "$proj/rpir/changes/$E/.local/research-queue.tsv"

[ "$fails" -eq 0 ] && echo "all research-queue tests passed"
exit "$fails"
