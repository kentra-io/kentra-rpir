# Implementation report — kentra-rpir process redesign

- **Change:** docs/changes/2026-11-05-process-redesign · **Tier:** standard
- **Branch:** retro-proto3-schema-libraries (integration, local only) · **Pull request:** none
- **Orchestrator session:** e11662fc-f69a-4f9b-99d8-654e48b86684 · **Models:** orchestrator opus, lead opus, implementer sonnet, verifier opus
- **Plugin:** kentra-rpir 0.5.4 → 0.6.0 · **Claude Code:** 2.1.318 · **maxParallel:** 1 (milestones were chained)

This change was built by hand on the new process, before the plugin had the
new implement skill: the main session acted as orchestrator. Leads were
`general-purpose` agents on opus, and verifiers were `general-purpose` agents
on opus given a verifier brief. The check ran with
`MILESTONED_PLAN_DAG=/private/tmp/claude-501/mpd-0.4.0/milestoned-plan-dag`,
a local build of milestoned-plan-dag branch `schema-0.4.0-no-steps`.

## Milestones

| # | Slug | Outcome | Lead rounds | Implementers | Verify rounds (fresh / resumed) | Merge commit |
|---|---|---|---|---|---|---|
| 1 | research-pool | merged | 2 | 3 | 2 (2 / 0) | 315aa21 |
| 2 | planning-stage | merged | 2 | 2 | 2 (2 / 0) | 2049942 |
| 3 | milestone-leads | merged | 3 | 3 | 3 (2 / 1) | 91d7fcf |
| 4 | retro | merged | 2 | 2 | 2 (2 / 0) | 629e1b3 |
| 5 | docs-release | merged | 1 | 0 | 1 (1 / 0) | cc92554 |

Lead rounds: the first dispatch plus each resume with findings, guidance or
an answer. Implementers: the count from the lead's IMPLEMENTERS lines.

### M1 research-pool

- **Verifier FAILs:**
  - Round 1: the index row was appended with `printf '%s\n' '<row>'`, so an apostrophe split one row into several JSONL lines.
  - Round 1: two sessions could get the same report path.
  - Round 1: the four new agents had `tools:` allowlists, which the spec's Non-goals rule out.
- **Pending criteria (human-checked):** "human: research skill", "human: source labels". The verifier quoted the lines; your read is pending.
- **Concerns raised (DONE_WITH_CONCERNS):** the report shape is written twice, once in spike.md and once in researcher.md, because the harness refused a separate shared file. The follow-up window is a fixed 5 minutes. The verifier judged both acceptable.
- **Lead decisions:**
  - The queue is a TSV file per session under `.kentra-rpir/research-queue/`, guarded by an `mkdir` lock.
  - Fact jobs: the main session writes the report and the index row.
  - Reuse: a row is reused only when its verdict is verified or refuted at the same `subject@version`.
  - Forbidden terms: matched as whole words.
- **Agents replaced:** none
- **Observed, not fixed:** `shellcheck -s sh` already exited 1 before this change, on info-level notes (SC2016). M1 adds one more note, SC2086, in check-forbidden.sh, where the variable is left unquoted on purpose.

Orchestrator fix after merge: 57bfbf0 makes the queue use absolute report directories.

### M2 planning-stage

- **Verifier FAILs:**
  - Round 1: the plan skill let the session settle a critical premise itself.
  - Round 1: a resumed small-tier change went on to write `plan.yaml`.
  - Round 1: the demo fixture plan still had 0.3.0 `steps`, so no single milestoned-plan-dag version could pass `tests/run.sh`.
- **Pending criteria (human-checked):** "human: planning stage", "human: reviewer".
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Lead decisions:**
  - Reviewer checks: added S7 (Layout and Abstractions present) and S8 (each pin says what it means; covers backlog F19).
  - Commit timing: one commit at approval, none at agreement.
  - Small tier: ends at `status: planned`.
  - Old-format specs: a spec with tier full or light stops the plan skill.
  - Forbidden term for the old spec skill: written as `kentra-rpir:spec([^-a-z]|$)`, because ugrep's `\b` also matches `spec-retro`.
