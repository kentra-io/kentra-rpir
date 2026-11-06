# kentra-rpir: process design

kentra-rpir is a Claude Code plugin for running one change (a feature, a bug, a
chore) from idea to merged code, for a solo founder. It is RPI
(Research → Plan → Implement) with an explicit Review stage. "RPIR" is our name for
that composition, not an industry standard: "RPI" was coined by HumanLayer, and
Microsoft's HVE Core adds Review under the same acronym.

A change runs through three stages, each a skill run in the main session:

| Stage | Skill | Writes |
|---|---|---|
| [plan](#stage-1-plan) | `kentra-rpir:plan` | `spec.md`, and at the standard tier `plan.yaml` |
| [implement](#stage-2-implement) | `kentra-rpir:implement` | the code, on an integration branch, and `impl-report.md` |
| [review](#stage-3-review) | `kentra-rpir:review` | `spec-retro.md` |

Research runs beside them as a [session pool](#research-pool), through the
`kentra-rpir:research` skill.

**Requirements.**
- `milestoned-plan-dag` 0.4.0 or later. Plans use its schema 0.4.0, which has no
  `steps`. The plan and implement stages stop with
  `brew upgrade kentra-io/tap/milestoned-plan-dag` when the CLI is missing or
  rejects `schemaVersion: 0.4.0`.
- `jq` 1.6 or later, for the planning log.
- `constitution`, only when a project opts into a constitution.

**Old-format changes.** A change started under kentra-rpir 0.5.x has `tier: full`
or `tier: light` in its spec, and separate spec and plan stages. It finishes on
0.5.x. The plan, implement and review stages stop on such a spec and say so; this
version does not migrate it.

## Principles

1. **Files are the handoff.** Each stage writes a file in the change folder, and
   the next stage reads that file rather than the previous conversation.
2. **Any stage can start any time.** No skill disables model invocation, and nothing
   blocks a stage from running. The user's agreement in the conversation is the only
   "gate".
3. **One independent check per judgement.** Each judgement gets exactly one check
   by an agent that did not make it, placed where checks have caught defects.
   Mechanical checks are scripts. Steps that only redo the previous step are left
   out.

   | Judgement | Made by | Checked by |
   |---|---|---|
   | Spec and plan | the user decides; the main session drafts | one fresh reviewer of spec and plan together, then a diff review per edit of substance |
   | A critical premise | the spike that settles it | the advisor, which re-runs only the decisive experiment |
   | A milestone | its lead | a fresh verifier, independent of the lead |
   | The change | the user's code review | the retro over the session transcripts |
4. **The process records itself.** The planning sessions are kept as a trimmed log
   in the change folder; research leaves reports and an index; the retro reads the
   implementation transcripts where Claude Code keeps them.
5. **Configuration over editing skills.** Models, agent definitions and limits
   live in `.kentra-rpir.yaml`, so they can be tuned from any session.

## Roles

Every role is an agent definition in `agents/`. Each sets the system prompt and a
default model; none restricts tools.

| Agent | Model | Dispatched by | Does |
|---|---|---|---|
| `reviewer` | opus | the plan skill | the joint review of spec and plan, and diff reviews |
| `lookup` | haiku | the research pool, a spike or a researcher | finds the sources for one fact and returns labelled verbatim excerpts, no judgement |
| `spike` | sonnet | the research pool | settles one premise end to end, writes its report and index row |
| `researcher` | opus | the research pool | answers one survey question from parallel lookups, writes its report and index row |
| `advisor` | opus | a spike | second read of a critical premise's evidence and conclusion |
| `lead` | opus | the implement orchestrator | leads one milestone: cuts it into pieces, briefs implementers, reviews their work |
| `implementer` | sonnet | a lead | builds and commits one piece from the lead's brief |
| `verifier` | opus | the implement orchestrator | checks one milestone against its description and contract |
| `retro` | opus, sonnet, haiku | the `spec-retro` workflow | reads the transcripts: pre-pass, blind readers, synthesis, reconciliation, remediation |

The reviewer, lead, implementer, verifier and retro roles are configurable under
`roles` in `.kentra-rpir.yaml`. The research agents and their models are fixed by
the research skill.

Only the main session receives a background subagent's result and can resume it
with SendMessage. A subagent's own background children report to the main session,
never to the subagent. Two consequences shape the process:

- The research pool runs in the main session, and spikes and researchers run their
  lookups and advisor in the foreground.
- The persistent agent of a milestone is its lead, resumed by the orchestrator. A
  lead does not keep an implementer across its own turns; it briefs a fresh one per
  piece of work.

## The change folder

```
.kentra-rpir.yaml                    # project config (committed)
.kentra-rpir/                        # session state (gitignored)
  sessions.map                       # session id, change folder, stage
  reviewed/<change>/                 # last reviewed copies of spec and plan, and the review's planning log
  research-queue/<session id>.tsv    # one research queue per session
  implement-state.json               # the implement orchestrator's agents and hand-back times
.worktrees/                          # implement worktrees (gitignored)
docs/research/                       # research.dir: reports from research outside a change
  index.jsonl                        # research.index: every finding, project-wide
docs/changes/
  2026-11-05-<slug>/
    spec.md
    plan.yaml                        # standard tier only
    planning-log.jsonl               # trimmed planning sessions
    impl-report.md
    spec-retro.md
    research/
      <slug>.md                      # one report per research job
      spikes/<slug>/                 # a spike's experiment files (gitignored)
```

- One folder per change. There is no `type` in the path; the spec's frontmatter
  says whether it is a feature, bug or chore.
- The folder name is `<date the spec started>-<slug>`, and it never moves. A
  finished change stays where it is with `status: done`.
- `planning-log.jsonl` and the research reports are committed: they are the
  durable record of how the change was defined. Spike experiment files never reach
  git. The plan skill makes sure `.gitignore` holds `.kentra-rpir/`, the
  `worktreesDir` and `<changesDir>/*/research/spikes/`, and `commit-change.sh`
  refuses to commit when spike files are not gitignored or the change folder holds
  a nested git repository.
- The spec's `status` moves `draft` → `agreed` → `planned` → `implementing` →
  `in-review` → `done`.

### `.kentra-rpir.yaml`

The first `/kentra-rpir:plan` in a project writes it from
`templates/kentra-rpir.yaml`, after asking the three fields marked †. Missing keys
take the template's defaults, which are these:

```yaml
changesDir: docs/changes            # † where change folders live
tracker: none                       # † none | github | jira
constitution: false                 # † true: the plan stage and its reviewer read constitution/constitution.md
spec:
  questionBatch: 5                  # max questions asked in one message
roles:                              # agent: a subagent type; model: overrides the agent's own
  reviewer:    { agent: "kentra-rpir:reviewer",    model: opus }    # joint review of spec and plan, and diff reviews
  lead:        { agent: "kentra-rpir:lead",        model: opus }    # one per milestone; resumed for fix rounds
  implementer: { agent: "kentra-rpir:implementer", model: sonnet }  # one per piece of work, dispatched by the lead
  verifier:    { agent: "kentra-rpir:verifier",    model: opus }
  impl-orchestrator: { model: opus }                              # the main session running implement
  retro:       { agent: "kentra-rpir:retro",       model: opus }    # synthesis, reconciliation, remediation
  prepass:     { agent: "kentra-rpir:retro",       model: haiku }   # transcript signals and skeleton timeline
  reader:      { agent: "kentra-rpir:retro",       model: sonnet }  # per-milestone blind readers
research:
  standalone: true                  # false: the research skill runs only inside an rpir stage
  maxParallel: 4                    # research jobs running at once in one session
  maxLookups: 4                     # lookups one job runs at once
  staleMinutes: 60                  # a running job older than this loses its slot
  dir: docs/research                # reports from research outside an rpir change
  index: docs/research/index.jsonl  # project-wide index of findings, checked before any job starts
implement:
  maxParallel: 3                    # milestones in progress at once: a lead each, from dispatch to merge
  cacheWindowMinutes: 5             # a verifier is resumed for re-verification only this soon after its last hand-back
  maxAttempts: 3                    # per blocker: 2 retries with new guidance, then the user
  maxVerifyRounds: 3                # lead → verify → fix rounds per milestone
  worktreesDir: .worktrees          # relative to the project root; gitignored
  branchPrefix: rpir/
  openPullRequest: true             # only when the remote is GitHub and gh is authenticated
```

- A project points a role at its own `.claude/agents/<name>.md` to tune the system
  prompt. The skills read the file on every run, so a change takes effect on the
  next one.
- `roles.impl-orchestrator` has no agent: it is the model the implement session
  should run on. The skill says so before starting when the session runs on
  another model.
- `roles.retro`, `prepass` and `reader` are the `spec-retro` workflow's agents.
- The defaults `research.maxParallel` and `maxLookups` keep the pool within Claude
  Code's 20 concurrent subagents.

## Tiers

The plan stage proposes a tier once it knows the change's size, and the user
confirms it. The spec's frontmatter records it.

| | `small` | `standard` |
|---|---|---|
| Fits | a bug fix, a chore, a change one milestone builds | several components, parallel work, a checkpoint the user wants |
| Planning writes | `spec.md` | `spec.md` and `plan.yaml` |
| Joint review | the spec alone | spec and plan together |
| Implemented as | one milestone built from the spec, with a lead, implementers and a verifier | the plan's milestones |

Both tiers research their premises the same way.

## Premises ledger

The spec's Premises table and the plan's `# premises:` comment block, together,
are the **ledger**. A premise is anything the change assumes is true: how an API
behaves, what a library version supports, what users do. It is recorded only when
the spec or plan would change if it were wrong; what an implementer settles while
writing code is not a premise.

Every premise carries:
- an **importance**: `critical` when, if it is wrong, the shape changes (a
  requirement, a design decision or the milestones); `normal` when it would be
  fixed inside one milestone;
- a **status**: `verified`, `refuted` or `unverified`;
- its **evidence**: a link to the research report that settles it, with the
  source kinds it rests on, or `docs: <URL or file:line@version>` for a direct
  read, or `—` while it is open.

Spec premises are numbered `P1`, `P2`, …; plan premises `PL1`, `PL2`, …, so they
never collide. A premise with evidence is never researched again unless an edit
changes what it rests on: a version, an API, a platform, or the behaviour relied
on.

## Stage 1: plan

**Skill:** `kentra-rpir:plan` · interactive · main session

One session writes both documents of a change: `spec.md`, which the user agrees,
then at the standard tier a coarse `plan.yaml`, which the user approves. The user
decides intent; the session drafts, researches what the change assumes, and
writes it down. It asks the user only about intent, never about facts it can look
up.

1. **Set up.** On first use, write `.kentra-rpir.yaml`. Create the change folder
   (or find an existing one to revise), register the session in
   `.kentra-rpir/sessions.map`, link or create the tracker issue, and read what the
   change touches: the README, the constitution when enabled, the code in the area,
   recent commits.
2. **Ask.** Up to `spec.questionBatch` questions per message when they do not
   depend on each other's answers, one at a time when an answer changes what comes
   next. Multiple choice, with a recommendation first. The questions cover the
   problem, goals, non-goals and how the user will know it works, then what the
   plan builds on:
   - **Layout:** the directory layout of every new module or component.
   - **Abstractions:** the main types and interfaces, their responsibilities, and
     what identifies each entity: what happens when one is deleted, recreated
     under the same key, renamed, or given a new version.
   - **Version pins:** what each pin means: exact, minimum, or newest compatible.

   Each open design choice gets two or three options with trade-offs and a recommendation.
   Each premise goes into the ledger the moment it surfaces.
3. **Propose the tier**, with a one-line reason. The user confirms.
4. **Research the premises** in the background, through the
   [research pool](#research-pool), while the conversation goes on. Every
   critical premise about an outside system is queued as a spike. A normal premise
   gets a docs check only. The session settles a premise itself only when it is
   about this repo's own code, or when it is normal and one or two reads of an
   official doc settle it. On each job's Conclusion it updates the premise's row:
   status from the verdict, evidence as a link to the report. A refuted premise,
   and a critical one left unverified, go to the user at once.
5. **Write `spec.md`** from `templates/spec.md` and show it section by section.
6. **Agree the spec.** Only the user's explicit agreement sets `status: agreed`,
   with Open questions empty. A small-tier change goes on to the joint review.
7. **Write `plan.yaml`** (standard tier), as described under
   [Coarse plans](#coarse-plans). Validate it with `milestoned-plan-dag validate`,
   then show one line per milestone and the DAG from `milestoned-plan-dag resolve`,
   marking what runs in parallel.
8. **Joint review**, once every critical premise's job has reported. See
   [Reviews](#reviews).
9. **Edits and diff reviews** until the user is satisfied.
10. **Approve and commit.** The user approves the plan, or at the small tier the
    reviewed spec. The session waits for this change's running research jobs (or
    tells the user which it drops), sets `status: planned`, writes the planning
    log, and commits the change folder with `scripts/commit-change.sh`, together
    with the research index, `.kentra-rpir.yaml` and `.gitignore` when this
    session changed them.

A later revision goes through steps 9 and 10, committed as `plan: amend <title>`.

### `spec.md`

Markdown with YAML frontmatter. The sections scale with the change, so a bug's spec
can be a few lines.

```markdown
---
title: <short name>
type: feature            # feature | bug | chore
status: draft            # draft | agreed | planned | implementing | in-review | done
tier: standard           # small | standard
issue:                   # tracker link, when a tracker is configured
planningLog: planning-log.jsonl
---

## Problem
## Goals
## Non-goals            # including what the session ruled out
## Premises             # the ledger: importance, status, evidence
## Requirements         # plain, numbered, testable statements
## Layout               # directory layout of every new module or component
## Abstractions         # main types and interfaces, their responsibilities and identity
## Design               # decisions, options not taken, what each version pin means
## Open questions       # must be empty at status: agreed

<!-- writer-gaps: technical gaps the review found and fixed, one per line -->
```

### Coarse plans

The planning session writes `plan.yaml` itself, in milestoned-plan-dag schema
0.4.0. A plan says what to build and why, and how it is checked; the lead reads
the repo and decides how. There are no steps and no code.

- **A milestone** is a deliverable a reviewer could merge on its own: one
  component, or one capability that can be checked on its own. Split only when
  parallel work or a checkpoint needs it. Most changes need 3 to 8 milestones.
- **The plan's `description`** settles what milestones share: file header layout,
  naming rules, which tests need Docker or a real tool, the standard check, and a
  map from each spec requirement to the milestone whose criterion covers it.
- **Each milestone** holds:
  - `goal`;
  - `description`: scope (files and directories, from the spec's Layout), the
    interfaces it provides and uses (from its Abstractions), the decisions it
    follows, and its risks with the premise ids they rest on;
  - `deliverables`: every file, and each type it introduces;
  - `contract`: the repo's standard `check`; one criterion per behaviour, named
    after the test that proves it, or `human:` and what the user checks; and
    `paths`, the milestone's write-set;
  - `depends-on`: every milestone whose output it uses. Order in the file creates
    no edge;
  - `rules`.
- **Parallel work.** Milestones with no dependency path between them get
  non-overlapping `paths`. Shared types, shared files and version pins go in the
  earliest milestone that needs them.
- **Plan premises** go to research like spec premises, and into the `# premises:`
  block at the end of the file.

### Rules

`rules` hold **references, never copies**: a skill name or a file path.

- **Plan-level `rules`** apply to every milestone, for example the constitution and
  the project's architecture skill.
- **Milestone-level `rules`** add only what that milestone needs.
- **Leave out** anything Claude Code loads by itself: `CLAUDE.md`/`AGENTS.md`, and
  path-scoped `.claude/rules/*.md`, which load when a matching file is read.

The lead loads every rule and names it in every brief, the implementer loads it
before writing code, and the verifier grades the code against the same list.

### Reviews

Spec and plan are reviewed together, once, by one fresh `reviewer` (Opus), before
the user approves the plan. Each later edit of substance gets a diff review by
another fresh reviewer. The plan skill dispatches each with the Agent tool from
`skills/plan/reviewer-prompt.md`. The reviewer changes nothing; it reports.

| The edit | Review |
|---|---|
| The finished spec and plan (at the small tier, the spec) | Joint review, once |
| A change to a requirement, goal, non-goal, premise, design decision, layout, abstraction, milestone contract, `paths` or `deliverables`, including an answer to a decision finding | Diff review |
| Wording, typos, formatting; a technical fix applied as the reviewer wrote it | None. The user sees the diff. |

When unsure, run a diff review. The reviewer reads the sources itself: the
planning log (written to `.kentra-rpir/reviewed/<change>/` before each review), the
ledger and the research reports it links, the constitution when enabled, and the
project rules that govern the files the change touches (`CLAUDE.md` and
`AGENTS.md` on their paths, path-scoped `.claude/rules`, and the skills those or
the plan's `rules` call for).

**The joint review** answers a fixed checklist yes or no, with evidence for every
"no":

- **Spec:** every decision the session reached is in the spec, and nothing it did
  not reach; every premise has an importance, a status and evidence, and every
  critical premise about an outside system links a report; nothing relies on a
  refuted premise; requirements are testable; non-goals are complete; Layout and
  Abstractions are given; every pin says what it means; Open questions is empty.
  Two checks catch what only the user caught before:
  - **keys, identity and lifecycle:** for every entity the change stores, names,
    publishes or versions, what identifies it, and what happens on delete,
    recreate, rename and a new version;
  - **adversarial change:** no change that should fail (a deleted-and-recreated
    entity, a renamed key, an edited fixture, a weakened check, a boundary value)
    passes the requirements and criteria as written.
- **Plan:** coverage (every requirement has a milestone criterion); each
  milestone's criteria can be met inside its `paths` from what its dependencies
  produce; cross-milestone interfaces are named on both sides; new dependencies
  are pinned in the earliest milestone; independent milestones do not overlap;
  milestones are coarse, with no steps and no code, 3 to 8 of them or a stated
  reason; criteria name their test; `rules` are references and relevant; nothing
  beyond the spec; `milestoned-plan-dag validate` passes.
- **Rules:** nothing conflicts with the constitution or a project rule.

**A diff review** checks that the diff does what the user decided and nothing
else, contradicts nothing else in the documents, keeps the identity and
adversarial checks true, and leaves the plan valid.

**Each "no" carries one label and its fix.** No separate triage step runs.
- **technical:** one clear answer, such as a missing interface name, an unpinned
  version or overlapping paths. The session applies the fix, tells the user in
  one line, and records it in the spec's `writer-gaps` comment or the plan's
  `# writerGaps:` block. The retro reads these.
- **decision:** ambiguous intent, a trade-off, or a conflict with the session or
  the constitution. The session stops and asks the user, with the reviewer's
  options.

The reviewer also lists the claims it could not check. The session queues the new
or reopened ones as premises and reads each Conclusion against the documents.

## Research pool

**Skill:** `kentra-rpir:research` · main session · background jobs

Research runs as a pool of background Agent-tool jobs, one per question, run by the
main session. It is not a workflow: a running workflow cannot take new questions,
and workflow agents cannot dispatch subagents, which spikes and researchers need.
Questions raised at any time join the queue, and the conversation goes on while
jobs run.

### Sizing

The main session sizes each question at intake:

| Size | When | Agent |
|---|---|---|
| `fact` | one fact with a definite answer: a default, a signature, a release date | `lookup` (haiku) |
| `premise` | a claim the change depends on, `critical` or `normal` | `spike` (sonnet) |
| `survey` | an open question with several candidate answers | `researcher` (opus) |

A fact the session can read itself in one or two reads (a file in the repo, a
`--help`) is answered without a job. A job that finds its question bigger or smaller
than its size says so in its report's Size line instead of growing, and the main
session re-queues it at the right size.

**Premises.** A spike on a `critical` premise reads official docs and source
first, runs experiments when they leave it open, and has the `advisor` read its
evidence and draft conclusion. The advisor re-runs only the decisive experiment
and any anomaly. A `normal` premise gets a docs check only: no experiments, no
advisor. Official docs or source code at the version in question settle a premise
on their own.

**Source labels.** Every lookup labels each source with its kind (official docs;
source code, changelog or release notes; standard; independent paper or
benchmark; vendor benchmark or marketing; community post; secondary summary), its
publisher, its date and the version it describes, and quotes it verbatim. The
spike, researcher and advisor weigh each claim by that label, the date and the
version match. A vendor benchmark, a community post or a secondary summary never
settles a premise on its own. Each report says which kinds of source its
conclusion rests on.

### The queue

`scripts/research-queue.sh add | next | done | list` keeps one queue per Claude
Code session, in `.kentra-rpir/research-queue/<session id>.tsv`.

- **`add`** queues a job and prints its id, unique within the session's queue,
  and its report path. A slug already taken in any session's queue, or on disk,
  gets a numeric suffix (`-2`, `-3`), so a report is never overwritten.
- **`next`** starts queued jobs in arrival order while fewer than
  `research.maxParallel` run. A job running longer than `research.staleMinutes`
  without reporting back is marked stale and loses its slot; the main session
  re-queues it or drops it, and tells the user.
- **`done`** marks a job finished. On each completion the main session runs `next`
  again, so the next queued job takes the free slot.

Each job runs at most `research.maxLookups` lookups at once.

### Reports and the index

- **One report per job.** `## Conclusion` first (answer, verdict, confidence,
  the source kinds it rests on, and a Size line when sized wrong), then
  `## References`. A spike's or researcher's final message is its Conclusion; the
  main session reads only that, and opens the report only when it cannot act on
  the Conclusion. A fact job's lookup returns sources only, and the main session
  writes its report.
- **Where reports go.** Inside an rpir change, to `<change>/research/<slug>.md`,
  with a spike's experiment files in the gitignored `<change>/research/spikes/`.
  Outside one, to `research.dir` and `<research.dir>/spikes/`.
- **The index** (`research.index`) is a project-wide JSONL file. Each job appends
  one row: claim, `subject` as `<name>@<version>`, verdict, confidence,
  conclusion, date and report path. The main session checks it before queueing:
  - the current row for the same claim at the same version, `verified` or
    `refuted`, answers the question, and nothing is queued;
  - a row for another version, or left `unverified`, only points the new job at
    its report;
  - a newer row for the same claim and subject supersedes the older one, which
    stays as history;
  - a row whose report file is missing still counts: its conclusion is in the row.

  Findings therefore carry across changes.

**Spikes are readable.** Each experiment is a file written with the Write tool in
the spike folder, run with one plain command such as `sh <file>`. A changed
experiment is a new file, so every recorded output matches its file. Spikes run no
`git init`.

### Follow-ups

A follow-up on a topic a job already covered is queued as a new job naming the
earlier one. It goes to the same agent with SendMessage when that agent is idle and
finished less than 5 minutes ago, while its prompt cache is warm; otherwise to a
fresh agent, pointed at the earlier report.

### The standalone switch

The pool also runs outside any rpir change, when the user asks for research.
`research.standalone: false` turns that off, for users who keep their own research
workflow: outside an rpir stage, the research skill then stops and runs nothing.

## Stage 2: implement

**Skill:** `kentra-rpir:implement` · main session as the **orchestrator**
(`roles.impl-orchestrator`, Opus)

The session that invokes the skill is the orchestrator. It builds the change
milestone by milestone, each in its own git worktree, independent milestones in
parallel:

| Role | Dispatched by | Lives |
|---|---|---|
| **lead** (`roles.lead`, Opus) | the orchestrator, one per milestone | the whole milestone; resumed with SendMessage for every fix round |
| **implementer** (`roles.implementer`, Sonnet) | the lead, one per piece of work, one at a time | one piece |
| **verifier** (`roles.verifier`, Opus) | the orchestrator, when a lead hands back | one milestone's verification; resumed for a re-verification within the cache window |

What stays fixed is the protocol: DAG order, a verifier independent of the lead
for every milestone, fix rounds to the same lead, and the escalation ladder. The
orchestrator's judgement answers what a lead cannot, resolves merge conflicts,
adjusts the plan without changing the spec, and decides what goes to the user. It
keeps its own context to hand-backs, verdicts and the state file; the leads and
verifiers read the code.

**Why the Agent tool and not a workflow.** Leads dispatch implementers, and only
Agent-tool subagents can dispatch subagents. The Agent tool takes no working
directory, so every dispatch prompt names the worktree's absolute path, and every
agent starts each shell command with `cd <worktree> &&`.

### Worktrees and branches

```
<project>/
  .worktrees/                      # implement.worktreesDir; gitignored
    <slug>/                        # integration worktree, branch rpir/<slug>
    <slug>--m3-<milestone-slug>/   # one per milestone in progress, branch rpir/<slug>--m3
```

- A milestone's worktree branches from the integration branch **after** every
  milestone it depends on has been merged into it. That head is the milestone's
  `base`.
- Milestone worktrees are removed after their branch is merged. The integration
  worktree stays until review is done.

### The orchestrator loop

1. **Start.** Find the change. Stop on a `full` or `light` spec. At the standard
   tier, validate and resolve `plan.yaml`. At the small tier, build the one
   milestone (below) and confirm its contract with the user. Create or resume the
   state file, create the integration worktree, register the session, set
   `status: implementing`, and run the check once for a green baseline.
2. **Dispatch leads.** For every milestone whose dependencies are merged, while
   fewer than `implement.maxParallel` milestones are in progress (a lead
   dispatched, not yet merged or settled as blocked), create its worktree and
   dispatch a lead in the background with `lead-prompt.md`: the spec's path, the
   plan's `description`, the plan-level and milestone `rules`, and the milestone's
   goal, description, deliverables and contract. Ready milestones are dispatched in
   one message so they run in parallel.
3. **Lead hand-backs.** `DONE` goes to verification. `DONE_WITH_CONCERNS` is
   settled first: a concern that a criterion, the check or a documented command
   fails, or cannot run, somewhere is a correctness concern, never noted and passed
   on. `NEEDS_CONTEXT` and `BLOCKED` get an answer, guidance, a plan adjustment or
   the user. `WAITING` is not verified (see [WAITING](#waiting)).
4. **Verify** (see [Verifier rules](#verifier-rules)). A `PASS` integrates; a
   `PASS` with pending `human:` criteria integrates too, and the user checks those
   at the finish. A `FAIL` goes back to the same lead with the findings verbatim.
   After `implement.maxVerifyRounds` FAILs the milestone counts as blocked.
5. **Integrate.** Merge the milestone branch into the integration branch with
   `--no-ff`, resolve any conflict keeping both sides' intent, run the check
   there, remove the milestone worktree, and dispatch whatever is now unblocked.
6. **Finish.** Show the user every pending `human:` criterion, in the integration
   worktree, and record each answer; a rejected one is fixed by a fresh lead in a
   new milestone worktree, verified and integrated first. Then write
   `impl-report.md`, set `status: in-review`, commit, push the integration branch,
   open a pull request when `implement.openPullRequest` is set, the remote is
   GitHub and `gh` is authenticated, and delete the state file.

### Milestone leads

The lead owns the design inside its milestone. It reads enough of the spec and the
repo to cut the milestone into pieces (most need one to four), each work one
implementer finishes and commits in one go. It dispatches a **fresh implementer
per piece**, one at a time because they share the worktree, each from a brief:

- the worktree and branch;
- the piece: what to build and why;
- the files to read, by absolute path, and the spec sections by heading;
- the design calls the lead made for it: names, interfaces, where things go;
- the rules to load, the paths it may change, and the check that must pass;
- in a fix round, the verifier findings the piece settles, verbatim.

The implementer reads the files the brief names and whatever else it needs in the
repo, builds the piece, commits once the check passes, and reports `DONE`,
`DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` or `BLOCKED` with the command and its exit
status. The lead reviews every hand-back (the check line, the paths the commits
touch, the diff where design matters) before the next piece. Something wrong goes
to another fresh implementer whose brief says what is wrong and what right looks
like. Per blocker, the lead allows two fresh tries with new guidance, then hands
back `BLOCKED`.

**Context.** Every resume re-reads the lead's whole context, and after more than 5
minutes it re-writes it at Opus price. So the lead keeps its context to the
milestone, the spec sections it needs, its briefs and the hand-backs; whole files
are the implementers' to read.

The lead decides anything inside the milestone's contract. It hands back
`NEEDS_CONTEXT` or `BLOCKED` instead for a change outside the milestone's paths, a
change to a criterion, the check, an interface the milestone provides or behaviour
the spec describes, a trade-off nobody settled, or a new dependency. It finishes by
running the check itself and handing back the evidence: commits, the check's exit
status and summary, one line per criterion, one line per implementer, and its
decisions, concerns and observations.

### WAITING

A subagent's Agent tool may start an implementer in the background even when the
lead asks for the foreground. The implementer's hand-back then reaches the lead as a
message only while the lead's turn is still going. So:

1. The lead keeps its turn going with bounded waits: while the branch head has not
   moved past the piece's base, a loop of 20-second sleeps up to 240 seconds, which
   keeps its cache warm; once the implementer has committed, short waits until the
   hand-back arrives.
2. When its turn must end while the implementer runs (three long waits with no
   commit, ten short waits with no hand-back, or a shell that refuses `sleep`), the
   lead hands back `STATUS: WAITING`, naming the implementer.
3. The implementer's report then goes to the orchestrator. The orchestrator sets
   the milestone's phase to `waiting`, and when the report arrives resumes the same
   lead with it verbatim. That continues the same round.

A WAITING lead is mid-piece: the orchestrator never verifies it.

### Verifier rules

- **Independent.** Every milestone the lead hands back is checked by a verifier
  that did not build it. The verifier gets the milestone, never the lead's report.
- **Fresh for the first verification** of each milestone.
- **Resumed only within the cache window.** For a re-verification after a fix, the
  orchestrator takes the verifier's last hand-back time from the state file. Within
  `implement.cacheWindowMinutes` it resumes the same verifier with SendMessage,
  while its prompt cache is warm; otherwise, or when it cannot be reached, it
  dispatches a fresh one.
- **A resumed verifier verifies from scratch:** it re-runs the full check,
  re-reads the whole diff from the base, and goes through every check again. Its
  earlier findings are one input, not the scope.

The verifier grades the milestone against its description and contract, in this
order:

1. **Check:** the contract's `check` passes.
2. **Criteria:** a named test exists, asserts what the criterion says (not
   something weaker) and passes; a named command shows what the criterion's `then`
   says; a `human:` criterion is listed as PENDING for the user.
3. **Paths:** `git diff --name-only <base>...HEAD` lists only files in `paths`.
4. **Consumers:** for each changed file, what reads it outside the check's reach
   (another module's build, a script that loads a template, a generator, a test
   suite the check skips) is run. One that now fails is a finding, even when the
   check passes.
5. **Intent:** the whole diff against the milestone's description and the spec
   sections it builds: everything it names is there, and nothing beyond its scope.
6. **Rules:** the code follows every listed rule.

It returns `PASS` or `FAIL` with findings, each tagged with the check it failed.

### The state file

`.kentra-rpir/implement-state.json` records what the orchestrator needs to pick the
run up again. It is rewritten on every dispatch, hand-back, phase change and merge.
Per milestone it holds the worktree, branch and base; the phase (`lead`,
`waiting`, `verify`, `merged` or `blocked`); the lead's and verifier's agent ids
with their last hand-back times; the lead rounds, verify rounds and verifier
resumes; and at the small tier the contract the user confirmed.

**After a session resume or compaction,** the orchestrator re-reads the file and
the integration branch's merges. It waits for agents recorded as running. After a
process resume it tells each lead to continue, and that implementers it started
before the resume are gone: the lead checks the branch for each piece's commit and
briefs a fresh implementer for unfinished work. An agent SendMessage can no longer
reach is replaced by a fresh one; a fresh lead is told the earlier lead's commits
are on the branch.

### Small tier

A small-tier change has no `plan.yaml`. The orchestrator builds one milestone from
the spec: number 1, the change's slug, the spec's title as goal, the files the
Layout names as deliverables and paths, the repo's standard check, and one
criterion per numbered requirement. The user confirms that contract, which stands
in for an approved plan, and it is recorded in the state file. It then runs like
any milestone: a lead, its implementers and a verifier.

### What the orchestrator decides, and what goes to the user

| The orchestrator resolves | The orchestrator asks the user |
|---|---|
| Missing context: it supplies what the lead needs | A change to a requirement or to behaviour the spec describes |
| A technical contradiction with one clear answer | A trade-off the spec did not settle |
| Merge conflicts between milestones | A conflict with the constitution |
| Flaky or environment failures it can fix | Dropping or deferring a milestone, or another change to scope |
| Plan adjustments that keep the spec intact: renaming a file, splitting a milestone, a different patch version | A new dependency, or an API or contract other code relies on that the plan did not name |
| | A blocker still unresolved after two retries |

**Escalation ladder,** per blocker: two retries, each resuming the lead with new
guidance or context, then the user (`implement.maxAttempts`). A failing message is
never re-sent unchanged. Milestones that do not depend on the blocked one keep
going while the user is asked.

**Plan adjustments** are edited into `plan.yaml` on the integration branch,
validated, committed with the reason, and listed in `impl-report.md`. Anything
that would change `spec.md` goes to the user.

### `impl-report.md`

Per milestone: the outcome, lead rounds, implementers, verify rounds (fresh and
resumed) and the merge commit; each verifier FAIL and its findings; pending
criteria and the user's answers; concerns and how each was settled; the lead's
decisions; replaced agents; and what agents observed but did not fix. Then the
plan adjustments, the decisions the user made, and the merge conflicts resolved.
The retro checks every claim in it against the transcripts.

## Stage 3: review

**Skill:** `kentra-rpir:review` · main session, plus the `spec-retro` workflow

Review has two halves, and the user does both.

1. **Process retro.** The skill launches the `kentra-rpir:spec-retro` workflow in
   the background first, with the change's sessions from `sessions.sh list`, the
   planning log, the research folder and index, and each merged milestone's diff
   range.
2. **Code review.** Meanwhile the skill presents the change: the pull request or
   branch, a line per milestone, the verifier findings and concerns, plan
   adjustments, blocked milestones, and anything in `impl-report.md` that needs a
   decision. A small fix the session makes itself; anything bigger is built like a
   milestone, with a fresh lead, a verifier and a merge.
3. **Retro review.** When the workflow finishes, the skill presents
   `spec-retro.md` and goes through each action with the user. Each is
   **applied** (its target is in this repo), **filed** as an issue against
   `kentra-io/kentra-rpir` (its target is one of this plugin's skills, agents,
   workflows or templates), **deferred** or **rejected**.
4. When both are done, the skill sets `status: done` and commits.

### The `spec-retro` workflow

Grounded in the research on agent-session retros (sources at the end).

1. **Pre-pass** (`roles.prepass`).
   - Per implement session: every lead, implementer and verifier of each milestone,
     found flat in the session's `subagents/` folder, with counts of lead rounds,
     implementers, verify rounds and resumes, FAILs, WAITING hand-backs, errors,
     test runs and writes outside `paths`, and a skeleton timeline.
   - Per planning session: the fresh tokens and time of the main session and of
     every agent (reviewers, research jobs, nested lookups and advisors,
     Workflow-tool runs), question rounds, and backward `status:` edits. The
     planning stage starts where the plan skill first loads; everything before it
     is counted on its own line, as work before the plan skill.
2. **Blind readers** (`roles.reader`), one per milestone and one for the planning
   sessions. None of them reads `impl-report.md`. A milestone reader gets the
   spec, the plan, the milestone's diff, its signals and skeleton, and its
   agents' transcripts, starting from the lead's briefs, where a wrong belief
   often starts. It writes a timeline and the **decisive points**: the earliest
   step where an agent acted on a wrong belief, working back from the first visible
   symptom. A milestone with troubled signals is read in full; a clean one is
   skimmed, checking that verification ran what the criteria say, because a
   passing run can still be a lucky pass. The planning reader reads the planning
   log, the spec and plan with their ledgers and writer gaps, and the research
   reports and index, looking for research sized wrong or repeated, premise rows
   that disagree with their reports, gaps the joint review missed, and edits
   without a diff review.
3. **Synthesis** (`roles.retro`). Merge the readers' findings and give each one a
   fault class:

   | Class | Meaning |
   |---|---|
   | `SPEC` | The spec was ambiguous or wrong |
   | `PLAN` | The plan was ambiguous, wrong, or could not be built as written (a missing file, directory, type, interface or pin) |
   | `SKILL` | A skill, agent definition or prompt was missing, wrong or harmful |
   | `PROCESS` | The process itself: a handoff, a verification step, the order of steps |
   | `ENV` | Tools, dependencies, sandbox, flaky infrastructure |
   | `MODEL` | The model failed with adequate context in front of it |

   For each one, describe how the action made sense to the agent at the time, given
   what was in its context. Ask how, not why: an LLM asked why will invent a tidy
   chain of causes. A finding that traces to a premise cites the report the
   premise's row links, and says whether the implementation bore its Conclusion
   out.
4. **Reconciliation** (`roles.retro`, a separate agent). Check every claim in
   `impl-report.md` against the blind findings: **confirmed**, **contradicted** or
   **unsupported**. A contradicted claim is itself a finding.
5. **Remediation** (`roles.retro`). Each finding ends in exactly one action:
   - a diff to a named skill, agent definition, template or `CLAUDE.md`, as before
     and after;
   - an eval case: the prompt, the fixture commit, and what counts as a pass;
   - an automated check: a hook, a lint, a test, a schema rule;
   - "no action, model variance", with the reasoning.

   Prefer an automated check over adding prose. A proposed skill edit must say what
   text it removes, or why its added length pays for itself.

Every workflow prompt opens by stating that the task below is the agent's only
job. Workflow agents receive the user's latest message relayed with their task,
and a small model may answer it instead of doing the task.

### `spec-retro.md`

1. **Header:** the change, tier, commits, the model per role, the plugin and skill
   versions, the sessions read.
2. **Outcome:** two or three sentences, taken from the verifier results rather than
   the report.
3. **Planning cost:** one row per session, part and role, with agent count, fresh
   tokens and time. Work before the plan skill gets its own lines, apart from the
   plan stage, and is not planning cost. A Workflow-tool run shows the tool's own
   token count beside fresh tokens. Then question rounds, status resets, full and
   diff review counts, and research jobs by size.
4. **Research:** one row per report: kind, verdict and confidence, the source kinds
   it rests on, and whether the implementation bore it out.
5. **Implementation cost:** per milestone, lead rounds, implementers, verify rounds
   (fresh and resumed), WAITING hand-backs, fresh tokens for lead, implementers and
   verifiers, and wall time; and the orchestrator's own fresh tokens and wall time.
6. **Self-report reconciliation:** a row per contradicted or unsupported claim,
   with its verdict and evidence, plus a count of the claims confirmed.
7. **Timeline:** planning, then per milestone, with decisive points marked.
8. **Findings:** id, fault class, decisive step with its reference, how it made
   sense at the time, severity.
9. **What went well:** what to keep, so that a fix does not undo it.
10. **Actions:** one per finding, as above, with the user's decision.
11. **Recurring:** fault classes and findings also seen in earlier retros in
    `<changesDir>/*/spec-retro.md`.
12. **Open questions:** what the evidence could not settle.

## Session records

The planning stage keeps one trimmed, redacted log of its sessions in the change
folder; the implement and review stages keep nothing in git, because the retro
reads those transcripts where Claude Code already keeps them.

### Finding sessions

Each stage skill writes `<session id> <change folder> <stage>` to
`.kentra-rpir/sessions.map` when it starts; stages are `plan`, `implement` and
`review`. `scripts/sessions.sh` is the one place that parses the map and finds
transcripts: `sessions.sh list` lists every session registered to a change, with
its stage(s) and transcript path; `sessions.sh transcript` resolves a session id to
its transcript under Claude Code's project directory, falling back to a search when
the project slug does not match. A transcript that cannot be found is reported,
never fatal by itself. Subagent transcripts, nested ones included, sit flat in the
session's `subagents/` folder.

### The planning log

`<change folder>/planning-log.jsonl` is a trimmed, redacted copy of the planning
sessions, written for agents rather than humans by `scripts/planning-log.sh`. It
keeps user messages, assistant text, questions and answers, tool calls (one line
each) and compaction markers. It drops tool results, thinking, and every subagent
and workflow-agent transcript, whose results already live in the research reports
and the review hand-backs. Before each review the plan skill writes it to
`.kentra-rpir/reviewed/<change>/planning-log.jsonl` for the reviewer; on approval it
writes it into the change folder and commits it with the spec and plan.

**Trade-off, accepted:** full transcripts are not in git. Claude Code's transcript
cleanup (`cleanupPeriodDays`, 30 days by default) does not matter, because the retro
runs right after implement.

## The milestone graph pane

While `/kentra-rpir:implement` runs, a side pane draws the plan as a graph, one box
per milestone with its status, and a band above the prompt summarises the run. It
recognises a lead by its `Lead M<n> <slug>` dispatch and a verifier by
`Verify M<n> <slug>`, and reads a small-tier change as one milestone from the spec.
The [README](../README.md#watching-an-implement-run) describes it.

## Plugin layout

```
.claude-plugin/plugin.json      # name, description, version
skills/
  plan/       SKILL.md  reviewer-prompt.md
  research/   SKILL.md
  implement/  SKILL.md  lead-prompt.md  verifier-prompt.md
  review/     SKILL.md
agents/
  reviewer.md  lookup.md  spike.md  researcher.md  advisor.md
  lead.md  implementer.md  verifier.md  retro.md
workflows/
  spec-retro.js
scripts/
  sessions.sh  redact.sh  planning-log.sh  commit-change.sh  research-queue.sh
templates/
  spec.md  impl-report.md  spec-retro.md  kentra-rpir.yaml
hooks/  types/                  # the milestone graph pane
docs/process.md                 # this document
README.md
```

## Sources

Full research reports: [`references/agent-session-retro-research-2026-10.md`](https://github.com/kentra-io/harness/blob/main/references/agent-session-retro-research-2026-10.md) and [`references/rpi-rpir-research-2026-10.md`](https://github.com/kentra-io/harness/blob/main/references/rpi-rpir-research-2026-10.md). The retro method draws on:

- arXiv 2607.09510: failed CLI coding-agent trajectories, decisive-error timing.
- arXiv 2607.28802, "Model or Harness?": attributing failures to the component to
  fix.
- arXiv 2605.29442: misalignment patterns in 20,574 coding-agent sessions,
  including inaccurate self-reporting.
- arXiv 2608.11888: skill-induced failures.
- AgentLens: lucky passes among passing trajectories.
- MAST: "Why Do Multi-Agent LLM Systems Fail?"
- Anthropic, "Demystifying evals for AI agents" (2026-01-09).
- Allspaw on "how" over "why"; Code for America on separating learning from
  remediation; Google SRE on blameless postmortems.
- HumanLayer ACE-FCA and QRSPI; Microsoft HVE Core `/rpi-review`; the agent-retro and
  mattpocock `retro` skills.

The process redesign behind the plan, implement and research design is
[`docs/changes/2026-11-05-process-redesign/spec.md`](changes/2026-11-05-process-redesign/spec.md),
with its research in that folder.
