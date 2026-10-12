Status: built (2026-10-12), plugin version 0.3.1. Smoke re-run pending (see Re-run smoke checklist).

# Smoke-run fixes

Six changes to kentra-rpir, agreed with the user after a live smoke test and one full
smoke run:

1. **Review and research cost.** Check each premise once, at a depth that matches its
   importance; size each re-review to the change; keep spike scratch in a
   project-local, gitignored directory.
2. **Session records.** Commit one trimmed planning log; read implementation
   transcripts in place; delete the session-capture hook.
3. **Plan verification.** Require milestoned-plan-dag 0.2.0; a plan-skill rule that a
   step writing into a new directory must create it, since git does not track empty
   directories.
4. **Implementation correctness.** The verifier proves red against the base; branch
   cleanup runs in the right worktree.
5. **Retro.** Read the planning sessions with cost metrics; a PLAN fault class; a short
   reconciliation table.
6. **How stages end.** One closing line per stage: what it produced, what comes next.

Code references are to branch `kentra-rpir` at plugin version 0.3.0.

## Why

The smoke test change added `--shout` and `--polite` flags to a 3-line `greet.sh`.

1. **The research cost did not match the risk.** The first spec self-review took
   about 10 minutes and ran about 26 agents. Most of them came from the research
   fan-out: 5 claims (`maxClaims` default, `workflows/self-review.js:104`), each with
   4 Haiku collectors (`DEFAULT_ANGLES`, `workflows/research.js:28-33`) plus 1 Opus
   reasoner. The reviewer and triage ran on top of that. About 4 of the 10 minutes
   went to topic 3, which re-checked the `tr` upper-casing premise. The spec stage's
   own research had already verified that premise with a 256-byte spike on macOS, GNU
   and BusyBox. Only one topic found a real problem: under `set -e`, the plain
   `[ "$(…)" = "" ]` test does not check an exit status.
2. **A spike sent a command the user could not review.** A Haiku `spike` collector
   sent one Bash call that:
   - used a heredoc to write `spike.sh`, which contained two inline `python3 -c`
     programs;
   - chained `cd`, the run, `sw_vers`, and a `printf` piped through `tr` into `od`;
   - ended with a stray `cat > /dev/null`.

   The user got a permission prompt they could not review. The command then hung on
   `cat` and was killed (exit 144).
3. **The plan stage ran three full reviews for one change.** The plan stage found
   that two independent per-flag milestones would conflict, because both edit the
   same lines. The user chose a new file layout: `flags/shout.sh`, `flags/polite.sh`,
   and a diamond of 4 milestones. The plan stage then:
   1. wrote that layout into the agreed spec;
   2. reset the spec to `draft`;
   3. re-ran the full spec self-review;
   4. was about to ask for agreement again before running the plan self-review.

   The skills say nothing about changes after agreement (`skills/spec/SKILL.md:129-141`,
   `skills/plan/SKILL.md:106-120`), so the model improvised the strictest path.
4. **Most of the time was waiting.** The full run took 73 minutes: spec and plan 52
   (about 80 workflow agents), implement 6 (8 agents), review 13. About 32 of the 73
   minutes were background waiting: three self-reviews (10.0, 7.0 and 6.6 minutes)
   and the retro (8.4).
5. **Spikes polluted the change folder.** A spike ran `git init` inside the change
   folder. The spec commit recorded it as a gitlink, which had to be removed by hand.
   192 spike files were committed: binaries, C sources and byte fixtures.
   `research.js:44` defaults `spikeDir` to `<outDir>/spikes`, inside the change folder.
6. **The session records cost more than they gave.** 29 MB of transcripts were
   committed for about 70 lines of code. The capture hook also had defects:
   - Capture from a worktree silently does nothing. Both
     `--project "$(git rev-parse --show-toplevel)"` (`skills/implement/SKILL.md:156`,
     `skills/review/SKILL.md:90`) and the hook's cwd lookup
     (`hooks/capture-session.sh:29`) resolve to the worktree, which has no
     `.kentra-rpir/sessions.map`, so the script exits 0 at line 35.
   - `SessionEnd` left the main checkout dirty: 28 lines appended to an
     already-committed transcript, a 0-byte `agent-*.jsonl.tmp`
     (`capture-session.sh:78`), and it would have recreated the removed worktree
     directory (`mkdir -p "$out"`, line 59).
   - A session that held both spec and plan was listed twice in `sessions/index`
     (`capture-session.sh:91-92` dedups on `<id> <stage>`, not on the id).
7. **The plan was not executable, and the check that should have caught it hid it.**
   The plan never creates `tests/`. Git does not track empty directories, so M1 could
   not hand `tests/` to M2 and M3. The plan stage's improvised replay ran every
   milestone in one tree and wrote files with Ruby `FileUtils.mkdir_p`, which hid the
   gap. Separately, the cached `plan-author` skill was 0.1.0, whose schema lacks
   plan-level `description` and `rules`; the model probed the CLI to work that out.
8. **A red run that passed was accepted four times.** A milestone's "red" run printed
   `no such file … all tests passed` and exited 0. The implementer, the verifier, the
   orchestrator's report ("expected") and the review presentation all accepted it. A
   verifier also read `$?` from `tail` instead of from the test. Branch cleanup
   (`git branch -d`, `skills/implement/SKILL.md:115`) failed because it ran where
   HEAD is not the integration branch.
9. **The retro could not see the planning cost.** `spec-retro.js` reads planning
   sessions only "if a finding points at the spec or plan" (lines 37-39, 139). The
   plan gap was labelled `SPEC` because there is no plan class (line 160). The
   reconciliation table had 22 rows, mostly "confirmed".
10. **The stages ended without saying so.** The user had to ask for the spec and plan
    paths, "can we proceed to review?" and "are we done?".
11. **What worked, and must be kept:**
    - parallel milestone worktrees (M2 and M3 ran at once; the cd fallback held; the
      plugin `agentType`s resolved);
    - the retro was accurate and independent of `impl-report.md`;
    - the main session's context stayed small (about 8%) because the work was
      delegated to subagents and workflows.

## Theme 1 — Review and research cost

### A. Check each premise once (the ledger)

A1. The spec's Premises table has these columns:

```
| # | Premise | Importance | Status | Evidence |
```

- `Importance` is `critical` or `normal` (see B).
- `Status` is `verified`, `refuted` or `unverified`.
- `Evidence` is `docs: <source>` or `spike: <source>`. For `docs`, the source is a URL
  or `file:line@<tag or commit>`. For `spike`, it is the kept copy of the spike in the
  change folder, `research/spikes/<slug>/` (E3). An `unverified` premise with no
  evidence yet shows `—`.

The `Source` column is replaced by `Evidence`.

A2. The **ledger** is the spec's Premises table plus the plan's premises block (A5).
Every premise is researched once. The following skip any premise already in the
ledger, whatever its status:
- the spec stage's own research;
- the plan stage's research;
- every self-review.

A3. A ledger premise is **re-opened** only when a document edit changes something
the premise rests on: a version, an API, a platform, or the behaviour relied on.
A re-opened premise is researched again, and its row is updated in place, keeping
its ID.

A4. The research workflow also records the plan stage's own spikes as
evidence. The plan stage never re-spikes a premise the spec stage already settled.

A5. **The plan's premises block (default, see Open questions).** `plan.yaml` gets a
top-level YAML comment block `# premises:`, placed before `# writerGaps:`. It uses the
same pattern as `# writerGaps:`, because the plan schema allows no extra keys
(`docs/process.md`, Self-review §3). Each line is one premise, with IDs `PL1`, `PL2`,
… so they cannot collide with the spec's `P<n>`:

```yaml
# premises:
#   PL1 | critical | verified | spike: research/spikes/1-bats-1-11-run-flag/ | bats 1.11 `run --separate-stderr` exists
#   PL2 | normal | unverified | — | shellcheck 0.10 flags SC2312 on this pattern
```

### B. Importance is assigned when the premise is recorded

B1. Whoever records a premise assigns its importance:
- the spec stage (`skills/spec` step 3);
- the plan stage (`skills/plan` step 2);
- the reviewer, for each of its `unchecked_claims`.

B2. The importance values mean:
- `critical`: a requirement, a design decision or a milestone criterion breaks if the
  premise is wrong;
