---
name: review
description: Final stage of a kentra-rpir change — presents the implementation for the user's code review while the spec-retro workflow reads the session transcripts, then walks through the retro's actions with the user. Use after implement, or to run a retro on a finished change.
---

# review — the review stage of kentra-rpir

Review has two halves, and the user does both: they review the code, and they
review the process through the retro. Start the retro first, because it runs in
the background while the code review happens.

**Where things are:**
- the config is `.kentra-rpir.yaml` (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/kentra-rpir.yaml`);
- the retro template is `${CLAUDE_PLUGIN_ROOT}/templates/spec-retro.md`;
- the plugin version is `version` in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.

## 1. Start

1. Find the change: the folder the user names, else the newest entry for this
   project in `.kentra-rpir/sessions.map`, else the newest folder under
   `changesDir`. Confirm your choice with the user. Its spec should say
   `status: in-review`. A spec whose `tier` is `full` or `light` belongs to
   a change started under kentra-rpir 0.5.x, which finishes on 0.5.x: stop
   and tell the user so.
2. Record `<main root>` = `git rev-parse --show-toplevel`, run now, before
   moving into the worktree: the worktree has no `.kentra-rpir/sessions.map`
   (gitignored).
3. Work in the change folder inside the integration worktree
   (`<worktreesDir>/<slug>/`) when it exists, or in the main checkout once the
   branch is merged.
4. Register this session to the change folder, in the main checkout's map:
   `mkdir -p "<main root>/.kentra-rpir" && echo "${CLAUDE_SESSION_ID} <change folder> review" >> "<main root>/.kentra-rpir/sessions.map"`.

## 2. Launch the retro

Gather the args:

- **`sessions`:** each line of
  `sh "${CLAUDE_PLUGIN_ROOT}/scripts/sessions.sh" list --project "<main root>" --change <change folder>`
  (`<id> <stage> <path or ->`) gives `{ id, stage, path }`, or
  `{ id, stage, path: null, missing: true }` when the path is `-`. Skip this
  review session's own id. Use `<main root>` from step 1.2, not this
  checkout's own root.
- **`planningLog`:** `<abs>/planning-log.jsonl`.
- **`research`:** `{ "dir": "<abs>/research", "index": "<abs research.index>" }`;
  leave out `dir` when the change folder has no `research/`.
- **`milestones`:** `{ number, slug, paths }` per milestone, plus a
  `diffRange` of `<merge>^1..<merge>`, where `<merge>` is the merge commit
  listed in `impl-report.md`'s Milestones table. Reading the report's table
  for commits is fine; the readers never see the report. Skip a milestone
  the report marks blocked or dropped: it has no merge commit, so no
  `diffRange`.
  - **`standard` tier:** every milestone in `plan.yaml`.
  - **`small` tier:** there is no `plan.yaml`, and one milestone, number `1`.
    Its slug is the change folder's name without its `YYYY-MM-DD-` date.
    Its `paths` are the files `git diff --name-only <merge>^1..<merge>`
    lists. Its check is the repo's standard check, from `AGENTS.md`,
    `CLAUDE.md`, the README or the CI config.
- **`priorRetros`:** every other `<changesDir>/*/spec-retro.md`.

Run the `kentra-rpir:spec-retro` workflow in the background with:

```json
{ "today": "<YYYY-MM-DD>", "changeDir": "<abs>", "projectRoot": "<abs checkout holding the change>",
  "spec": "<abs>/spec.md", "plan": "<abs>/plan.yaml", "implReport": "<abs>/impl-report.md",
  "out": "<abs>/spec-retro.md", "template": "${CLAUDE_PLUGIN_ROOT}/templates/spec-retro.md",
  "sessions": [...], "planningLog": "<abs>/planning-log.jsonl", "research": {...},
  "milestones": [...], "priorRetros": [...],
  "roles": { "prepass": <roles.prepass>, "reader": <roles.reader>, "retro": <roles.retro> },
  "versions": { "plugin": "<plugin version>" } }
```

At the `small` tier, leave out `plan`.

## 3. Code review

While the retro runs, present the change:

- the pull request link, or the branch and `git diff --stat <base>...<branch>`;
- one line per milestone: its outcome, and what it added;
- the verifier findings and concerns from `impl-report.md`, plan adjustments,
  and blocked milestones;
- anything in the report that needs the user's decision.

Fix what the user asks for on the integration branch:

- **A small fix:** make it yourself.
- **Anything bigger:** build it as the implement stage builds a milestone.
  Dispatch a fresh lead in a new milestone worktree from the integration
  head, with the user's request as `guidance`, numbered and named after the
  milestone whose code it changes. Then the lead's hand-backs, a fresh
  verifier and the merge: steps 2 to 5 of
  `${CLAUDE_PLUGIN_ROOT}/skills/implement/SKILL.md`. At the `small` tier,
  build the milestone's fields as "Small tier" there says. The implement
  state file is gone by now: keep agent ids and hand-back times in your
  log, and write no state file.

Run the check after each fix: the plan's, or at the `small` tier the repo's
standard check.

## 4. Retro review

When the workflow finishes:

1. Present `spec-retro.md`: the outcome, the Planning cost table with the
   work before the plan skill on its own line, the Research table, the
   contradicted self-report claims, and the findings with their fault
   classes.
2. Go through the Actions with the user, one at a time. They choose one of:
   - **Apply:** the target is in this repo. Make the change and commit it.
   - **File:** the target is a kentra-rpir skill, agent, workflow or template.
     Run `gh issue create --repo kentra-io/kentra-rpir`, with the finding, its
     evidence and the proposed action in the body.
   - **Defer** or **reject:** with the user's reason.
3. Record each choice in the Decision column.

## 5. Finish

When the user has finished both reviews:

1. Set the spec's `status: done`.
2. Commit the change folder. Push when on the integration branch and
   `implement.push` is true.

Merging the pull request is the user's call. Once it is merged, remove the
integration worktree:
`git worktree remove <worktreesDir>/<slug>`.

The stage is done when the spec says `status: done` and every retro action has a
decision. Then end with one line:

`Change done: <change folder>/spec-retro.md (<short sha>). Next: merge <PR url or branch>, then git worktree remove <worktreesDir>/<slug>.`
