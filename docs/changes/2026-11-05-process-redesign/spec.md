---
title: Leaner kentra-rpir — coarse plans, spike reports, milestone leads, lighter verification
type: feature
status: in-review
tier: standard
issue:
---

## Problem

Planning in kentra-rpir costs far more than it returns. Over three changes
(continuous-producers, proto-to-avro, proto3-schema-libraries) planning-stage
workflows used 43.75M tokens, and the superseded protobuf-java-schemas change
another 15.8M (research/planning-cost-analysis.md). About half was design
exploration before any spec skill loaded. Of the 21.8M spent inside the
pipeline, the plan stage took about 15.5M.

What the evidence says (research/verification-yield.md,
research/models-review-split-context.md, research/external/index.md):

- **Plans carry full code.** Opus plan writers are about 37% of
  dollar-weighted cost. Implementers copied the code byte for byte, and
  verifiers on those milestones (proto3 M1–M13) found nothing. No source
  from 2026-07 to 2026-11 recommends code in plan steps.
- **Parallel writers drift.** 19 writers produced 27 interface requests and
  23 "no" answers in review (proto3 retro F21).
- **Verification steps redo each other.**
  - Spike judges re-run every experiment; no re-run ever differed.
  - Triage never dropped a finding; it added 2 in four changes.
  - In split plan reviews, 32% of the 44 milestone reviewers found nothing.
- **Opus is 90% of dollar-weighted cost.**
- **Every subagent carried about 20–30k tokens of unused harness context.**

## Goals

1. Planning produces three first-class artifacts:
   - the spec, with premises that reference spike reports;
   - one spike report per spiked premise;
   - a coarse milestone plan with no code.
2. The spec settles the directory layout of new modules or components, and
   the main abstractions, with the user.
3. Premises are spiked asynchronously while the conversation continues. The
   planning session reads only each report's conclusions.
4. One plan writer writes the whole plan.
5. Every judgement gets one independent check, placed where the evidence
   shows checks catch defects. Steps that only redo the previous step are
   removed.
6. Implementation keeps an independent contract verifier per milestone.
7. The plugin never asks for red-green test runs.

## Non-goals

- **Tool allowlists in agent frontmatter.** The user chose to deny only
  `SendFeedback`, `ReportFindings` and `ShareOnboardingGuide`, at user
  level, and set `enableArtifact: false`. Both are done in
  `~/.claude/settings.json`, outside this repo.
- **Rules that override Ultracode.** The user will test the plugin with and
  without it first.
- **Cost monitors or token budgets.**
- **Red-green or test-first ordering in plans, implementers or verifiers.**
  Rejected by the user. External evidence shows no gain from red-green
  inside the implementer loop (research/external/agentic-verification.md).
- **The Claude Code advisor tool (`/advisor`).**
  - It is session-wide and inherited by every subagent, with no per-agent
    switch.
  - Each call re-reads the whole transcript uncached.
  - Opus 5.x advice is encrypted, so the retro could not read it
    (research/external/agent-role-patterns.md).
  - Advisors here are ordinary subagents.

## Premises

