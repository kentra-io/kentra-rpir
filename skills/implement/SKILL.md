---
name: implement
description: Orchestrates the implement stage of a kentra-rpir change — a persistent Opus lead per milestone running fresh Sonnet implementers, parallel milestones in git worktrees, a fresh contract verifier per milestone, fix rounds back to the same lead, merges into an integration branch, an escalation ladder, and impl-report.md. Use when a plan, or a small-tier spec, is approved and the user wants it built.
---

# implement — the implement stage of kentra-rpir

**You are the orchestrator.** You build the change milestone by milestone,
each in its own worktree, independent milestones in parallel:

| Role | Who dispatches it | Lives |
|---|---|---|
| **lead** (`roles.lead`) | you, one per milestone | the whole milestone: you resume it with SendMessage for every fix round |
| **implementer** (`roles.implementer`) | the lead, one per piece of work, one at a time | one piece |
| **verifier** (`roles.verifier`) | you, when a lead hands back | one milestone's verification; resumed for a re-verification within the cache window |

The lead owns the design inside its milestone. Your judgement does the
following:

- answering what a lead cannot;
- resolving merge conflicts;
- adjusting the plan without changing the spec;
- deciding what goes to the user.

The protocol below is fixed: DAG order, a fresh verifier per milestone,
fix rounds to the same lead, and the escalation ladder. Keep your own
context to hand-backs, verdicts and the state file; the leads and verifiers
read the code.