- `normal`: everything else.

B3. The `importance` field is required in the reviewer's `unchecked_claims` schema.
In research `topics` it is optional. A missing value means `normal`, and the workflow
logs one line naming the topic.

### C. Tiered research depth, with no cap on the number of premises

C1. Research has no limit on the number of premises or claims. Remove `maxClaims` from
`self-review.js`: delete the arg comment (line 23) and the `.slice(0, args.maxClaims ?? 5)`
(line 104). If a caller still passes `maxClaims`, the workflow logs
`maxClaims is no longer supported; every claim is researched` and ignores it. The
only limit on concurrency is the Workflow tool's own.

C2. **Tier 1, the docs check, runs for every topic, all in parallel.** Each topic
gets one checker agent (`research.checker`, default `sonnet`). The checker reads:
- the official documentation and changelog for the version in question;
- the source at the pinned version;
- field reports.

The checker runs no code. It returns `CHECK_SCHEMA`:

```js
{ verdict: 'verified'|'refuted'|'unverified',
  confidence: 'high'|'medium'|'low',
  evidence: [{ kind: 'docs'|'source'|'field', url: string, version?: string, excerpt: string }],
  summary: string,          // one paragraph: what the evidence says
  gaps: string[] }          // what it could not settle
```

`confidence: high` means a primary source (docs or source code) at the relevant
version states the behaviour directly. Field reports alone are at most `medium`.

This replaces `DEFAULT_ANGLES`, `SOURCES_SCHEMA`, `collectPrompt` and `reasonPrompt`
(`research.js:28-33, 51-102`). The `angles`, `extraAngles` and `collector` args are
removed. If a caller passes `collector`, the workflow logs and ignores it.

C3. **Tier 2, the spike, is the escalation rule.** Defined once in `research.js`:

```js
const needsSpike = (topic, check) =>
  topic.spike === true ||
  (topic.importance === 'critical' && (!check || check.confidence !== 'high'))
```

- A null checker result counts as low confidence. A `critical` topic with a null
  checker result therefore spikes. A `normal` topic with a null checker result goes
  to `failed`.
- A `normal` topic that the docs cannot settle stays `unverified` with
  `depth: 'docs'`. The skills show it to the user, who can ask for a spike. A spike
  is a re-run of research with `spike: true` on that topic.
- A topic with high confidence from tier 1 does not spike, even when the verdict is
  `refuted`.

C4. The new research args (header comment, `research.js:12-24`):

```
today      (required) 'YYYY-MM-DD'
topics     (required) [{ name, slug?, focus?, importance?: 'critical'|'normal', spike?: boolean }]
question, context, format, outDir, index   (unchanged)
spikeDir   (required when a topic can spike) absolute path to the project-local spike scratch dir (E3)
checker    (optional) model for tier-1 checkers, default 'sonnet'
designer   (optional) model for spike designers, default 'opus'
runner     (optional) model for spike runners, default 'sonnet'
reasoner   (optional) model for spike judges and the index, default 'opus'
```

C5. The new research return value (the keys stay `{ reports, failed, index }`, so
`self-review.js` triage keeps working):

```js
reports: [{ topic, slug, importance, verdict, confidence,
            depth: 'docs'|'spike',
            evidence: string,          // 'docs: <url|file:line@ver>' or 'spike: research/spikes/<slug>/'
            file?, report?, key_findings: string[], sources: string[],
            unverified: string[], open_questions: string[] }]
failed: string[]                       // topic names with no final result
index: string|null
```

For a docs-depth report, the workflow builds `report` and `file` from the checker
result. When `outDir` is set, a short agent or the judge writes `<outDir>/<slug>.md`.
For a spike-depth report, the judge writes the file.

C6. The new phases in `meta.phases`, replacing `Collect` and `Reason`:

| title | detail |
|---|---|
| `Check` | one docs checker per topic: verdict, confidence, evidence |
| `Design` | one designer per escalated topic writes the spike files |
| `Run` | runners execute the spike files in parallel and return output verbatim |
| `Judge` | one reasoner per escalated topic reads every output, gives the verdict, keeps the spike |
| `Index` | optional cross-topic index (unchanged) |

Agent labels: `check:<slug>`, `design:<slug>`, `run:<slug>:<experiment id>`,
`judge:<slug>`, `index`.

### D. Spikes use the stronger model and fan out inside the workflow

D1. **The flow.** `research.js` runs
`pipeline(topics, check, (c, topic) => needsSpike(topic, c) ? spike(topic, c) : docsReport(topic, c))`.
Each topic escalates as soon as its own check returns, so every escalated topic's
spike runs concurrently with the others. No `workflow()` call is involved.
`self-review` → `research` is already one level of nesting, and nesting is limited to
one level (see `tests/check-workflows.mjs:255-276`). The fan-out is therefore made of
agents inside `research.js`.

D2. **Design** (`designer`, default `opus`). One designer per escalated topic. It
splits the premise into independent experiments, one per platform, version or edge
case, and writes each experiment as a file under `<spikeDir>/<slug>/` with the Write
tool. It is given the tier-1 result. It returns `DESIGN_SCHEMA`:

```js
{ experiments: [{ id: string,            // kebab-case, unique per topic
                  file: string,          // absolute path the designer wrote, under <spikeDir>/<slug>/
                  command: string,       // one short command, e.g. 'sh /abs/spikes/3-x/gnu.sh'
                  what: string }],       // what this experiment shows
  not_spikeable: string }                // non-empty when the premise is not a behaviour claim
```

If `experiments` is empty, the topic keeps its tier-1 result with `depth: 'docs'`,
and `not_spikeable` is added to `open_questions`. If the designer returns null, the
same applies.

D3. **Run** (`runner`, default `sonnet`, overridable with the `runner` arg). The
workflow starts one runner per experiment, all in parallel. Each runner runs exactly
the given `command` once, with the Bash tool and a 120000 ms timeout. It does not edit
the file, retry, or add commands. It returns `RUN_SCHEMA`:

```js
{ id, command, exit_code: integer, stdout: string, stderr: string, timed_out: boolean }
```

`stdout` and `stderr` are verbatim, cut to the last 4000 characters. A null runner
result is passed to the judge as `{ id, missing: true }`.

D4. **Judge** (`reasoner`, default `opus`). One judge per escalated topic. It reads:
- the tier-1 result;
- every experiment file;
- every run output.

It returns the C5 report shape with `depth: 'spike'` and
`evidence: 'spike: research/spikes/<slug>/'`. The judge may run one extra experiment
itself, under rule E, when two outputs conflict. It then keeps the spike (E3). It ends
with the existing verdict line (`research.js:94`). If the judge returns null, the
topic goes to `failed`.

D5. **No command guard.** The workflow does not filter or reject spike commands.
Readability comes from rule E in the prompts: the logic lives in a file you can
read, and the command that runs it stays short. A pattern blocker was considered
and dropped (2026-10-12): pipes, redirects and `&&` are normal in real spikes, and
blocking them would stall research.

### E. Spikes are readable, and scratch stays out of git

E1. A spike is a file written with the Write tool and run with one short command:
`sh <file>`, `node <file>`, `python3 <file>`, or one `docker run --rm -v <dir>:<dir> <image> sh <file>`
for another platform. The rule forbids:
- heredocs;
- inline `-c` or `-e` programs;
- chained commands (`;`, `&&`, `||`, `|`);
- background processes (`&`);
- command substitution;
- redirects;
- anything that reads stdin. The spike files themselves must not read stdin either.

E2. The rule is one shared constant, `READABLE_SPIKES`, in `research.js`. It goes
into the designer, runner and judge prompts. The checker prompt says instead
`Run no code; read only.` The same text goes into every skill step that may spike
inline: `skills/spec` step 4 and `skills/plan` step 2.

Proposed text:

> Spikes must be readable by the user approving them. Write each spike as a file with the Write tool, then run it with one short command such as `sh <file>`. Never use heredocs, inline `python3 -c`/`sh -c`/`node -e` programs, chained or piped commands, `&`, command substitution or redirects, and never run anything that reads stdin.

