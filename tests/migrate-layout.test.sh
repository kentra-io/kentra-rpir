#!/bin/sh
# Tests for scripts/migrate-layout.sh. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
script="$here/scripts/migrate-layout.sh"
fails=0
check() { # check <description> <command...>
  desc=$1; shift
  if "$@"; then echo "ok   - $desc"; else echo "FAIL - $desc"; fails=$((fails + 1)); fi
}
no() { ! "$@"; }
same() { [ "$(cat "$1")" = "$2" ]; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/rpir-migrate-test.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
tab=$(printf '\t')

newproj() { # newproj <name>: an empty git project
  p="$scratch/$1"
  mkdir -p "$p" && git -C "$p" init -q
}
snap() { (cd "$1" && find . -path ./.git -prune -o -print | sort && find . -path ./.git -prune -o -type f -exec cksum {} + | sort); }
run() { (cd "$1" && sh "$script" 2>&1); }

# 1. docs/changes project
newproj docs
cd "$p" || exit 1
cat > .kentra-rpir.yaml <<'Y'
changesDir: docs/changes   # where change folders live
tracker: none
research:
  standalone: true
  dir: "docs/research"
  index: docs/research/index.jsonl  # index
Y
mkdir -p docs/changes/2026-10-01-a/research/spikes/s1 docs/changes/2026-10-02-b docs/research
echo spec > docs/changes/2026-10-01-a/spec.md
echo out > docs/changes/2026-10-01-a/research/spikes/s1/out.txt
echo rep > docs/changes/2026-10-01-a/research/r.md
echo spec > docs/changes/2026-10-02-b/spec.md
echo topic > docs/research/topic.md
echo '{"path":"docs/research/topic.md","from":"docs/changes/2026-10-01-a/research/r.md"}' > docs/research/index.jsonl
mkdir -p .kentra-rpir/reviewed/2026-10-01-a .kentra-rpir/research-queue
printf 's1 docs/changes/2026-10-01-a plan\ns2 docs/changes/2026-10-02-b plan\ns1 docs/changes/2026-10-01-a implement\n' > .kentra-rpir/sessions.map
echo plan > .kentra-rpir/reviewed/2026-10-01-a/plan.yaml
printf '1\tdone\tfact\tdocs/changes/2026-10-01-a/research/r.md\t5\t6\t7\ta1\tq\n' > .kentra-rpir/research-queue/s1.tsv
echo '{"change":"docs/changes/2026-10-02-b","phase":"x"}' > .kentra-rpir/implement-state.2026-10-02-b.json
printf '.kentra-rpir/\ndocs/changes/*/research/spikes/\nnode_modules\n' > .gitignore
out=$(run "$p"); st=$?
check "docs/changes project: exits 0" [ "$st" -eq 0 ]
check "docs/changes project: prints actions" [ -n "$out" ]
check "docs/changes project: change and research files moved" sh -c '[ -f rpir/changes/2026-10-01-a/spec.md ] && [ -f rpir/changes/2026-10-01-a/research/r.md ] && [ -f rpir/changes/2026-10-02-b/spec.md ] && [ -f rpir/research/topic.md ]'
check "docs/changes project: spikes under .local" [ -f rpir/changes/2026-10-01-a/.local/spikes/s1/out.txt ]
check "docs/changes project: sessions split per change" sh -c '[ "$(cat rpir/changes/2026-10-01-a/.local/sessions)" = "s1 plan
s1 implement" ] && [ "$(cat rpir/changes/2026-10-02-b/.local/sessions)" = "s2 plan" ]'
check "docs/changes project: reviewed moved" [ -f rpir/changes/2026-10-01-a/.local/reviewed/plan.yaml ]
check "docs/changes project: implement state moved" [ -f rpir/changes/2026-10-02-b/.local/implement-state.json ]
check "docs/changes project: queue moved, report path rewritten" same rpir/changes/2026-10-01-a/.local/research-queue.tsv "1${tab}done${tab}fact${tab}rpir/changes/2026-10-01-a/research/r.md${tab}5${tab}6${tab}7${tab}a1${tab}q"
check "docs/changes project: index rewritten" same rpir/research/index.jsonl '{"path":"rpir/research/topic.md","from":"rpir/changes/2026-10-01-a/research/r.md"}'
check "docs/changes project: config has project, no old keys" sh -c 'grep -qx "project: docs" rpir/config.yaml && ! grep -q "changesDir\|^  dir:\|^  index:" rpir/config.yaml && grep -q "tracker: none" rpir/config.yaml && grep -q "standalone" rpir/config.yaml'
check "docs/changes project: old files gone" sh -c '[ ! -e .kentra-rpir ] && [ ! -e .kentra-rpir.yaml ] && [ ! -e docs/changes ] && [ ! -e docs/research ]'
check "docs/changes project: .gitignore" sh -c 'grep -qxF "rpir/**/.local/" .gitignore && ! grep -qx "/rpir/" .gitignore && ! grep -q "kentra-rpir\|spikes" .gitignore && grep -qx node_modules .gitignore'
check "docs/changes project: track not set" no grep -q '^track:' rpir/config.yaml
before=$(snap "$p")
out=$(run "$p"); st=$?
check "docs/changes project: second run prints nothing, exits 0" sh -c '[ "$1" -eq 0 ] && [ -z "$2" ]' _ "$st" "$out"
check "docs/changes project: second run changes nothing" [ "$before" = "$(snap "$p")" ]

# 2. ignored rpir/changes project
newproj ignored
cd "$p" || exit 1
printf 'changesDir: rpir/changes\ntrack: true\ntracker: none\n' > .kentra-rpir.yaml
mkdir -p rpir/changes/c1
echo spec > rpir/changes/c1/spec.md
printf '/rpir/\n.kentra-rpir.yaml\n' > .gitignore
out=$(run "$p"); st=$?
check "ignored rpir/changes project: exits 0" [ "$st" -eq 0 ]
check "ignored rpir/changes project: files stay in place" same rpir/changes/c1/spec.md spec
check "ignored rpir/changes project: track false, once" sh -c '[ "$(grep -c "^track:" rpir/config.yaml)" = 1 ] && grep -qx "track: false" rpir/config.yaml && ! grep -q changesDir rpir/config.yaml'
check "ignored rpir/changes project: .gitignore" sh -c 'grep -qx "/rpir/" .gitignore && grep -qxF "rpir/**/.local/" .gitignore && ! grep -q kentra-rpir .gitignore'
check "ignored rpir/changes project: old config gone" [ ! -e .kentra-rpir.yaml ]

# 3. partly migrated
newproj partly
cd "$p" || exit 1
mkdir -p rpir/changes/c1 .kentra-rpir/reviewed/c1 .kentra-rpir/research-queue
printf 'tracker: none\n' > rpir/config.yaml
echo spec > rpir/changes/c1/spec.md
printf 's1 docs/changes/c1 plan\ns2 docs/changes/c1 implement\ns9 docs/changes/gone plan\n' > .kentra-rpir/sessions.map
echo plan > .kentra-rpir/reviewed/c1/plan.yaml
echo '{"phase":"x","change": "docs/changes/c1"}' > .kentra-rpir/implement-state.json
printf '1\tdone\tfact\tdocs/research/a.md\t5\t6\t7\ta1\tq1\n2\tqueued\tfact\tdocs/research/b.md\t5\t-\t-\t-\tq2\n' > .kentra-rpir/research-queue/s1.tsv
printf '1\tqueued\tfact\tdocs/research/c.md\t5\t-\t-\t-\tq3\n' > .kentra-rpir/research-queue/s2.tsv
printf '1\tqueued\tfact\tdocs/research/d.md\t5\t-\t-\t-\tq4\n' > .kentra-rpir/research-queue/s5.tsv
out=$(run "$p"); st=$?
check "partly migrated: exits 0" [ "$st" -eq 0 ]
check "partly migrated: note for the missing change" sh -c 'echo "$1" | grep -q "s9"' _ "$out"
check "partly migrated: sessions of c1" sh -c '[ "$(cat rpir/changes/c1/.local/sessions)" = "s1 plan
s2 implement" ]'
check "partly migrated: reviewed and implement state" sh -c '[ -f rpir/changes/c1/.local/reviewed/plan.yaml ] && [ -f rpir/changes/c1/.local/implement-state.json ]'
check "partly migrated: queues merged and renumbered" sh -c 'cut -f1,4 rpir/changes/c1/.local/research-queue.tsv | tr "\t\n" " " | grep -qx "1 rpir/research/a.md 2 rpir/research/b.md 3 rpir/research/c.md "'
check "partly migrated: unregistered queue is the standalone one" sh -c 'cut -f4 rpir/research/.local/research-queue.tsv | grep -qx rpir/research/d.md'
check "partly migrated: project id added, config kept" sh -c 'head -n1 rpir/config.yaml | grep -qx "project: partly" && grep -q "tracker: none" rpir/config.yaml'
check "partly migrated: leftover folder removed" [ ! -e .kentra-rpir ]

# 4. symlinked old paths
newproj links
cd "$p" || exit 1
printf 'tracker: none\n' > .kentra-rpir.yaml
mkdir -p rpir/changes/c1 rpir/research docs
echo spec > rpir/changes/c1/spec.md
echo t > rpir/research/t.md
ln -s ../rpir/changes docs/changes
ln -s ../rpir/research docs/research
out=$(run "$p"); st=$?
check "symlinked old paths: exits 0" [ "$st" -eq 0 ]
check "symlinked old paths: symlinks removed" sh -c '[ ! -L docs/changes ] && [ ! -L docs/research ] && [ ! -e docs/changes ]'
check "symlinked old paths: content kept once" sh -c '[ "$(find rpir -name spec.md | wc -l)" -eq 1 ] && [ -f rpir/research/t.md ] && [ -f rpir/changes/c1/spec.md ]'

# 5. project id
newproj "id proj"
cd "$p" || exit 1
printf 'tracker: none\n' > .kentra-rpir.yaml
run "$p" > /dev/null
check "project id: directory name" grep -qx 'project: id proj' rpir/config.yaml
sed 's/^project: .*/project: edited/' rpir/config.yaml > "$scratch/cfg" && cat "$scratch/cfg" > rpir/config.yaml
mkdir .kentra-rpir
out=$(run "$p"); st=$?
check "project id: edited id kept" sh -c 'grep -qx "project: edited" rpir/config.yaml && [ "$(grep -c "^project:" rpir/config.yaml)" = 1 ]'

# 6. conflicting destination
newproj conflict
cd "$p" || exit 1
printf 'tracker: none\n' > .kentra-rpir.yaml
mkdir -p docs/changes/x rpir/changes/x .kentra-rpir
echo a > docs/changes/x/spec.md
echo b > rpir/changes/x/spec.md
echo 's1 docs/changes/x plan' > .kentra-rpir/sessions.map
before=$(snap "$p")
out=$(run "$p"); st=$?
check "conflicting destination: exits non-zero, names both paths" sh -c '[ "$1" -ne 0 ] && echo "$2" | grep -q "docs/changes/x/spec.md" && echo "$2" | grep -q "rpir/changes/x/spec.md"' _ "$st" "$out"
check "conflicting destination: nothing moved" [ "$before" = "$(snap "$p")" ]

# 7. standalone research spikes
newproj spikes
cd "$p" || exit 1
printf 'tracker: none\nresearch:\n  dir: docs/research\n' > .kentra-rpir.yaml
mkdir -p docs/research/spikes/x
echo a > docs/research/spikes/x/a
printf 'docs/research/spikes/\nnode_modules\n' > .gitignore
git add .gitignore .kentra-rpir.yaml
out=$(run "$p"); st=$?
check "standalone spikes: exits 0" [ "$st" -eq 0 ]
check "standalone spikes: moved under .local, old folder gone" sh -c '[ -f rpir/research/.local/spikes/x/a ] && [ ! -e rpir/research/spikes ] && [ ! -e docs/research/spikes ]'
check "standalone spikes: old .gitignore line gone" sh -c '! grep -q "docs/research/spikes" .gitignore'
check "standalone spikes: nothing untracked under .local" sh -c '! git status --porcelain --untracked-files=all | grep -q "rpir/research/.local"'
before=$(snap "$p")
out=$(run "$p"); st=$?
check "standalone spikes: second run changes nothing" sh -c '[ "$1" -eq 0 ] && [ "$2" = "$3" ]' _ "$st" "$before" "$(snap "$p")"

[ "$fails" -eq 0 ] || { echo "$fails check(s) failed"; exit 1; }
echo "all migrate-layout checks passed"
