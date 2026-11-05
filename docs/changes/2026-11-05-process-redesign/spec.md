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
| P2 | Nesting reaches three levels: orchestrator → milestone lead → implementer → lookup. | critical | unverified | docs say three levels (research/external/agent-role-patterns.md); a changelog note says v2.1.217 turned nesting off |
| P3 | A subagent's prompt cache lives 5 minutes. A subagent resumed with SendMessage after a longer gap re-writes its whole history. | normal | verified | 578be2d0 M26 implementer: resumed after 7 s, read 58.7k from cache and wrote 0.8k; resumed after 5.6 min, wrote 61.0k and read 0 |
| P4 | A milestoned-plan-dag plan can hold coarse milestones whose `steps` are a short outline with no code. | critical | unverified | the plan-author skill (milestoned-plan-dag 0.3.0) defines a step as "write the failing test, run it and see it fail…" |

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
3. **Spike.** One Sonnet agent drives a spike end to end: docs check,
   experiments, conclusion.
   - It may dispatch Haiku lookup agents for facts, and an Opus advisor for
     design calls and for a second read of its conclusion on a critical
     premise.
   - It writes a concise report: verdict, confidence, conclusions and
     references.
   - Its working files stay out of git.
4. **Spike reports.** Spike reports are committed in the change folder. The
   planning session reads their conclusions and updates the premise rows.
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
6. **Plan reviews.** One plan review checks the whole plan. There is no split
   per milestone and no consolidator. Diff reviews follow edits, as today.
7. **Triage.** The reviewer labels each "no" as a user decision or a
   technical gap and gives the fix. No separate triage agent runs. The main
   session reads every research outcome against the document.

### Area 3 — Implementation

1. **Orchestrator.** The orchestrator (the main session, Opus) dispatches
   one milestone lead per ready milestone, up to `implement.maxParallel` at
   once.
2. **Milestone lead.** The milestone lead turns the coarse milestone into
   concrete work and delegates it to a Sonnet implementer. It reviews the
   implementer's output and hands the milestone back.
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
  context at Opus cache-write price on its next turn. A persistent
  implementer resumed after a verifier round pays the same for its own
  history.
- **Proposed shape:**
  - The lead keeps its context small: the milestone, the spec sections it
    needs, and the implementer's hand-backs, not the implementer's file
    reads.
  - The implementer persists for the length of the milestone and is resumed
    for parts that follow within minutes.
  - A fix round after a long verifier run starts a fresh implementer from
    the lead's brief.

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

1. **When premises are spiked.** During the spec conversation, so the spec is
   agreed with its spikes done, or during the plan stage, with the spec
   agreed while some premises are still unverified?
2. **What gets spiked.** Every critical premise? Normal premises by docs check
   only? Who decides: the main session, or the user per premise?
3. **Spike reports in git.** The banank workspace rule says "Spikes are local
   work and are never committed". Proposed split: the report is committed at
   `research/<slug>.md`, and the experiment files stay in gitignored
   `research/spikes/<slug>/`. Does the workspace rule need rewording?
4. **Milestone lead or advisor on demand.**
   - An Opus lead holds context for the whole milestone. It costs more, and
     every long wait re-caches it.
   - The alternative is a Sonnet implementer that calls an Opus advisor only
     when stuck. It is cheaper, but Sonnet decides when to escalate.
   - No source compares them head to head; Cognition's frontier-lead design
     reported −54% cost at equal score. Pilot both?
5. **Nesting depth** (P2): a spike needs 2 levels, a milestone needs 3. To be
   tested before planning.
6. **Re-verification.** A fresh verifier each round, or the same verifier
   resumed with the fix diff? Resuming keeps it independent of the builder,
   but risks anchoring.
7. **Tiers.** Scale the stages to the size of the change, for example:
   - **small:** spec, then one milestone with lead, implementer and
     verifier, no plan file;
   - **standard:** spec, spikes, coarse plan.

   This would replace full and light. What decides the tier?
8. **Skeleton review.** With one writer and a coarse plan, is a separate
   skeleton review still worth it, or does the single plan review cover it?
9. **milestoned-plan-dag.** Change that plugin (a coarse mode, no red-green),
   or work around it in the plan skill?
10. **Research workflow.** Which of the four proposals to apply.
11. **Issue #22** (implementer red runs) and the F9 backlog entry: close them
    as rejected?
