---
title: Retro learning, multi-repo plans, one rpir/ folder and a pluggable audit
type: feature            # feature | bug | chore
status: in-review          # draft | agreed | planned | implementing | in-review | done
tier: standard           # small | standard — proposed by the planning session, confirmed by the user
issue:                   # tracker link, when a tracker is configured
planningLog: planning-log.jsonl   # the trimmed planning session, written when the plan is approved
---

## Problem

Twelve changes ran through kentra-rpir between 2026-10-28 and 2026-11-13, on
versions 0.5.2 to 0.6.2. [analysis.md](analysis.md) reads their transcripts
and retros. Four groups of problems came out of it:

1. **The same failures recur, and retros do not stop them.**
   - Milestone `paths` miss the files that read what the milestone changes:
     5 changes, more than 10 hand widenings in change 7 alone.
   - Edits that were never reviewed reach `status: planned`: 4 changes. In
     change 7 a diff reviewer's baseline was overwritten while it
     read it.
   - A lead's brief states facts from memory, and a cached or UP-TO-DATE
     test run counts as passing: 5 and 4 changes.
   - Premises about outside systems are "verified" from local copies. In
     change 7 a local `git tag` stood in for the remote, and a
     breaking change shipped.
   - Every 0.6.x planning session fails its first research-queue calls.
   - Subagents try `sleep`, which Claude Code refuses. Two researcher
     results were lost, and an implementer's `git commit -a` swept up
     another implementer's edits.
2. **Retros make noise instead of learning.** Each retro proposes one action
   per finding (23–36 of them) and walks the user through every one. The user
   rejected 22 of 22 in change 6 and applied 6 of 32 in
   change 7. Nothing records a rejection, so rejected ideas come
   back. Recurrence is counted only within one project, by rereading earlier
   reports.
3. **Plans assume one repository.** Change 9 spanned
   four repositories in a workspace that is not itself a git repo. The
   orchestrator improvised a convention for it: per-repo integration
   branches, path prefixes and a hand-written prompt generator. There is no
   first-class support.
4. **kentra-rpir's files are scattered, and the plugin assumes they are
   committed.**
   - The files live in three places: `.kentra-rpir.yaml`, `.kentra-rpir/`
     and `changesDir`.
   - All implement runs in a project share one state file, so parallel
     implementations clash (change 3).
   - Projects A and B gitignore their change folders. There,
     leads get a spec path that does not exist in their worktree, and plan
     edits made during implement go unrecorded.

There is also one new need. The user runs `/ponytail:ponytail-audit` by hand
after implementation and applies what is worth applying. They want that as an
optional, pluggable step that runs in the background.

## Goals

1. The recurring failures in Problem 1 stop at their source in the plan,
   research, implement and agent prompts.
2. Retro findings accumulate across changes in two registries: plugin and
   project. Two skills, `improve` and `improve-plugin`, rank them by impact
   against fix complexity and remember the user's decisions.
3. A plan can span several repositories, one repository per milestone, in a
   workspace whose root need not be a git repo.
4. Every kentra-rpir file in a project lives under one `rpir/` folder.
   Machine-local state lives in each change's gitignored `.local/`. One
   switch gitignores all of `rpir/`, and every stage works when `rpir/` is
   untracked.
5. Several implementations run in parallel in one project.
6. An optional audit skill named in config runs in the background after
   implement. The review session applies the findings it judges worth
   applying, without asking.

## Non-goals

- A prompt renderer, or `milestoned-plan-dag resolve --format json`. These
  are the next candidates.
- Recapping the user's decisions before agreement, and before/after samples
  for bulk rewrites. The user rejected these for now, since they instruct it
  themselves.
- A `handbacks.sh` extractor. A verbatim-copy rule in the impl report gets
  most of its value.
- Filing GitHub issues upstream from retros or from `improve-plugin`.
- Reading the old layout (`.kentra-rpir.yaml`, `.kentra-rpir/`,
  `changesDir`). A one-off migrate script moves existing projects instead.
- A milestone spanning two repositories.
- Machinery for artifacts flowing between repositories, such as publishing
  to `~/.m2`. The plan's description covers it, as change 9's did.
- An always-on background observer of sessions.
- A session-wide question cap.
- A git-specific red-flag line in plan step 4: the outside-state rule is
  general.