E3. **Spikes run in project-local, gitignored scratch.** Every spike file, its
build output and its fixtures live under `spikeDir`, under the project root. Spike
scratch is never committed, and no `.git` ever appears in the change folder.
- The skills set `spikeDir` to
  `<project root>/.kentra-rpir/spikes/<change folder name>/`, so the spec and plan
  sessions share it. `.kentra-rpir/` is already gitignored by the spec skill's
  setup. They create it with `mkdir -p` before starting research.
- `research.js` deletes the default at line 44. When any topic has `spike: true` or
  `importance: 'critical'` and `spikeDir` is missing, it throws
  `research: spikes need args.spikeDir, a scratch dir for spike files`.
- **Keeping a spike.** After the verdict, the judge copies into
  `<outDir>/spikes/<slug>/` only:
  - each experiment file listed in `DESIGN_SCHEMA.experiments[].file` (text, read and
    re-written with the Write tool, never `cp -r`);
  - `result.md`: per experiment, its `command`, `exit_code`, `timed_out`, and the
    stdout/stderr it judged on (cut as in D3), then the verdict line.

  Nothing else is copied: no binaries, no generated fixtures, no build output. A
  fixture the spike needs is generated by the spike file at run time.
- `READABLE_SPIKES` gains one sentence: "Work only under `<spikeDir>/<slug>/`. Never
  run `git init` there or anywhere else."
- The same rule goes into the skill steps that spike inline (E2): spike in `spikeDir`,
  then keep the files and `result.md` under `<change folder>/research/spikes/<slug>/`.

E4. **The spec and plan commits refuse an embedded repository.** Both commits go
through a new script, `scripts/commit-change.sh <change folder> <message> [extra path …]`:
1. If `find <change folder> -mindepth 1 -name .git` prints anything, it prints
   `kentra-rpir: <path> is a git repository inside the change folder; remove it and keep only the spike files`
   and exits 1 before staging.
2. It runs `git add -- <change folder> <extra paths>`, capturing stderr. If stderr
   contains `embedded git repository`, it runs `git reset -q -- <the same paths>`,
   prints the warning and exits 1.
3. It runs `git commit -m <message> -- <change folder> <extra paths>` and exits with
   git's status.

### F. Re-review is sized to the change

F1. Three sizes of review:

| The edit | Review |
|---|---|
| A new document (first spec, first plan) | Full self-review, once (`mode: 'full'`). |
| An edit to a reviewed or agreed document that changes a requirement, goal, non-goal, premise, design decision, milestone contract, `paths`, `deliverables`, or step code | Diff review (`mode: 'diff'`). |
| Wording, typos, formatting; applying a self-review `technical` fix verbatim | No review. The user sees the diff. Technical fixes still go to the writer-gaps list. |

When unsure, use a diff review.

F2. New `self-review.js` args:

```
mode     (optional) 'full' | 'diff', default 'full'
base     (diff)     the reviewed version: a git revision (e.g. the agreed spec's commit) or an
                    absolute path to a snapshot file
decision (diff)     what the user decided that this edit implements, in plain words
ledger   (optional) absolute paths holding the ledger: spec.md, and plan.yaml at the plan stage
```

In diff mode, a missing `base` or `decision` throws
`self-review: mode "diff" needs base and decision`.

F3. Diff mode makes one reviewer call (label `review:diff`, phase `Review`). It
reads the diff with `git diff <base> -- <document>` when `base` is a revision, or
`git diff --no-index <base> <document>` when it is a path. It answers:

```js
const DIFF_CHECKS = [
  ['D1', 'The diff does what the user decided, as stated in `decision`, and nothing else.'],
  ['D2', 'The diff contradicts nothing in the rest of the document' + (plan ? ' or in the spec.' : '.')],
  ['D3', '`milestoned-plan-dag validate <plan>` exits 0 (run it).'],   // plan stage only
]
```

It lists only the outside claims that the diff introduces or changes, as
`unchecked_claims`. It runs no research unless that list is non-empty, and then only
on those claims (tiers per C). If there are no "no" answers and no claims, it returns
without triage.

F4. Snapshots. After every full or diff review, the skill copies the reviewed
document to `.kentra-rpir/reviewed/<change folder name>/<spec.md|plan.yaml>`. That
directory is already gitignored. The copy is the `base` for edits made before the
document is committed. Once the document is committed, the base is its commit:
`git log -1 --format=%H -- <document>`.

F5. Changes to full mode:
- The reviewer prompt gets the ledger paths. It must give each unchecked claim:
  - `importance`;
  - `premise`, the ledger ID when the claim is already a ledger row;
  - `reopen: true` only when the document changes what that premise rests on.
- The workflow decides which claims go to research:

  ```js
  claims.filter(c => !c.premise || c.reopen)
  ```

  It logs how many it skipped as already in the ledger.
- The reviewer schema (`REVIEW_SCHEMA.unchecked_claims`, `self-review.js:74-76`)
  becomes:

  ```js
  { claim, why, importance: 'critical'|'normal', premise?: string, reopen?: boolean }   // required: claim, why, importance
  ```

- Research topics carry `importance` from the claim:
  `{ name, slug, focus, importance }`. They keep the existing index-prefixed slug
  (`self-review.js:114-117`).
- The research call passes `checker`, `designer`, `runner` and `reasoner` from
  `args.research` in place of `collector` and `reasoner` (`self-review.js:119-120`),
  plus `spikeDir`. `self-review.js` gets a new optional arg
  `spikeDir`, forwarded as is.

F6. Changes to triage and the return value:
- `TRIAGE_SCHEMA.research_outcomes` items become:

  ```js
  { claim, premise?, importance, status, confidence, evidence }
  ```

  `evidence` is `docs: …` or `spike: …`.
- One new finding rule: a `critical` claim that stays `unverified` after its spike
  becomes a `decision` finding. Its question is whether to proceed on it, and its
  options are proceed, change the design, or drop the requirement.
- The return value becomes:

  ```js
  { stage, mode, checks, findings, research }
  ```

- `SPEC_CHECKS` S3 changes to: "Every premise has an importance, a status (verified,
  refuted or unverified) and evidence."

### G. The plan stage does not edit the spec for "how" decisions

G1. Implementation choices belong in `plan.yaml`: in the plan-level or milestone
`description`, and in `deliverables` and `paths`. Implementation choices include:
- file layout;
- milestone structure;
- module split;
- the order of work.

This holds even when the user makes the choice during the plan stage.

G2. The spec changes only when a requirement, goal, non-goal, or a spec Design
decision changes. When it does, it is a **spec amendment**:
1. Make the smallest edit that carries the change.
2. Run a diff review: `stage: 'spec'`, `mode: 'diff'`, `base` = the agreed commit,
   `decision` = the user's words.
3. Show the user the diff and any findings.
4. When the user approves the diff, commit it with
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/commit-change.sh" <change folder> "spec: amend <title>"`.

The status stays `agreed`. The spec is not reset to `draft` and gets no new full
review. The plan self-review then runs once, against the amended spec.

G3. A plan "how" choice may contradict a statement in the spec's Design section. In
that case the change is an amendment (G2) that edits only that statement.

### H. Expected outcome

H1. A change gets exactly two full reviews: the spec once and the plan once. Every
later edit gets a diff review or none (F1).

H2. Every premise is researched once (A2). Its depth matches its importance and how
uncertain it is (C3).

H3. On the smoke-test change, the spec self-review would run:
- the reviewer;
- 4 tier-1 checkers (the `tr` premise is skipped as already in the ledger);
- one spike for the critical `set -e` premise, only if its docs check came back below
  high confidence (1 designer, a few runners, 1 judge);
- triage.

That is about 7-11 agents instead of about 26, and no spike from the `tr` topic.

## Theme 2 — Session records

The capture hook is deleted. The planning sessions (spec and plan) leave one trimmed
log in git, the durable record of how the change was defined. The implementation
sessions leave nothing in git; the retro reads them in place, and `spec-retro.md` is
the durable record of how the change was built.

Trade-off, accepted: the full transcripts are not in git. Claude Code's transcript
cleanup (`cleanupPeriodDays`, 30 days by default) does not matter, because the retro
runs right after implement.

### 2.1 Finding sessions and transcripts

2.1.1. `.kentra-rpir/sessions.map` stays the session-id → change → stage index (one
line, `<session id> <change folder> <stage>`, change folder relative to the project
root). Every stage registers the plain `<change folder>`, including implement and
review: drop the `<worktreesDir>/<slug>/` prefix (`skills/implement/SKILL.md:47-49`,
`skills/review/SKILL.md:27-29`), which existed only so capture wrote into the
worktree.

