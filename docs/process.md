# kentra-rpir — process design

kentra-rpir is a Claude Code plugin for running one change — a feature, a bug, a
chore — from idea to merged code, for a solo founder. It is RPI
(Research → Plan → Implement) with an explicit Review stage. "RPIR" is our name for
that composition, not an industry standard: "RPI" was coined by HumanLayer, and
Microsoft's HVE Core adds Review under the same acronym.

It replaces `spec-lifecycle`. The gates, the OpenSpec format, the living specs and
the `lifecycle` CLI are gone. The only machine validation left is the plan schema,
checked by the `milestoned-plan-dag` CLI (0.3.0 or later). The other CLI the process
can use is `constitution`, and only when a project opts into a constitution.

## Principles

1. **Files are the handoff.** Each stage writes a file in the change folder, and
   the next stage reads that file rather than the previous conversation.
2. **Any stage can start any time.** No skill disables model invocation, and nothing
   blocks a stage from running. The user's agreement in the conversation is the only
   "gate".
3. **Check against the source, not against the writer.** An independent reviewer
   checks the spec and the plan before the user sees them. Research agents check the
   facts these documents depend on against primary sources and spikes.
4. **The process records itself.** The planning sessions are kept as a trimmed log
   in the change folder; the retro reads the implementation transcripts where
   Claude Code keeps them.
5. **Configuration over editing skills.** Models, agent definitions and batch sizes
   live in `.kentra-rpir.yaml`, so they can be tuned from any session.

## The change folder

```
.kentra-rpir.yaml                  # project config (committed)
.kentra-rpir/sessions.map          # session id → change folder (gitignored)
.kentra-rpir/plan/<change>/          # the plan's fragments while it is written (gitignored)
docs/changes/
  2026-10-11-<slug>/
    spec.md
    plan.yaml
    planning-log.jsonl             # trimmed spec and plan sessions
    impl-report.md
    spec-retro.md
    research/
      spikes/<slug>/               # spikes and their result.md (gitignored)
```

- One folder per change. There is no `type` in the path; the spec's frontmatter
  says whether it is a feature, bug or chore.
- The folder name is `<date the spec started>-<slug>`, and it never moves. A
  finished change stays where it is with `status: done`.
- `.worktrees/` holds the implement stage's worktrees and is gitignored.
- `planning-log.jsonl` is committed; it is the durable record of how the change was
  defined. `research/` holds the research reports, named `<stage>-<slug>.md`
  (`spec-`, `plan-`, and `<stage>-review-`, `<stage>-skeleton-review-` or `<stage>-diff-review-` for self-review research). `research/spikes/` holds every
  spike and its `result.md` and is gitignored with the pattern
  `<changesDir>/*/research/spikes/`; `commit-change.sh` refuses to commit while the
  pattern is missing.

### `.kentra-rpir.yaml`

Written by the `spec` skill the first time it runs in a project. It asks for the
fields marked † and uses the defaults for everything else.

```yaml
changesDir: docs/changes            # †
tracker: none                       # † none | github | jira
constitution: false                 # † true when constitution/constitution.md exists and should be used
tier: full                          # † full | light
spec:
  questionBatch: 5                  # max questions asked in one message
roles:                              # agent: a subagent type; model: overrides the agent's own
  reviewer:    { agent: kentra-rpir:reviewer,    model: opus }    # spec and plan self-review
  plan-writer: { agent: kentra-rpir:plan-writer, model: opus }    # one per milestone, fills the plan skeleton
  implementer: { agent: kentra-rpir:implementer, model: sonnet }
  verifier:    { agent: kentra-rpir:verifier,    model: opus }
  impl-orchestrator: { model: opus }                            # the main session running implement
  retro:       { agent: kentra-rpir:retro,       model: opus }    # synthesis, reconciliation, remediation
  prepass:     { agent: kentra-rpir:retro,       model: haiku }   # transcript signals and skeleton timeline
  reader:      { agent: kentra-rpir:retro,       model: sonnet }  # per-milestone blind readers
research:
  workflow: kentra-rpir:research    # or a user/project workflow with the same args contract
  checker: sonnet                   # tier-1 docs check, one per topic
  designer: opus                    # splits an escalated premise into spike experiments
  reasoner: opus                    # judges the spike, writes the verdict
implement:
  maxAttempts: 3                    # per blocker: 2 re-dispatches with guidance, then the user
  maxVerifyRounds: 3                # implement → verify → fix rounds per milestone
  worktreesDir: .worktrees          # nested in the project root; gitignored
  branchPrefix: rpir/
  openPullRequest: true             # only when the remote is GitHub and gh is authenticated
```