- A foreground diff review.
- Removing the lead's WAITING status.
- milestoned-plan-dag 0.5.0 reading 0.4.0 plans (user decision).
- Migrating kentra-rpir's own files during this change's implement run; that
  is an after-merge step (user decision).
- Changing what the retro workflow reads, or how it writes `spec-retro.md`,
  beyond the registry step.

## Premises

| # | Premise | Importance | Status | Evidence |
|---|---|---|---|---|
| P1 | A plugin's `hooks/hooks.json` can hold a SessionStart command hook beside `"modules"`. `${CLAUDE_PLUGIN_ROOT}` is set in its command. Its stdout reaches the model as context. Whether the user sees it in the TUI is not established. | critical | verified | [research/plugin-sessionstart-hook.md](research/plugin-sessionstart-hook.md): experiment (Claude Code 2.1.325), working plugins, type declarations. untested: visibility to the user in the interactive TUI; an installed plugin (only `--plugin-dir` ran); the resume, clear and compact sources |
| P2 | A background subagent can run another plugin's skill (`ponytail:ponytail-audit`) through the Skill tool and return its report. Skills with `disable-model-invocation: true` cannot be run this way. | critical | verified | [research/subagent-runs-plugin-skill.md](research/subagent-runs-plugin-skill.md): experiment (2.1.325, ponytail 5.3.3), official docs. untested: a `context: fork` skill called from a subagent; a plugin-defined calling agent; a `disable-model-invocation` skill (docs only) |
| P3 | The Monitor tool is available inside subagents (leads, verifiers). | normal | verified | docs: project B's subagent transcripts for change 9 (Monitor tool calls by the leads of M1–M7 and the verifiers of M2 and M5)@2026-11-11 |
| P4 | Per-repository integration and milestone worktrees work from a workspace root that is not a git repository, and for a sibling repository outside the project root (`../`). | critical | verified | docs: project B's impl report for change 9, line 17@2026-11-13 (four repositories, all milestones merged); experiment: `git -C ../milestoned-plan-dag worktree add` from kentra-rpir, then remove (2026-11-14). untested: confining leads and verifiers to a `../` repository (prompt-level) |
| P5 | Tagging milestoned-plan-dag `v*` publishes the GitHub release and the Homebrew cask. | normal | verified | docs: `milestoned-plan-dag/.github/workflows/release.yml:4-6`@5821e3f |
| P6 | Background agents can write under `${XDG_DATA_HOME:-~/.local/share}` without the sensitive-path prompt that guards `~/.claude`. (The user config under `$XDG_CONFIG_HOME` is written by the main session, with the user present.) | normal | verified | docs: `~/.claude/skills/continuous-learning-v2/SKILL.md:138-144`@2.1.0, a third-party account of the guard |

## Requirements

### A. Planning and research

1. **Diff-review baseline.** Plan step 9 copies the edited documents into the
   change's `.local/reviewed/` only after the diff reviewer hands back. An
   edit made while a diff review runs gets its own diff review afterwards.
2. **Approval waits for reviews.** Plan step 10 waits for running diff
   reviews, as it waits for research jobs.
   - When the user approves with an edit still unreviewed, the spec's
     `<!-- writer-gaps -->` block records `unreviewed: <edit>, approved by
     the user <date>`.
   - Step 10 runs this check whether or not the change folder is tracked.
3. **Readers in `paths`.** Before writing a milestone's `paths`, plan step 7
   has the session grep the milestone's base for every reader of each symbol,
   flag, file, option or rule the milestone changes: tests, fixtures, docs,
   generators. Each reader is in `paths`, or named in a risk that says why
   it stays green.
4. **Reviewer check P2.** Reviewer check P2 also fails a milestone with a
   reader of what it changes that is neither in its `paths` nor in a risk.
5. **Plan adjustments during implement.** A new or changed criterion command
   is run at the milestone's base, as reviewer P11 runs one, before the
   milestone is resumed.
6. **Outside state.** Plan step 4 states this rule:

   > A premise about something this session does not own — a remote, a
   > registry, CI, another repository, a deployed service, another team's
   > documents — is settled by reading it at its source. A local copy, a
   > cache or an earlier conversation is a snapshot of it, not the thing.
   > The Evidence names what was read and when.

   A premise row states only what was tested. It adds `untested: <part>` for
   each part its report names as untested or inferred.
