---
name: plan
description: The planning stage of kentra-rpir. Turns an idea, bug or chore into an agreed spec.md and, at the standard tier, an approved coarse plan.yaml, in one session — questions in batches, premises researched in the background, one joint review of spec and plan. Use when starting a change, or to revise its spec or plan.
---

# plan — the planning stage of kentra-rpir

One session writes both documents of a change: `spec.md`, then `plan.yaml`.
The user decides intent; you draft, research what the change assumes, and
write it down. Ask the user only about intent, never about facts you can look
up.

**Where things are:**
- the config is `rpir/config.yaml` at the project root (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/config.yaml`);
- change folders are `rpir/changes/<YYYY-MM-DD-slug>/`;
- the spec template is `${CLAUDE_PLUGIN_ROOT}/templates/spec.md`;
- the reviewer's prompt is `${CLAUDE_SKILL_DIR}/reviewer-prompt.md`;
- research runs through the `kentra-rpir:research` skill;
- the plan format is the `milestoned-plan-dag:plan-author` skill;
- the full process is `${CLAUDE_PLUGIN_ROOT}/docs/process.md`.

**Paths:** `<change>` is the change folder, `<name>` its folder name, and
`<reviewed>` is `<change>/.local/reviewed/` (gitignored),
which holds the last reviewed copy of each document.

**Tiers:**

| | `small` | `standard` |
|---|---|---|
| Fits | a bug fix, a chore, a change one milestone builds | anything bigger: several components, parallel work, a checkpoint the user wants |
| Writes | `spec.md` | `spec.md` and `plan.yaml` |
| Implemented as | one milestone built from the spec | the plan's milestones |

## Checklist

Make a task for each item and complete them in order. Research (step 4)
runs in the background from the first premise on.

1. Set up
2. Ask
3. Propose the tier
4. Research the premises
5. Write `spec.md`
6. Agree the spec
7. Write `plan.yaml`
8. Joint review
9. Edits and diff reviews
10. Approve and commit

### 1. Set up

- **Stage start.** Run
  `sh "${CLAUDE_PLUGIN_ROOT}/scripts/stage-start.sh" "<project root>"`. On exit 3,
  stop and relay its line. On `user-config: missing`, follow the instructions
  it prints (the user's questions, in one message) before going on. Remember
  its `mode:` line: on `mode: untracked`, skip every commit of the change
  folder and say so in one line.
- **First use in this project** (stage-start printed `config: new`): ask these
  three questions in one message, then write `rpir/config.yaml` from the
  template with the answers, keeping the `project:` line stage-start wrote.
  - Which issue tracker: none, GitHub or Jira?
  - Should the plan stage and its reviewer read
    `constitution/constitution.md`? Recommend yes when that file exists.
  - Should `rpir/` be committed to git (`track`, default yes)?
- **Every run:** make sure `.gitignore` holds `rpir/**/.local/` and the
  `worktreesDir` (default `.worktrees/`), plus `/rpir/` when `track` is
  `false`, adding whichever is missing.
- **An existing change** (the user names one to revise): find it — the
  folder the user names, else
  `sh "${CLAUDE_PLUGIN_ROOT}/scripts/sessions.sh" current --project <project root> --session "${CLAUDE_SESSION_ID}"`
  (the session's own change, else the newest by sessions file) — and
  confirm it with the user.
  - A spec whose `tier` is `full` or `light` belongs to a change started
    under kentra-rpir 0.5.x, which finishes on 0.5.x. Stop and tell the
    user so.
  - Otherwise resume at the step its state shows:
    - `draft`: step 2;
    - `agreed`: step 7 at the standard tier with no `plan.yaml` yet; step 9
      when `<reviewed>` already holds copies of the documents; otherwise
      step 8;
    - `planned`: step 9.
- **A new change:** `rpir/changes/<today>-<slug>/`, the slug 2–4 kebab-case
  words. Copy the spec template into it as `spec.md`, with `status: draft`.
- **Register this session:**
  `mkdir -p <change>/.local && echo "${CLAUDE_SESSION_ID} plan" >> <change>/.local/sessions`
- **Tracker:** `github`: link the issue the user names, or create one with
  `gh issue create`; `jira`: link the key the user gives. Put the link in the
  frontmatter `issue:`.
- **Explore:** read what the change touches — the README, the constitution
  when enabled, the code in the area, `git log --oneline -20` — enough to
  ask good questions.

### 2. Ask

- Ask up to `spec.questionBatch` questions in one message when they do not
  depend on each other's answers. Ask one at a time when an answer changes
  what you ask next.
- Prefer multiple choice, and put your recommendation first.
- Cover the problem, the goals, what is out of scope, and how the user will
  know it works. Then cover what the plan builds on:
  - **Layout:** the directory layout of every new module or component.
  - **Abstractions:** the main types and interfaces, their
    responsibilities, and what identifies each entity: what happens when one
    is deleted, recreated under the same key, renamed, or given a new
    version.
  - **Version pins:** for each pinned dependency, what the pin means: exact,
    minimum, or newest compatible.
- For each design choice the conversation leaves open, give 2–3 options with
  their trade-offs and your recommendation. Record the choice and the
  options not taken in the Design section.
- **Premises.** A premise is anything the change assumes is true: how an API
  behaves, what a library version supports, what users do. Record one only
  when the spec or plan would change if it were wrong. Add it to the spec's
  Premises table the moment it surfaces, `unverified` with Evidence `—`, and
  an importance: `critical` when, if it is wrong, the shape changes (a
  requirement, a design decision or the milestones); `normal` when it would
  be fixed inside one milestone. Then hand it to step 4.

### 3. Propose the tier

Once you know the change's size, propose `small` or `standard` with a
one-line reason from the tier table. The user confirms; when the answer is
obvious, state it and go on. Write the tier into the spec's frontmatter.

### 4. Research the premises

Load the `kentra-rpir:research` skill once, and queue every premise whose
Evidence is `—` as a `premise` job, its question starting `critical:` or
`normal:`. Every critical premise about an outside system is queued: it gets
a spike and its advisor. A normal premise gets a docs check only. Official
docs or source code at the version in question settle a premise on their
own.

> A premise about something this session does not own — a remote, a
> registry, CI, another repository, a deployed service, another team's
> documents — is settled by reading it at its source. A local copy, a
> cache or an earlier conversation is a snapshot of it, not the thing.
> The Evidence names what was read and when.

Settle a premise yourself only when it is about this repo's own code, or
when it is normal and a read or two of an official doc page settles it. Its
Evidence is then `docs: <URL or file:line@version>`.

Keep the conversation going while jobs run. On each job's Conclusion,
update the premise's row:

- **Status** from the Verdict.
- **Evidence:** a link to the report, `[research/<slug>.md](research/<slug>.md)`,
  then the source kinds from its "Rests on" line. A row reused from the
  research index links the report the index row names. A row states only
  what was tested, and adds `untested: <part>` for each part its report
  names as untested or inferred.
- A **refuted** premise goes to the user at once: it usually changes the
  design.
- A **critical** premise left `unverified` goes to the user as a decision:
  proceed on it, change the design, or drop the requirement.
- A **normal** premise left `unverified` goes to the user, who may ask for a
  spike: re-queue it as `critical:`.

A premise with Evidence is never researched again unless an edit changes
what it rests on.

### 5. Write `spec.md`

Fill the template. The sections scale with the change: a bug's spec can be
a few lines. Requirements are plain, numbered, testable statements. Layout
and Abstractions record what step 2 settled. Show the user the spec section
by section, and adjust as they react.

### 6. Agree the spec

When the user says the spec is right, make sure Open questions is empty and
set `status: agreed`. Research may still be running; its outcomes reach the
spec through step 4 and the review.

**Small tier:** go to step 8 and review the spec alone.

### 7. Write `plan.yaml`

1. Run `milestoned-plan-dag --version`. When it is missing, stop and tell
   the user: `kentra-rpir needs milestoned-plan-dag 0.5.0 or later: brew upgrade kentra-io/tap/milestoned-plan-dag`.
   When `validate` later rejects `schemaVersion: 0.5.0`, stop with the same
   message.
2. Load `milestoned-plan-dag:plan-author` for the format. Plans here use
   schema 0.5.0, which has no `steps`. When the loaded skill documents a
   schema older than 0.5.0 or asks for steps, tell the user once to run
   `claude plugin update milestoned-plan-dag@kentra-agentic-plugins`, and
   follow `validate`. Pin the `# yaml-language-server: $schema=` line to
   `v0.5.0`.
3. Before writing any milestone's `paths`, grep the milestone's base for every
   reader of each symbol, flag, file, option or rule the milestone changes:
   tests, fixtures, docs, generators. Each reader is in `paths`, or named in
   a risk that says why it stays green.
   A change spanning several repositories sets `repo` on every milestone (its
   path from the project root, e.g. `.` or `../other`), writes that
   milestone's `paths` and `check` relative to its repository, and greps at
   that repository's base.
4. Write `<change>/plan.yaml` yourself.

**Milestones.** A milestone is a deliverable a reviewer could merge on its
own: one component, or one capability that can be checked on its own. Split
only when parallel work or a checkpoint needs it. Most changes need 3–8
milestones.

**The plan's `description`** settles what milestones share, because each
milestone's lead otherwise infers its own: file header layout, naming rules,
which tests need Docker or a real tool, the standard check, and a
requirement map naming the milestone whose criterion covers each spec
requirement.

**Each milestone holds:**
- `number`, `slug`, `goal`;
- `description`:
  - **scope:** the files and directories, from the spec's Layout;
  - **interfaces:** what it provides and uses, by name and responsibility,
    from the spec's Abstractions;
  - **decisions:** the spec's decisions it must follow;
  - **risks:** each with the premise ids it rests on;
- `deliverables`: every file, and each type it introduces;
- `contract`: the repo's standard `check`; one criterion per behaviour,
  named after the test that proves it, at the level of the spec's
  requirement, or `human:` and what the user checks when no test or command
  can; and `paths`. When a research report gives a machine-readable
  worklist (an inventory, a mapping), one criterion runs a script in the
  change folder that checks every entry under the milestone's `paths`: each
  is present at the head, or dropped by a spec line the script quotes. It
  exits 1 listing each miss;
- `depends-on`: every milestone whose output this one uses. A milestone
  without it is a root and starts at once;
- `rules`: references only (a skill name or a repo path) to what the lead
  loads and the verifier grades against. `CLAUDE.md`, `AGENTS.md` and
  path-scoped `.claude/rules` load by themselves.

No steps and no code: the lead reads the repo and decides how.

**Parallel work:** order in the file creates no edge. Milestones with no
dependency path between them get non-overlapping `paths`. Shared types,
shared files and version pins go in the earliest milestone that needs them.

**Plan premises.** A claim the plan rests on that the spec's ledger does not
hold goes to research as in step 4, and into a `# premises:` comment block
at the end of `plan.yaml`, with ids `PL1`, `PL2`, … so they never collide
with the spec's `P<n>`:

```yaml
# premises:
#   PL1 | critical | verified | research/bats-run-flag.md: official docs (1.11) | bats 1.11 `run --separate-stderr` exists
```

Run `milestoned-plan-dag validate <change>/plan.yaml` and fix every error.
An overlap warning between independent milestones means adding an edge or
narrowing `paths`. Then show the user one line per milestone (number, goal,
the tests it adds) and the DAG as `milestoned-plan-dag resolve` orders it,
marking which milestones run in parallel.

### 8. Joint review

Wait until every critical premise's job has reported, then:

1. Write the planning log, so the reviewer reads the conversation as it is:
   ```
   mkdir -p "<reviewed>"
   sh "${CLAUDE_PLUGIN_ROOT}/scripts/planning-log.sh" --project "$(git rev-parse --show-toplevel)" --change "<change folder>" --out "<reviewed>/planning-log.jsonl"
   ```
2. Dispatch one fresh reviewer with the Agent tool, in the foreground:
   `subagent_type` `roles.reviewer.agent`, `model` `roles.reviewer.model`,
   `description` `Review <name>`, and the prompt `reviewer-prompt.md` with
   its slots filled:
   - `mode`: `full`;
   - `title`: the spec's title; `tier`: the spec's tier;
   - `project_root`, `spec`, `research_dir` (`<change>/research`): absolute
     paths;
   - `plan`: the absolute path of `plan.yaml` in backticks, or `none (small
     tier)`;
   - `planning_log`: `<reviewed>/planning-log.jsonl`;
   - `constitution`: the absolute path of `constitution/constitution.md`
     when enabled, else `none`;
   - `diff_commands`, `decision`: `—`.
3. Copy `spec.md`, and `plan.yaml` when there is one, into `<reviewed>`:
   the base for later diff reviews.
4. Act on the hand-back:
   - **technical:** apply each fix. Tell the user in one line per fix, and
     record it: a line in the spec's `<!-- writer-gaps -->` comment, or in a
     `# writerGaps:` comment block at the end of `plan.yaml`.
   - **decision:** stop. Ask the user each question with its options, then
     edit the documents to match their answers.
   - **unchecked claims:** queue each new or reopened one as a premise, as in
     step 4, and read its Conclusion against the documents when it arrives.
     A claim with a premise id and no reopen is already settled.

Edits made here are reviewed in step 9.

### 9. Edits and diff reviews

Size the review for each edit to a reviewed document:

| The edit | Review |
|---|---|
| Changes a requirement, goal, non-goal, premise, design decision, layout, abstraction, milestone contract, `paths` or `deliverables`, including an answer to a decision finding | Diff review |
| Wording, typos, formatting; a technical fix applied as the reviewer wrote it | None. Show the user the diff. |

When unsure, run a diff review. Dispatch a fresh reviewer as in step 8 with
`mode` `diff`, the `decision` in plain words, and `diff_commands`: one
`git diff --no-index "<reviewed>/<file>" "<change>/<file>"` per changed
document (once committed: `git diff <last commit of the file> -- <file>`).
When it hands back, copy the edited documents into `<reviewed>` again, show
the user the diff, and act on the hand-back as in step 8: technical fixes,
decisions and unchecked claims. An edit made while a diff review runs gets
its own diff review once that one hands back.

Once the spec is `agreed`, its status stays `agreed` through every edit.

### 10. Approve and commit

The user approves the plan; at the small tier, the reviewed spec. Then:

1. Make sure Open questions is empty and every premise has a status. Wait
   for running research jobs and diff reviews of this change, or tell the
   user which you drop. When the user approves with an edit still
   unreviewed, add `unreviewed: <edit>, approved by the user <date>` to the
   spec's `<!-- writer-gaps -->` block. This step runs whether or not the
   change folder is tracked.
2. Set the spec's `status: planned`.
3. Write the planning log:
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/planning-log.sh" --project "$(git rev-parse --show-toplevel)" --change "<change folder>" --out "<change folder>/planning-log.jsonl"`.
   On exit 3, tell the user which sessions' transcripts are missing, and
   commit anyway.
4. Commit the change folder (spec, plan, planning log and research reports)
   with
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/commit-change.sh" <change folder> "plan: <title>" [rpir/research/index.jsonl rpir/config.yaml .gitignore]`,
   passing as extra paths `rpir/research/index.jsonl` when this session's
   research jobs appended to it, and `rpir/config.yaml` and `.gitignore`
   when this session created or changed them. In untracked mode the script
   prints that it skipped the commit.

A later revision of an approved change goes through step 9 and commits the
same way, with the message `plan: amend <title>`.

The stage is done when the change folder is committed and the spec says
`status: planned`. End with one line:

`Planned: <change folder> (<short sha>). Next: /kentra-rpir:implement.`

## Red flags

| Thought | Reality |
|---|---|
| "This premise is obviously true" | Then a direct read or its job settles it quickly. Check it; never assume it. |
| "A normal premise deserves a spike" | A docs check. The user can ask for more. |
| "I'll read the whole report to be sure" | The Conclusion carries the verdict and what it rests on. |
| "The user seems happy, I'll mark it agreed" | Only the user's explicit agreement sets `status: agreed`. |
| "I'll show the lead how, with a code sketch" | The milestone says what and why. The lead reads the repo and decides how. |
| "Ten milestones keep each one small" | A milestone is a deliverable a reviewer could merge on its own. Most changes need 3–8. |
| "`check: go test ./internal/foo/...`" | Use the repo's standard check. A narrowed check hides regressions. |
| "The reviewer flagged a decision, but I know the answer" | A decision goes to the user. |
| "Milestone 2 comes after 1 in the file, so it waits for 1" | Order creates no edge. A milestone waits only for what its `depends-on` lists. |
