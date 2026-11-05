---
title: Leaner kentra-rpir — coarse plans, spike reports, milestone leads, lighter verification
type: feature
status: draft
tier: light
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
| P1 | A subagent dispatched with the Agent tool can itself dispatch subagents (an Opus advisor, Haiku lookups). Workflow `agent()` subagents cannot: they have no Agent tool. | critical | unverified | 578be2d0 implementer and verifier transcripts carry `Agent`; workflow agents in research/../agents.json do not |
| P2 | Nesting reaches three levels: orchestrator → milestone lead → implementer → lookup. | critical | verified | docs: code.claude.com/docs/en/sub-agents (fetched 2026-11-05) "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation."; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` changes it |
| P3 | A subagent's prompt cache lives 5 minutes. A subagent resumed with SendMessage after a longer gap re-writes its whole history. | normal | verified | 578be2d0 M26 implementer: resumed after 7 s, read 58.7k from cache and wrote 0.8k; resumed after 5.6 min, wrote 61.0k and read 0 |
| P4 | A milestoned-plan-dag plan can hold coarse milestones whose `steps` are a short outline with no code. | critical | refuted | the plan-author skill (milestoned-plan-dag 0.3.0) defines a step as "write the failing test, run it and see it fail…"; milestoned-plan-dag is changed to allow it (Area 2.8) |
| P5 | Most fix rounds come back within the 5-minute cache window, so a resumed verifier would usually hit cache. | normal | verified | 578be2d0: verifier hand-back → next verifier start was 3m17s (M19), 3m42s (M23), 9m43s (M22), 3m05s (M26), 1m05s and 0m48s (M25) |

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
5. **Plan.** One plan writer writes the plan as coarse milestones. Each
   milestone holds:
   - goal;
   - scope: the files and directories, from the spec's layout;
   - the interfaces it provides and uses, from the spec's abstractions;
   - acceptance criteria;
   - the check command;
   - risks, with the premises they depend on;
   - at most a short outline of steps.

   No code.
6. **Plan reviews.** One plan review checks the whole plan. There is no
   skeleton review, no split per milestone and no consolidator. Diff reviews
   follow edits, as today.
7. **Triage.** The reviewer labels each "no" as a user decision or a
   technical gap and gives the fix. No separate triage agent runs. The main
   session reads every research outcome against the document.
8. **milestoned-plan-dag.** That plugin is changed so a plan holds coarse
   milestones: the step rule (2–5-minute steps, failing test first) goes,
   and `steps` becomes an optional short outline. There is no separate
   coarse mode; the old shape is not kept.
9. **Tiers.** `small` (spec, then one milestone with lead, implementer and
   verifier, no plan file) and `standard` (spec, spikes, coarse plan)
   replace `full` and `light`. The session that starts the spec proposes the
   tier, and the user confirms it unless the answer is obvious.

### Area 3 — Implementation

1. **Orchestrator.** The orchestrator (the main session, Opus) dispatches
   one milestone lead per ready milestone, up to `implement.maxParallel` at
   once.
2. **Milestone lead.** The milestone lead (Opus) turns the coarse milestone
   into concrete work and delegates it to a Sonnet implementer it spawns.
   It reviews the implementer's output and hands the milestone back. The
   lead and its implementer persist for the whole milestone, fix rounds
   included. Parallel milestones get parallel leads.
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

1. The kentra-rpir research workflow (checker → designer → judge) is
   replaced by the spike driver (Area 2.3).
2. The user-level research workflow (`~/.claude/workflows/research.js`)
   gets the changes the user picks from the Design section.

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
| Spec | The user decides; the main session drafts | One fresh Opus full review before `agreed`, with the two new checks; diff review after edits | Separate triage agent |
| Premise | Spike driver (Sonnet) concludes | For critical premises, the Opus advisor reads the evidence and the conclusion, and re-runs only the decisive experiment or an anomaly | Separate checker, designer and judge contexts; judge re-running everything |
| Plan | Single plan writer (Opus) | One fresh Opus plan review (coverage, DAG and paths, checkable criteria); diff review after edits | Per-milestone split review, consolidator, plan-milestones claim research and revisions |
| Milestone | Milestone lead (Opus) judges design and the implementer's output | Fresh contract verifier (Opus), dispatched by the orchestrator, independent of the lead | — |
| Change | User code review | Retro over the transcripts | — |

Keep: spec full and diff reviews and the skeleton-level coverage check, the
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

- **Cache.** A subagent's cache lives 5 minutes (P3). Whenever a lead waits
  more than 5 minutes for its implementer, the lead re-writes its whole
  context at Opus cache-write price on its next turn. The user accepts this:
  a persistent lead and implementer keep what they learned about the
  milestone.
- The lead keeps its context small: the milestone, the spec sections it
  needs, and the implementer's hand-backs, not the implementer's file reads.
- **Verifier per round.** A fresh verifier for each milestone. For a
  re-verification round, the orchestrator resumes the same verifier when
  the fix comes back within the cache window (P5), and dispatches a fresh
  one otherwise. It reads the verifier's hand-back time and compares it
  with now. The resumed verifier re-runs the full check and re-reads the
  whole diff, not only its earlier findings.

### User-level research workflow (proposals for the user to pick from)

1. The reasoner synthesises from the collectors' excerpts. It fetches a
   source itself only when two excerpts conflict or one lacks a version.
   The proto3 November reasoners re-fetched at 340–600k each.
2. Size the run to the question. A single fact gets one Haiku lookup, not a
   collector fleet; a single question gets one topic.
3. Persist findings by default (outDir), with an index of claim,
   subject@version, verdict and date. Before collecting, look up the index
   and reuse a verified finding at the same version.
4. Questions asked in a conversation join the open topic list for the next
   run instead of each starting a workflow.

## Open questions

1. **One planning stage.** Merge spec and plan into a single command (the
   "planning stage")? Proposed shape:
   - one session;
   - checkpoint 1: the user agrees the spec, with premises spiked in the
     background meanwhile;
   - the session writes the coarse plan;
   - checkpoint 2: the user approves the plan;
   - one fresh review of spec and plan together before checkpoint 2, with
     diff reviews after edits.
2. **Lead or advisor: how to verify.** No source compares them head to head.
   Proposed pilot:
   - take three or four milestones of a finished change and write them as
     coarse contracts;
   - build each twice in worktrees: Opus lead with a Sonnet implementer, and
     a Sonnet implementer with an Opus advisor on demand;
   - compare verifier findings, rework rounds, the user's review and cost.
3. **Re-verification.** The user wants fresh verifiers so assumptions do not
   carry over, and cache reuse when possible. The Design section resumes the
   verifier within the cache window and otherwise starts fresh. To confirm.
4. **Research workflow.** Which of the four proposals to apply.