7. **Research queue command.**
   - The research skill shows the queue command as one complete literal
     command line. It says never to store the command in a variable.
   - `research-queue.sh add premise` exits 2 unless the question starts
     with `critical:` or `normal:`.

### B. Implement agents

8. **Waiting.** `agents/implementer.md`, `verifier.md`, `researcher.md` and
   `spike.md` each say three things:
   - wait for a background child with Monitor on an until-loop, never a
     foreground `sleep`;
   - a launch notice in place of a child's result means keep the turn going
     until the result arrives;
   - never hand back while a child still runs.
9. **Staging.** `agents/implementer.md` says to stage only the files the
   implementer changed, by path. It never runs `git commit -a`,
   `git add -A`, `git checkout -- <path>` or `rm -rf` on files it did not
   create.
10. **Lead briefs.** `agents/lead.md` adds two rules:
    - **Facts in the brief.** Every repository fact or convention in a
      brief, including "X is unsupported", names the file:line read or the
      grep run. Rules are named concretely, never as "read <file>".
    - **Before handing back.** Each given/when/then clause of every criterion
      maps to its assertion line (file:line). A test task reported
      UP-TO-DATE, FROM-CACHE or skipped is not evidence: it is rerun with the
      cache off.
11. **Impl report.** `impl-report.md` copies each lead's final CONCERNS and
    OBSERVED lines verbatim.

### C. One `rpir/` folder

12. **Layout.** A project's kentra-rpir files live under `rpir/` at the
    project root, as in Layout.
    - `rpir/config.yaml` replaces `.kentra-rpir.yaml`.
    - The `changesDir`, `research.dir` and `research.index` keys are gone.
    - `rpir/**/.local/` is always gitignored.
13. **The `track` switch.** `track: true` is the default. With
    `track: false`, the plan stage's setup adds `/rpir/` to `.gitignore`.
14. **Per-change local state.** `<change>/.local/` holds:
    - the sessions registered to the change;
    - the reviewed snapshots;
    - the research queue of jobs started for the change;
    - the implement state;
    - the spikes.

    Research outside a change keeps the same files in `rpir/research/.local/`.

    `sessions.sh`, `planning-log.sh`, `research-queue.sh` and the retro read
    and write those files.

    A stage finds "the newest change" from the newest `.local/sessions` file
    under `rpir/changes/`.
15. **Implement state per change.** Implement keeps its state in
    `<change>/.local/implement-state.json` and deletes it when the stage
    finishes. At start, implement lists every other unfinished
    implementation: each `rpir/changes/*/.local/implement-state.json` with
    its phase and last update time.
16. **Untracked mode.** The project is in untracked mode when `rpir/` is
    gitignored or the project root is not a git repository. In untracked
    mode:
    - stages skip their commits of the change folder and say so in one line;
    - leads and verifiers get the spec's path in the main checkout;
    - plan adjustments during implement are recorded in `impl-report.md` as
      a diff against the reviewed `plan.yaml`.
17. **Old layout.** Every stage stops on a project with `.kentra-rpir.yaml`
    or `.kentra-rpir/` and no `rpir/config.yaml`. It names
    `scripts/migrate-layout.sh`, which moves the config, change folders,
    research, index and machine-local state into the new layout. It also
    moves a leftover `.kentra-rpir/` when `rpir/config.yaml` already exists,
    sets `track: false` when the old change folder or config was gitignored,
    removes old-path symlinks that point into `rpir/` (as project A
    has) instead of copying through them, writes `project:` (the directory
    name) when it is absent, and changes nothing on a second run.

### D. Multi-repository plans

18. **Schema 0.5.0.** milestoned-plan-dag 0.5.0 adds an optional milestone
    field `repo`: a relative path from the project root to a git
    repository.
    - `repo` is compared after cleaning (`a`, `./a` and `a/` are one
      repository). It may start with `../`; an absolute path is rejected.
    - `validate` rejects a plan in which some milestones set `repo` and
      others do not.
    - In a plan that sets `repo`, `paths` are relative to the milestone's
      repository, and overlap warnings compare only milestones of the same
      repository.
    - `resolve` and `render` show each milestone's repository.
    - The plan-author skill documents the field.
    - milestoned-plan-dag's own `spec.md` and plugin version describe 0.5.0.
    - After merge: release `v0.5.0`; the pin in the user's workspace repository and its submodule
      pointer move to it in one commit, and that repository's `AGENTS.md` entry
      for milestoned-plan-dag says multi-repository plans are supported.
