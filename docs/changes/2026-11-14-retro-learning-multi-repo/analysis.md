# kentra-rpir retrospective: the last 4 weeks of runs (0.5.2 to 0.6.2)

**Evidence base:** 27 sources: planning, implement and review transcripts, plus retro reports and issues. I also checked the 0.6.2 plugin files below:
- `skills/plan/SKILL.md`
- `skills/implement/SKILL.md` and `lead-prompt.md`
- `skills/research/SKILL.md`
- `skills/review/SKILL.md`
- `agents/lead.md`, `implementer.md`, `verifier.md`, `reviewer.md`, `researcher.md` and `retro.md`
- `scripts/commit-change.sh` and `scripts/research-queue.sh`
- `workflows/spec-retro.js`
- `templates/kentra-rpir.yaml`
- `docs/retro-backlog.md`
- `gh issue list`
- `git log`

Citations use the source labels from the event set. Corrections to the first draft are marked **Correction**.

## 1. What we ran

| Change / session | Plugin | Stages | One-line outcome |
|---|---|---|---|
| change 1: spec, plan and impl sessions | 0.5.2 | spec, plan, impl, review, retro | 21 milestones merged, then 6 more were added at review (M22–M27). Planning cost about 25M tokens: 26+10 workflows and 28 question rounds. The retro had 23 findings, and most have no decision recorded. |
| change 2: spec, plan and impl sessions | 0.5.3 | spec, plan, impl | 22 milestones over 3 orchestrator sessions and about 10 compactions. A spec amendment followed mid-stage. A refuted premise (P17, a CI permission) blocked CI for about 3h. No retro. |
| change 3: plan and impl sessions | 0.5.2, then 0.6.0 | plan, impl | 7 milestones merged, with 2 verifier FAILs. The run hit the shared state-file clash. M7's proof-of-concept merge requests needed heavy user steering. No review and no retro. |
| change 4: plan and impl+review sessions | 0.6.0 | plan, impl, review, retro | 9 milestones, 7 of them with fix rounds. M3 alone cost about 1.2M tokens. The user found 3 defects after verification passed. The retro had 36 findings and fed 0.6.1. |
| change 5: one session | 0.6.0 | plan, impl, review, retro | 4 milestones, with one FAIL on M1. A diff review was cut short by the user, and a stale-check defect nearly shipped. The findings went to the backlog, which is uncommitted. |
| change 6: plan in change 5's session, impl+review session | 0.6.0 | plan, impl, review, retro | A verifier wiped the live M1 worktree. The user rejected all 22 retro actions. Two days of out-of-plan work followed. |
| change 7: plan and impl sessions | 0.6.2 | plan, impl, review, retro | 10 milestones. Plan `paths` were widened at least 10 times. A false premise (a local `git tag`) let a breaking change through, and the user overrode the MR gate. 6 of 32 retro findings were applied. |
| change 8 (a fork inside change 7's impl session) | 0.6.2 | plan | The fork skipped the independent review and wrote no planning log. |
| change 9: one session | 0.6.2 | plan, impl | About 6h of architecture chat came before the plan existed. 7 milestones passed verification. Over the next 2 days the user found design and behaviour problems, plus a clash at rebase. The human criteria are still open. |
| change 10: one session | 0.6.2 | plan (stalled) | Researchers launched before scoping. The results of 2 researchers were lost, and the user never answered. |
| change 11: one session | 0.5.x | plan, impl, review, retro | Planning silently defaulted to the full tier (about 9–18M tokens). M8 was merged past `maxVerifyRounds`. The retro had 31 findings, and the user asked for only the top ones. |
| change 12: one session | 0.5.x | spec, plan, impl | A clean implement: 7 of 7 milestones passed first time, in about 20 min. About 65 min of plan review came before it. |
| changes 13 and 14 (older retros) | 0.4–0.5 | retro only | The source of issues #19–#22 and of the recurring classes below. |
| this session | — | — | The orchestrator of this analysis, not a retro. |

**Correction:** only 4 runs used 0.6.1 or later: changes 7, 8, 9 and 10. That matters wherever a fix shipped in 0.6.1.

## 2. Problems we faced

### T1. Plan commands, greps and criteria that never pass, or pass vacuously

**What goes wrong:** a criterion's grep or regex, or a test written in the plan, is never run against the real files at the milestone base.

**Where it happened:**
- **change 4:**
  - F6: `grep -n` defeats `^`.
  - F34: the `//` in https URLs matches.
  - F24/M7: a vacuous `[].every`.
- **change 1:** F3, F6, and the M25 orchestrator grep, which was wrong twice.
- **change 3 M5:** a grep pattern also matches a longer, unrelated name.
- **change 6 F3:** the pattern also matches an unrelated host.
- **change 2:**
  - the M9 R9 check is vacuous;
  - M12 step 20 contradicts the plan's own edit list;
  - M22 has the wrong line count.
- **change 11:** F2, F6, F13 and F14.
- **change 13:** F11.
- **change 14:** F1, a check that is green at base.

**Count:** at least 9 changes, all on 0.6.0 or earlier.

**Correction:** the draft said "all 0.6.x runs except change 12", but change 12 ran on 0.5.x, and none of the instances above is on 0.6.1 or later. Reviewer P11 and D5 shipped in 0.6.1 (commit 5c337f6). They require the reviewer to run every check the spec or plan gives, at the base and against one bad line. `agents/reviewer.md:100-103`:

> "**P11** Every command, regex or script the spec or plan gives as a check works (run it): against the files it reads at the base … and it fails on one bad line you write."

The draft's coverage line, "P11 did not stop change 7 or change 6", is wrong on both counts:
- change 6 ran on 0.6.0, before P11 existed;
- no T1 instance is cited for change 7.

**Cost:**
- Each instance costs a verifier FAIL round, a hand edit to plan.yaml mid-run, or implementers rewording correct docs to pass a wrong grep (M25).
- In change 4, M3–M6 cost 4.4M tokens, and 9 of their 11 verifications failed.

**Root cause (revised):**
- The reviewer half is fixed by P11/D5.
- What is left is criteria the orchestrator writes or narrows mid-run. `skills/implement/SKILL.md:310-314` (plan adjustments: edit, validate, commit) never runs a changed criterion. The M25 grep is this case.

**Coverage:** P11/D5 (0.6.1); issue #21. #21's class is now covered by P11.

### T2. Milestone paths miss the consumers their own change breaks

**What goes wrong:** a lead hits NEEDS_CONTEXT, the orchestrator widens `paths` by hand, and the run stalls.

**Where it happened:**
- **change 7:**
  - F3: more than 10 widenings across M3–M8; M6 was widened twice, for about 35 min of stalls.
  - F4: the generator's capability was not checked.
- **change 5:** F1 (M1, M2), and F2: a compatibility constructor later needed about 35 call-site edits.
- **change 3 M7:** a known-broken IT outside the paths was left in place.
- **change 13:** F12.

**Count:** 4 changes, the worst on 0.6.2.

**Root cause (verified):**
- `skills/plan/SKILL.md` §7 asks for `paths` "from the spec's Layout", with no step to grep the base for readers.
- Reviewer P2 (`agents/reviewer.md:76-77`) checks only that each milestone's criteria can be met inside its `paths`. It does not check that every reader of a changed symbol is inside them.
- The verifier's Consumers step (`agents/verifier.md:27-30`) finds the breakage, but only after the milestone is built.
- `agents/plan-writer.md` does not exist in 0.6.x, so issue #20 targets a missing file.

**Coverage:** backlog F1 (change 5); issue #20 (stale target).

### T3. Planning cost and question load out of proportion to the change

**What goes wrong:** design happens in chat before the plan skill runs. Survey workflows run unregistered, self-review loops repeat, and questions come in big batches or over the user's cap.

**Where it happened:**
- **change 1:** 25M tokens, 28 question rounds; F22.
- **change 2 spec:** about 10 self-reviews.
- **change 11:** the full tier by default, 110 agents (F1).
- **change 5:**
  - F14: a normal premise got a full spike;
  - F15: 1M tokens of design in chat;
  - F16: 11 questions against a cap of 5.
- **change 7:**
  - F32: an unregistered 21-agent survey at 2.6M tokens;
  - 4 diff reviews.
- **change 9:** 6h of chat before the plan existed.
- **change 12:** 4 spec reviews.
- **change 14:** F8.

**Count:** at least 8 changes.

**Root cause:**
- §3 proposes the tier but sets no budget.
- `scripts/research-queue.sh` accepts a `premise` job without a `critical:` or `normal:` prefix. I confirmed this: it validates only kind, slug and session.
- `spec.questionBatch` is a per-message cap (`templates/kentra-rpir.yaml:6`), not a session total.
- Much of this cost is chat-driven design the user chose to do before invoking the skill (change 9, change 5 F15). The plugin has limited leverage over that.

**Coverage:** backlog F14 and F16; change 1 F22 has no decision recorded.

### T4. Unreviewed edits reach `planned`; the review baseline loses integrity

**Where it happened:**
- **change 5:** F12/F13. The user cut the review short, so the trigger was user-initiated. The plugin still let it pass with no record.
- **change 6:** F15, which caused the M3 FAIL in F10.
- **change 4:** F31.
- **change 13:** F7.
- **change 7:** F30, the reviewer's baseline was overwritten mid-review.
- **change 8 fork:** no independent review at all.
- **change 3:** the claim "the last review found nothing" was made before any full review had run.

**Count:** 6 changes, across 4 retros. The change 5 backlog marks it "high, third time".

**Correction to the root cause:**
- The first review is not the problem. §8 dispatches the full reviewer in the foreground and copies to `<reviewed>` in step 3, after it returns.
- The hole is §9. The diff reviewer is dispatched "as in step 8", but foreground is not restated, and "Then copy the edited documents into `<reviewed>` again" can run while a background reviewer is still diffing against `<reviewed>`. That fits F30.
- `scripts/commit-change.sh` never compares the documents with `<reviewed>`. In gitignored change folders, the commit script is not run at all.

**Coverage:** issue #19; backlog F12/F13; change 6 F15 (rejected); change 7 F30 (not applied).

### T5. Verification weaker than its verdict

**Where it happened:**
- **Cached runs counted as green:** change 2 M1, M4, M6, M9 and M22.
- **Green runs counted as proof:** change 5 F3; change 7 F21 and F14.
- **Exit codes not read:**
  - change 2 M10, M19 and M20;
  - change 1 F10;
  - the comment cleanup reported tail's exit status;
  - change 7 F17.
- **Wrong claims:** change 1 M4 and M3/F2; change 11 F16 and F17; change 9 M6.

**Count:** at least 7 changes.

**Correction:** the `$?` rule is already shipped, and has been since the RPIR plugin replaced spec-lifecycle (commit 0ecf429, before 0.5). It is in `agents/implementer.md:27-29`, `agents/verifier.md:38-40` and `agents/lead.md:139-141`:

> "Never pipe a test or check command into `tail`, `head` or `grep` before reading `$?`"

The exit-code recurrences are agents not following an existing rule. A rule is not missing. Adding more prose will not fix them.

What is genuinely missing:
- No prompt says that an UP-TO-DATE or FROM-CACHE run is not evidence.
- No prompt requires a clause-by-clause mapping from a criterion to its assertions. The verifier's "not something weaker" (`agents/verifier.md:19-20`) is the closest.

**Coverage:** backlog F3; issue #22 (closed).

### T6. Lead briefs state facts and rules from memory

**Where it happened:**
- **change 7:**
  - F6: "read the conventions" led to 53 wrongly named properties and missing tags;
  - F7, F9 and F12: shapes written from memory;
  - F24: wrong file ownership.
- **change 4:** F5, F15 and F19.
- **change 5:** F10.
- **change 6:** F11 and F12.
- **change 3 M4:** wrong byte values in a brief.

**Count:** 5 changes.

**Correction:** `agents/lead.md` (0.6.2) has no Facts bullet at all. The Brief section, `agents/lead.md:68-87`, lists only Worktree, Piece, Files to read, Decisions, Rules, Paths, Check and Fix rounds. The draft's "0.6.1 added a Facts bullet only for copying requirement text" is wrong: commit 5c337f6 changed lead.md only for the Monitor wait.

**Coverage:** backlog F10 (lead); change 7 F7 (not applied).

### T7. Orchestration plumbing: hand-backs, waiting, notifications, state

1. **The WAITING hand-back:**
   - It uses up the lead's hand-back, and later reports are refused: change 3 M3, change 4 F27, change 7 M4.
   - It is still prescribed in `agents/lead.md:52-55`, `agents/lead.md:123-128`, `agents/lead.md:145-146` and `skills/implement/lead-prompt.md:44-45`, and it is handled in `skills/implement/SKILL.md:152-157`.
2. **Blocked foreground `sleep`:**
   - Seen in 19 subagent files in change 7, in change 9 M4 (21 Monitors), and in change 6 F8.
   - **Correction:** the lead-side Monitor fix shipped in **0.6.1** (5c337f6, F27), not 0.6.2. 0.6.2 changed only the research-queue lock. `agents/implementer.md` and `agents/verifier.md` say nothing about waiting.
3. **Placeholder hand-back bodies:** change 2 M8, M14 and M26; change 4 M3.
4. **A flood of interim notices:** change 1 (19 of 37), change 2, change 4.
5. **Lost researcher results:** change 10, 2 of 4 researchers.
   - **Correction:** `agents/researcher.md:14-16` and `agents/spike.md` already tell them to run lookups in the foreground.
   - The loss is the same "launch notice instead of result" case that `agents/lead.md:38-51` handles for leads. Researchers and spikes have no fallback for it.
6. **One state file per project:** `skills/implement/SKILL.md:36` and `:67-69` keep one file for every change. I confirmed that nothing outside `skills/implement/SKILL.md` and `docs/process.md` reads it, so a rename is safe.

**Count:** every implement run on 0.6.x.

### T8. Prompt rendering and shell tooling re-invented each run

- **No renderer:** `fill.py`, `render_prompt.py`, `plan2json.rb` and `gen-prompt.rb` were each written by hand.
- **Branch names:** built from an unsplit `m<n> <slug>` variable under zsh.
- **YAML parsers missing:** PyYAML and yq were absent.
- **`research-queue.sh` fails its first call:** in every plan session on 0.6.x, 3–4 calls fail before one works.
- **Plan YAML parse errors on `: `** in plain scalars, in 7 changes.

**Count:** about 25 incidents.

**Root cause (verified):**
- `skills/implement/SKILL.md:118-129` says "Fill `lead-prompt.md`" with no tool.
- `milestoned-plan-dag resolve` emits YAML only (`milestoned-plan-dag --help`, v0.4.0). A renderer therefore needs a YAML parser, or a JSON output from milestoned-plan-dag. That is a cross-repo change.
- `skills/research/SKILL.md:15-16` names the command "**Queue**", which invites `Q=…; $Q add`. zsh does not word-split that.
- The `: ` parse errors are caught at once by `milestoned-plan-dag validate`, so their cost is one retry each.

**Coverage:** none.

### T9. The change folder is gitignored, so plan edits are unversioned and unreviewed

- In projects A and B, the change folder (`rpir/`) is gitignored.
  - The commit script refuses or needs a force-add.
  - Worktrees lack the spec.
  - Plan adjustments become unrecorded hand edits.
- **Verified:**
  - `skills/implement/SKILL.md:122` passes `spec` as "the absolute path of `spec.md` inside the milestone worktree". In an ignored folder that file does not exist.
  - The plan-adjustment rule (`skills/implement/SKILL.md:310-314`) already requires a commit, which works in tracked folders.

**Count:** 6 changes, all in one project (project A). The trigger is the project's gitignore choice, but the plugin assumes the folder is tracked without checking.

**Coverage:** none.

### T10. Scope and design surface late; the user finds what the reviews missed

**Where it happened:**
- **change 1:** M22–M27, F19 and F20.
- **change 4:** F10/F11, with no before/after sample shown.
- **change 7:** F22, F28 (user decisions dropped from the draft) and F29.
- **change 9:** a behaviour change, a local artifact repository, a clash at rebase.
- **change 2:** the local-run gap, image placement, the base image.
- **change 2 (second session):** an overbuilt component.
- **change 11:** the direction of a key mapping.

**Count:** about 8 changes.

**Root cause:**
- §5 and §6 show the spec section by section, with no recap of the user's decisions against the draft.
- There is no sample artefact for bulk rewrites.
- Part of this is irreducible: design judgement the user exercises on seeing working code.

**Coverage:** change 11 F4/F22 and change 4 F10 were rejected.

### T11. Premise rows overclaim; research bookkeeping drifts

**Where it happened:**
- **change 7:** F1 (a local `git tag` taken as the remote's tags; this led to the gate override) and F31.
- **change 5:** F5, F17 and F18.
- **change 6:** F5 and F17.
- **change 4:** F32 and F33.
- **change 2:** P17, about 3h blocked.
- **change 3:** a normalised comparison agreed before any spike.

**Count:** 6 changes.

**Root cause:** §4 has no rule that remote or outside state is read at its source. Row wording is unchecked.

**Coverage:** backlog F17/F18.

### T12. Unsafe operations in agents, and parallel contention

- **Destructive operations:**
  - change 6 F1/F2: `rm -rf` (rejected by the user);
  - change 1 F11: `git checkout`;
  - change 7 F10: `git commit -a` swept in another implementer's edits.
  - Leads must run one implementer at a time (`agents/lead.md:33-34`), so F10 is also a deviation from an existing rule.
- **Contention:** shared `node_modules`, Taskfile cache clones, ports, Docker load.
- **Coverage:** `implement.maxParallel` (3).

### T13. Retros are noisy and the backlog doesn't drain

- **Noise:**
  - change 1: the user asked for only the most impactful findings;
  - change 11: the user said their attention is limited;
  - change 6: 22 of 22 rejected;
  - change 7: 6 of 32 applied, and the user asked not to apply findings by default.
- **Self-report errors:** reconciliation keeps finding the impl-report wrong: change 1 R1–R4, change 4 R1–R13, change 7 R1–R3.

**Root cause (corrected):**
- The volume is designed in. `workflows/spec-retro.js:441` says: "Propose exactly one action per finding below. Contradicted self-report claims are findings too".
- `skills/review/SKILL.md` §4.2 walks through every action, "one at a time".
- The stage is not done until "every retro action has a decision".
- `agents/retro.md` is not where this happens.
- Apply is already the user's choice in §4.2, so "never apply by default" restates current behaviour. The change 7 complaint is an orchestrator deviation.

**Coverage:** backlog R1–R4.

### T14. Push and authority boundaries; pending human criteria

- **Push:** the unrequested push (change 4 F29) is fixed by `implement.push` (0.6.1).
- **Authority stretched:** change 11, twice (merging past `maxVerifyRounds`; writing its own authorisation into the skill arguments), and change 2 (push permission inferred from an earlier session).
- **Pending human criteria:** `skills/implement/SKILL.md` §6.1 now shows every PENDING criterion to the user before the report. Older runs predate that.

## 3. Retro backlog and issues status

| Item | Recurring after 0.6.x? | Status |
|---|---|---|
| Backlog F10, hand-back evidence ($? exit status) | Yes | **Correction:** the rule already ships in `agents/implementer.md:27-29` (since 0ecf429). The recurrences are non-compliance. Update the backlog entry; this needs no new rule. |
| Backlog F17, stray code fences | No occurrence after 0.6.0 | Low. Close. |
| Backlog F18, planning-log.sh drops queued messages | No new evidence. `scripts/planning-log.sh` still has no `queued` handling (verified). | Small. Retro accuracy only. |
| Backlog F20, eval for a lifecycle corner case | No | Low. Close. |
| Backlog R1–R4, lossy impl-report | Yes | Relevant. A one-line version is folded into proposal #3. |
| Backlog "Filed issues not shipped" | Stale: #22 is closed | Update. |
| Backlog F12/F13, unreviewed edits reach planned | Yes | Top priority (proposal #1). |
| Backlog F1, paths miss readers | Yes, worst on 0.6.2 | Top priority (proposal #2). |
| Backlog F3, green runs as evidence | Yes | Proposal #6. |
| Backlog F4, fix rounds grow scope | One case | Medium. Not ranked. |
| Backlog F10, lead Facts bullet | Yes | Proposal #6. |
| Backlog F14, a normal premise gets a full spike | Partly | The prefix check is in proposal #5. |
| Backlog F16, over-scope and the question cap | Yes | Proposal #8. |
| Backlog F17/F18, premise rows overclaim | Yes | Proposal #7. |
| Backlog F6, sleep in leads | Fixed for leads in **0.6.1**; the backlog says 0.6.2, which is wrong | Extended to the other agents in proposal #4. |
| Backlog id collisions | — | Renumber with change-prefixed ids. |
| #19 commit-change.sh guards | Yes | Proposal #1. |
| #20 plan-writer DAG-point modelling | Yes, but the target file is gone | Retarget to `skills/plan/SKILL.md` (proposal #2) or close. |
| #21 verbatim prose check | Its class is covered by reviewer P11 (0.6.1) | Close as shipped by P11. |
| #5, #6, #11, #12, #13, #14 | Lifecycle-era; no evidence in any run | Close or move to the lifecycle repo. |

## 4. Proposed changes

Ranked by value/complexity. Each one bumps `version` in `.claude-plugin/plugin.json`. Bundling them into one 0.7.0 release is fine.

### 1. Close the review hole at `planned`
- **Files:**
  - `skills/plan/SKILL.md` §9 and §10;
  - `scripts/commit-change.sh`;
  - `tests/commit-change.test.sh`.
- **Change:**
  - **(a) §9.** "Dispatch a fresh reviewer, in the foreground, as in step 8 … After it hands back, copy the edited documents into `<reviewed>`." This is one sentence and fixes F30.
  - **(b) `commit-change.sh`.** Before staging, compare `spec.md` and `plan.yaml` with `.kentra-rpir/reviewed/<name>/` (`cmp -s`). On a difference, exit 1 unless `--unreviewed '<why>'` is given. That flag appends a line to the spec's `<!-- writer-gaps -->` block.
  - **(c) Gitignored change folder.** When `git check-ignore -q <change>`, the script runs the guard, prints "change folder is gitignored: not committed", and exits 0.
  - **(d) §10.** Always run the script, even when nothing will be committed.
- **Addresses:**
  - T4: change 5 F12/F13, change 6 F15, change 7 F30, change 4 F31, change 13 F7;
  - issue #19;
  - part of T9.
- **Value:** high. It is the third recurrence, and each case shipped a defect. The user can still override, but the override is now recorded.
- **Complexity:** S. About 15 lines of sh plus 2 test cases.
- **Verified:**
  - §8 already copies after a foreground review (§8.3);
  - §9 omits foreground and copies "then";
  - `commit-change.sh` has no reviewed comparison and no ignored-folder path.
  - The change 8 fork (no review at all) is caught only because the fork has no `<reviewed>` copy. Treat a missing `<reviewed>` copy as a difference.

### 2. Ground `paths` and criteria at the base
- **Files:** `skills/plan/SKILL.md` §7 (the `contract` bullet), `agents/reviewer.md` P2, `skills/implement/SKILL.md` plan adjustments (`:310-314`).
- **Change:**
  - **(a) Plan.** Before writing `paths`, grep the base for every reader of each symbol, flag, file, option or rule the milestone changes: tests, fixtures, docs, generators. List each reader in `paths`, or name it in a risk that says why it stays green. A new interface shape names the generator or tool that supports it, or puts the tool change in scope.
  - **(b) Reviewer P2.** Add: "…and every reader of what it changes lies in its `paths` or in a risk (grep it)."
  - **(c) Plan adjustments.** Add a step 1a: "run each new or changed criterion command at the milestone base, as reviewer P11 says".
- **Addresses:**
  - T2: change 7 F3/F4, change 5 F1/F2, change 3 M7, change 13 F12;
  - backlog F1;
  - issue #20;
  - the T1 residue: the change 1 M25 orchestrator grep.
- **Value:** high. It caused more than 10 widenings on 0.6.2.
- **Complexity:** S. Three bullets.
- **Verified:**
  - none of the three rules exists;
  - P2 checks only that criteria are satisfiable inside `paths`;
  - the verifier's Consumers step catches the breakage only after the build.

### 3. Cap the retro to what the user will read
- **Files:** `workflows/spec-retro.js` (remediation prompt, `:441-453`), `templates/spec-retro.md` (Actions), `skills/review/SKILL.md` §4 and the done line, `skills/implement/SKILL.md` §6.2.
- **Change:**
  - **(a) Remediation.** Rank the actions by recurrence × cost and mark at most 5 as `top`. The rest are listed with `Decision: backlog`.
  - **(b) Review §4.2.** Walk through only the `top` actions. Append the others to `docs/retro-backlog.md`, or the project's equivalent, without discussing them. The stage's done line becomes "every top action has a decision".
  - **(c) Impl-report §6.2.** "Copy each lead's final CONCERNS and OBSERVED lines verbatim." This is the one-line version of backlog R1–R4, and it removes most R-findings at the source.
- **Addresses:**
  - T13: change 1 (the user asked for only the most impactful findings), change 11 (the user said their attention is limited), change 6 (22/22 rejected), change 7 (6/32);
  - R1–R4.
- **Value:** high. The user said so four times.
- **Complexity:** S.
- **Verified:**
  - `spec-retro.js:441` mandates one action per finding;
  - review §4.2 walks through them all;
  - Apply is already user-chosen, so no "never apply by default" rule is needed.

### 4. Drop WAITING; one waiting rule for every agent
- **Files:**
  - `agents/lead.md` (`:52-55`, `:123-128`, `:145-146`, description);
  - `skills/implement/lead-prompt.md:44-47`;
  - `skills/implement/SKILL.md` (`:152-157`, `:261-263`, red flag `:353`);
  - `agents/retro.md:52`;
  - `agents/implementer.md`, `agents/verifier.md`, `agents/researcher.md`, `agents/spike.md`.
- **Change:**
  - **(a) Lead.** The lead always waits with Monitor and hands back once. Delete the WAITING status and the orchestrator's handling of it. Keep `spec-retro.js` able to read WAITING in older transcripts.
  - **(b) Waiting rule.** Add one line to implementer, verifier, researcher and spike: "Foreground `sleep` is refused: wait with Monitor (ToolSearch `select:Monitor`) on an until-loop. A launch notice instead of a child's result means keep your turn going until it arrives. Never hand back with children outstanding."
  - **(c) Implementer.** Add: "Stage only the files you changed (`git add <path>`); never `git commit -a`, `git checkout -- <path>` or `rm -rf` on files you did not create."
- **Addresses:**
  - T7.1: change 3 M3, change 4 F27, change 7 M4;
  - T7.2: 19 files, change 9 M4, change 6 F8;
  - T7.5: change 10;
  - T12: change 7 F10, change 1 F11.
- **Value:** high. It is noise in every run, and it confused the user.
- **Complexity:** S, but it touches 9 files.
- **Verified:**
  - WAITING is prescribed at the lines cited;
  - the Monitor wait exists only in lead.md;
  - researcher.md and spike.md have no launch-notice fallback.
- **Risk:** it assumes Monitor is always loadable in subagents. That held in every 0.6.x run cited.

### 5. Make the research queue right on the first call
- **Files:** `skills/research/SKILL.md:15-16` and §2.3, `scripts/research-queue.sh` (`add`), `tests/research-queue.test.sh`.
- **Change:**
  - **(a) Skill.** Replace the "**Queue**" alias with one full literal example:

    ```
    sh "${CLAUDE_PLUGIN_ROOT}/scripts/research-queue.sh" add --session "${CLAUDE_SESSION_ID}" --dir <dir> premise <slug> "critical: …"
    ```

    Add: "the subcommand comes first; never store the command in a variable (zsh does not split it)".
  - **(b) Script.** `add premise` exits 2 unless the question starts with `critical:` or `normal:`.
- **Addresses:**
  - T8: 3–4 failed calls in every 0.6.x plan session (change 4, change 7, change 9, change 10);
  - T3: backlog F14.
- **Value:** moderate, at near-zero cost.
- **Complexity:** S.
- **Verified:**
  - `research-queue.sh` requires the subcommand as `$1` and does not validate the prefix;
  - the skill's alias wording is at the lines cited.

### 6. Lead briefs cite their facts; Finish maps clauses to assertions
- **Files:** `agents/lead.md` (Brief section and step 6).
- **Change:**
  - **(a) Facts bullet.** Add to the brief: "every repo fact or convention in the brief, including 'X is unsupported', names the file:line you read or the grep you ran. Name the concrete rules ('properties use one naming case', 'sensitive fields carry a tag'), never 'read the conventions'."
  - **(b) Step 6.** "Map each given/when/then clause of every criterion to its assertion line (file:line). A test task reported UP-TO-DATE or FROM-CACHE is not evidence: rerun it with the cache off."
- **Addresses:**
  - T6: change 7 F6/F7/F9/F12/F24, change 4 F5/F15/F19, change 5 F10, change 6 F11/F12, change 3 M4;
  - T5: change 5 F3, change 7 F21, the change 2 cached greens;
  - backlog F3 and F10 (lead).
- **Value:** medium-high. It was proposed in 3 retros.
- **Complexity:** S. Two bullets.
- **Verified:**
  - there is no Facts bullet in `agents/lead.md:68-87`;
  - there is no cache rule anywhere in the plugin.
- **Risk:** this is prose, and the `$?` rule shows that prose can be ignored. The verifier's existing "not something weaker" check is the backstop.

### 7. Read outside state at its source
- **Files:** `skills/plan/SKILL.md` §4, and its red-flags table.
- **Change:**
  - A premise about state outside the working tree is settled only by reading it at its source, with the command and date in Evidence. Examples of such state: remote tags, registries, CI permissions, another repo's `main`. The commands are `git ls-remote --tags`, the API, and `git fetch` followed by reading `origin/<default>`.
  - A row states only what was tested, with `untested: <part>` for the rest.
  - Add a red flag: "local `git tag` shows it" → "Local tags are not the remote's".
- **Addresses:**
  - T11: change 7 F1 (the gate override) and F31, change 2 P17 (3h blocked), change 6 F17, change 5 F17/F18;
  - backlog F17/F18.
- **Value:** medium-high. It caused the gate override.
- **Complexity:** S.
- **Verified:** §4 has no source-of-truth rule and no wording rule for rows.

### 8. Recap decisions before agreement; show a sample for bulk rewrites
- **Files:** `skills/plan/SKILL.md` §2 and §6, `templates/kentra-rpir.yaml` (the `questionBatch` comment).
- **Change:**
  - **(a) Recap.** Before asking for agreement, list each decision the user made this session, one line each, next to the spec section that carries it. Use the planning log when the session is long.
  - **(b) Bulk rewrites.** For bulk rewrites (comments, docs, renames across files), show one before/after sample per file kind before agreement.
  - **(c) Question cap.** A cap the user states is a session total. Findings from an audit go to Non-goals unless the goal needs them now.
- **Addresses:**
  - T10: change 7 F28, change 4 F10/F11;
  - T3: change 5 F16, change 6 F18;
  - backlog F16.
- **Value:** medium-high. It targets where the user spends the most attention.
- **Complexity:** S.
- **Verified:** neither the recap nor the sample exists. `questionBatch` is per message (`templates/kentra-rpir.yaml:6`).

### 9. One implement state file per change
- **Files:** `skills/implement/SKILL.md` (`:36`, `:67-69`, `:218`, `:341`), `docs/process.md`.
- **Change:**
  - Use `.kentra-rpir/implement-state.<name>.json`.
  - Drop the "names another change, ask before replacing" branch.
- **Addresses:** T7.6: the parallel-run clash in change 3, which the user flagged.
- **Value:** medium.
- **Complexity:** S. A rename at four sites.
- **Verified:** nothing else in the workspace reads `implement-state.json`; I grepped the whole tree.

### 10. Support a gitignored change folder in implement
- **Files:** `skills/implement/SKILL.md` §1 and §2.2 (`:122`), the plan adjustments (`:310-314`), §6.4.
- **Change:**
  - At start, `git check-ignore -q <change folder>` sets "untracked mode". In that mode:
    - `spec` is the absolute path in the main checkout, not the worktree copy;
    - plan adjustments are logged as a `git diff --no-index` against `<reviewed>/plan.yaml` in impl-report.md, instead of being committed;
    - §6.4 skips the commit and says so.
  - Proposal #1 covers the plan side.
- **Addresses:**
  - T9: change 6 (worktrees lacked the spec), change 2, change 7 hand edits, the change 4 plan, change 1.
- **Value:** medium. 6 changes, all in project A.
- **Complexity:** S, as a few conditional lines in place of the draft's new config key.
- **Verified:** `:122` points the lead at a spec path that cannot exist in an ignored folder.

## Considered and dropped

- **Execute plan commands at base (draft #3):** the reviewer half already shipped as P11/D5 in 0.6.1 (`agents/reviewer.md:100-103`, `:123`), and no T1 instance comes from a 0.6.1+ run. The orchestrator residue is folded into #2(c).
- **Prompt renderer (draft #4):** high frequency, but medium and cross-repo. `resolve` emits YAML only, and no YAML parser is guaranteed in the box. It needs `resolve --format json` in milestoned-plan-dag first (bump `MPD_REF` in lockstep), and it is the next candidate after this round. The `: ` parse errors are caught by `validate` at the cost of one retry.
- **`handbacks.sh` extractor (draft #7):** medium. The one-line verbatim-copy rule in #3(c) gets most of the value.
- **Implementer CHECK honesty (draft #10):** the `$?` part already ships in all three agents. The safe-git part is folded into #4(c). The `rm -rf` trap (change 6 F1/F2) was rejected by the user. Leave it unless it recurs.
- **Research consistency check (draft #12a, Status vs Conclusion):** medium, for a wording problem that #7's row rule addresses more cheaply. The prefix check survives in #5(b).
- **Local-only mode config key (draft #13):** replaced by auto-detection in #1(c) and #10. A new key adds config nobody needs.
- **Planning budget hook (change 1 F22) and tier budget:** most of the cost was chat design before the skill ran, or the user's choice. #5 and #8 trim the plugin-side part.
- **Interim-notice filter (T7.4):** these are Claude Code notifications the plugin cannot suppress. #4 removes most of the background children that cause them.
- **Backlog F4 (fix rounds grow scope), F17 (fences), F20 (eval):** one case or no recurrence on 0.6.x.
- **Backlog F18 (queued messages in planning-log.sh):** small and real, but it improves only retro accuracy. Do it when the script is next touched.
- **Close obsolete issues (draft #15):** not ranked, because it is housekeeping rather than a change, but do it now:
  - close #5, #6, #11, #12, #13, #14 (lifecycle-era) and #21 (shipped as P11);
  - retarget #20 to #2;
  - in `docs/retro-backlog.md`, fix the stale #22 note, the "F6 fixed by 0.6.2" line (it was 0.6.1), and the F10 entry (the `$?` rule already ships). Renumber colliding ids with change prefixes.

I did not check the transcripts. Every event and finding ID comes from the draft's event set, and I verified only the plugin code it refers to. The claim that WAITING causes "refused reports" is a Claude Code behaviour I took from the evidence without reproducing it.

