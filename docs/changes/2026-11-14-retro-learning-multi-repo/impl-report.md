# Implementation report — Retro learning, multi-repo plans, one rpir/ folder and a pluggable audit

- **Change:** docs/changes/2026-11-14-retro-learning-multi-repo · **Tier:** standard
- **Branch:** `kentra-rpir: rpir/2026-11-14-retro-learning-multi-repo`, `milestoned-plan-dag: rpir/2026-11-14-retro-learning-multi-repo` · **Pull request:** none
- **Orchestrator session:** `<session-id>` · **Models:** orchestrator opus, lead opus, implementer sonnet, verifier opus
- **Plugin:** kentra-rpir 0.6.2 (running), 0.7.0 (built) · **Claude Code:** 2.1.325 · **maxParallel:** 3

The kentra-rpir branch was squashed into one commit before publishing (the user's
decision, see below). The merge commits named here are on the local branch
before the squash.

## Repositories

| Repository (`repo`) | Path (absolute) | Integration worktree | Branch | Base (sha the branch was cut from) |
|---|---|---|---|---|
| `.` | `/path/to/kentra-rpir` | `/path/to/kentra-rpir/.worktrees/2026-11-14-retro-learning-multi-repo` | rpir/2026-11-14-retro-learning-multi-repo | 7ee9bf2 |
| `../milestoned-plan-dag` | `/path/to/milestoned-plan-dag` | `/path/to/milestoned-plan-dag/.worktrees/2026-11-14-retro-learning-multi-repo` | rpir/2026-11-14-retro-learning-multi-repo | 5821e3f |

## Merge order

1. milestoned-plan-dag first: M5's checks need schema 0.5.0's `repo` field. Tag
   v0.5.0 after its merge.
2. kentra-rpir second.

## Milestones

Implementers: counted from the leads' IMPLEMENTERS lines where the log kept
them; "—" where it did not.

### ../milestoned-plan-dag

| # | Slug | Outcome | Lead rounds | Implementers | Verify rounds (fresh / resumed) | Merge commit |
|---|---|---|---|---|---|---|
| 1 | mpd-repo-field | merged | 1 | — | 1 (1 / 0) | f5c5f44 |

#### M1 mpd-repo-field

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** plan-author documents `repo`: accepted on the verifier's reading (the user chose to check only three criteria themselves).
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Lead decisions:** `validate` rejects absolute `repo` paths; `repo` is emitted cleaned; `render` shows Repository after Goal.
- **Agents replaced:** none
- **Observed, not fixed:** a stale "steps" sentence in milestoned-plan-dag's spec.md (around line 43).

### .

| # | Slug | Outcome | Lead rounds | Implementers | Verify rounds (fresh / resumed) | Merge commit |
|---|---|---|---|---|---|---|
| 2 | recurring-failures | merged | 2 | 5 | 2 (1 / 1) | a9541b5 |
| 3 | improvements-core | merged | 1 | — | 1 (1 / 0) | 9a3c537 |
| 4 | rpir-layout | merged | 2 | — | 2 (1 / 1) | b62a138 |
| 5 | multi-repo | merged | 2 | 5 | 2 (1 / 1) | 35cdce5 |
| 6 | retro-registry | merged | 4 | — | 2 (1 / 1) | 5418dc1 |
| 7 | pluggable-audit | merged | 1 | — | 1 (1 / 0) | 791163b |
| 8 | docs-release | merged | 3 | — | 3 (1 / 2) | c0375c4 |
| 9 | leak-cleanup (user-requested) | merged | 1 | — | 1 (1 / 0) | 197e265 |

#### M2 recurring-failures

- **Verifier FAILs:** round 1: [intent] `skills/plan/SKILL.md`: the readers-in-paths rule sat after the plan.yaml write in step 7.
- **Pending criteria (human-checked):** plan skill rules, agent rules, implement rules: accepted on the verifier's reading.
- **Concerns raised (DONE_WITH_CONCERNS):** one implementer's concern, settled by the lead.
- **Lead decisions:** the nav test fix uses `{plugin:'*'}` handlers in the test; the version check is a `--version` mode of `check-templates.sh`; the research `Queue` alias was removed; `reviewer-prompt.md` unchanged (it has no check list).
- **Agents replaced:** none
- **Observed, not fixed:** none