19. **Plan stage.**
    - The plan stage writes `schemaVersion: 0.5.0`, and sets `repo` on every
      milestone when the change spans several repositories.
    - The reviewer runs its base checks (P2, P11) in each milestone's
      repository.
    - The skill names `milestoned-plan-dag` 0.5.0 as the minimum.
20. **Implement stage.** For a plan with `repo`:
    - Each repository the plan touches gets an integration worktree
      `<repo>/<worktreesDir>/<slug>` on the branch `<branchPrefix><slug>`,
      cut from that repository's current branch. The worktrees dir goes into
      the clone's `.git/info/exclude` when the repository does not ignore it.
    - A milestone's worktree and branch are cut from its repository's
      integration branch, and merged back into it.
    - The standard check runs per repository.
    - `impl-report.md` has a table per repository, plus a merge order derived
      from the DAG.
    - A pull request is opened per repository when `openPullRequest` holds.
21. **Review and retro.**
    - The review stage presents each repository's diff.
    - The retro gets each milestone's `diffRange` in its own repository.

### E. Improvements registries

22. **Two registries.**
    - The plugin registry lives in
      `${XDG_DATA_HOME:-~/.local/share}/kentra-rpir/improvements/`.
    - The project registry lives in `rpir/improvements/`.
    - Each holds one JSON file per finding class, as in Abstractions.
23. **Retro step.** After writing `spec-retro.md`, the retro workflow labels
    each finding `plugin` or `project`. It matches the finding to an existing
    class in that scope's registry, or creates a new class, and appends an
    occurrence. Plugin findings are recorded only when the user config's
    `plugin.record` is true.
24. **Review stage.**
    - Review no longer walks through retro actions or files issues.
    - When the retro finishes, review shows one summary line: findings
      recorded per scope, and any class that recurred after its fix shipped.
    - The stage is done when the code review is done and `status: done` is
      set.
25. **Score script.** `scripts/improvements.mjs` computes each class's
    impact, its priority and whether it may be proposed, as in Design.
    - An occurrence on a plugin version later (semver) than the newest
      `version` in the class's `shipped[]` marks the class `regressed`.
    - The script has tests.
26. **The `improve` and `improve-plugin` skills.**
    - `improve` works the project registry. `improve-plugin` works the plugin
      registry, against the plugin source path in the user config.
    - Each proposes up to five changes across all changes. For each, it shows
      the class's counts, its accumulated metrics, its complexity, earlier
      rejections with reasons, and the occurrences since the last rejection.
    - The user's decision is recorded: accept, reject with a reason, or
      defer. Accepted ones are carried out.
      - `improve` edits the project's own files: AGENTS.md, conventions, CI,
        config.
      - `improve-plugin` edits the plugin source and bumps its version.
27. **Nudge.** A SessionStart hook prints at most one line per scope.
    - It fires only when the scope's last nudge was at least
      `nudge.days` (default 3) days ago and the scope has at least
      `nudge.minFindings` (default 5) occurrences recorded since its last
      `improve` run.
    - The project nudge is on by default. The plugin nudge is on only when
      the user config's `plugin.nudge` is true.
    - The line asks the model to relay it to the user.
28. **User config.** It lives in
    `${XDG_CONFIG_HOME:-~/.config}/kentra-rpir/config.yaml`.
    - The first stage run in a project without `project:` in
      `rpir/config.yaml` writes it: a stable project id, by default the
      project root's directory name, never changed by a rename. Editing
      `project:` starts a new identity; earlier occurrences keep the old id
      (user decision).
    - The first kentra-rpir stage run on a machine without it asks these
      questions in one message:
      - record plugin findings (default yes, silent);
      - plugin nudge (default no);
      - the plugin source path (asked only when the nudge is on);
      - a default audit skill (default none).
    - The record question says that the plugin findings are kept for local
      tuning if the user later forks the plugin.
29. **Seeding.**
    - `scripts/improvements.mjs import` reads every existing `spec-retro.md`
      and `docs/retro-backlog.md`, and `docs/retro-backlog.md` is deleted.
    - After merge, the eight existing reports are imported: seven in
      project A's `rpir/changes/*/spec-retro.md` and one in project C's
      change folder, plus the backlog. Each import names the target project's id with
      `--project-id`.
    - Their project-scope findings are imported into the project registries
      of projects A and C after those projects migrate.

