---
name: review
description: Final stage of a kentra-rpir change — presents the implementation for the user's code review while the spec-retro workflow reads the session transcripts and records its findings into the improvement registries. Use after implement, or to run a retro on a finished change.
---

# review — the review stage of kentra-rpir

Review has two halves: the user reviews the code, and the retro reads the
process. Start the retro first, because it runs in the background while the
code review happens. The user decides improvements later, through
`/kentra-rpir:improve`.

**Where things are:**
- the config is `rpir/config.yaml` (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/config.yaml`);
- change folders are `rpir/changes/<YYYY-MM-DD-slug>/`;
- the audit files are `<change>/audit/<repo>.md`; their markers are
  `<main root>/<change>/.local/audit.<repo>.running`;
- the retro template is `${CLAUDE_PLUGIN_ROOT}/templates/spec-retro.md`;
- the plugin version is `version` in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.

## 1. Start

If this session is not running on `roles.review-orchestrator.model` (from the
config, default opus), tell the user before starting and let them choose to
continue or switch models.

1. **Stage start.** Run
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/stage-start.sh" "<project root>"`. On exit 3,
   stop and relay its line. On `user-config: missing`, follow the
   instructions it prints (the user's questions, in one message) before going
   on. Remember its `mode:` line: on `mode: untracked`, skip every commit of
   the change folder and say so in one line.
2. Find the change: the folder the user names, else
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/sessions.sh" current --project <project root> --session "${CLAUDE_SESSION_ID}"`
   (the session's own change, else the newest by sessions file). Confirm
   your choice with the user. Its spec should say
   `status: in-review`. A spec whose `tier` is `full` or `light` belongs to
   a change started under kentra-rpir 0.5.x, which finishes on 0.5.x: stop
   and tell the user so.
3. Record `<main root>` = `git rev-parse --show-toplevel`, run now, before
   moving into the worktree: the worktree has no `<change>/.local/`
   (gitignored). When the project root is not a git work tree (a workspace
   folder), `<main root>` is the project root.
   Read each repository's path, integration worktree, branch and base from the
   Repositories table of `impl-report.md`. A plan whose milestones set `repo`
   spans several repositories: the change folder is in the project root, and
   the report's `### <repo>` headings name the repositories.
4. Work in the change folder inside the integration worktree
   (`<worktreesDir>/<slug>/`) when it exists, or in the main checkout once the
   branch is merged. In untracked mode, and when the project root is not a git
   work tree, no worktree holds `rpir/`: work in the change folder in
   `<main root>`.
5. Register this session to the main checkout's change folder:
   `mkdir -p "<main root>/<change>/.local" && echo "${CLAUDE_SESSION_ID} review" >> "<main root>/<change>/.local/sessions"`.

## 2. Launch the retro

Gather the args:

- **`sessions`:** each line of
  `sh "${CLAUDE_PLUGIN_ROOT}/scripts/sessions.sh" list --project "<main root>" --change <change folder>`
  (`<id> <stage> <path or ->`) gives `{ id, stage, path }`, or
  `{ id, stage, path: null, missing: true }` when the path is `-`. Skip this
  review session's own id. Use `<main root>` from step 1.3, not this
  checkout's own root.
- **`planningLog`:** `<abs>/planning-log.jsonl`.
- **`research`:** `{ "dir": "<abs>/research", "index": "<abs>/rpir/research/index.jsonl" }`;
  leave out `dir` when the change folder has no `research/`.
- **`milestones`:** `{ number, slug, paths }` per milestone, plus a
  `diffRange` of `<merge>^1..<merge>`, where `<merge>` is the merge commit
  listed in `impl-report.md`'s Milestones table. With `repo` set,
  read the table under the milestone's repository heading, and add
  `repo`: the absolute path of that repository's checkout. Reading the report's table
  for commits is fine; the readers never see the report. Skip a milestone
  the report marks blocked or dropped: it has no merge commit, so no
  `diffRange`.
  - **`standard` tier:** every milestone in `plan.yaml`.
  - **`small` tier:** there is no `plan.yaml`, and one milestone, number `1`.
    Its slug is the change folder's name without its `YYYY-MM-DD-` date.
    Its `paths` are the files `git diff --name-only <merge>^1..<merge>`
    lists. Its check is the repo's standard check, from `AGENTS.md`,
    `CLAUDE.md`, the README or the CI config.
- **`improvements`:** `${CLAUDE_PLUGIN_ROOT}/scripts/improvements.mjs`.
- **`projectId`:** `project:` in `rpir/config.yaml`.
- **`changeDate`:** `date -r <path> +%F` of the newest transcript among the
  gathered sessions (excluding this review session).
- **`pluginRecord`:** `plugin.record` in the user config
  `${XDG_CONFIG_HOME:-~/.config}/kentra-rpir/config.yaml`; `true` unless it says
  `false`.
- **`versions.plugin`:** the version on `impl-report.md`'s
  `**Plugin:** kentra-rpir <version>` line, or `version` in
  `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` when the line is missing.
  It must be x.y.z: `improvements.mjs record` rejects anything else.

Run the `kentra-rpir:spec-retro` workflow in the background with:

```json
{ "today": "<YYYY-MM-DD>", "changeDir": "<abs>", "projectRoot": "<abs checkout holding the change>",
  "spec": "<abs>/spec.md", "plan": "<abs>/plan.yaml", "implReport": "<abs>/impl-report.md",
  "out": "<abs>/spec-retro.md", "template": "${CLAUDE_PLUGIN_ROOT}/templates/spec-retro.md",
  "sessions": [...], "planningLog": "<abs>/planning-log.jsonl", "research": {...},
  "milestones": [...],
  "roles": { "prepass": <roles.prepass>, "reader": <roles.reader>, "retro": <roles.retro> },
  "versions": { "plugin": "<x.y.z>" },
  "improvements": "<abs improvements.mjs>", "projectId": "<project id>",
  "changeDate": "<YYYY-MM-DD>", "pluginRecord": <true|false> }
```

At the `small` tier, leave out `plan`.

## 3. Code review

While the retro runs, present the change:

- the pull request link, or the branch and `git diff --stat <base>...<branch>`;
  with several repositories, one such diff per row of the Repositories table,
  headed by the repository, run as
  `git -C <integration worktree> diff --stat <base>...<branch>`;
- one line per milestone: its outcome, and what it added;
- the verifier findings and concerns from `impl-report.md`, plan adjustments,
  and blocked milestones;
- anything in the report that needs the user's decision.

Fix what the user asks for on the integration branch of the repository the
code belongs to (its Repositories row):

- **A small fix:** make it yourself.
- **Anything bigger:** build it as the implement stage builds a milestone.
  Dispatch a fresh lead in a new milestone worktree from that repository's
  integration head, with the user's request as `guidance`, numbered and named after the
  milestone whose code it changes. Then the lead's hand-backs, a fresh
  verifier and the merge: steps 2 to 5 of
  `${CLAUDE_PLUGIN_ROOT}/skills/implement/SKILL.md`. At the `small` tier,
  build the milestone's fields as "Small tier" there says. The implement
  state file is gone by now: keep agent ids and hand-back times in your
  log, and write no state file.

Run the check after each fix: the plan's, or at the `small` tier the repo's
standard check.

## 4. Audit

Skip this step when the change has no `<change>/audit/` folder and no
`audit.*.running` marker.

1. Wait until no `audit.*.running` marker is left: a Monitor on an until-loop
   over the markers, after one line telling the user which audits it waits on.
   A marker that stays while no audit subagent can still run (its implement
   session ended) is for the user: name that audit and go on when they say so.
2. Read every audit file and judge every finding against the spec and the
   code. Decide without asking the user: apply it, or skip it with a reason.
   Judge its size:
   - `small`: make it yourself, as step 3's small fix;
   - `large`: build it as step 3's "Anything bigger" builds a user-requested
     fix (a fresh lead and verifier in a new milestone worktree), with the
     finding as `guidance`.

   Fix in the repository the audit file names, one fix at a time onto the
   same integration branch as the user-requested fixes, and run the check
   after each fix as step 3 says.
3. Append to each audit file a `## Decisions` section with one entry per
   finding: `- <finding> — decision: applied | skipped: <reason> — size: small | large`.
   An audit file that reports the skill was not run gets the single line
   `decision: none — the skill did not run`.
4. Show one line: `Audit: <n> findings · applied <a> (<s> small, <l> large) · skipped <k>`.

A user instruction about a finding (apply, skip, resize) overrides your
judgement: record the decision accordingly.

## 5. Retro line

When the workflow finishes, show exactly one line from its `registry` result:

- normal: `Retro: <out path> · recorded <n> project, <n> plugin findings · regressed: <ids or none>`.
  Write `plugin recording off` in place of the plugin count when
  `pluginRecord` is false.
- `registry.nodeMissing`: `Retro: <out path> · findings not recorded: scripts/improvements.mjs needs node 18 or later`.
- `registry` null: `Retro: <out path> · findings not recorded: the registry step returned no result`.

Then point the user at `/kentra-rpir:improve` for deciding changes, and at
`/kentra-rpir:improve-plugin` for plugin findings.

## 6. Finish

When the code review is done:

1. Set the spec's `status: done`.
2. Commit the change folder (including `audit/`) and `rpir/improvements/` (the project registry is
   written in the checkout holding the change, `--project <projectRoot>`; in
   untracked mode, or when the project root is not a git work tree, skip the
   commit). Push when on the integration branch
   and `implement.push` is true. For each repository in the Repositories
   table, push its integration branch when fixes added commits and
   `implement.push` is true; its pull request, if any, takes the new commits.

Merging the pull requests is the user's call. Once each is merged, remove that
repository's integration worktree:
`git -C <R> worktree remove <R>/<worktreesDir>/<slug>`.

The stage is done when the code review is done and the spec says `status: done`. Then end with one line:

`Change done: <change folder>/spec-retro.md (<short sha>). Next: merge <PR url or branch>, then git -C <R> worktree remove <R>/<worktreesDir>/<slug>`
(for each repository, `<R>` from the Repositories table).