#### M3 improvements-core

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** nudge seen on startup and resume: accepted on the verifier's reading.
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Lead decisions:** JSON CLI output; a `--now` override; `recordedAt` kept apart from `date`; `decide` sets `lastImproveRun`; shipped and regressed are derived; the import stub exits 2 (M8 builds it).
- **Agents replaced:** none
- **Observed, not fixed:** the nudge writes `lastNudge` into the tracked `rpir/improvements/state.json`, as the spec asks, which dirties the tree. The verifier also noted, without blocking: a same-day string compare, no lock on registry writes, and nudge errors swallowed.

#### M4 rpir-layout

- **Verifier FAILs:** round 1: [intent] `migrate-layout.sh` moved standalone research spikes into tracked space and left the old `.gitignore` line; [intent, low] the pane fallback used name order, not the newest sessions file; [rules] a no-op sentence in the research skill.
- **Pending criteria (human-checked):** stages on the new layout: the user checks it after release, and any break is fixed then.
- **Concerns raised (DONE_WITH_CONCERNS):** migrate can stop partway on conflicts (it never overwrites; a rerun continues); a rerun prints leftovers; `check-templates.sh` skips the `track` key; the research skill's standalone fallback. Settled by the orchestrator: none is about a failing criterion.
- **Lead decisions:** a shared `scripts/stage-start.sh` for four skills; `sessions.sh current`; the research queue is per change via `--change`; an untracked mode in `commit-change`; the pane falls back to implement-state, then the newest sessions file; the repository `.gitignore` untouched.
- **Agents replaced:** none
- **Observed, not fixed:** README and process.md still on the old layout (went to M8).

#### M5 multi-repo

- **Verifier FAILs:** round 1: review broke when the project root is not a git repository; review's fix, push and worktree removal were single-repository; review read per-repository bases from a deleted state file.
- **Pending criteria (human-checked):** plan multi-repo, implement multi-repo: accepted on the verifier's reading.
- **Concerns raised (DONE_WITH_CONCERNS):** the root repository may have an empty diff (went to M7 as guidance); the check needs `MILESTONED_PLAN_DAG` until v0.5.0 ships, as the plan expects.
- **Lead decisions:** a local `RepoMilestone` type in `hooks/plan.ts`; the pane goal row reads `<repo> · <goal>`; workflow `milestones[].repo` is an absolute path; the state file's `repos` map replaces `integration`; a baseline check per repository; per-repository tables in the impl report, plus the Repositories table that review reads.
- **Agents replaced:** none
- **Observed, not fixed:** README named milestoned-plan-dag 0.4.0 (went to M8).

#### M6 retro-registry

- **Verifier FAILs:** round 1: the improve commit lacked the untracked-mode exception; re-running a retro with an empty scope left stale occurrences; unquoted paths in `spec-retro.js`'s register commands.
- **Pending criteria (human-checked):** improve skills, review, no node: accepted on the verifier's reading.
- **Concerns raised (DONE_WITH_CONCERNS):** before verification, the orchestrator found the nudge was not reset when nothing was eligible, and resumed the lead (round 2); the fix needed the plan adjustment below.
- **Lead decisions:** synthesis assigns scope and metrics; the workflow filters plugin findings unless `pluginRecord`; the register agent records per scope; the Remediate phase and the Actions and Recurring sections are removed; review passes `changeDate` and the plugin version; improve has no ship step; `decide --verdict none` records an improve run with nothing eligible; `record --project-id/--change` lets `[]` clear a re-run.
- **Agents replaced:** none
- **Observed, not fixed:** parallel changes may conflict on class files (accepted).

#### M7 pluggable-audit

