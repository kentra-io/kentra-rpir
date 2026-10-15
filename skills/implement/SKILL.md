---
name: implement
description: Orchestrates the implementation of a kentra-rpir plan.yaml — parallel milestones in git worktrees, an implementer and a fresh verifier per milestone, merges into an integration branch, an escalation ladder, and impl-report.md. Use when a plan is approved and the user wants it built.
---

# implement — stage 3 of kentra-rpir

**You are the orchestrator.** Build the plan by dispatching an implementer and a
fresh verifier per milestone, running independent milestones in parallel, each
in its own worktree. Your judgement does the following:

- unblocking implementers;
- resolving merge conflicts;
- adjusting the plan without changing the spec;
- deciding what goes to the user.

The protocol below is fixed: DAG order, a fresh verifier per milestone, and the
escalation ladder.

**Where things are:**
- the config is `.kentra-rpir.yaml` (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/kentra-rpir.yaml`);
- the dispatch prompts are `${CLAUDE_SKILL_DIR}/implementer-prompt.md` and
  `${CLAUDE_SKILL_DIR}/verifier-prompt.md`;
- the report template is `${CLAUDE_PLUGIN_ROOT}/templates/impl-report.md`.

If this session is not running on `roles.impl-orchestrator.model`, tell the
user before starting and let them choose to continue or switch models.

Stay in the project root for the whole stage. Reach into worktrees with
`git -C <worktree>` and absolute paths. The Agent tool has no working-directory
parameter, so every dispatch prompt fills a `{{worktree}}` slot with the
worktree's absolute path instead.

## 1. Start

1. Find the change: the folder the user names, else the newest entry for this
   project in `.kentra-rpir/sessions.map`, else the newest folder under
   `changesDir`. Confirm your choice with the user. Its spec should say
   `status: planned`.
2. Validate the plan:
   `milestoned-plan-dag validate <plan>`, then
   `milestoned-plan-dag resolve <plan>`. The resolve output is your milestone
   list and order.
3. Create the integration worktree from the current branch:
   `git worktree add <worktreesDir>/<slug> -b <branchPrefix><slug>`.
4. Register this session to the change folder:
   `mkdir -p .kentra-rpir && echo "${CLAUDE_SESSION_ID} <change folder> implement" >> .kentra-rpir/sessions.map`.
5. In the integration worktree:
   - set the spec's `status: implementing`;
   - commit;
   - run the plan's `check` once, so you know the baseline is green.

Keep a running log for `impl-report.md`: dispatches, verify rounds, FAILs,
concerns, adjustments, decisions and conflicts.

## 2. Dispatch implementers

For every milestone whose dependencies are all merged and which is not yet
started:

1. Create its worktree **from the integration branch's current head**:
   `git worktree add <worktreesDir>/<slug>--m<n>-<mslug> -b <branchPrefix><slug>--m<n> <branchPrefix><slug>`.
2. Fill `implementer-prompt.md`:
   - `worktree` is the milestone worktree's absolute path;
   - `plan_description` is the plan's `description`;
   - `rules` is the plan-level rules followed by the milestone's;
   - the milestone fields come from the resolve output;
   - `guidance` is empty on the first dispatch.
3. Dispatch with the Agent tool:
   - `subagent_type`: `roles.implementer.agent`;
   - `model`: `roles.implementer.model`;
   - the filled prompt.

   Dispatch every ready milestone in the same message so they run in parallel.

Handle the report:

| STATUS | You do |
|---|---|
| `DONE` | Verify (step 3). |
| `DONE_WITH_CONCERNS` | Read the concerns. Settle those about correctness or scope (re-dispatch with guidance, or decide per the table below), then verify. |
| `NEEDS_CONTEXT` | Find the answer and re-dispatch with it in `guidance`. |
| `BLOCKED` | Decide per the table below: re-dispatch with guidance, adjust the plan, or ask the user. |

## 3. Verify

Dispatch a **new** verifier for every finished milestone, never reusing the
implementer's context:

- `subagent_type`: `roles.verifier.agent`, `model`: `roles.verifier.model`;
- the prompt: `verifier-prompt.md` filled, with `title` = `spec.md`'s title,
  `branch` = the milestone branch created in step 2.1, `worktree` = the
  milestone worktree's absolute path, and `base` = the integration-branch
  commit the milestone branched from.

- **PASS** → integrate (step 4).
  A PASS with PENDING criteria integrates too; keep the pending criteria for
  the user, who checks them on the integrated stack before the report.
- **FAIL** → re-dispatch the implementer with the findings as `guidance`, then
  verify again with a new verifier. After `implement.maxVerifyRounds` FAILs,
  treat the milestone as blocked.

## 4. Integrate

On PASS:

1. Merge in the integration worktree:
   `git -C <worktreesDir>/<slug> merge --no-ff <milestone branch> -m "Merge M<n> <mslug>"`.
2. Resolve any conflict yourself. Both sides' intent is in the two milestones;
   keep both, and record the resolution.
3. Run the plan's `check` in the integration worktree. If it fails, the merge
   broke something: fix it on the integration branch, or re-dispatch the
   milestone with the failure.
4. Clean up:
   `git worktree remove <milestone worktree>` and
   `git -C <worktreesDir>/<slug> branch -d <milestone branch>`. `branch -d`
   checks the merge against the current worktree's HEAD, which must be the
   integration branch.
5. Dispatch every milestone this one unblocked (step 2).

## Decide or ask

The implementer follows the milestone exactly. You unblock it, and you never let
it deviate silently.

| You resolve | You ask the user |
|---|---|
| Missing context: supply it | A change to a requirement, or to behaviour the spec describes |
| A technical contradiction with one clear answer | A trade-off the spec did not settle |
| Merge conflicts between milestones | A conflict with the constitution |
| Flaky or environment failures you can fix | Dropping or deferring a milestone, or any other change to scope |
| Plan adjustments that keep the spec intact: renaming a file, reordering or adding a step, splitting a milestone, a different patch version | A new dependency, or an API or contract other code relies on that the plan did not name |
| | A blocker still unresolved after two re-dispatches |

**Escalation ladder, per blocker:**

- Allow two re-dispatches, each with new guidance or context. Never re-send a
  failing dispatch unchanged.
- Then stop and ask the user (`implement.maxAttempts`).
- Milestones that do not depend on the blocked one keep running while you wait.

**Plan adjustments:**

1. Edit `plan.yaml` on the integration branch.
2. Validate it and commit it, with the reason in the commit message.
3. Log the adjustment.

Anything that would change `spec.md` goes to the user.

## 5. Finish

When every milestone is merged, or blocked and settled with the user:

1. Show the user every PENDING criterion from the verifiers, with the
   integration worktree to check it in, and record each answer. A criterion
   the user rejects is a FAIL for its milestone: dispatch an implementer
   with the user's answer as `guidance` in a new milestone worktree from
   the integration head (step 2.1), verify it (step 3) and integrate it
   (step 4) before finishing.
2. Write `impl-report.md` in the change folder in the integration worktree,
   from the template and your log. Report what happened, including FAILs and
   concerns. The retro checks every claim in it against the transcripts.
3. Set the spec's `status: in-review`.
4. Commit the change folder on the integration branch.
5. Push:
   `git -C <worktreesDir>/<slug> push -u origin <branchPrefix><slug>`.
6. When `implement.openPullRequest` is true, the remote is GitHub, and
   `gh auth status` succeeds: open a pull request whose body links the spec,
   the plan and `impl-report.md`.

The stage is done when the integration branch is pushed with `impl-report.md`
and the spec says `status: in-review`. Leave the integration worktree in
place. Then end with one line:

`Implemented on <branch> in <worktreesDir>/<slug>: <change folder>/impl-report.md[, <PR url>]. Next: /kentra-rpir:review.`

## Red flags

| Thought | Reality |
|---|---|
| "The implementer said DONE, I'll merge" | Every milestone passes a fresh verifier first. |
| "I'll reuse the implementer to verify" | A new verifier, every round. |
| "Same prompt again, it might work this time" | Each re-dispatch carries new guidance or context. |
| "The spec is slightly wrong; I'll fix it in the plan" | Anything that changes the spec goes to the user. |
| "I'll leave the FAIL out of the report" | The retro reads the transcripts. Report it. |