2.1.2. New script `scripts/sessions.sh` (POSIX `sh`), the one place that parses the map
and finds transcripts:

- `sessions.sh list --project <root> --change <change folder>` prints one line per
  distinct session registered to that change, in first-appearance order:
  `<session id> <stage> <transcript path or ->`. A session registered for several
  stages is listed once, with its stages joined by `+` in map order (`spec+plan`).
  Map parsing keeps the current rules (`capture-session.sh:36-42`): CRLF tolerated,
  runs of whitespace between fields, a literal (non-regex) match on the id, and a line
  with no change field is ignored.
- `sessions.sh transcript --project <root> <session id>` prints the transcript path,
  or exits 1 with nothing on stdout.

2.1.3. Transcript lookup, used by both subcommands:
1. `base="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"`.
2. The project slug is the absolute project root with every character outside
   `[A-Za-z0-9]` replaced by `-`
   (`printf '%s' "$root" | sed 's/[^A-Za-z0-9]/-/g'`; `/Users/jony/code/kentra/harness`
   → `-Users-jony-code-kentra-harness`). Try `$base/<slug>/<id>.jsonl`.
3. Otherwise, `find "$base" -maxdepth 2 -name "<id>.jsonl"`, first hit. This covers a
   session started from a worktree or another directory, and slugs Claude Code
   shortens.
4. Otherwise the transcript is **missing**.

The session's own directory is the transcript path without `.jsonl`. It holds
`subagents/` and `workflows/` (one `<runId>.json` journal per workflow run).

2.1.4. A missing transcript is reported, never fatal by itself:
- `planning-log.sh` writes a `session` entry with `"missing": true` for it, prints
  `kentra-rpir: transcript for <id> not found` on stderr, and exits 3 after writing
  the rest. The plan skill tells the user which session is missing and commits anyway.
- The review skill passes it to the retro as `{ id, stage, path: null, missing: true }`
  (5.1.6).

### 2.2 The planning log

2.2.1. **File.** `<change folder>/planning-log.jsonl`. Audience: agents (the retro, a
future review), not humans. It is committed together with `plan.yaml`.

2.2.2. **Written by** `scripts/planning-log.sh --project <root> --change <change folder> --out <file>`
(POSIX `sh` plus `jq` ≥ 1.6). It takes the sessions from `sessions.sh list` whose
stage includes `spec` or `plan`, so spec and plan in separate sessions both go in, and
one session holding both appears once. For each session, in list order, it writes a
`session` entry, then the session's kept lines in transcript order. The output goes
through `scripts/redact.sh` (2.2.5) before it lands at `<file>`. Exit codes: 0 written;
2 usage error or no planning session in the map; 3 written, with at least one
transcript missing; 4 `jq` not found.

2.2.3. **What is kept and dropped.** `jq` reads each line leniently (`fromjson?`;
unparseable lines are skipped).

| Transcript content | In the log |
|---|---|
| `type: user`, string content or `text` blocks, not `isMeta`, not `isSidechain` | `user` |
| `type: assistant`, `text` blocks | `assistant` |
| `type: assistant`, `tool_use` named `AskUserQuestion` | `ask` |
| `type: user` whose `toolUseResult.answers` is an object (the AskUserQuestion result) | `answer` |
| `type: assistant`, any other `tool_use` | `tool` (one entry per call) |
| `type: system`, `subtype: compact_boundary` | `compact` |
| `tool_result` blocks, `thinking` blocks, `<system-reminder>` text, `attachment`, `file-history-snapshot`, every other `type`, `isMeta` and `isSidechain` lines | dropped |
| `subagents/**` and `workflows/**` | dropped (their results already live in `research/` and the self-review output) |

A user text block that starts with `<system-reminder>` is dropped; a user message whose
only content was dropped yields no entry.

2.2.4. **Line schema.** Every line is one JSON object with `kind` and, except
`session`, `ts` (the transcript line's `timestamp`) and `sid` (the first 8 characters
of the session id).

```
session   { kind, sid, id, stages: string, claudeCode: string|null, missing?: true }
user      { kind, ts, sid, text }
assistant { kind, ts, sid, text }
tool      { kind, ts, sid, tool, input }       // input: one-line summary, ≤ 200 chars
ask       { kind, ts, sid, questions: [{ question, options: [label], multiSelect }] }
answer    { kind, ts, sid, answers: { <question>: <answer> } }
compact   { kind, ts, sid }
```

`tool.input` is the tool's `input.description` when present (Bash, Agent); otherwise,
by tool: `file_path` (Read, Write, Edit, NotebookEdit), `pattern` plus `path` (Grep,
Glob), `skill` (Skill), `url` (WebFetch), `query` (WebSearch), the script's `name` or
path plus `args.stage`/`args.mode` when present (Workflow); otherwise the compact JSON
of `input`. Every summary is cut to 200 characters. `claudeCode` is the first `version`
field seen.

Example:

```jsonl
{"kind":"session","sid":"3f2a9c1e","id":"3f2a9c1e-…","stages":"spec+plan","claudeCode":"2.1.301"}
{"kind":"user","ts":"2026-10-12T09:01:12Z","sid":"3f2a9c1e","text":"/kentra-rpir:spec add --shout and --polite to greet.sh"}
{"kind":"tool","ts":"2026-10-12T09:01:20Z","sid":"3f2a9c1e","tool":"Read","input":"/p/greet.sh"}
{"kind":"ask","ts":"2026-10-12T09:02:05Z","sid":"3f2a9c1e","questions":[{"question":"Can both flags be given at once?","options":["Yes, compose (Recommended)","No, error"],"multiSelect":false}]}
{"kind":"answer","ts":"2026-10-12T09:03:40Z","sid":"3f2a9c1e","answers":{"Can both flags be given at once?":"Yes, compose (Recommended)"}}
{"kind":"tool","ts":"2026-10-12T09:04:02Z","sid":"3f2a9c1e","tool":"Workflow","input":"kentra-rpir:research"}
{"kind":"assistant","ts":"2026-10-12T09:15:31Z","sid":"3f2a9c1e","text":"Research verified P2: `tr '[:lower:]' '[:upper:]'` …"}
{"kind":"compact","ts":"2026-10-12T09:40:00Z","sid":"3f2a9c1e"}
```

2.2.5. **Redaction.** Move the `sed` program of `redact()` (`capture-session.sh:61-79`)
unchanged into `scripts/redact.sh`, a stdin → stdout filter. `planning-log.sh` writes
`<file>.tmp` through it and renames it to `<file>` only on success; a failure removes
the `.tmp`.

2.2.6. **When.** The plan skill writes the log as an explicit step when the user
approves the plan (new plan step 7, see 2.3), and commits it in the same commit
as `plan.yaml`. The spec stage writes no log into the change folder.

2.2.7. **The spec self-review reads the log, not the raw transcript.** Before the
spec self-review, the spec skill runs `planning-log.sh` with
`--out .kentra-rpir/reviewed/<change folder name>/planning-log.jsonl` (gitignored) and
passes that path as `transcripts`. The `self-review.js` sources line (line 59) says:
"The planning log the spec came from (JSONL, one entry per line: `user`, `assistant`,
`ask`, `answer`, `tool`)".

### 2.3 Skill, template, doc and test changes

