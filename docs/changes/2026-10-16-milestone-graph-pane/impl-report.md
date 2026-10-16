# Implementation report — Milestone graph pane for implement runs

- **Change:** docs/changes/2026-10-16-milestone-graph-pane
- **Branch:** rpir/milestone-graph-pane · **Pull request:** https://github.com/kentra-io/kentra-rpir/pull/23
- **Orchestrator session:** 1c0e2a0d-047c-4210-8977-644f3526facf · **Models:** implementer sonnet, verifier opus, orchestrator opus
- **Plugin:** kentra-rpir 0.5.0 · **Claude Code:** 2.1.301

The user delegated every call in this stage ("make your own calls … without
involving me"). The orchestrator made no user-facing decisions; the ones it
made are listed below.

## Milestones

| # | Slug | Outcome | Dispatches | Verify rounds | Merge commit |
|---|---|---|---|---|---|
| 1 | mod-scaffold | merged | 1 | 1 | bb6eeb3 |
| 2 | plan-source | merged | 1 | 1 | 1fb507a |
| 3 | run-tracker | merged | 1 | 1 | 9dc512e |
| 4 | graph-layout | merged | 1 | 1 | 1fd0a5d |
| 5 | pane-wiring | merged | 1 | 1 | 528ff8d |
| 6 | docs | merged | 1 | 1 | 52f13b2 |

M2, M3 and M4 ran in parallel after M1. Every milestone passed on its first
verify round.

### M1 mod-scaffold

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** none
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Observed, not fixed:** `claude plugin validate` warns that the root CLAUDE.md is not loaded as context (pre-existing).

### M2 plan-source

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** none
- **Concerns raised (DONE_WITH_CONCERNS):** none. Spec premise P8 held: the vendored js-yaml 4.1.0 loads in the mod runtime, so the `milestoned-plan-dag resolve` fallback was not used.
- **Observed, not fixed:** none

### M3 run-tracker

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** none
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Observed, not fixed:** none

### M4 graph-layout

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** none
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Observed, not fixed:** none

### M5 pane-wiring

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** `human: live implement run`. Not yet answered by the user. The orchestrator ran a partial live check itself; see "Live smoke runs" below.
- **Concerns raised (DONE_WITH_CONCERNS):** the test kit's engine `$` has no `$.state`, `$.ui.open` or `$.ui.close`, although the 2.1.301 types declare them. The tests therefore read state through a test-side `state.set` hook and simulate the engine closing the pane, so the plugin's own `ui.close` hook runs under no test. The orchestrator accepted this: it stays inside the milestone's paths and keeps every criterion's intent, and the verifier confirmed the gap independently.
- **Observed, not fixed:** validate lists six hooks as "gating hook without .catch". The plugin-authoring reference calls that line a fact, not a warning, and the tracking code is wrapped in try/catch.
- **Borrowed hotkey action:** `app:toggleDiffPreSession`, accepted by validate (spec P7: whether the chord reaches the Button while the prompt has focus is still a live-check item).

### M6 docs

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** `human: README section` (README.md, "Watching an implement run"). Not yet answered by the user.
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Observed, not fixed:** none. The verifier's one finding was that the README said the borrowed chord also does the engine's action. Per reference.md the engine's handler wins *instead*. The orchestrator reworded the sentence on the M6 branch before merging (a5857db).

## Live smoke runs (orchestrator, before the user's check)

A `claude --plugin-dir <integration worktree>` session in tmux at 170×50, on
a demo change (M1 alpha and M2 beta in parallel, M3 gamma on both), with the
dispatches simulated by asking a Haiku session to launch agents whose prompts
start with the real template lines.

- `/rpir-graph` docked the pane with the placeholder. The first dispatch drew the header with counts and elapsed time, three boxes, and the lanes, including the `┴` join and the `▶` into M3. The band above the prompt showed the summary and the `[ graph ]` button. Status moved through implementing → verifying → passed with separate impl and verify times; dependents showed `ready`/`waiting` correctly.
- **Defect 1 (fixed, 22c83f7):** Claude Code 2.1.301 runs these Agent dispatches in the background. The Agent tool answers at once with `status: async_launched`, which the mod took for the agent's end: impl 0s, no current tool, never finishing. The fix skips that result and lets the subagent's `turn.complete` end it. Regression test added.
- **Defect 2 (fixed, 8ffc78f):** a subagent that waits on its own background command ends a turn and later wakes for another. The mod froze its timer at the first turn's end. Now `turn.start` (new tracker event `resume`) and any tool call reopen the agent, and the latest end wins. Regression test added.
- **Known limit, not fixed:** while a subagent idles waiting for its own background command, its timer pauses at the last turn's end. When the agent wakes, the timer catches up to the real span (seen: 6s during the wait, 34s after).
- **Not checked live:** Up/Down selection and Enter opening a transcript, since the orchestrator could not focus the pane from tmux. Also the borrowed chord, which would need an edit to the user's `~/.claude/keybindings.json`. Both stay with the human criterion.

## Plan adjustments

| Milestone | Change | Reason | Commit |
|---|---|---|---|
| M3 run-tracker | `reduce`: the latest `agentDone` wins and `tool`/`resume` reopen an agent (was: keep the earliest end); test expectation 4000 → 4100 | Live smoke defect 2: a subagent ends several turns | 8ffc78f |
| M5 pane-wiring | skip an Agent result with `status: async_launched`/`remote_launched`; add a `turn.start` hook | Live smoke defects 1 and 2 | 22c83f7, 8ffc78f |
| M6 docs | the chord sentence reworded | Verifier finding (reference.md:158) | a5857db |

## Decisions the user made

| Question | Decision |
|---|---|
| (all calls delegated to the orchestrator) | Plan self-review decision P6@pane-wiring: keep M1's toggle (decide from `$.ui.panes()`, `isPaneOpen` a cache), made by the orchestrator under the delegation |

## Merge conflicts resolved

| Milestones | Files | Resolution |
|---|---|---|
| none | | |