### F. Pluggable audit

30. **Config.** The audit is configured as `audit: { skill: <skill name>,
    args: <text> }`.
    - The key may be in `rpir/config.yaml`, which wins, or in the user
      config. Unset means no audit.
    - `args` may use `{{worktree}}`, `{{base}}` and `{{head}}`, filled per
      repository.
    - When the audit subagent cannot invoke the skill (for example, it has
      `disable-model-invocation: true`), it writes that reason as the audit
      file's content instead of findings.
31. **Launch.** Implement's last step launches the audit in the background,
    after `impl-report.md` is written. It runs as one subagent per
    repository, each running the skill on its integration worktree. Each
    subagent writes the skill's findings to `<change>/audit/<repo>.md` and
    keeps `<change>/.local/audit.<repo>.running` while it runs, where
    `<repo>` is the cleaned `repo` path with `../` dropped and `/` replaced
    by `-` (the project id for `.` or a single-repository change); when two
    repositories map to one name, implement appends `-2`, `-3` in plan order
    (user decision). It deletes the marker when it finishes. The prompt tells it to write the report
    text itself.
32. **Applying the findings.** The review stage runs on
    `roles.review-orchestrator.model` (default opus), and tells the user
    before starting when it does not. Once every audit file is complete (no
    `.running` marker left):
    - the review session judges every finding;
    - by its own judgement of size, it makes small fixes itself and sends
      larger ones through a fresh lead and verifier, as user-requested fixes
      go (user decision);
    - it does not ask the user first;
    - each finding's decision (applied, or skipped with a reason) and the
      size it judged (small, applied itself; large, through a lead) are
      written into its audit file, and one summary line goes to the user;
    - an instruction from the user about a finding overrides the judgement.

### G. Docs and release

33. `docs/process.md` and `README.md` describe the `rpir/` layout,
    untracked mode, multi-repository plans, the registries, `improve` and
    `improve-plugin`, the nudge, the user config and the audit, and no
    longer mention `changesDir`, `.kentra-rpir.yaml` or the retro action
    walk-through.
34. kentra-rpir becomes version 0.7.0. After merge, the marketplace entry in
    `kentra-agentic-plugins` names milestoned-plan-dag 0.5.0 as the minimum.
35. `scripts/improvements.mjs` needs node (minimum in Design "Pins"). Without
    it, the nudge prints nothing, and the retro's registry step and the
    improve skills stop with one line naming the requirement.

## Layout

A project using kentra-rpir:

```
rpir/
  config.yaml                project config (replaces .kentra-rpir.yaml)
  research/                  research outside any change, and index.jsonl
    .local/                  queue and spikes of standalone research
  improvements/              project registry: <class id>.json, state.json
  changes/<YYYY-MM-DD-slug>/
    spec.md  plan.yaml  research/  impl-report.md  spec-retro.md
    audit/<repo>.md          audit findings and their decisions

    .local/                  always gitignored
      sessions               "<session id> <stage>" per line
      reviewed/              last reviewed spec.md and plan.yaml
      research-queue.tsv
      implement-state.json   present only while implement is unfinished
      audit.<repo>.running
      spikes/
```

User space:

```
${XDG_CONFIG_HOME:-~/.config}/kentra-rpir/config.yaml      user config
${XDG_DATA_HOME:-~/.local/share}/kentra-rpir/improvements/  plugin registry
```

New in this repository:

```
scripts/improvements.mjs        record, list, decide, ship, import, nudge (node)
scripts/migrate-layout.sh       old layout → rpir/
hooks/nudge.sh                  SessionStart nudge
skills/improve/SKILL.md         project improvements
skills/improve-plugin/SKILL.md  plugin improvements
skills/implement/audit-prompt.md  the audit subagent's prompt
templates/config.yaml           project config (renamed from kentra-rpir.yaml)
templates/user-config.yaml      user config
tests/improvements.test.mjs, tests/migrate-layout.test.sh, tests/nudge.test.sh
tests/fixtures/multi-repo-plan.yaml, tests/fixtures/retros/
```

## Abstractions