| Where | Change |
|---|---|
| `hooks/hooks.json`, `hooks/capture-session.sh` | Delete both, and the `hooks/` directory. This removes the `PreCompact` and `SessionEnd` registrations. |
| `skills/spec/SKILL.md` | Step 1: register `<change folder>` (unchanged form). Step 7 (lines 103-107): replace the capture command with the 2.2.7 `planning-log.sh` call; `transcripts` (line 113) is that file. Step 8 (lines 135-138): delete "Capture the session"; commit with `commit-change.sh` (E4). Checklist item 8: "Agree, commit". |
| `skills/plan/SKILL.md` | Step 6.2 (lines 113-117): replace "capture the session" with "write the planning log" (`planning-log.sh --out <change folder>/planning-log.jsonl`; on exit 3 name the missing sessions to the user), then commit the change folder with `commit-change.sh` in one commit that holds `plan.yaml`, `spec.md`, `planning-log.jsonl` and `research/`. Checklist item 6: "Present, agree, write the planning log, commit". |
| `skills/implement/SKILL.md` | Step 1.4 (lines 47-49): register `<change folder>`, delete "inside the integration worktree, so its transcript is committed". Step 5.3 (lines 155-156): delete. |
| `skills/review/SKILL.md` | Step 1.3 (lines 27-29): register `<change folder>`. Step 2 `sessions` (lines 35-36): each line of `sessions.sh list` gives `{ id, stage, path }`, or `{ id, stage, path: null, missing: true }` for `-`; skip this review session's own id. Add `planningLog` to the args (5.1.1). Step 5.2 (lines 89-90): delete. |
| `templates/spec.md` | Line 6: `sessions: sessions/` → `planningLog: planning-log.jsonl   # trimmed spec and plan sessions, written when the plan is approved`. |
| `docs/process.md` | Principle 4 (lines 24-25): "The process records itself. The planning sessions are kept as a trimmed log in the change folder; the retro reads the implementation transcripts where Claude Code keeps them." Change-folder tree (lines 31-43): replace `sessions/…` with `planning-log.jsonl` and `research/spikes/<slug>/`; line 50 likewise. Line 131 frontmatter. Stage 1 step 8 (line 117), Stage 2 step 7 (line 175), Stage 3 step 5 (line 300): drop "capture the session"; plan step 7 adds "write the planning log". Replace "Session capture" (lines 416-438) with "Session records" (2.1, 2.2, the trade-off). Plugin layout (lines 472-473): drop `hooks/`, add `scripts/`. |
| `README.md` | Lines 25-27: "The process records itself. The spec and plan sessions are kept as a trimmed, redacted log in the change folder; the retro reads every session's transcript, not the agents' account of their work." Install (line 37): add `jq` as a requirement. |
| `AGENTS.md` | "skills, agents, workflows, hooks and templates" → "skills, agents, workflows, scripts and templates"; "the hook tests" → "the script tests". |
| `tests/` | Delete `capture-session.test.sh`; add `sessions.test.sh` and `planning-log.test.sh` (Test plan); `tests/run.sh` line 5 runs them. |

## Theme 3 — Plan verification

A full replay of the plan — building every milestone in a fresh worktree before
presenting it, proving red then green — was tried live and dropped (2026-10-12).
A replay is effectively a second build of the plan, verifier-less, and it costs
time in the stage the user waits on. Theme 4's genuine-red verifier check catches
the same class of gap (the smoke run's missing `tests/`) at implement time, for
one fix round, and the retro classifies it as `PLAN`. Revisit if retros show plan
gaps slipping through often.

**Plan-skill rule.** A step that writes into a new directory creates it; git does
not track empty directories, so a directory a later milestone needs must contain a
committed file.

### 3.1 Require milestoned-plan-dag 0.2.0

3.1.1. Plan skill, new first action in step 1: run `milestoned-plan-dag --version`
(prints `milestoned-plan-dag version X.Y.Z (…)`). If it is missing or below 0.2.0,
stop and tell the user: `kentra-rpir plan needs milestoned-plan-dag ≥ 0.2.0 (found <X|none>): brew upgrade kentra-io/tap/milestoned-plan-dag`.

3.1.2. The plan sets `schemaVersion: 0.2.0` (plan-level `description` and `rules` exist
from 0.2.0). Step 3 says so.

3.1.3. If the loaded `plan-author` skill documents only `schemaVersion: 0.1.0` (no
plan-level `rules`), tell the user once to run
`claude plugin update milestoned-plan-dag@kentra-agentic-plugins`, and continue with
`validate` as the authority on the schema. Do not probe the CLI to learn the schema.

3.1.4. `README.md` Install (line 37) and `docs/process.md` line 11: "milestoned-plan-dag
0.2.0 or later".

## Theme 4 — Implementation correctness

### 4.1 The verifier proves red against the base

4.1.1. `agents/verifier.md` gets a new check 3, **Red**, between Criteria and Paths
(renumber the rest):

> 3. **Red.** Prove the milestone's tests fail without its change. Create a scratch worktree at the base: `git -C <worktree> worktree add --detach <worktree>--red <base>`. Copy the milestone's test files into it from the milestone branch: `git -C <worktree>--red checkout <branch> -- <test files>`, where the test files are those the criteria name and the deliverables list as tests. Run the contract's `check` there. Then remove the scratch worktree with `git -C <worktree> worktree remove --force <worktree>--red`. The red is genuine only when the check exits non-zero and its output shows a criterion's test running and failing on the missing behaviour. A missing test file, a missing runner, a syntax error in the test, zero tests run, or exit 0 is not red evidence: FAIL with `[red]`, whatever the implementer reported.

4.1.2. `agents/verifier.md` gets one rule under the checks:

> Read the exit status of the command itself. Never pipe a test or check command into `tail`, `head` or `grep` before reading `$?`: redirect its output to a file, read the status, then read the file.

4.1.3. The report format gains a `RED` line, and `[red]` joins the finding tags:

```
VERDICT: PASS | FAIL
CHECK: <command> → <result>
RED: <command> at <base> → exit <n> — <the failing criterion test line, or "no red evidence">
FINDINGS:
- [criteria|red|paths|intent|rules|check] <file:line> — <what is wrong> — <what the fix is>
```

PASS requires a `RED` line with a non-zero exit and a genuine failure.

4.1.4. `skills/implement/verifier-prompt.md` line 29-31: the check list becomes
"check command, criteria, red against `{{base}}` (in `{{worktree}}--red`), paths
(`git diff --name-only {{base}}...HEAD`), intent, rules", and the report list becomes
"VERDICT, CHECK, RED and FINDINGS".

4.1.5. `docs/process.md` Stage 3 step 3 (lines 288-293): add "the milestone's tests fail
on the base, for a genuine reason (red)".

### 4.2 Branch cleanup runs in the integration worktree

`skills/implement/SKILL.md:114-115` becomes:
`git worktree remove <milestone worktree>` and
`git -C <worktreesDir>/<slug> branch -d <milestone branch>`.
`branch -d` checks the merge against the current worktree's HEAD, which must be the
integration branch.

## Theme 5 — Retro

### 5.1 Read the planning sessions, with cost metrics

5.1.1. New `spec-retro.js` args (header, lines 14-22):

```
sessions    (required) [{ id, stage, path, missing? }]; stage may join stages with '+';
                       path null only when missing is true
planningLog (optional) absolute path of <change>/planning-log.jsonl
```

The session check (lines 33-35) throws `session "<id>" has no path` only when `path` is
empty and `missing` is not true.

5.1.2. Session selection (lines 37-39) becomes:

```js
const stagesOf = s => String(s.stage).split('+')
const present = args.sessions.filter(s => !s.missing)
const implSessions = present.filter(s => stagesOf(s).includes('implement'))
const planningSessions = present.filter(s => stagesOf(s).some(x => x === 'spec' || x === 'plan'))
const missing = args.sessions.filter(s => s.missing)
if (missing.length) log(`transcripts missing: ${missing.map(s => `${s.id} (${s.stage})`).join(', ')}`)
```

The review session is not passed (2.3), so it is in neither list.

5.1.3. **Planning pre-pass** (phase `Prepass`, alongside the implement pre-pass). One
agent per planning session, `as('prepass', { label: 'prepass:planning:<id>', … })`,
returning `PLANNING_SCHEMA`:

```js
{ id: string, stages: string,
  wallMs: number,                    // first to last timestamp in the transcript
  workflows: [{ runId, name, stage, mode, status, durationMs, agentCount, totalTokens, startTime }],
  questionRounds: number,
  statusResets: [{ from, to, ref }], // spec.md / plan.yaml status moved backwards, with <file>:<line>
  fullReviews: { spec: number, plan: number },
  diffReviews: { spec: number, plan: number } }
// required: id, workflows, questionRounds, statusResets, fullReviews
```

Prompt: read `<session dir>/workflows/*.json` with `jq` for each run's `runId`,
`workflowName`, `status`, `durationMs`, `agentCount`, `totalTokens`, `startTime`,
`args.stage` and `args.mode` (a missing `mode` on a self-review is `full`); read
`tasks/*.output` only when given a tasks directory (Open question 4); read the
transcript for question rounds (an assistant turn that calls `AskUserQuestion`, or
whose last text ends in a question, followed by a user message) and for `status:`
edits to `spec.md` or `plan.yaml` that move backwards in
`draft → agreed → planned → implementing → in-review → done`.

5.1.4. **Planning reader** (phase `Read`, in the same `parallel` as the milestone
readers, `READ_SCHEMA` with `milestone: 'planning'`, label `read:planning`, role
`reader`, `MODE: full` always). It reads:
- the planning log (`planningLog`) first, and the planning transcripts in place where
  the log is not enough;
- the spec and plan, with their writer-gap lists and `# premises:`;
- the planning metrics (5.1.3).

It looks for: research or review whose cost did not match the risk, a plan gap the
self-review should have caught, status resets and re-reviews, questions the
user had to ask that a stage should have answered. Like the other readers, it never
opens `impl-report.md`. The milestone readers' line 139 becomes
`- the planning log, when a finding may trace back to the spec or plan: <planningLog>`
(omitted when `planningLog` is not given).

5.1.5. Synthesis gets the planning metrics as JSON and the planning reader's findings
with the others. The writer gets the metrics and fills the new **Planning cost**
section (5.2).

5.1.6. Missing sessions go into the writer's header facts as
`<id>: <stage> (transcript missing)` and into Open questions. If every implement
session is missing, the existing log line (line 38) stands and the readers get "no
transcript" in place of the list.

5.1.7. The return value adds `planning` (the array of `PLANNING_SCHEMA` results).

### 5.2 A PLAN fault class

- `SYNTH_SCHEMA.findings[].class` enum (line 160): `['SPEC', 'PLAN', 'SKILL', 'PROCESS', 'ENV', 'MODEL']`.
- Synthesis prompt (lines 188-193): `SPEC: the spec was ambiguous or wrong`;
  `PLAN: the plan was ambiguous, wrong, or could not be built as written (a missing step, file, directory, type or pin)`.
- `templates/spec-retro.md` line 30 and `docs/process.md` table (lines 373-379): add `PLAN`.
- New template section after Outcome:

  ```markdown
  ## Planning cost

  | Session | Workflow | Stage · mode | Duration | Agents | Tokens | Status |
  |---|---|---|---|---|---|---|
  | <sid> | self-review | spec · full | <m.m> min | <n> | <n> | completed |

  Question rounds: <n> · Status resets: <n> · Full reviews: spec <n>, plan <n> · Diff reviews: <n> · Workflow time: <m> min of <m> min wall
  ```

### 5.3 A short reconciliation table

- `RECON_SCHEMA` and the reconcile prompt are unchanged: every claim still gets a
  verdict.
- In code, after line 214:
  `const notConfirmed = reconciliation.claims.filter(c => c.verdict !== 'confirmed')` and
  `const confirmedCount = reconciliation.claims.length - notConfirmed.length`.
- The writer gets `notConfirmed` and `confirmedCount` in place of the whole
  reconciliation (line 259): "Reconciliation (only the contradicted and unsupported
  claims; <confirmedCount> other claims were confirmed): …".
