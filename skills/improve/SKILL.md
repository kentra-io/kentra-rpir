---
name: improve
description: Ranks the project's improvement-registry findings, proposes the top ones, records the user's accept, reject or defer, and carries out the accepted changes to the project's own files. Use when the user wants to improve the project's process, or after a retro or a nudge reports recorded findings.
---

# improve — decide the project's registry findings

The project registry holds classes of findings that retros recorded in
`rpir/improvements/`. This skill proposes the top ones and carries out the
accepted ones in the project's own files.

## 1. Gate

Run `node -e 'process.exit(+process.versions.node.split(".")[0] < 18)'`. When
it fails, print exactly one line,
`kentra-rpir: improve needs node 18 or later (scripts/improvements.mjs)`, and stop.

## 2. List

Run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/improvements.mjs" list --scope project --project <project root>`,
the project root being the directory holding `rpir/`. Take the eligible rows in
the order `list` gives (ranked by priority), at most five. When nothing is eligible, say so in one line, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/improvements.mjs" decide --scope project --project <project root> --verdict none`,
and stop.

## 3. Propose and decide

Present each proposal:
- title, problem, fix, complexity;
- occurrence count and `totals` (count, wall minutes, tokens, user
  interventions), impact and priority;
- `regressed` with `shipped`, when set;
- every earlier rejection with its date and reason, and the occurrences since
  the last rejection (`sinceLastRejection`: change, date, severity).

Record the user's decision for each through
`node "${CLAUDE_PLUGIN_ROOT}/scripts/improvements.mjs" decide --scope project --project <project root> --id <id> --verdict accept|reject|defer [--reason <text>]`.
A reject needs a reason. A proposal the user leaves undecided is recorded as
defer. `decide` resets the nudge's `lastImproveRun`, so every run calls it at least
once.

## 4. Carry out

For the accepted classes, edit the project's own files: AGENTS.md or
CLAUDE.md, conventions, CI, `rpir/config.yaml`. Run the project's standard
check (from AGENTS.md, CLAUDE.md, the README or CI), then commit the edits
together with `rpir/improvements/`. When `git -C <project root> check-ignore -q --no-index rpir/.kentra-rpir-probe`
succeeds (untracked mode), or the project root is not a git work tree
(`git -C <project root> rev-parse --is-inside-work-tree` fails), commit only the
edited project files and leave out `rpir/improvements/`. Accepted project classes stay `accepted`:
the project scope has no version, so it has no `ship`.

## 5. Finish

End with one line: the decisions per verdict, and the commit sha.

The skill is done when every proposal shown has a recorded decision and every
accepted one is committed.
