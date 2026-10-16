# kentra-rpir

A Claude Code plugin that runs one change — a feature, a bug or a chore — from
idea to merged code, in four stages:

| Stage | Skill | You | It writes |
|---|---|---|---|
| **spec** | `/kentra-rpir:spec` | answer questions until you agree | `spec.md` |
| **plan** | `/kentra-rpir:plan` | approve | `plan.yaml` |
| **implement** | `/kentra-rpir:implement` | settle what the orchestrator asks | code, `impl-report.md` |
| **review** | `/kentra-rpir:review` | review the code and the retro | `spec-retro.md` |

It is RPI (Research → Plan → Implement) with an explicit Review stage, for a solo
founder:

- **Files are the handoff.** Each stage reads the previous stage's file, not
  its conversation.
- **Checked against the source.** An independent reviewer checks the spec and
  the plan against the conversation, the spec, the project's rules and its
  constitution — split per milestone for a plan. Research agents check every
  premise that could change the plan with a docs check, and spike only a
  critical premise the docs don't settle.
- **Two tiers.** `full` for code that ships; `light` for proofs of concept,
  researching only what could change the plan's shape.
- **Plans written in parallel.** The main session writes the plan's skeleton;
  one writer per milestone fills in the detail.
- **Parallel, verified implementation.** Milestones from the plan's DAG run in
  parallel git worktrees. Each one is checked by a fresh verifier before it
  merges.
- **The process records itself.** The spec and plan sessions are kept as a
  trimmed, redacted log in the change folder; the retro reads every session's
  transcript, not the agents' account of their work.

Everything for one change lives in `docs/changes/<date>-<slug>/`. See
[`docs/process.md`](docs/process.md) for the whole process.

## Install

```
/plugin marketplace add kentra-io/kentra-agentic-plugins
/plugin install kentra-rpir@kentra-agentic-plugins
brew install kentra-io/tap/milestoned-plan-dag
```

Needs `milestoned-plan-dag` 0.3.0 or later and `jq` 1.6 or later.

Optional: [`adr-sourced-constitution`](https://github.com/kentra-io/adr-sourced-constitution)
for a project constitution that the spec, plan and self-review stages read.

## Configure

The first `/kentra-rpir:spec` in a project writes `.kentra-rpir.yaml`. Models and
agents per role, question batch size, worktree location and research settings
live there — see [`templates/kentra-rpir.yaml`](templates/kentra-rpir.yaml).

## Watching an implement run

While `/kentra-rpir:implement` runs, a side pane draws the plan as a
graph:

- **One box per milestone**, in dependency order, with lanes in a
  gutter on the left that run from each milestone down to the
  milestones that depend on it. A box that the pane is too narrow to
  draw every lane for says `+N edges` in its header, and every box
  lists its dependencies as `needs M<a>, M<b>`.
- **Each box** shows `M<n> <slug>`, the goal, the status,
  `impl <time> · verify <time>`, the attempts and verify rounds when
  there is more than one, the wall-clock time once merged, and the
  tool call the milestone's subagent is running right now. The
  status is one of waiting, ready, implementing, implemented,
  verifying, verified, failed, fixing, passed, merged or stuck.
  `implementing`, `verifying` and `fixing` mean a subagent of the
  milestone is running, and only then do the times count. Four
  statuses mean the milestone waits for the orchestrator, and the box
  says what for: `implemented · awaiting verify`,
  `verified · awaiting verdict`, `passed · awaiting merge` and
  `failed · awaiting fix`. `stuck` means the implementer reported
  `BLOCKED` or `NEEDS_CONTEXT`, and a person needs to look.
- **Colours.** Boxes with a running subagent, or that are implemented
  or verified, are light blue, passed and merged boxes are green,
  waiting boxes (not yet ready) are grey, ready boxes take the
  theme's default text colour, a failed box is orange (the theme's
  warning colour) and a stuck box is red.
- **The pane header** shows the change's title, a count per status
  and the run's elapsed time. When no subagent is running it shows
  the time up to the last agent's end followed by `· idle`, and once
  every milestone is merged it ends `· done` instead.

While a run is tracked, a one-line band above the prompt summarises
it: the merged count, then each milestone whose subagent is running
or that waits for the orchestrator, with its status, ending with
`· idle` when nothing runs (for example
`rpir: 1 merged · M2 verifying · M3 implemented`, or
`rpir: 1 merged · M2 implemented · idle`). You can follow the run
there in a terminal too narrow for the pane.

**Opening and closing.** The pane opens by itself on the first
milestone dispatch when Claude Code runs in the fullscreen terminal
layout at 144 columns or wider. Narrower, it waits and the band keeps
the summary. `/rpir-graph` toggles the pane at any time; asked for,
it docks from 110 columns. Closing the pane does not stop tracking:
reopen it and it shows the current state.

**Trying it.** `sh tests/demo/run-demo.sh` from this checkout builds
a throwaway git repository with a four-milestone diamond plan (M1,
then M2 and M3 in parallel, then M4), Haiku implementers and
verifiers, and a bare `origin` beside it, in a new temporary
directory (or in `<dir>` with `sh tests/demo/run-demo.sh <dir>`; the
repository goes in `<dir>/project`). It then starts
`/kentra-rpir:implement` there with this checkout's plugin
(`claude --plugin-dir`), so the pane runs this branch's code. Run it
in the fullscreen layout at 144 columns or wider and answer the
skill's confirmation prompt: the boxes move through implementing,
implemented, verifying, passed and merged, and the header ends
`· done`. `--print-only` builds the repository and prints its path
and the command without starting Claude Code. The run spends model
tokens.

**Keys in the pane.** Up and Down select the previous or next box,
Enter opens the transcript of the selected milestone's subagent (the
running one, or else the most recent one), and `ctrl+x x` closes the
pane. PageUp, PageDown, Home, End and the mouse wheel scroll.

**Optional hotkey.** A plugin cannot add a chord of its own, so the
band's `graph` button borrows the engine action `app:toggleDiffPreSession`.
Bind a chord to it in `~/.claude/keybindings.json`, and that chord
toggles the pane from the prompt while a run is tracked:

```json
{
  "bindings": [
    {
      "context": "Global",
      "bindings": { "ctrl+x g": "app:toggleDiffPreSession" }
    }
  ]
}
```

If the file already exists, add the block to its `bindings` array.
`ctrl+x g` is a suggestion; any free chord works. While the diff panel is
open, the engine handles `app:toggleDiffPreSession` itself, and the chord does
that instead of toggling the pane.

**Requirements and limits.** The pane needs Claude Code 2.1.287 or
later. On older versions the rest of the plugin should work as
before, without the pane. The pane tracks the run in the current
session only: a resumed or restarted session, or a run in another
terminal, starts with an empty pane.

## History

This repository was `spec-lifecycle`: a gated, OpenSpec-format lifecycle with a
Go CLI. Its last release is v0.2.0; the history is in git.

## License

MIT