- `templates/spec-retro.md` lines 12-16: the table lists only contradicted and
  unsupported claims, followed by `<n> other claims confirmed.` When there are none:
  `All <n> claims confirmed.`

## Theme 6 — How stages end

6.1. Each skill ends with one closing line to the user: what the stage produced, as
paths relative to the project root, and what comes next. Each skill's "The stage is
done when…" paragraph gets: "Then end with one line:" and its template.

| Skill | Closing line |
|---|---|
| `spec` (line 140-141) | `Spec agreed: <change folder>/spec.md (<short sha>). Next: /kentra-rpir:plan, ideally in a fresh session.` |
| `plan` (line 119-120) | `Plan approved: <change folder>/plan.yaml, planning-log.jsonl (<short sha>). Next: /kentra-rpir:implement.` |
| `implement` (line 164-166) | `Implemented on <branch> in <worktreesDir>/<slug>: <change folder>/impl-report.md[, <PR url>]. Next: /kentra-rpir:review.` |
| `review` (line 97-98) | `Change done: <change folder>/spec-retro.md (<short sha>). Next: merge <PR url or branch>, then git worktree remove <worktreesDir>/<slug>.` |

6.2. `README.md` and `docs/process.md` need no change for this.

## Changes per file

| File | Theme | Change |
|---|---|---|
| `workflows/research.js` | 1 | Rewrite per C, D and E: new args header (C4); `meta` description and phases (C6); delete `DEFAULT_ANGLES`, `SOURCES_SCHEMA`, `collectPrompt` and `angles`/`collector`; delete the `spikeDir` default (line 44) and add the E3 throws; add `CHECK_SCHEMA`, `DESIGN_SCHEMA`, `RUN_SCHEMA`, `needsSpike`, `READABLE_SPIKES` (with the E3 sentence); the checker, designer, runner and judge prompts (each opens with `ONLY_JOB`; the judge keeps the spike per E3); the `pipeline` per D1; the C5 return value. Keep `slugOf` (line 41), the 60-character slug cap, `ONLY_JOB` and the Index step (lines 136-148). The `log` line (119) reports topics, the checker model, and how many topics escalated. |
| `workflows/self-review.js` | 1, 2 | Args per F2 plus `spikeDir`; delete `maxClaims` (lines 23, 104) and add the C1 log line; add `DIFF_CHECKS` and the diff branch (F3); update `REVIEW_SCHEMA` and the claim filter (F5); research args (F5, with `spikeDir`); `TRIAGE_SCHEMA` and the critical-unverified rule (F6); change S3; add `mode` to both return paths (lines 128-130, 171-176); the `meta` description mentions the diff mode; the spec sources line (59) describes the planning log (2.2.7). |
| `workflows/spec-retro.js` | 5 | Args (5.1.1); session check (lines 33-35); session selection (5.1.2); `PLANNING_SCHEMA` and the planning pre-pass (5.1.3); the `read:planning` reader (5.1.4) and line 139; synthesis input (5.1.5) and the `PLAN` class (5.2, lines 160, 188-193); missing sessions in header facts (5.1.6, line 255); `notConfirmed`/`confirmedCount` (5.3); return adds `planning` (lines 267-272); `meta` phases' details mention planning sessions. |
| `skills/spec/SKILL.md` | 1, 2, 6 | **Step 3:** record each premise with an importance, using the B2 definition. **Step 4:** skip ledger rows; topics carry `importance`; the args use `checker`/`designer`/`runner`/`reasoner` and add `spikeDir` (E3, created with `mkdir -p`); set Evidence from each report's `evidence`; show `normal` premises left `unverified` and offer a spike (`spike: true`); add the E2 text and the E3 rule. **Step 7:** the planning-log snapshot replaces capture (2.3); pass `"mode": "full"`, `"ledger"` and `"spikeDir"`; snapshot after the review (F4); research outcomes fill Importance, Status and Evidence; a `critical` premise left unverified becomes a decision. **New step 7a, "Edits after review":** the F1 table, the diff-review args, and a fresh snapshot after each diff review. **Step 8:** no capture; commit with `commit-change.sh`; after `agreed`, edits are amendments (G2), never a reset to `draft`; closing line (6.1). **Red flags:** add "I'll re-check this premise to be safe → it's in the ledger; it's re-opened only when an edit changes it". |
| `skills/plan/SKILL.md` | 1, 2, 3, 6 | **Step 1:** the version check (3.1.1, 3.1.3). **Step 2:** research only what is not in the ledger; assign importance; `spikeDir` as in the spec stage; record results and the plan's own spikes in `# premises:` (A5); add the E2 text; replace "Any claim about a third-party API's behaviour gets a spike" (lines 51-52) with "send it to research with its importance; a `critical` claim spikes when the docs don't settle it". **Step 3:** "how" choices go in `plan.yaml` (G1); `schemaVersion: 0.2.0` (3.1.2); a step that writes into a new directory creates it. **Step 5 (self-review):** pass `"mode": "full"`, `"ledger": [spec.md, plan.yaml]` and `"spikeDir"`, then snapshot. **Step 6:** later plan edits follow F1; on approval write the planning log and commit (2.3); closing line (6.1). **New subsection "Spec amendments":** G2 and G3. **Red flags:** add "The user picked a file layout; I'll write it into the spec → it goes in `plan.yaml`. The spec changes only when a requirement changes, as an amendment." |
| `skills/implement/SKILL.md` | 2, 4, 6 | Step 1.4 registration (2.3); step 4.4 branch cleanup (4.2); delete step 5.3; closing line (6.1). |
| `skills/implement/verifier-prompt.md` | 4 | Lines 29-31 per 4.1.4. |
| `agents/verifier.md` | 4 | Red check (4.1.1), the exit-status rule (4.1.2), the report format (4.1.3); the `description` mentions red. |
| `skills/review/SKILL.md` | 2, 5, 6 | Step 1.3 registration and step 2 `sessions` (2.3); add `"planningLog"` to the args; delete step 5.2; step 4.1 presents Planning cost; closing line (6.1). |
| `agents/reviewer.md` | 1 | The unchecked-claims bullet: give each claim an importance, skip claims already in the ledger, and mark `reopen` only when the document changes what the premise rests on. Add one bullet for diff reviews: read only the diff and check D1 and D2. |
| `hooks/hooks.json`, `hooks/capture-session.sh` | 2 | Delete. |
| `scripts/sessions.sh` | 2 | New (2.1.2, 2.1.3). |
| `scripts/redact.sh` | 2 | New: the `sed` program from `capture-session.sh:61-79`, stdin → stdout. |
| `scripts/planning-log.sh` | 2 | New (2.2). |
| `scripts/commit-change.sh` | 1 | New (E4). |
| `templates/spec.md` | 1, 2 | Premises table per A1: header `\| # \| Premise \| Importance \| Status \| Evidence \|`, example row `\| P1 \| <…> \| critical · normal \| verified · refuted · unverified \| docs: <URL or file:line@version> · spike: research/spikes/<slug>/ \|`. Frontmatter line 6 per 2.3. |
| `templates/spec-retro.md` | 5 | Planning cost section; `PLAN` class; the short reconciliation table (5.2, 5.3). |
| `templates/kentra-rpir.yaml` | 1 | `research:` becomes `{ workflow, checker: sonnet, designer: opus, runner: sonnet, reasoner: opus }`; delete `collector`. |
| `docs/process.md` | 1-5 | Config block (lines 72-75) per the template. Line 11: mpd 0.2.0. Stage 1 steps 3-4 (lines 101-111): importance, the ledger, spikes in project-local gitignored scratch. The `spec.md` block (lines 131, 137). Stage 2 step 2 (lines 152-155): the ledger and `# premises:`; step 7: amendments (G2) and the planning log. Self-review section (lines 193-230): modes, the F1 table, ledger skip, no cap. Stage 3 step 3: red (4.1.5). Retro: `PLAN` (lines 373-379); planning pre-pass and reader replace lines 397-398; reconciliation lists only non-confirmed claims (lines 384-386, 406). Session records (2.3). Research section (lines 447-460): rewrite as tiers, the escalation predicate, readable spikes and `spikeDir` project-local and gitignored. New short section "Premises ledger" after "The change folder". Plugin layout. |
| `README.md` | 1, 2, 3 | Line 21 area: research is a docs check with spikes for critical premises. Lines 25-27 (2.3). Install: mpd 0.2.0, `jq` ≥ 1.6. |
| `AGENTS.md` | 2 | Per 2.3. |
| `tests/workflow-fixtures.mjs` | 1, 5 | See the test plan. The `research` constant (line 9) becomes `{ workflow, checker: 'sonnet', designer: 'opus', runner: 'sonnet', reasoner: 'opus' }`. |
| `tests/check-workflows.mjs` | — | No change expected. The harness already runs the child workflow for real and checks phase titles against `meta.phases`. |
| `tests/capture-session.test.sh` | 2 | Delete. |
| `tests/sessions.test.sh`, `tests/planning-log.test.sh`, `tests/commit-change.test.sh` | 1-3 | New (Test plan). |
| `tests/run.sh` | — | Line 5: run the four new `sh` tests in place of `capture-session.test.sh`. |
| `.claude-plugin/plugin.json` | — | `"version": "0.3.0"` → `"0.3.1"`. Also bump `versions.plugin` in the `specRetroArgs` fixture if a test asserts it (currently it does not). |

