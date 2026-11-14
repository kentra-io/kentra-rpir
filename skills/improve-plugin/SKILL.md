---
name: improve-plugin
description: Ranks the plugin-registry findings, proposes the top ones, records the user's accept, reject or defer, and carries out the accepted changes in the kentra-rpir plugin source with a version bump. Use when the user wants to improve kentra-rpir itself, or after a nudge reports plugin findings.
---

# improve-plugin — decide the plugin registry findings

The plugin registry holds classes of findings that retros recorded about
kentra-rpir itself. This skill proposes the top ones and carries out the
accepted ones in the plugin source checkout.

**Where things are:** the target is `plugin.source` in the user config
`${XDG_CONFIG_HOME:-~/.config}/kentra-rpir/config.yaml`.

## 1. Gate

Run `node -e 'process.exit(+process.versions.node.split(".")[0] < 18)'`. When
it fails, print exactly one line,
`kentra-rpir: improve-plugin needs node 18 or later (scripts/improvements.mjs)`, and stop.

## 2. Check the target

When `plugin.source` is empty or not a git checkout, stop with one line asking
the user to set `plugin.source` in
`${XDG_CONFIG_HOME:-~/.config}/kentra-rpir/config.yaml`. This check comes before
`list`.

## 3. List

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/improvements.mjs" list --scope plugin`.
Take the eligible rows in the order `list` gives (ranked by priority), at most
five. When nothing is eligible, say so in one line, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/improvements.mjs" decide --scope plugin --verdict none`,
and stop.

## 4. Propose and decide

Present each proposal:
- title, problem, fix, complexity;
- occurrence count and `totals` (count, wall minutes, tokens, user
  interventions), impact and priority;
- `regressed` with `shipped`, when set;
- every earlier rejection with its date and reason, and the occurrences since
  the last rejection (`sinceLastRejection`: change, date, severity).

Record the user's decision for each through
`node "${CLAUDE_PLUGIN_ROOT}/scripts/improvements.mjs" decide --scope plugin --id <id> --verdict accept|reject|defer [--reason <text>]`.
A reject needs a reason. A proposal the user leaves undecided is recorded as
defer. `decide` resets the nudge's `lastImproveRun`, so every run calls it at least
once.

## 5. Carry out

For the accepted classes:
1. Branch first when the checkout is on its default branch.
2. Edit the skills, agents, workflows, scripts or templates there.
3. Bump `version` in its `.claude-plugin/plugin.json`: patch by default, minor
   when the user asks.
4. Run its `sh tests/run.sh` and commit.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/improvements.mjs" ship --scope plugin --id <id> --version <new version>`
   for each accepted class.

Pushing and releasing are the user's call.

## 6. Finish

End with one line: the decisions per verdict, and the commit sha.

The skill is done when every proposal shown has a recorded decision, and every
accepted one is committed and shipped.