**Where things are:**
- the config is `rpir/config.yaml` (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/config.yaml`);
- change folders are `rpir/changes/<YYYY-MM-DD-slug>/`;
- the dispatch prompts are `${CLAUDE_SKILL_DIR}/lead-prompt.md` and
  `${CLAUDE_SKILL_DIR}/verifier-prompt.md`; the audit prompt is
  `${CLAUDE_SKILL_DIR}/audit-prompt.md`;
- the report template is `${CLAUDE_PLUGIN_ROOT}/templates/impl-report.md`;
- the state file is `<change>/.local/implement-state.json` (see "State file").

If this session is not running on `roles.impl-orchestrator.model`, tell the
user before starting and let them choose to continue or switch models.

Stay in the project root for the whole stage. Reach into worktrees with
`git -C <worktree>` and absolute paths. The Agent tool has no working-directory
parameter, so every dispatch prompt fills a `{{worktree}}` slot with the
worktree's absolute path instead.

## 1. Start

1. **Stage start.** Run
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/stage-start.sh" "<project root>"`. On exit 3,
   stop and relay its line. On `user-config: missing`, follow the
   instructions it prints (the user's questions, in one message) before going
   on. Remember its `mode:` line: on `mode: untracked`, skip every commit of
   the change folder and say so in one line.
2. **Find the change:** the folder the user names, else
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/sessions.sh" current --project <project root> --session "${CLAUDE_SESSION_ID}"`
   (the session's own change, else the newest by sessions file). Confirm
   your choice with the user. Its spec should say `status: planned`.
3. **Read the spec's `tier`.** A spec whose `tier` is `full` or `light`
   belongs to a change started under kentra-rpir 0.5.x, which finishes on
   0.5.x. Stop and tell the user so.
4. **Load the milestones.**
   - **`standard`:** run `milestoned-plan-dag --version`, then
     `milestoned-plan-dag validate <plan>` and
     `milestoned-plan-dag resolve <plan>`. The resolve output is your
     milestone list and order. When the tool is missing, or `validate`
     rejects `schemaVersion: 0.5.0`, stop and tell the user:
     `kentra-rpir needs milestoned-plan-dag 0.5.0 or later: brew upgrade kentra-io/tap/milestoned-plan-dag`.
   - **`small`:** there is no `plan.yaml`. When the state file (step 5)
     names this change, take milestone 1's `contract` from it. Otherwise
     build one milestone from the spec, as "Small tier" below says, and
     confirm its contract with the user before dispatching.
5. **State file.** List every other unfinished implementation: each
   `rpir/changes/*/.local/implement-state.json`, with its phase and last
   update time (the file's mtime), and tell the user. When this change's own
   state file exists, this is a resumed run: go to "After a resume or
   compaction". Otherwise create it.
6. **Repositories and integration worktrees.** The repositories are the
   distinct cleaned `repo` values of the resolved plan; `<R>` is
   `<project root>/<repo>`. A plan without `repo` (every small-tier change) has
   the one repository `.`. In each repository, from its current branch:
   `git -C <R> worktree add <R>/<worktreesDir>/<slug> -b <branchPrefix><slug>`.
   When `git -C <R> check-ignore -q <worktreesDir>` fails, first append
   `<worktreesDir>/` to `$(git -C <R> rev-parse --git-common-dir)/info/exclude`.
   Record each repository's `repos` entry in the state file, with `base` the
   sha the branch was cut from.

   The change folder lives in the project root. When the project root is a git
   repository it is always among the repositories, with its integration
   worktree, even if no milestone has `repo: .`. When it is not (a workspace
   folder), commit nothing of the change folder: work as in untracked mode, and
   give leads and verifiers the absolute paths of the spec and plan there.
7. **Register this session** to the change folder:
   `mkdir -p <change>/.local && echo "${CLAUDE_SESSION_ID} implement" >> <change>/.local/sessions`.
8. Set the spec's `status: implementing` in the project root's integration
   worktree and commit; in untracked mode, edit the main checkout's spec
   instead, uncommitted.
9. In each repository's integration worktree, run the check its milestones'
   contracts name once, so you know the baseline is green.

In untracked mode the worktrees hold no `rpir/`: give every lead and
verifier the absolute path of the spec (and plan) in the main checkout.

Keep a running log for `impl-report.md`: dispatches, lead rounds, verify
rounds, FAILs, concerns, the leads' decisions, adjustments and conflicts.

### Small tier

A small-tier change is one milestone built from the spec:

- **number** `1`; **slug** the change folder's name without its
  `YYYY-MM-DD-` date; **goal** the spec's title;
- **plan context:** `A small-tier change: there is no plan file. The spec is
  the whole contract.`;
- **description:** `Builds every requirement of the spec, following its
  Design.`;
- **deliverables:** the files the spec's Layout names, else what the
  requirements need;
- **check:** the repo's standard check, from `AGENTS.md`, `CLAUDE.md`, the
  README or the CI config;
- **criteria:** one per numbered requirement, named after the test that
  will prove it, or `human:` and what the user checks;
- **paths:** the files and directories the Layout and requirements name,
  plus the tests beside them;
- **rules:** those the spec names, else none.

Show the user this contract in one message. Their confirmation stands in
for an approved plan. Record the confirmed contract in the state file as
milestone 1's `contract` (step 1.4); fill the lead and verifier prompts
from it, then and after any resume. Then run it through steps 2–6 like any
milestone.

## 2. Dispatch leads

For every milestone whose dependencies are all merged and which is not yet
started, while fewer than `implement.maxParallel` milestones are in
progress (a lead dispatched, not yet merged or settled as blocked):

1. Create its worktree **from its repository's integration branch head**:
   `git -C <R> worktree add <R>/<worktreesDir>/<slug>--m<n>-<mslug> -b <branchPrefix><slug>--m<n> <branchPrefix><slug>`.
   Record that head as the milestone's `base`.
2. Fill `lead-prompt.md`:
   - `title` is `spec.md`'s title;
   - `worktree` is the milestone worktree's absolute path; `branch` and
     `base` as created in step 1;
   - `repo` is one line: the milestone's repository `<R>` (absolute path, and
     its `repo` value; for a single-repository plan, the project root), that
     the milestone's `paths` and `check` are relative to it, and that the lead
     writes only there;
   - `spec` is the absolute path of `spec.md` inside the milestone worktree
     (in untracked mode, in the main checkout);
   - `implementer_agent` and `implementer_model` are
     `roles.implementer.agent` and `roles.implementer.model`;
   - `plan_description` is the plan's `description`;
   - `rules` is the plan-level rules followed by the milestone's;
   - the milestone fields come from the resolve output, or at the small
     tier from the state file's `contract`;
   - `guidance` is empty on the first dispatch.
3. Dispatch with the Agent tool, `run_in_background: true`:
   - `subagent_type`: `roles.lead.agent`;
   - `model`: `roles.lead.model`;
   - `description` and `prompt`: as "Dispatch prompts" below says.

   Dispatch every ready milestone in the same message so they run in
   parallel.
4. Record the lead's agent id, from the launch notice, in the state file.

A milestone that unblocks while every slot is taken waits for the next
merge or settled block.

## 3. Lead hand-backs

When a lead hands back, write its hand-back time to the state file, then:

| STATUS | You do |
|---|---|
| `DONE` | Verify (step 4). |
| `DONE_WITH_CONCERNS` | Read the concerns. Settle those about correctness or scope: resume the lead with guidance, or decide per "Decide or ask". Then verify. A concern that one of the milestone's own criteria, its check or a documented command fails, or could not be run, somewhere (a worktree, an image, CI, a busy port) is about correctness, even when it works elsewhere: resume the lead or adjust the plan, never note it and pass it on. |
| `NEEDS_CONTEXT` | Find the answer, or ask the user when it is theirs, and resume the lead with it. |
| `BLOCKED` | Decide per "Decide or ask": resume the lead with guidance, adjust the plan, or ask the user. |
| `WAITING` | Not a hand-back to verify. Its implementer, named on the `WAITING:` line, still runs, and its report comes to you, not to the lead. Set the milestone's phase to `waiting`. When that report arrives, resume the same lead with it verbatim. |

An implementer's report reaching you directly (its description starts with
`M<n>`) belongs to milestone n's lead. When that lead's last hand-back was
WAITING, pass the report on at once; otherwise send it with the lead's next
resume.

Resume a lead with SendMessage to its agent id: the answer, guidance,
findings or implementer report, and nothing it already has. A resume with
an answer, guidance or findings starts a new round: count it in the
milestone's `leadRounds`. Passing on an implementer's report continues the
same round.

## 4. Verify

Every lead hand-back you verify gets a verifier that is independent of the
lead. Send it the milestone, never the lead's report.

- **First verification of a milestone:** dispatch a fresh verifier with the
  Agent tool, `run_in_background: true`:
  - `subagent_type`: `roles.verifier.agent`, `model`: `roles.verifier.model`;
  - `description` and `prompt`: as "Dispatch prompts" below says, with
    `verifier-prompt.md` filled: `title` = `spec.md`'s title, `branch` =
    the milestone branch, `base` = the milestone's `base`, `repo` as in the
    lead's prompt (the verifier writes only there), and every other slot as
    in the lead's prompt.
- **Re-verification after a fix:** take the verifier's `handedBackAt` from
  the state file and compare it with `date +%s`.
  - **Within `implement.cacheWindowMinutes`:** count it in
    `verifyResumes` and resume that verifier with SendMessage: `Re-verify M<n> <mslug>: the lead's fix is committed on
    <branch>. Verify from scratch: run the full check, re-read the whole
    diff from <base>, and go through every check again.`
  - **Otherwise,** or when it cannot be reached: dispatch a fresh verifier
    as for the first verification.

Record each verifier's agent id, and its hand-back time when it reports.

- **PASS** → integrate (step 5).
  A PASS with PENDING criteria integrates too; keep the pending criteria for
  the user, who checks them on the integrated stack before the report.
- **FAIL** → resume the same lead with SendMessage: the verifier's findings,
  verbatim, and the round number. Its next hand-back goes through step 3.
  After `implement.maxVerifyRounds` FAILs, treat the milestone as blocked.

## 5. Integrate

On PASS:

1. Merge in the milestone's repository's integration worktree (`<I>`):
   `git -C <I> merge --no-ff <milestone branch> -m "Merge M<n> <mslug>"`.
2. Resolve any conflict yourself. Both sides' intent is in the two milestones;
   keep both, and record the resolution.
3. Set the repository's `head` in the state file to `git -C <I> rev-parse HEAD`.
   Run the milestone's check in `<I>`. If it fails, the merge broke
   something: fix it on the integration branch, or resume the milestone's
   lead with the failure.
4. Clean up:
   `git -C <R> worktree remove <milestone worktree>` and
   `git -C <I> branch -d <milestone branch>`. `branch -d`
   checks the merge against the current worktree's HEAD, which must be the
   integration branch.
5. Mark the milestone merged in the state file. Its lead and verifier are
   done.
6. Dispatch every milestone this one unblocked, and any waiting for a slot
   (step 2).

## State file

`<change>/.local/implement-state.json` records what you need to pick the run up
again. Rewrite it whole with the Write tool on every dispatch, hand-back,
phase change and merge, before acting on the hand-back:

```json
{
  "change": "rpir/changes/2026-11-05-example",
  "repos": {
    ".": {
      "path": "/abs/project",
      "integration": "/abs/project/.worktrees/2026-11-05-example",
      "branch": "rpir/2026-11-05-example",
      "base": "<sha the integration branch was cut from>",
      "head": "<integration head after the last merge>"
    }
  },
  "milestones": {
    "2": {
      "slug": "store",
      "repo": ".",
      "worktree": "/abs/project/.worktrees/2026-11-05-example--m2-store",
      "branch": "rpir/2026-11-05-example--m2",
      "base": "<repository integration sha the milestone branched from>",
      "phase": "lead | waiting | verify | merged | blocked",
      "lead": { "id": "<agent id>", "handedBackAt": 1762340000 },
      "verifier": { "id": "<agent id>", "handedBackAt": null },
      "leadRounds": 2,
      "verifyRounds": 2,
      "verifyResumes": 1,
      "contract": "small tier only: { goal, description, deliverables, check, criteria, paths, rules } as the user confirmed them"
    }
  }
}
```

Times are `date +%s` seconds; `handedBackAt` is `null` while the agent runs.
`leadRounds` counts the lead's dispatch and every resume that starts a new
round (step 3); `verifyRounds` every verification, of which
`verifyResumes` resumed a verifier.

### After a resume or compaction

Re-read the state file before anything else, and `git -C <integration> log
--oneline` for the merges, per repository in `repos`. A small-tier milestone's prompts come from its
recorded `contract`. Then, per milestone that is not merged:

- an agent recorded as running: wait for its notification. When none
  arrives because the session's process was resumed, resume the agent with
  SendMessage, telling it to continue where it stopped and hand back when
  its work is done. Tell a lead also that implementers it started before
  the resume are gone: it checks the branch for each piece's commit and
  briefs a fresh implementer for any unfinished work;
- a milestone in phase `waiting`, after a process resume: resume its lead
  with the same message about implementers that are gone. After a
  compaction the implementer is still running: keep waiting for its report;
- an agent you need to reach (a lead for a fix round, a verifier within the
  cache window) that SendMessage cannot reach is replaced by a fresh one:
  - a fresh lead gets `guidance`: `An earlier lead worked on this milestone;
    its commits are on <branch> (git log <base>..HEAD). Continue from them.`
    plus the findings or answer it was due;
  - a fresh verifier is dispatched as in step 4.

Record each replacement in the state file and the log.

## Dispatch prompts

Every lead and verifier dispatch, first or replacement, from any step, sets:

- `description`: `Lead M<n> <mslug>` for a lead, `Verify M<n> <mslug>` for a
  verifier;
- `prompt`: the filled template, its first line kept verbatim as the
  prompt's first line.

The milestone graph pane maps each dispatch to its milestone by that first line
and the `description`, and follows a resumed lead or verifier by its agent id.
A prompt too long to send whole goes in a file: the Agent `prompt` is then the
filled template's first line and its `Work only in` paragraph, with the
worktree's absolute path, followed by the file's absolute path and an
instruction to read all of it.

## Decide or ask

The lead builds the milestone as its description and contract say. You
answer what it cannot, and you never let it deviate silently.

| You resolve | You ask the user |
|---|---|
| Missing context: supply it | A change to a requirement, or to behaviour the spec describes |
| A technical contradiction with one clear answer | A trade-off the spec did not settle |
| Merge conflicts between milestones | A conflict with the constitution |
| Flaky or environment failures you can fix | Dropping or deferring a milestone, or any other change to scope |
| Plan adjustments that keep the spec intact: renaming a file, splitting a milestone, a different patch version | A new dependency, or an API or contract other code relies on that the plan did not name |
| | A blocker still unresolved after two retries |

**Escalation ladder, per blocker:**

- Allow two retries, each resuming the lead with new guidance or context.
  Never re-send a failing message unchanged.
- Then stop and ask the user (`implement.maxAttempts`).
- Milestones that do not depend on the blocked one keep running while you wait.

**Plan adjustments:**

1. Edit `plan.yaml` on the integration branch.
2. Validate it and commit it, with the reason in the commit message. In
   untracked mode, skip the commit; the report records the adjustment as a
   diff against `<change>/.local/reviewed/plan.yaml`.
3. Run a new or changed criterion command at the milestone's base, as
   reviewer P11 does (against the files it reads there, or one file you
   write when they do not exist yet): it prints what the criterion says and
   fails on one bad line you write. Do this before you resume the milestone.
4. Log the adjustment.

Anything that would change `spec.md` goes to the user.

## 6. Finish

When every milestone is merged, or blocked and settled with the user:

1. Show the user every PENDING criterion from the verifiers, with the
   integration worktree to check it in, and record each answer. A criterion
   the user rejects is a FAIL for its milestone: dispatch a fresh lead with
   the user's answer as `guidance` in a new milestone worktree from the
   integration head (step 2.1), verify it (step 4) and integrate it
   (step 5) before finishing.
2. Write `impl-report.md` in the change folder (in the project root's
   integration worktree; in place when the project root is not a git
   repository), from the template, your log and the state file (its `repos` fill the
   Repositories table). Report what happened,
   including FAILs, concerns and the leads' decisions. Copy each lead's final
   CONCERNS and OBSERVED lines verbatim. The retro checks
   every claim in it against the transcripts.
3. Set the spec's `status: in-review`.
4. Commit the change folder on the integration branch (in untracked mode,
   edit the main checkout's spec instead, uncommitted, and skip the commit).
5. When `implement.push` is true, push:
   `git -C <I> push -u origin <branchPrefix><slug>` for each repository's
   integration worktree `<I>`. Otherwise tell the user the branches are ready
   to push, and push only when they ask.
6. For each repository whose branch is pushed, when `implement.openPullRequest`
   is true, its remote is GitHub, and `gh auth status` succeeds: open a pull
   request whose body links the spec, the plan and `impl-report.md`. With
   several repositories, the body also links the other pull requests and
   states the report's merge order.
7. **Audit.** The audit config is `audit` in `rpir/config.yaml`, else in the
   user config `${XDG_CONFIG_HOME:-~/.config}/kentra-rpir/config.yaml`; the
   project key wins. An empty or missing `audit.skill` means no audit: skip
   this step. Otherwise launch one audit per `repos` entry whose `base`
   differs from its `head`:
   - Its name `<repo>` is the project id (`project:` in `rpir/config.yaml`)
     for `.` or for a change with a single repository; otherwise the cleaned
     `repo` path (`./a` and `a/` are `a`) with leading `../` segments dropped and `/` replaced by `-`. When
     two repositories map to one name, append `-2`, `-3` in plan order (the
     order in which the repositories first appear in plan.yaml's milestones).
   - Fill `audit.args`' `{{worktree}}`, `{{base}}` and `{{head}}` with that
     repository's integration worktree, base and head, then fill
     `audit-prompt.md`'s slots. `auditFile` is `<change>/audit/<repo>.md` in
     the change folder holding `impl-report.md` (absolute). `marker` is
     `<main root>/<change>/.local/audit.<repo>.running` (absolute; `.local/`
     lives in the main checkout).
   - `touch` every marker before dispatching any audit.
   - Dispatch every audit in one message: Agent tool,
     `run_in_background: true`, `subagent_type: general-purpose`,
     `model: opus`, `description: audit <repo>`, prompt = the filled template.
   - Leave the audit files uncommitted: review commits them with the change
     folder.
8. Delete this change's `<change>/.local/implement-state.json`.

The stage is done when the integration branch has `impl-report.md`, pushed
when `implement.push` is true, and the spec says `status: in-review`. Leave
the integration worktree in place. Then end with one line:

`Implemented on <branch> in <worktreesDir>/<slug>: <change folder>/impl-report.md[, <PR url>]. Next: /kentra-rpir:review.`
(with several repositories, name each repository's branch and worktree.)
When audits launched, add `Audit running: <names>.`

## Red flags

| Thought | Reality |
|---|---|
| "The lead handed back, so I'll verify" | A WAITING lead is mid-piece. Verify only DONE, or settled DONE_WITH_CONCERNS. |
| "The lead said DONE, I'll merge" | Every milestone passes a verifier independent of its lead first. |
| "I'll tell the verifier what the lead reported" | The verifier gets the milestone, never the lead's report. |
| "A FAIL: I'll dispatch a new lead with the findings" | The same lead, resumed with SendMessage. A fresh one only when it cannot be reached. |
| "The verifier handed back 9 minutes ago; resuming is cheaper" | Past the cache window it re-writes its whole context. Dispatch a fresh one. |
| "A resumed verifier only needs to check its findings" | It re-runs the full check and re-reads the whole diff. |
| "Same guidance again, it might work this time" | Each retry carries new guidance or context. |
| "Four milestones are ready; I'll start them all" | At most `implement.maxParallel` milestones are in progress at once. |
| "I lost track after the compaction; I'll start over" | The state file holds every agent id and hand-back time. Re-read it. |
| "The spec is slightly wrong; I'll fix it in the plan" | Anything that changes the spec goes to the user. |
| "I'll leave the FAIL out of the report" | The retro reads the transcripts. Report it. |
| "I'll wait for the audit before ending" | It runs in the background; review waits for its markers. |
| "The prompt is long; I'll send just the path to its file" | The Agent prompt starts with the template's first line and `Work only in` paragraph; the path follows them. |