| # | Premise | Importance | Status | Evidence |
|---|---|---|---|---|
| P1 | A subagent dispatched with the Agent tool can itself dispatch subagents (an Opus advisor, Haiku lookups). Workflow `agent()` subagents cannot: they have no Agent tool. | critical | verified | probe 2026-11-05 (nest-probe): a general-purpose subagent spawned a child and resumed it with SendMessage; workflow agents in research/../agents.json carry no `Agent` tool |
| P2 | Nesting reaches three levels: orchestrator → milestone lead → implementer → lookup. | critical | verified | docs: code.claude.com/docs/en/sub-agents (fetched 2026-11-05) "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation."; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` changes it |
| P3 | A subagent's prompt cache lives 5 minutes. A subagent resumed with SendMessage after a longer gap re-writes its whole history. | normal | verified | 578be2d0 M26 implementer: resumed after 7 s, read 58.7k from cache and wrote 0.8k; resumed after 5.6 min, wrote 61.0k and read 0 |
| P4 | A milestoned-plan-dag plan can hold coarse milestones with no steps. | critical | verified | milestoned-plan-dag branch `schema-0.4.0-no-steps` (e451450) removes `steps`; `go test ./...` passes and a plan with steps is rejected |
| P5 | Most fix rounds come back within the 5-minute cache window, so a resumed verifier would usually hit cache. | normal | verified | 578be2d0: verifier hand-back → next verifier start was 3m17s (M19), 3m42s (M23), 9m43s (M22), 3m05s (M26), 1m05s and 0m48s (M25) |
| P6 | A subagent can wait for a child it started in the background, or resumed with SendMessage, across the end of its own turn. | critical | refuted | probe 2026-11-05 (nest-probe2): the lead ended its turn after starting a background child and handed back at once; the child's result went to the main session, and the lead was never woken. A foreground Agent call blocks and returns the child's result |
| P7 | A subagent can call an implementer in the foreground and block until it hands back. | critical | refuted | M3 build 2026-11-05: a subagent's Agent tool has no `run_in_background` parameter; the lead's implementer calls ran in the background and returned a launch notice. Their hand-backs reached the lead as messages while it was still working |

## Requirements

### Area 1 — Harness (done, outside this repo)

1. `enableArtifact: false`, plus deny rules for `SendFeedback`,
   `ReportFindings` and `ShareOnboardingGuide`, in the user's
   `~/.claude/settings.json`. Verified with a probe session: neither the
   main thread nor its subagent carries them.

### Area 2 — Planning

1. **Spec content.** The spec stage asks about, and the spec records:
   - the directory layout of every new module or component;
   - the main abstractions: types, interfaces and their responsibilities;
   - premises, each linking the spike report that settles it.
2. **Spec-review checks.** The spec review gains two checks:
   - **keys, identity and lifecycle:** what identifies each entity, and what
     happens on delete, recreate, rename and version;
   - **adversarial change:** how a change that should fail could still pass.

   Only the user caught these in past changes: the identity model in
   proto-to-avro, delete-and-recreate in proto3.
3. **Spike.** Premises are spiked asynchronously during the spec
   conversation, while the conversation goes on. Every critical premise is
   spiked; normal premises get a docs check only. A premise stated in
   official documentation, or checked in the source code, counts as
   verified without experiments. One Sonnet agent drives a spike end to end:
   docs check, experiments, conclusion.
   - It may dispatch Haiku lookup agents for facts, and an Opus advisor for
     design calls and for a second read of its conclusion on a critical
     premise.
   - It writes a concise report: verdict, confidence, conclusions and
     references.
   - Its working files stay out of git.
4. **Spike reports.** Spike reports are committed in the change folder at
   `research/<slug>.md`. The experiment files stay in the gitignored
   `research/spikes/<slug>/`. This is the plugin's default. A project that
   commits no kentra-rpir artifacts, such as banank, simply never commits
   them. The planning session reads each report's conclusions and updates
   the premise rows.
5. **Plan.** The planning session itself writes the plan as coarse
   milestones (no plan-writer agent). Each milestone holds, in its
   `description` and `contract`:
   - goal;
   - scope: the files and directories, from the spec's layout;
   - the interfaces it provides and uses, from the spec's abstractions;
   - acceptance criteria;
   - the check command;
   - risks, with the premises they depend on.

   Milestones have no steps.

   No code.
6. **Plan reviews.** One plan review checks the whole plan. There is no
   skeleton review, no split per milestone and no consolidator. Diff reviews
   follow edits, as today.
7. **Triage.** The reviewer labels each "no" as a user decision or a
   technical gap and gives the fix. No separate triage agent runs. The main
   session reads every research outcome against the document.
8. **milestoned-plan-dag.** That plugin moves to schema 0.4.0. The
   `steps` field and the plan-author step rule (2–5-minute steps, failing
   test first) are removed, and 0.4.0 rejects a plan that has `steps`.
   There is no compatibility mode. Plans in finished change folders keep
   `schemaVersion: 0.3.0` as history.
9. **Tiers.** `small` (spec, then one milestone with lead, implementer and
   verifier, no plan file) and `standard` (spec, spikes, coarse plan)
   replace `full` and `light`. The session that starts the spec proposes the
   tier, and the user confirms it unless the answer is obvious.

### Area 3 — Implementation

1. **Orchestrator.** The orchestrator (the main session, Opus) dispatches
   one milestone lead per ready milestone, up to `implement.maxParallel` at
   once.
2. **Milestone lead.**
   - **Role:** the milestone lead (Opus) turns the coarse milestone into
     concrete work. It runs Sonnet implementers one at a time, a fresh one
     for each piece of work, each from a brief. It reviews their
     output and hands the milestone back.
   - **Persistence:** the lead persists for the whole milestone. The
     orchestrator resumes it with SendMessage for fix rounds.
   - **Parallelism:** parallel milestones get parallel leads.
   - **Why not a persistent implementer:** a lead cannot wait for a
     persistent implementer across its own turns (P6). The user chose this
     shape on 2026-11-05.
3. **Contract verifier.** The orchestrator dispatches a fresh contract
   verifier for each milestone the lead hands back. The verifier is
   independent of the lead. It checks the contract, the criteria, the
   milestone's intent against the spec, and builds that consume changed
   files.
4. **Fix rounds.** A FAIL goes back to the same lead.
5. **Concerns.** A concern that a milestone's step, criterion or documented
   command fails, or cannot run, somewhere is a correctness concern. Shipped
   in 0.5.4.

### Area 4 — Research

1. Research moves into kentra-rpir as one session-scoped research pool. It
   replaces both the `kentra-rpir:research` workflow and the user-level
   `~/.claude/workflows/research.js`. Spikes are one kind of research job.
2. Every question is sized at intake:
   - `fact`: one Haiku lookup;
   - `premise`: a Sonnet spike driver with Haiku lookups and an Opus
     advisor;
   - `survey`: an Opus researcher with parallel Haiku lookups.
3. The pool runs at most `research.maxParallel` jobs at once. Further
   questions queue and start as jobs finish. Questions raised later in the
   session join the queue.
4. Every job writes one report, conclusions first, and adds a row to a
   research index. The index is checked before a job starts.
5. `research.standalone: false` turns the pool off outside rpir stages, for
   users who keep their own research workflow.
6. Lookups label every source with its kind (official docs, source code,
   vendor benchmark, and so on), publisher, date and version. Reports say
   which kind of source each conclusion rests on.
7. The "Research workflows" section of the user's `~/.claude/CLAUDE.md`
   stops referring to `~/.claude/workflows/research.js` and points to the
   plugin's research pool.

### Cross-cutting

1. **Red-green.** No skill, agent, workflow or template of kentra-rpir
   mentions red-green, red runs or test-first ordering.
2. **Retro.** The retro reads spike reports and the new roles: spike driver,
   advisor, milestone lead.

## Design

### Verification and judgement

One rule: each judgement gets one independent check, and mechanical checks
are scripts.

| Stage | Judge | Independent check | Removed |
|---|---|---|---|
| Spec and plan | The user decides; the main session drafts both | One fresh Opus review of spec and plan together before the user approves the plan, with the two new checks and the coverage check; diff reviews after edits | Separate triage agent; skeleton review; per-milestone split review; consolidator; plan-writer agents |
| Premise | Spike driver (Sonnet) concludes | For critical premises, the Opus advisor reads the evidence and the conclusion, and re-runs only the decisive experiment or an anomaly | Separate checker, designer and judge contexts; judge re-running everything |
| Milestone | Milestone lead (Opus) judges design and the implementer's output | Fresh contract verifier (Opus), dispatched by the orchestrator, independent of the lead | — |
| Change | User code review | Retro over the transcripts | — |

Keep: the joint review with its coverage check, and diff reviews, the
cheapest steps per real issue at about 50–85k tokens. Keep spikes for
critical premises: both refutations so far were would-break.

### Coarse plans: prompt changes

- **Plan skill and plan-writer.**
  - Remove "steps with their code", "bite-sized" and "an implementer builds
    without exploring the codebase".
  - Add "a milestone is a deliverable a reviewer could merge on its own: one
    component, or one capability that can be checked on its own; split only
    when parallel work or a checkpoint needs it".
  - Add a size anchor, for example "most changes need 3–8 milestones". For
    scale, proto3 had 21 milestones; the same work fits in about 7.
- **Implementer.** `agents/implementer.md` stops forbidding codebase
  exploration. It reads the spec's layout and abstractions, and the files
  the milestone names.
- **milestoned-plan-dag.** Its plan-author step rule (failing test first,
  2–5-minute steps) conflicts with this design. Either the plan skill stops
  loading plan-author's step guidance, or milestoned-plan-dag gets a coarse
  mode (P4).

### Spike driver

- **How it runs.** A background Agent-tool dispatch from the main planning
  session, not a workflow, because only Agent-tool subagents can dispatch
  advisors and lookups (P1).
- **The report** is short: verdict and confidence, conclusions, references.
  The main session reads the report's first section only.

### Milestone lead and implementer

- **Persistence and waiting.**
  - The main session receives its children's results and can resume them.
    A subagent cannot (P6).
  - So the persistent agent is the lead, resumed by the orchestrator.
  - A lead's implementer runs in the background (P7). The lead keeps its
    turn going until the implementer's hand-back arrives as a message. When
    it must end its turn, it hands back `WAITING`, and the orchestrator,
    which receives the implementer's result (P6), resumes the lead with it.
- **Cache.** A subagent's cache lives 5 minutes (P3).
  - Resuming a lead after a long verifier run re-writes its context at Opus
    price, so the lead keeps its context small: the milestone, the spec
    sections it needs, briefs and hand-backs, never the implementer's file
    reads.
  - A fresh implementer per piece of work re-reads the files it needs. The
    brief names them.
- **Verifier per round.**
  - Each milestone gets a fresh verifier.
  - For a re-verification round, the orchestrator resumes the same
    verifier when the fix comes back within the cache window (P5), and
    dispatches a fresh one otherwise. It takes the verifier's last hand-back
    time from `.kentra-rpir/implement-state.json`.
  - A resumed verifier re-runs the full check and re-reads the whole diff,
    not only its earlier findings.

### Lifecycle of the new artifacts

- **Queue entries.**
  - **Identity:** each job has an id, unique within its session queue.
  - **Stale jobs:** a job marked running whose agent never reported back
    counts as stale after `research.staleMinutes` (default 60). `next`
    reclaims its slot, and the main session re-queues the job or drops it.
- **Index rows.**
  - **Identity:** a row is identified by claim plus subject@version.
  - **Superseding:** a newer row for the same claim and subject supersedes
    the older one, which stays as history.
  - **Dangling paths:** a row whose report path is missing still counts.
    Its conclusion is copied into the row, so the index alone answers the
    question.
- **Report slugs.** A slug that already exists gets a numeric suffix; a
  report is never overwritten.
- **Orchestrator state.**
  - **What is recorded:** the implement orchestrator records each lead and
    verifier agent id, with its last hand-back time, in
    `.kentra-rpir/implement-state.json`.
  - **After a session resume or compaction:** the orchestrator re-reads the
    file. An agent it can no longer reach is replaced by a fresh one.
- **Old-format changes.** A change started under 0.5.x (tier `full` or
  `light`, separate spec and plan stages) finishes on 0.5.x. The new
  version does not migrate it.

### Research pool

**Why not a workflow.** A running workflow cannot take new questions, and
its agents cannot dispatch subagents (P1). So the pool is run by the main
session itself, dispatching background Agent-tool jobs, guided by a
`kentra-rpir:research` skill and a small queue script.

**Roles (agent definitions):**

| Agent | Model | Does | Spawns |
|---|---|---|---|
| `lookup` | haiku | Finds one fact; returns each source with a verbatim excerpt, its kind, publisher, date and the version it describes; no judgement | — |
| `spike` | sonnet | Settles one premise: docs and source first, experiments if still open | `lookup`; `advisor` for critical premises |
| `researcher` | opus | Answers one survey question; synthesises from lookup excerpts and fetches a source itself only on conflict or a missing version | `lookup`, in parallel |
| `advisor` | opus | Second read of a spike's evidence and conclusion; re-runs only the decisive experiment | — |

**Source credibility.** Every lookup labels each source with its kind:
- official docs;
- source code or a changelog;
- standard or spec;
- independent paper or benchmark;
- vendor benchmark or marketing;
- community post;
- secondary summary.

It also gives the publisher, the date and the version the source describes.
The researcher, spike driver or advisor weighs each claim by that label,
the date and the version match, and says in the report which kind of source
each conclusion rests on. Official docs and source code settle a premise on
their own (Area 2.3). A vendor-run benchmark or a secondary summary does
not.

**Sizing at intake.** The main session sizes each question with a short
rubric:
- `fact`: one lookup, unless the answer is already in the index or the
  main session can read it itself.
- `premise`: a spike.
- `survey`: a researcher.

A job that finds its question bigger or smaller than its size says so in
its report instead of growing.

**The pool.**
- **Queue.** `scripts/research-queue.sh add | next | done` keeps one queue
  per Claude session, in the session's `.kentra-rpir/` state.
- **Concurrency.** At most `research.maxParallel` jobs run at once (default
  4). Each job runs at most `research.maxLookups` lookups at once (default
  4). The defaults keep the pool within Claude Code's 20 concurrent
  subagents.
- **Starting jobs.** On each job-completion notification the main session
  starts the next queued job.
- **Follow-ups.** A follow-up on the same topic goes to the same researcher
  when it is idle and within the cache window; otherwise to a fresh one.

**Reports and index.**
- **Report.** One report per job: `## Conclusion` first (answer, verdict,
  confidence), then `## References`. The main session reads only the
  Conclusion.