- **Verifier FAILs:** none
- **Pending criteria (human-checked):**
  - audit flow: checked by the orchestrator at the user's request on a scratch clone of a finished change in another project. The filled `audit-prompt.md` ran `ponytail:ponytail-audit` in the background. It wrote the audit file in the documented shape and deleted its marker. Review's step 4 decided all three findings without asking: two small fixes applied (the project's tests passed), one large. The large fix was not built through a lead and verifier in that test. The scratch clone was deleted afterwards.
  - audit config: accepted on the verifier's reading. The uninvokable-skill and `-2` paths were not exercised.
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Lead decisions:** `.running` markers are created before dispatch and each subagent deletes its own; the audit subagent is general-purpose on opus; plan order is first appearance in plan.yaml; the audit file has a Range line and review appends Decisions; review gets section 4 Audit; a stale marker goes to the user; args placeholders are filled per repository.
- **Agents replaced:** none
- **Observed, not fixed:** `stage-start.sh` question 4 asks only for the audit skill, not its args. The verifier also noted: `<main root>` is undefined in `skills/implement/SKILL.md`'s audit step, and audit files stay uncommitted until review.

#### M8 docs-release

- **Verifier FAILs:**
  - round 1: import titles for scope-tagged findings were only the tag; process.md lacked the audit `-2`/`-3` suffix.
  - round 2: anonymisation leftovers in the fixtures.
- **Pending criteria (human-checked):** docs: accepted on the verifier's reading.
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Lead decisions:** `import --file --project-id [--project] [--now]`; a per-finding scope rule (an Actions target of kentra-rpir goes to the plugin, another target to the project, else SKILL or PROCESS goes to the plugin); one class per finding; duplicate ids get `-2`; the backlog goes to the plugin under the change `retro-backlog`; scope tags and `What happened:` prefixes are stripped from titles with an abbreviation-safe splitter.
- **Agents replaced:** none
- **Observed, not fixed:** "no action" rows with a kentra-rpir target are still plugin-scoped.

#### M9 leak-cleanup (user-requested)

Added by the user before publishing: kentra-rpir is public, and the change's
files held content from the user's private projects. It changes no requirement.

- **Verifier FAILs:** none
- **Pending criteria (human-checked):** redaction reads well: open.
- **Concerns raised (DONE_WITH_CONCERNS):** none
- **Lead decisions:** private projects are named project A, B and C, and changes change 1 to 14, consistently across files; retro fixtures are synthetic; `harnessTokens` was renamed `workflowTokens` (a plugin-internal field); the planning log keeps its record kinds and order, with neutral paraphrases.
- **Agents replaced:** none
- **Observed, not fixed:** leaks in files outside the change went to the history rewrite.

## Plan adjustments

| Milestone | Change | Reason | Commit |
|---|---|---|---|
| M6 | paths gain `scripts/improvements.mjs` and `tests/improvements.test.mjs` | resetting the nudge with nothing eligible needs `decide --verdict none` in M3's script | 89c4acc |
| M9 | new milestone `leak-cleanup` | the user's decision to remove private content before publishing | — |

## Decisions the user made

| Question | Decision |
|---|---|
| Push during implement? | No. Push only after the leak cleanup, on explicit go-ahead. |
| Retro fixtures | Synthetic content. |
| Leaks in the change and in public history | Remove all; squash the change into one commit; rewrite the public history with `git filter-repo`. |
| Mentions of the public kentra-io/harness repository | Keep. |
| The user's first name in fixtures and trailers | Keep. |
| Process-redesign research docs | Delete four from history, scrub the rest. |
| The user's quotes about kentra-rpir's own design | Keep. |
| AGENTS.md | States the repository is public and how to mask private work. |
| Human-checked criteria | The user checks the layout after release; the orchestrator tests the audit flow; the rest is accepted on the verifiers' readings. |

## Merge conflicts resolved

| Milestones | Files | Resolution |
|---|---|---|
| — | — | none |