- **Finding class.** One problem and its proposed fix: the unit that is
  ranked and decided. It is one JSON file, `<scope registry>/<id>.json`.
  - **Identity:** `id`, a kebab-case slug fixed at creation. A class is
    never renamed; merging two classes keeps the older id and moves the
    other's occurrences into it.
  - **Fields:**
    - `title`, `problem`, `fix`, and `complexity` (S, M or L);
    - `scope` (`plugin` or `project`);
    - `status`: `open`, `accepted`, `shipped` or `regressed`;
    - `shipped[]`: one `{version, date}` per release that carried its fix,
      appended, never overwritten;
    - `occurrences[]`;
    - `decisions[]`.
  - The retro creates it. `improve` and `improve-plugin` change its status
    and fix.
- **Occurrence.** One sighting of a class in one change:
  - `change`, `date`, `pluginVersion`, `findingRef` (the `spec-retro.md`
    path). `date` and `pluginVersion` are the change's own: the date of its
    last session and the plugin version it ran on, never those of the
    recording (user decision);
  - `count` (instances within the change);
  - `wallMinutes`, `tokens`, `userInterventions`, `severity` (low, medium
    or high).
  - `project`: the project id from `rpir/config.yaml`.
  - `findingId`: the `Id` column of the retro's Findings table (e.g. `F3`),
    or a backlog entry's bold label (e.g. `F10`, `R1–R4`). `findingRef` is
    the `spec-retro.md` path: a pointer, not part of the key.
  - Identified by `project`, `change` and `findingId`. A change's
    occurrences in one scope are recorded in one call, which first removes
    every earlier occurrence of that `project` and `change` in that scope,
    across classes, so a re-run retro replaces its earlier record (user
    decision).
  - `pluginVersion` compares as semver (`0.10.0` is later than `0.9.0`).
- **Decision.** `date`, `verdict` (accept, reject or defer), `reason`, and
  the class's impact at the time.
- **`improvements.mjs` CLI.** Subcommands `record`, `list`, `decide`,
  `ship`, `import` and `nudge`, each with `--scope plugin|project` and
  `--project <root>` where the scope needs it. `record` reads a JSON array
  on stdin: every occurrence of one change in one scope, each an Occurrence
  plus either an existing class `id` or the new class's `title`, `problem`,
  `fix` and `complexity`. `import` also takes `--project-id <id>`, the id
  its occurrences are recorded under. `list` prints
  classes ranked by priority with their eligibility and its reason.
- **Audit file.** `<change>/audit/<repo>.md`: the skill's report, then one
  entry per finding with `decision: applied | skipped: <reason>` and
  `size: small | large`.
- **Registry state.** `state.json` in each registry holds `lastImproveRun`
  and `lastNudge`.
- **User config.** It holds:
  - `plugin.record`, `plugin.nudge` and `plugin.source`;
  - `nudge.days` and `nudge.minFindings`;
  - an optional `audit`.
- **Project config.** `rpir/config.yaml` holds the template's keys, minus
  `changesDir` and the research paths, plus `project` (the stable id),
  `track`, `audit` and `roles.review-orchestrator`.
- **Milestone `repo`.** In milestoned-plan-dag 0.5.0, a relative path from
  the project root to a git repository, compared after cleaning; it may
  start with `../`, and absolute paths are rejected. All milestones set it,
  or none do.
  It identifies where a milestone's worktree, branch, check and `paths`
  live.

## Design

- **Retro, review and improvement are separate steps.**
  - The retro still runs automatically in the background at review start,
    and records into the registries.
  - Deciding what to change moves to `improve` and `improve-plugin`, which
    rank across all changes.
  - *Rejected:* keeping the per-change action walk-through but capped at 5.
    That still ranks one change at a time, and forgets rejections.
- **Modelled on continuous-learning-v2** (instinct → finding class,
  observer → retro, evolve → improve), with two differences:
  - no hooks capture events, because the transcripts already exist;
  - the score is computed by a script, not held as a confidence the model
    adjusts, so it is reproducible and testable.
- **Score.** Each occurrence weighs:

  `count × (1 + wallMinutes/30 + 2·userInterventions + severityWeight)`

  - `severityWeight` is 0 for low, 2 for medium and 6 for high.
  - The weight halves every 60 days of age.
  - A class's **impact** is the sum of its occurrence weights.
  - Its **priority** is impact ÷ complexity weight (S=1, M=3, L=8).
  - A `regressed` class's priority is doubled.

  The constants live at the top of `improvements.mjs`. *Rejected:* letting
  the model rank freely, which is neither reproducible nor testable.