## Test plan

All of it runs under `sh tests/run.sh`.

### Workflow dry-run cases (`tests/workflow-fixtures.mjs`)

Override keys are label prefixes. Default agent results are `fake(schema)`, which
gives `''` and `[]` and makes a `confidence` of `''` count as "not high".

**`research`**

- `rejects missing args`: unchanged.
- `one topic` (rewritten), with importance `normal`:
  - exactly one `check:` agent, on `sonnet`;
  - no `collect:`, `design:`, `run:` or `judge:` agents;
  - every prompt opens with the only-job preamble.
- `caps a long topic slug at 60 chars`: now asserts on the `check:` label.
- `no cap: 12 topics get 12 checkers`.
- `critical, low confidence: spikes`:
  - `check:<slug>` returns `{verdict:'verified', confidence:'low', …}`;
  - `design:<slug>` returns 2 experiments with safe commands;
  - expect 1 `design:` agent (`opus`), 2 `run:` agents (`sonnet`) and 1 `judge:` agent
    (`opus`);
  - the report has `depth: 'spike'` and `evidence` starting `spike: research/spikes/`.
- `critical, high confidence: no spike`.
- `normal, low confidence: no spike, stays unverified`: the report has
  `depth: 'docs'` and `verdict: 'unverified'`.
- `normal with spike: true: spikes`.
- `critical, null checker: spikes`. `normal, null checker: in failed`.
- `two critical topics: both designers run` (asserts both `design:` labels, so the
  topics escalate independently).
- `designer returns no experiments`: no `run:` or `judge:` agent; the report has
  `depth: 'docs'`.
- `models are overridable`: `checker`, `designer`, `runner` and `reasoner` args reach
  the matching labels.
- `readable-spike rule in every spiking prompt`: the `design:`, `run:` and `judge:`
  prompts include `READABLE_SPIKES`; the `check:` prompt includes `Run no code`.
- `critical topic without spikeDir: throws` (`/spikes need args.spikeDir/`).
- `spikes go to spikeDir, kept copy to outDir`: the `design:` prompt names
  `<spikeDir>/<slug>/` and not `<outDir>`; the `judge:` prompt names
  `<outDir>/spikes/<slug>/` and `result.md`.
- Null pass (`nullsOk: true`): unchanged.

**`self-review`**

- `clean spec: no research, no triage`: unchanged, plus `result.mode === 'full'`.
- `plan with a no and a claim: research then triage`: change the override
  `'reason:1-jackson-…'` to `'check:1-jackson-…': null`. Replace "research gets the
  configured models" with a check that `checker`, `designer`, `runner`, `reasoner` and
  `spikeDir` are passed through. Assert that the topic carries `importance`.
- `claims already in the ledger are skipped`: 2 claims with `premise: 'P1'` and 1 claim
  with no premise give 1 research topic.
- `reopened ledger premise is researched`: `premise: 'P2', reopen: true` gives 1 topic.
- `every ledger claim skipped: no research`: no `workflow()` call. Triage still runs
  when there is a "no".
- `no cap: 8 claims give 8 topics`.
- `maxClaims is ignored`: `maxClaims: 2` with 4 claims gives 4 topics.
- `diff mode: no research`: `mode:'diff'`, `base:'abc123'`, `decision:'…'`, the review
  returns no claims; one agent, labelled `review:diff`; its prompt includes `D1`, `D2`
  and `abc123`, and not `S1`; no `workflow()` call, no triage.
- `diff mode, plan: D3 included`.
- `diff mode with a new outside claim: researched`: 1 topic.
- `diff mode without base or decision: throws` (`/needs base and decision/`).
- `critical claim left unverified reaches triage`: the triage prompt includes the
  claim and its importance.
- `spec sources describe the planning log`: the spec review prompt includes
  `planning log`.

**`spec-retro`** (`specRetroArgs.sessions` becomes
`[{ id: 's1', stage: 'spec+plan', path: '/p/s1.jsonl' }, { id: 's2', stage: 'implement', path: '/p/s2.jsonl' }]`,
plus `planningLog: '/p/c/planning-log.jsonl'`)