- **Where reports go.** In an rpir change, reports go to
  `<change>/research/<slug>.md`. Outside one, they go to
  `research.dir`.
- **Index.** `research.index`, a project-level JSONL of claim,
  subject@version, verdict, confidence, date and report path. It is
  checked before any job starts, so findings carry across changes. A
  verified finding at the same version is reused, never re-researched.
  - In the past three changes, about 2M tokens of research repeated
    findings that already existed: one spike (P11) was simply re-run, the
    srcDir layout was spiked again after an earlier change had already
    settled it, and two pairs of runs worked on the same topic at the same
    time.

**Configuration (`.kentra-rpir.yaml`):**
```yaml
research:
  standalone: true   # false: the research skill is off outside rpir stages
  maxParallel: 4
  maxLookups: 4
  dir: docs/research
  index: docs/research/index.jsonl
```

## Decided since the first draft

- Spec and plan merge into one planning stage: one session, the user agrees
  the spec while premises are spiked in the background, the session writes
  the coarse plan, and the user approves it. One fresh review covers spec
  and plan together before approval; diff reviews follow edits.
- Opus milestone lead with a Sonnet implementer, implemented directly, with
  no pilot against an advisor-on-demand setup.
- Re-verification resumes the verifier within the cache window, and starts
  a fresh one otherwise.
- Research merges into kentra-rpir as the session research pool (Area 4).

## Open questions