**Tiers.** `tier` is the default for every change; the spec records its own and the
spec stage recommends the other tier when a change fits it better. `full` researches
every claim that is not in the ledger and writes complete code in every plan step.
`light` researches only `critical` claims, leaves `normal` ones `unverified` (evidence
`—`; the self-review accepts that at `light`), and writes each step with the best code
available knowledge supports — a step resting on an unverified premise names it and
states the outcome its code must reach. Both tiers spike a `critical` claim the docs
don't settle.

A project points a role at its own `.claude/agents/<name>.md` to tune the system
prompt. The skills read this file and pass the values to the workflows as `args`, so a
change takes effect on the next run.

## Premises ledger

The spec's Premises table and the plan's `# premises:` block, together, are the
**ledger**. Every premise carries an importance — `critical` when, if it is wrong, the
shape changes (the milestones, a design decision or the approach); `normal` when it
would be fixed inside one milestone — a status (`verified`, `refuted` or
`unverified`) and its evidence (`docs: <source>` or `spike: research/spikes/<slug>/`).
A premise is recorded only when the spec or plan would change if it were wrong; what
an implementer settles while writing code is not a premise.

Every premise is researched once: the spec stage's own research, the plan stage's
research, and every self-review all skip a premise already in the ledger, whatever
its status. A ledger premise is **re-opened**, and its row updated in place, only
when a later edit changes something it rests on — a version, an API, a platform, or
the behaviour relied on.

## Stage 1 — spec

**Skill:** `kentra-rpir:spec` · interactive · main session

The spec stage turns an idea into `spec.md`, which the user and the agent agree on.
It ends only when the user says they are aligned.

1. **Set up.** On first use, write `.kentra-rpir.yaml` (above). Create the change
   folder and record `${CLAUDE_SESSION_ID}` → folder in `.kentra-rpir/sessions.map`.
   If a tracker is configured, link the existing issue or create one.
2. **Explore context.** Read the project files that matter: the README, the
   constitution if it is enabled, the code in the area of the change, and recent
   commits.
3. **Ask.** Ask the questions together, up to `spec.questionBatch` per message,
   whenever they do not depend on each other's answers. Ask one at a time when
   an answer changes what to ask next. Prefer multiple choice. Record each
   **premise** (something the change assumes is true) as it surfaces, only when the
   spec or plan would change if it were wrong, with its importance: `critical` when,
   if it is wrong, the shape changes — a requirement, a design decision or the
   milestones; `normal` when it would be fixed inside one milestone. When the change
   fits the other tier better than the config's default, the skill recommends it and
   the user chooses.