- **Re-proposal after a rejection.** A rejected class is not proposed again
  until the impact of its occurrences since the last rejection reaches half
  its impact at that rejection, or one of them is high severity. Rejections
  never close a class. When it comes back, the proposal shows every earlier
  reason. This holds however many times it was rejected.
- **The registry is JSON, one file per class.**
  - It diffs per class in git and needs no YAML parser (the box has no
    PyYAML or yq).
  - Node is already a test dependency.
  - *Rejected:* Markdown with front matter, which needs a parser; and one
    JSONL log, which merges badly and is hard to read per class.
- **Scopes and where they live.**
  - Plugin findings live in user space, because forks tune their own plugin.
  - Project findings live in the project, tracked by default, and follow the
    `track` switch.
  - *Rejected:* filing upstream issues, which would flood the repository
    once the plugin has users.
- **The SessionStart command hook, not the mod API.** The mod API's
  `session.start` cannot inject context (P1). The hook prints its line on
  stdout, which reaches the model, and asks the model to relay it, because
  TUI visibility is unverified. The matcher is `startup|resume`, so it does
  not fire on clear or compact.
- **One `rpir/` root, with local state per change.**
  - One `track` switch gitignores all of `rpir/`, as projects A and
    B already do by hand.
  - Per-change `.local/` makes parallel implementations safe.
  - The listing of `implement-state.json` files is the list of unfinished
    runs, and deleting the file at the end is the pruning.
  - *Rejected:* the old split, which needed three places to configure; and a
    hidden `.kentra-rpir/` root, which hides specs in file browsers.
  - *Rejected:* reading the old layout (user decision). A migrate script covers the three existing projects.
- **`repo` on each milestone, not a plan-level list.**
  - A single-repository plan sets nothing and is unchanged.
  - The base is each repository's current branch at implement time, as for
    one repository today.
  - The check is already per milestone.
  - All-or-none validation stops a multi-repository plan from forgetting one
    milestone.
  - *Rejected:* a `repos` list at plan level, which repeats the base and
    check without need; and path prefixes, which are easy to get wrong.
- **The audit starts at the end of implement**, so it runs while the user
  reads the code. Each audit subagent writes its own `audit/<repo>.md`, so
  the result survives when review runs in another session, and parallel
  repositories never share a file. Review applies the
  findings of any size: small ones itself, larger ones through a lead and
  verifier. *Rejected:* starting at review, which leaves the gap between
  implement and review idle.
- **Pins.**
  - milestoned-plan-dag 0.5.0 is a minimum. Like earlier bumps, the 0.5.0
    binary reads only `schemaVersion: 0.5.0`; an older plan gets the one-line
    version edit (user decision; *rejected:* also reading 0.4.0).
  - `schemaVersion` 0.5.0 is exact in written plans.
  - kentra-rpir moves to 0.7.0.
  - node 18 is the minimum for `scripts/improvements.mjs`, which uses only
    built-in modules. Node was a test-only dependency until now.

## Open questions

<!-- writer-gaps: technical gaps the review found and fixed, one per line
review 1 S3: premise rows name every untested part, cite docs: or an experiment; P6 narrowed to XDG_DATA_HOME
review 1 S6: non-goals list everything the session ruled out
review 1 S7: Layout and Abstractions name the CLI, the audit file, templates, fixtures and the audit prompt
review 1 S10: per-repository audit files and markers; migrate cases; eight retros; boundary tests (plan)
review 1 P4: node is a runtime dependency (Req 35, Pins)
review 1 R2: milestoned-plan-dag spec.md and the workspace repository's AGENTS.md entry follow 0.5.0
review 1 unchecked: the audit subagent reports a skill it cannot invoke, instead of kentra-rpir reading skill frontmatter
diff review 1 D1: every audit entry records its size
diff review 1 D2: regression compares with the newest shipped[] version; findingId is its own field; Req 35 owned by M3 and M6
diff review 1 D3: audit file names from the cleaned repo path; clashes get -2, -3 (diff review 2)
diff review 2 D1/D2: import --project-id in the spec; findingRef is the path only; migrate writes project:; M6 owns Req 35's half
unreviewed: diff review 2 fixes and the four decisions after it (record call per change, the change's own date and version, audit name suffixes, edited project id), approved by the user 2026-11-14
diff review 1 unchecked: migrate removes old-path symlinks into rpir/
-->