- **Agents replaced:** none
- **Observed, not fixed:** none

Orchestrator fix after merge: ca35439 settles the resume of a reviewed change, the red-flag wording and the demo config.

### M3 milestone-leads

- **Verifier FAILs:**
  - Round 1: `agents/lead.md` assumed foreground implementers. In this build a subagent's Agent call always runs in the background (spec P7, refuted).
  - Round 1: the small-tier contract was stored nowhere.
  - Round 1: after a resume, the skill asked running agents to hand back, which invites partial work.
  - Round 2: the lead's poll re-took its base on every run and waited 550 s, past the cache window.
  - Round 2: the Monitor fallback does not block.
  - Round 2: nothing capped the wait when an implementer died.
- **Pending criteria (human-checked):** "human: implement skill", "human: lead".
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Lead decisions:**
  - maxParallel counts milestones in progress.
  - The state file schema records agent ids, `handedBackAt`, `leadRounds`, `verifyRounds`, `verifyResumes` and the small-tier contract.
  - WAITING: a lead hands back WAITING, and the orchestrator forwards the implementer's report to it.
  - The pane maps a lead to role `impl`, and WAITING to `implementing`.
- **Agents replaced:** none. Round 3 resumed the round-2 verifier within the cache window (about 1 minute).
- **Observed, not fixed:** the pane shows `implementing` rather than `fixing` for a WAITING lead in a fix round. It is display only.

Orchestrator fix after merge: 109e33b sets the Bash timeout for the 240 s poll, and keeps a `waiting` milestone waiting after a compaction.

### M4 retro

- **Verifier FAILs:**
  - Round 1: the before-plan line missed Workflow-tool runs. Those runs sit in `subagents/workflows/<runId>/`, with journals at `workflows/<runId>.json`.
  - Round 1: the retro flagged "a spike on a normal premise", which is normal under the research skill.
  - Round 1: review-stage fixes skipped implement step 3.
- **Pending criteria (human-checked):** "human: retro".
- **Concerns raised (DONE_WITH_CONCERNS):** the plan-skill-load detection and the workflow-run timing have run only against fixtures; no real transcript under the new process exists yet.
- **Lead decisions:**
  - Roles are identified from each agent's `meta.json` and the first line of its prompt.
  - The workflow sums the totals, not the model.
  - A workflow row shows the harness's own token count in parentheses.
  - A milestone is read in full when it had more than one lead round, a FAIL, errors, writes outside its paths, no test runs, or was blocked.
- **Agents replaced:** none
- **Observed, not fixed:** none

Orchestrator fix after merge: a930566.
- Workflow runs are placed by line order. The ISO-to-epoch-ms comparison is kept as a fallback.
- A research job's description carries its report name.
- A review-stage fix writes no state file.
- A test checks the schema's `workflow` role.

### M5 docs-release

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** "human: process doc".
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Lead decisions:**
  - `process.md` is restructured around the plan, implement and review stages plus a research pool chapter.
  - The config block is copied verbatim from the template.
  - The repo's `.kentra-rpir.yaml` keeps only the three first-use keys.
- **Agents replaced:** none
- **Observed, not fixed:**
  - Backlog F10 and F20 look partly addressed by this change. They are left in the backlog.
  - `plugin.json` keywords still list "spec".

Orchestrator fix after merge: four doc nits, and this spec's tier is set to `standard` so the 0.6.0 skills accept it.

Where the spec and the plugin differ, the docs follow the plugin:
- research happens at both tiers;
- a critical premise about this repo's own code is settled by reading the code;
- the research follow-up window is a fixed 5 minutes;
- maxParallel counts milestones in progress.

## Plan adjustments

| Milestone | Change | Reason | Commit |
|---|---|---|---|
| 5 | Added `.claude-plugin/plugin.json` (its description) to scope | M2's verifier found the description still named the old stages, and no milestone's paths covered it | 388e4ab |

## Decisions the user made

| Question | Decision |
|---|---|
| Lead shape after PL1 was refuted | The lead persists and gets a fresh implementer for each piece |

## Merge conflicts resolved

| Milestones | Files | Resolution |
|---|---|---|
| none | | |