4. **Research in the background.** At the change's tier (`full`: every premise;
   `light`: `critical` premises only), for each premise about an external system
   (an API, a library version, a protocol, another product's behaviour) that is not
   already in the [ledger](#premises-ledger), start the research workflow in the
   background and keep talking. Research checks the docs and source at the pinned
   version first, and spikes only a `critical` premise the docs can't settle at high
   confidence, or one marked `spike: true`; spikes stay in the change's gitignored
   `research/spikes/` (see [Research](#research)). Results update the premise's
   status: `verified`, `refuted` or `unverified`. A refuted premise is raised with
   the user straight away.
5. **Propose approaches.** For the design choices, give 2–3 options with
   trade-offs and a recommendation.
6. **Write `spec.md`** from `templates/spec.md`, and show it section by section.
7. **Self-review** (see [Self-review](#self-review)) against the planning log,
   the constitution and the project rules.
8. **Agree.** Once the user says the spec is right, set `status: agreed` and commit
   the change folder.

### `spec.md`

Markdown with YAML frontmatter. The sections scale with the change, so a bug's spec
can be a few lines.

```markdown
---
title: <short name>
type: feature            # feature | bug | chore | ...
status: draft            # draft | agreed | planned | implementing | in-review | done
issue:                   # tracker link, when configured
planningLog: planning-log.jsonl   # trimmed spec and plan sessions, written when the plan is approved
---

## Problem
## Goals
## Non-goals
## Premises             # each with importance, status (verified | refuted | unverified) and evidence
## Requirements         # plain, numbered, testable statements
## Design               # decisions and their rationale; the options not taken
## Open questions       # must be empty at status: agreed
```

## Stage 2 — plan

**Skill:** `kentra-rpir:plan` · mostly hands-off · main session

The plan stage turns `spec.md` into `plan.yaml`: a DAG of milestones detailed enough
that an implementer never needs to explore the codebase to learn what to do.

1. **Read** `spec.md`, the constitution if it is enabled, and the code the change
   touches. Record the session in `sessions.map`.
2. **Research the plan's shape.** The research workflow checks the claims the
   plan's shape rests on, at the change's tier, skipping any premise already in
   the [ledger](#premises-ledger).
3. **Write the skeleton.** The main session is the plan's author. It writes the
   plan as fragments in `.kentra-rpir/plan/<change>/`: `head.yaml`, one file per
   milestone, `tail.yaml`. Each milestone has its goal, description, deliverables
   (with the full signature of every type that crosses milestones), contract,
   explicit `depends-on` and `rules`, and a placeholder step.
   `scripts/assemble-plan.sh` concatenates the fragments into `plan.yaml`, and
   `milestoned-plan-dag validate` checks it.
4. **Skeleton review.** Self-review in `skeleton` mode checks the shape:
   coverage, paths, pins, independence, scope, validity.
5. **Write the milestones.** The `plan-milestones` workflow runs one writer
   (`roles.plan-writer`, Opus) per milestone, in parallel. Each fills its own
   fragment — steps with their code, criteria with given/when/then — keeping the
   skeleton's contract, and returns the claims it depends on and any interface
   request. The workflow researches those claims at the tier and has each writer
   whose claims research did not verify revise its milestone. The author settles
   interface requests, re-running a writer with `only` and the author's `guidance`
   when needed, and records outcomes in `# premises:`.
6. **Self-review** — split: one reviewer per milestone, one for the plan as a
   whole, merged by a consolidator — against the spec, the constitution and the
   project rules.
7. **Present** each milestone as a single line with its goal and tests, then the
   DAG and any flagged items. A "how" decision — file layout, milestone structure,
   module split, order of work — is written into `plan.yaml`, never into `spec.md`.
   The spec changes only for a requirement, goal, non-goal or design decision, as a
   **spec amendment**: the smallest edit, a diff review, the user's approval, and a
   commit — `status` stays `agreed`, never reset to `draft`. Once the user approves
   the plan, write the planning log, set `status: planned`, and commit.

### Rules

`rules` hold **references, never copies**: a skill name or a file path.

- **Plan-level `rules`** apply to every milestone, for example the constitution and
  the project's architecture skill.
- **Milestone-level `rules`** add only what that milestone needs.
- **Leave out** anything Claude Code loads by itself: `CLAUDE.md`/`AGENTS.md`, and
  path-scoped `.claude/rules/*.md`, which load when a matching file is read.

The implementer loads every rule before starting. The verifier grades the code
against the same list. The plan self-review checks that the list is minimal, and when
the enabled skills bring in rules that are too many or irrelevant, it suggests
trimming the skills enabled in the project or the user space.

## Self-review

**Workflow:** `kentra-rpir:self-review` · run by `spec` and `plan` before the user sees
the document

A new document gets a **full** review, once. A later edit to a reviewed or agreed
document gets a **diff** review, or none, by how much it changes:

| The edit | Review |
|---|---|
| A new document | First spec: full self-review, once. First plan: skeleton review, then full self-review, once each. |
| An edit that changes a requirement, goal, non-goal, premise, design decision, milestone contract, `paths`, `deliverables`, or step code | Diff review. |
| Wording, typos, formatting; applying a self-review `technical` fix verbatim | No review. The user sees the diff. Technical fixes still go to the writer-gaps list. |

When unsure, use a diff review.

| Stage | Document | Checked against |
|---|---|---|
| spec | `spec.md` | the planning log, the constitution, project rules |
| plan | `plan.yaml` | `spec.md`, the constitution, project rules |

"Project rules" are the rules that govern the files the change will touch: the
`CLAUDE.md`/`AGENTS.md` files on their paths, path-scoped `.claude/rules`, and the
skills those files call for.

1. **Review.** In full mode, the reviewer role answers a fixed checklist with
   **yes or no**, citing evidence for every "no". The spec checklist asks whether
   the spec says what the session decided, whether every premise has an importance,
   a status and evidence, and whether any requirement conflicts with a rule. The
   plan checklist asks whether every requirement lands in a milestone; whether each
   milestone's criteria can be met within its own `paths`, using only what its
   dependencies produce; whether every cross-milestone type is named; whether
   versions are pinned; whether independent milestones overlap; and whether `rules`
   are minimal and relevant. In diff mode, the reviewer reads only the diff against
   the last reviewed or agreed version and checks that it does what the user decided
   and nothing else, and that it contradicts nothing else in the document (or, for a
   plan diff, in the spec); a plan diff also checks that
   `milestoned-plan-dag validate` still exits 0.

   A plan's full review is split: one reviewer per milestone answers the
   milestone checks (P2, P3, P6–P11) from that milestone's fragment, one plan-wide
   reviewer answers P1, P4, P5 and P12 (P5 from `milestoned-plan-dag resolve`), and a
   consolidator — the review's orchestrator — merges them, settles conflicts, and adds
   the cross-milestone gaps no single reviewer could see. A skeleton review answers
   P1, P2, P4, P5, P11 and P12 on the skeleton.
2. **Research.** The reviewer lists the claims it could not check, each with its
   importance. The workflow skips any claim already in the
   [ledger](#premises-ledger), whatever its status — there is no cap on how many
   claims are researched — and re-researches a ledger premise only when the
   document changes what it rests on. It runs the research workflow on the rest and
   gives the results back to the reviewer. At the `light` tier only `critical` claims
   are researched; `normal` ones come back as `unverified`.
3. **Triage.** For each "no" or unresolved claim, the reviewer decides:
   - **Needs a decision.** Intent is ambiguous, there is a trade-off, the document
     conflicts with the session, the document conflicts with the constitution, or a
     `critical` premise stays unverified after research. The main session stops and
     asks the user. The user decides, and the main session then edits the spec, the
     plan or the rule (through an ADR).
   - **Technical gap.** The writer missed something whose answer is clear: a missing
     type name, an unpinned version, overlapping `paths`. The main session applies
     the fix, tells the user in one line, and appends it to the document's
     **writer gaps** list (an HTML comment at the end of `spec.md`, a `# writerGaps:`
     comment block at the end of the plan, since the plan schema allows no extra keys). The retro reads these as evidence about the
     skills.

The reviewer reads the constitution directly. Self-review does not produce
`deviation.json`.

## Stage 3 — implement

**Skill:** `kentra-rpir:implement` · main session as the **orchestrator**
(`roles.impl-orchestrator`, Opus)

The implement stage follows the `subagent-workflow` pattern from `kentra-skills`: the
session that invokes the skill *is* the orchestrator. It dispatches the implementer
and verifier for each milestone as subagents with the Agent tool, in the background,
with `cwd` set to the milestone's worktree, so several milestones run at once.
Judgement stays with the orchestrator: asking the user, handing an implementer
missing context, adjusting the plan, resolving merge conflicts. What stays
deterministic is the protocol: the order comes from the DAG, every milestone passes a
fresh verifier, and the escalation ladder is fixed.

**Why not a workflow per milestone.** Workflow `agent()` takes no working directory.
A test on Claude Code 2.1.296 showed each workflow agent starts in the session's
directory at the moment it spawns, so parallel runs launched from different worktrees
drift into whichever directory the orchestrator moved to last. The Agent tool's `cwd`
is the only supported way to pin a subagent to a worktree. (`isolation: 'worktree'`
chooses its own location and base branch.)

If the session is not on the model set for `roles.impl-orchestrator`, the skill says
so before starting.

### Worktrees and branches

```
<project>/
  .worktrees/                      # implement.worktreesDir; gitignored
    <slug>/                        # integration worktree, branch rpir/<slug>
    <slug>--m3-<milestone-slug>/   # one per running milestone, branch rpir/<slug>--m3
```

- The orchestrator creates the worktrees itself with `git worktree add`, and runs each
  subagent in its milestone's worktree (the Agent tool's `cwd`).
- A milestone's worktree branches from the integration branch **after** every
  milestone it depends on has been merged into it.
- Milestone worktrees are removed after their branch is merged. The integration
  worktree stays until review is done.

### The orchestrator loop

1. **Start.** Check `plan.yaml` validates, run `milestoned-plan-dag resolve`, read
   `.kentra-rpir.yaml`, record the session in `sessions.map`, create the integration
   worktree and set `status: implementing`.
2. **Dispatch an implementer** (`roles.implementer`) for every milestone whose
   dependencies are merged, each in its own new worktree. It gets the plan-level
   context (the plan's `description` and plan-level `rules`) and the milestone's full
   text — description, deliverables, steps, contract, milestone `rules` — never the
   plan file. It commits on the milestone branch and returns one of:
   - `DONE` → verify.
   - `DONE_WITH_CONCERNS` → read the concerns; settle the ones about correctness or
     scope, then verify.
   - `NEEDS_CONTEXT` → supply the context and re-dispatch.
   - `BLOCKED` → decide (table below), then re-dispatch or ask the user.
3. **Dispatch a fresh verifier** (`roles.verifier`) in the same worktree — never the
   implementer's context. It checks:
   - the `check` command passes;
   - every criterion holds: a named test exists, asserts what the criterion says and
     passes; a named command shows what the criterion's `then` says; a criterion
     naming `human:` in place of a test is left to the user, who checks it at the
     finish;
   - the diff stays inside `paths`;
   - the code does what the milestone's description and steps intend;
   - the code follows every rule in the plan-level and milestone `rules`.

   It returns `PASS` or `FAIL` with findings. On `FAIL`, re-dispatch the implementer
   with the findings, then verify again, up to `implement.maxVerifyRounds`.
4. **Integrate** on `PASS`: merge the milestone branch into the integration branch,
   resolve any conflict, run `check` there, remove the milestone worktree, and
   dispatch whatever is now unblocked.
5. **Finish.** Show the user every PENDING (`human:`) criterion the verifiers found,
   in the integration worktree, and record each answer; a rejected one is fixed in a
   new milestone worktree, verified and integrated before the report. Then write
   `impl-report.md`, push the branch, open a pull request when
   `implement.openPullRequest` is set and the remote is GitHub, and set
   `status: in-review`.

Subagents return short, structured reports (status, commits, findings, concerns), so
the orchestrator's context grows by a few lines per dispatch, not by the work itself.

### What the orchestrator decides, and what goes to the user

The implementer follows the milestone exactly. The orchestrator exists to unblock it
without letting it deviate silently.

| The orchestrator resolves | The orchestrator asks the user |
|---|---|
| Missing context: it supplies what the implementer needs | A change to a requirement or to behaviour the spec describes |
| A technical contradiction with one clear answer | A trade-off the spec did not settle |
| Merge conflicts between milestones | A conflict with the constitution |
| Flaky or environment failures it can fix | Dropping or deferring a milestone, or other change to scope |
| Plan adjustments that keep the spec intact: renaming a file, reordering or adding a step, splitting a milestone, pinning a different patch version | A new dependency, or an API or contract other code relies on that the plan did not name |
| | A blocker still unresolved after two re-dispatches |

**Escalation ladder,** per blocker: two re-dispatches with new guidance or context,
then stop and ask the user (`implement.maxAttempts: 3`). Never re-send a failing
dispatch unchanged. Milestones that do not depend on the blocked one keep going
while the user is asked.

**Plan adjustments** are edited into `plan.yaml` on the integration branch, validated,
committed, and listed in `impl-report.md` with the reason. Anything that would change
`spec.md` goes to the user.

### `impl-report.md`

Per milestone: the outcome, the number of dispatches and verify rounds, each verifier `FAIL` and its
findings, `DONE_WITH_CONCERNS` notes, and what the agents observed but did not fix.
Then the plan adjustments, the decisions the user made, and the merge conflicts
resolved.

## Stage 4 — review

**Skill:** `kentra-rpir:review` · main session, plus the `spec-retro` workflow

Review has two halves, and the user does both.

1. **Code review.** The skill presents the change: the pull request or branch, a
   per-milestone summary, the verifier's findings, blocked milestones, and anything
   in `impl-report.md` that needs a decision.
2. **Process retro.** At the same time, the skill launches the `spec-retro` workflow
   in the background. When it finishes, the skill presents `spec-retro.md` and goes
   through each proposed action with the user. Each action is **applied** (when its
   target is in this repo), **filed as an issue** (against `kentra-io/kentra-rpir`
   when the target is one of this plugin's skills or workflows), **deferred** or
   **rejected**.
3. When both are done, the skill sets `status: done` and commits.

### The `spec-retro` workflow

Grounded in the research on agent-session retros (sources at the end).

1. **Pre-pass** (`roles.prepass`). Parse each implement transcript into signals —
   tool calls, errors and non-zero exits, repeated commands, files touched outside
   `paths`, test results, interventions, compaction events — and a skeleton timeline
   per milestone.
2. **Blind readers**, one per milestone (`roles.reader`). Each gets the spec, the
   plan, the milestone's diff, its skeleton and its transcript, but **not**
   `impl-report.md`. It writes a timeline, the **decisive points** (the earliest step
   where the agent acted on a wrong belief, working back from the first visible
   symptom), and quoted evidence with a transcript reference for every claim.
   Every blocked or retried milestone is read in full. A clean milestone is read in
   full only when its signals show retries, writes outside `paths` or missing
   verification, because a passing run can still be a lucky pass.
3. **Synthesis** (`roles.retro`). Merge the readers' findings and give each one a
   fault class:

   | Class | Meaning |
   |---|---|
   | `SPEC` | The spec was ambiguous or wrong |
   | `PLAN` | The plan was ambiguous, wrong, or could not be built as written (a missing step, file, directory, type or pin) |
   | `SKILL` | A skill, agent definition or prompt was missing, wrong or harmful |
   | `PROCESS` | The workflow itself: a handoff, a verification step, the order of steps |
   | `ENV` | Tools, dependencies, sandbox, flaky infrastructure |
   | `MODEL` | The model failed with adequate context in front of it |

   For each one, describe how the action made sense to the agent at the time, given
   what was in its context. Ask how, not why: an LLM asked why will invent a tidy
   chain of causes.
4. **Reconciliation** (`roles.retro`, a separate agent). Check every claim in
   `impl-report.md` against the blind findings: **confirmed**, **contradicted** or
   **unsupported**. A contradicted claim is itself a finding. The report lists only
   the contradicted and unsupported claims, with a count of how many others were
   confirmed.
5. **Remediation** (`roles.retro`). Each finding ends in exactly one action:
   - a diff to a named skill, agent definition, template or `CLAUDE.md`, as before
     and after;
   - an eval case: the prompt, the fixture commit, and what counts as a pass;
   - an automated check: a hook, a lint, a test, a schema rule;
   - "no action — model variance", with the reasoning.

   Prefer an automated check over adding prose. A proposed skill edit must say what
   text it removes, or why its added length pays for itself.

A **planning pre-pass** (`roles.prepass`), one per spec or plan session, reads that
session's workflow runs for duration, agent count and tokens, its question rounds,
and any `status:` reset in `spec.md` or `plan.yaml`. A **planning reader**
(`roles.reader`), run alongside the milestone readers, reads the planning log, the
spec and plan with their writer-gap lists and premises ledger, and the planning
metrics — never `impl-report.md` — looking for research or review whose cost did
not match the risk, a plan gap the self-review should have caught, status resets
and re-reviews, and questions the user had to ask that a stage should have
answered.

### `spec-retro.md`

1. **Header:** the change, the commits, the model per role, the plugin and skill
   versions, the sessions read.
2. **Outcome:** two or three sentences, taken from the verifier's results rather
   than the report.
3. **Planning cost:** per spec or plan session, the self-review workflow's stage
   and mode, duration, agent count and tokens; then question rounds, status
   resets, full and diff review counts, and the planning workflows' total wall
   time.
4. **Implementation cost:** per milestone, the implementer dispatches, verify
   rounds, fresh tokens and wall time; and the orchestrator's own fresh tokens and
   wall time.
5. **Self-report reconciliation:** a row per contradicted or unsupported claim,
   with its verdict and evidence, plus a count of the claims confirmed.
6. **Timeline:** per milestone, with decisive points marked.
7. **Findings:** id, fault class, decisive step with its reference, how it made
   sense at the time, severity.
8. **What went well:** what to keep, so that a fix does not undo it.
9. **Actions:** one per finding, as above.
10. **Recurring:** fault classes and findings also seen in earlier retros in
   `docs/changes/*/spec-retro.md`.
11. **Open questions:** what the evidence could not settle.

## Session records

The spec and plan stages keep one trimmed, redacted log of their sessions in the
change folder; the implement and review stages keep nothing in git, because the
retro reads those transcripts where Claude Code already keeps them.

### Finding sessions

Each stage skill writes `<session id> <change folder> <stage>` to
`.kentra-rpir/sessions.map` when it starts, using the plain change folder path for
every stage, including implement and review. `scripts/sessions.sh` is the one place
that parses the map and finds transcripts: `sessions.sh list` lists every session
registered to a change, with its stage(s) and transcript path; `sessions.sh transcript`
resolves a session id to its transcript under Claude Code's project directory,
falling back to a search when the project slug does not match. A transcript that
cannot be found is reported, never fatal by itself.

### The planning log

`<change folder>/planning-log.jsonl` is a trimmed, redacted copy of the spec and plan
sessions — written for agents, not for reading by humans — kept by
`scripts/planning-log.sh`. It keeps user messages, assistant text, questions and
answers, tool calls (one line each) and compaction markers; it drops tool results,
thinking, and every subagent and workflow-agent transcript, whose results already
live in `research/` and the self-review output. The plan skill writes it when the
user approves the plan, and commits it in the same commit as `plan.yaml`. Before
every spec self-review, the spec skill runs `planning-log.sh` into the gitignored
`.kentra-rpir/reviewed/<change folder name>/planning-log.jsonl` and passes that
path as `transcripts`.

**Trade-off, accepted:** full transcripts are not in git. Claude Code's transcript
cleanup (`cleanupPeriodDays`, 30 days by default) does not matter, because the retro
runs right after implement.

## Workflow prompts

Workflow agents receive the user's latest message relayed alongside their task, and a
small model may answer that message instead of doing the task (seen in the cwd test).
Every workflow prompt therefore opens by stating that the task below is the agent's
only job and that the relayed message is background.

## Research

**Workflow:** `kentra-rpir:research` — the user-space `research` workflow, adapted.

Research runs in two tiers, and never twice for the same premise (see
[Premises ledger](#premises-ledger)):

1. **Check** (`research.checker`, Sonnet). One per topic, all in parallel. It reads
   the official docs and changelog for the version in question, the source at that
   version, and field reports, and returns a verdict (`verified`, `refuted` or
   `unverified`) with a confidence (`high`, `medium` or `low`) and its evidence. It
   runs no code.
2. **Spike**, only for a topic that escalates:

   ```
   topic.spike === true, or
   topic.importance === 'critical' and the check's confidence is not 'high'
   ```

   A **designer** (`research.designer`, Opus) splits the premise into independent
   experiments — one per platform, version or edge case — writes each as a file, and
   runs each once. A **judge** (`research.reasoner`, Opus) reads every file, re-runs
   every experiment itself, judges from its own runs, and writes `result.md`.

The checker writes its own report file, `<prefix>-<slug>.md`.

A topic the docs cannot settle, and that does not escalate, stays `unverified` with
a note that a spike is available on request.

**Spikes are readable.** Every spike is a file written with the Write tool and run
with one short command (`sh <file>`, `node <file>`, …) — never a heredoc, an inline
`-c`/`-e` program, chained or piped commands, a background process, command
substitution, a redirect, or anything that reads stdin.

**Spikes stay out of git.** Every spike file, its output and its `result.md` live in
`<change folder>/research/spikes/<prefix>-<slug>/`, gitignored by the pattern
`<changesDir>/*/research/spikes/`.

`research.workflow` can point at any workflow with the same `args` contract, such as
the user's own `research`.

## Plugin layout

```
.claude-plugin/plugin.json      # name: kentra-rpir
skills/
  spec/SKILL.md   plan/SKILL.md   implement/SKILL.md   review/SKILL.md
agents/
  reviewer.md  plan-writer.md  implementer.md  verifier.md  retro.md
workflows/
  self-review.js  spec-retro.js  research.js  plan-milestones.js
scripts/
  sessions.sh  redact.sh  planning-log.sh  commit-change.sh  assemble-plan.sh
templates/
  spec.md  impl-report.md  spec-retro.md  kentra-rpir.yaml
docs/process.md                 # the user-facing process doc, derived from harness/kentra-rpir.md
README.md
```

Agents define the system prompt and the default model only; they do not restrict
tools.

## Sources

Full research reports: [`references/agent-session-retro-research-2026-10.md`](https://github.com/kentra-io/harness/blob/main/references/agent-session-retro-research-2026-10.md) and [`references/rpi-rpir-research-2026-10.md`](https://github.com/kentra-io/harness/blob/main/references/rpi-rpir-research-2026-10.md). The retro method draws on:

- arXiv 2607.09510 — failed CLI coding-agent trajectories, decisive-error timing.
- arXiv 2607.28802 — "Model or Harness?": attributing failures to the component to
  fix.
- arXiv 2605.29442 — misalignment patterns in 20,574 coding-agent sessions,
  including inaccurate self-reporting.
- arXiv 2608.11888 — skill-induced failures.
- AgentLens — lucky passes among passing trajectories.
- MAST — "Why Do Multi-Agent LLM Systems Fail?"
- Anthropic, "Demystifying evals for AI agents" (2026-01-09).
- Allspaw on "how" over "why"; Code for America on separating learning from
  remediation; Google SRE on blameless postmortems.
- HumanLayer ACE-FCA and QRSPI; Microsoft HVE Core `/rpi-review`; the agent-retro and
  mattpocock `retro` skills.