- `two milestones, one troubled`: existing expectations, except "prepass only reads
  implement sessions" becomes "implement pre-pass labels are `prepass:s2` only".
- `planning pre-pass per planning session`: exactly one `prepass:planning:s1`, on the
  `prepass` model; its prompt names `/p/s1/workflows/`.
- `planning reader runs in full`: `read:planning` exists, its prompt includes
  `MODE: full` and `/p/c/planning-log.jsonl`, and not `impl-report.md`.
- `PLAN class offered`: the synthesis prompt includes `PLAN:`.
- `reconciliation lists only non-confirmed claims`: override `reconcile` with 2
  confirmed claims and 1 contradicted; the `write` prompt includes the contradicted
  claim's text and `2 other claims were confirmed`, and not the confirmed claims' text.
- `missing transcript is tolerated`: a third session
  `{ id: 's3', stage: 'implement', path: null, missing: true }` does not throw; the
  `write` prompt includes `s3: implement (transcript missing)`.
- `throws when a session has no path`: unchanged (no `missing` flag).
- `returns planning metrics`: override `prepass:planning:s1` with one workflow;
  `result.planning[0].workflows.length === 1`.
- The existing null-result cases: unchanged.

### Script tests

**`tests/sessions.test.sh`** (`CLAUDE_CONFIG_DIR` set to a temp dir, as the old test does)

- The map-parsing cases from `capture-session.test.sh` (CRLF and collapsed spaces,
  literal id match with a wildcard decoy, empty change field, empty change field on the
  last line) now assert on `sessions.sh list` output.
- `spec` and `plan` lines for one id list once, as `spec+plan`.
- Only the given change's sessions are listed.
- `transcript` finds `<slug>/<id>.jsonl` by the slug rule (a project path with `.` and
  `_` in it).
- `transcript` falls back to `find` for a transcript under another slug.
- A missing transcript: `transcript` exits 1; `list` prints `-` as the path.

**`tests/planning-log.test.sh`**

- Fixture transcript with one line of each kind: user text, `isMeta` user, sidechain
  line, `<system-reminder>` user block, assistant text plus `thinking`, Bash `tool_use`
  with `description`, Read `tool_use`, `tool_result`, `AskUserQuestion` `tool_use`, its
  result with `toolUseResult.answers`, `attachment`, `file-history-snapshot`,
  `compact_boundary`, and one unparseable line.
- Kept: one `user`, one `assistant`, two `tool` (Bash `input` = its description, Read
  `input` = the path), one `ask` with options as labels, one `answer`, one `compact`.
- Dropped: `grep -c tool_result`, `thinking`, `system-reminder`, `file-history-snapshot`
  all 0; no `subagents` content even when the session dir has `subagents/*.jsonl`.
- Every output line parses with `jq`; every `tool.input` is ≤ 200 characters.
- Every redaction case from `capture-session.test.sh` (tokens, keys, PEM and PGP blocks,
  URL credentials, JSON secret fields, the `disk-`/`risk-` and `input_tokens` false
  positives), placed in kept user and assistant text.
- Two sessions (`spec` then `plan`) give two `session` entries in map order; one session
  with both gives one entry with `stages: "spec+plan"`.
- A `review` or `implement` session in the map is not included.
- A missing transcript: exit 3, a `session` entry with `"missing": true`, the other
  session's entries still written.
- No map entry for the change: exit 2, no file written. No `.tmp` left behind in any case.

**`tests/commit-change.test.sh`**

- A change folder holding `research/spikes/x/.git` (from `git init`): exit 1, nothing
  staged (`git diff --cached --quiet`), message names the path.
- A clean change folder: exit 0, one commit whose paths are only the change folder and
  the extra paths.

### Re-run smoke checklist

Re-run the `greet.sh` change (`--shout`/`--polite`) on 0.3.1. The run must show:

- **Theme 1:** the `tr` premise skipped as already in the ledger; one full spec review
  and one full plan review; the layout decision in `plan.yaml` only; every spike's logic
  in a file run with one short command; `git ls-files <change>/research/spikes` lists
  only spike scripts and `result.md` files; no gitlink (`git ls-files -s <change> | grep ^160000`
  empty); no `.git` under the change folder.
- **Theme 2:** `planning-log.jsonl` in the same commit as `plan.yaml`, no `sessions/`
  directory, the log under 1 MB, and `grep -c tool_result` 0; no `hooks/` in the
  installed plugin; `git status --porcelain` in the main checkout empty after every
  session ends; the retro's header lists each session once.
- **Theme 3:** the version check line at the start of plan; `schemaVersion: 0.2.0`;
  and either the plan creates `tests/` with a file in it in M1, or the implement
  stage's red-evidence check fails the milestone and the fix loop repairs it.
- **Theme 4:** every verifier report has a `RED` line with a non-zero exit and a named
  failing test; no `branch -d` error; `git branch --list 'rpir/<slug>--m*'` empty after
  implement.
- **Theme 5:** `spec-retro.md` has a Planning cost table with one row per self-review
  and research run (durations, agents, tokens); `PLAN` is available as a class; the
  reconciliation table has only contradicted or unsupported rows plus the confirmed
  count.
- **Theme 6:** each stage ends with its closing line; the user never has to ask for
  paths or the next step.
- **Kept:** parallel milestone worktrees; the retro still independent of
  `impl-report.md`; the main session's context still small.
- Record wall time per stage and the background waiting time, and compare with 52 / 6 /
  13 minutes and 32 minutes waiting.

## Open questions

1. **Where the plan's premises live.**
   - Default: the `# premises:` comment block in `plan.yaml` (A5).
   - Alternatives: a `premises.md` file in the change folder, using the spec's table
     format; or a "Premises" paragraph in the plan-level `description`.

   The trade-off: a comment block keeps the plan as one file, but tools cannot parse
   it. A separate file would let a later version check the ledger in code.
2. **Can an agent inside a workflow start the Workflow tool itself?** Unverified.
   This design does not depend on it, because D's fan-out is agents inside
   `research.js`. If it is possible, a spike designer could start a sub-workflow for a
   very large experiment matrix. Follow-up: a spike that tries it.
3. **The runner model.** The default is `sonnet`, because runners only run files that
   Opus wrote and return the output verbatim. The `runner` arg overrides it. `haiku`
   is the cheaper candidate once runners have shown they run only the given command
   (there is no command guard, D5).
4. **Where `tasks/*.output` lives.** On this machine it is under the OS temp dir
   (`/private/tmp/claude-<uid>/<project slug>/<session id>/tasks/`), not under
   `~/.claude/projects/`, and the location is undocumented. The planning pre-pass
   relies on the `workflows/*.json` journals, which carry duration, agent count and
   tokens; it reads `tasks/` only when the review skill finds that directory. Settle
   whether to look it up at all.

## Non-goals

- Replaying the plan (building every milestone in a fresh worktree before
  presenting it, proving red then green). A replay is effectively a second build
  of the plan, verifier-less, and it costs time in the stage the user waits on.
  Theme 4's genuine-red verifier check catches the same class of gap for one fix
  round, and the retro classifies it as `PLAN`. Revisit if retros show plan gaps
  slipping through often.
- A cap on the number of premises, claims or topics.
- Changing the full-mode checklists beyond S3, or the plan checklist P1-P12.
- Nested `workflow()` calls from `research.js`.
- A machine-readable ledger format or a ledger CLI (see Open question 1).
- Compatibility with external research workflows that implement the old
  `collector`/`angles` contract. `research.workflow` can still point at a user
  workflow, but it must accept the C4 args.
- Re-reviewing a document after a self-review `technical` fix is applied.
- Full transcripts in git, or any record of the implementation sessions other than
  `spec-retro.md`.
- Special wording for a "no remote / push skipped" case. It was a trial-run quirk; the
  skills get no instructions for one-off situations.
- Turning first-use setup questions into silent defaults. The spec stage keeps asking.
- A holistic agent code review in the review stage. Per-milestone verifiers plus the
  user's own review are enough; revisit only if retros show cross-milestone issues.
- A command blocker for spikes (D5).
- `kentra-io/kentra-rpir` not existing yet is not a defect: the repository rename (plan
  task D1) has not happened. The review skill's `gh issue create --repo kentra-io/kentra-rpir`
  stays as is.
