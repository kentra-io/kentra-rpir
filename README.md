# kentra-rpir

A Claude Code plugin that runs one change (a feature, a bug or a chore) from
idea to merged code, in three stages:

| Stage | Skill | You | It writes |
|---|---|---|---|
| **plan** | `/kentra-rpir:plan` | answer questions, agree the spec, approve the plan | `spec.md`, `plan.yaml`, research reports |
| **implement** | `/kentra-rpir:implement` | settle what the orchestrator asks, check the `human:` criteria | code, `impl-report.md` |
| **review** | `/kentra-rpir:review` | review the code | `spec-retro.md`, findings in the registries |

`/kentra-rpir:research` runs the research pool on its own, outside a change.
`/kentra-rpir:improve` and `/kentra-rpir:improve-plugin` turn the findings that
retros recorded into changes to your project and to the plugin.

It is RPI (Research → Plan → Implement) with an explicit Review stage, for a solo
founder:

- **Files are the handoff.** Each stage reads the previous stage's files, not
  its conversation.
- **One session plans.** It asks the questions, settles the layout and the main
  abstractions with you, writes the spec, and then writes a coarse plan: usually
  3 to 8 milestones, each with its scope, interfaces, criteria and check, and no code.
- **Research in the background.** Premises go to a session research pool while
  the conversation goes on: a lookup for a fact, a spike for a premise, a
  researcher for a survey. Each job writes a report, Conclusion first, and a row
  in a project-wide index that is checked before anything is researched again.
- **Two tiers.** `small`: the spec alone, built as one milestone. `standard`:
  spec and plan, built milestone by milestone.
- **One independent check per judgement.** One fresh reviewer reads spec and
  plan together before you approve, and a diff review follows each edit of
  substance. An advisor checks a spike's conclusion on a critical premise.
- **Milestone leads.** Milestones from the plan's DAG run in parallel git
  worktrees. An Opus lead per milestone turns it into briefs for fresh Sonnet
  implementers, and a fresh verifier checks each milestone before it merges.
- **The process records itself.** The planning sessions are kept as a trimmed,
  redacted log in the change folder; the retro reads every session's transcript,
  not the agents' account of their work.

Everything for one change lives in `rpir/changes/<date>-<slug>/`, and every
other kentra-rpir file of a project lives under the same `rpir/` folder. A plan
can span several repositories. See [`docs/process.md`](docs/process.md) for the
whole process.

## Install

```
/plugin marketplace add kentra-io/kentra-agentic-plugins
/plugin install kentra-rpir@kentra-agentic-plugins
brew install kentra-io/tap/milestoned-plan-dag
```

Needs `milestoned-plan-dag` 0.5.0 or later (`brew upgrade
kentra-io/tap/milestoned-plan-dag`) and `jq` 1.6 or later. `node` 18 or later is
optional: without it the findings are not recorded, and the nudge and the
`improve` skills do nothing.

Optional: [`adr-sourced-constitution`](https://github.com/kentra-io/adr-sourced-constitution)
for a project constitution that the plan stage and its reviewer read.

**Projects on the old layout.** A project without `rpir/config.yaml`
is on the layout of kentra-rpir 0.6.x and earlier. Every stage stops on it and names `scripts/migrate-layout.sh`,
which moves the files into `rpir/`. Run it by hand, review `git status`, and
commit.

**Changes started on 0.5.x.** A spec with `tier: full` or `tier: light` belongs
to a change started on kentra-rpir 0.5.x. Finish it on 0.5.x: this version's
stages stop on it and do not migrate it.

## Usage

1. `/kentra-rpir:plan` with the idea, bug or chore. Answer the questions, confirm
   the tier, agree the spec, and approve the plan. The stage commits the change
   folder.
2. `/kentra-rpir:implement` builds it on an integration branch in
   `.worktrees/<slug>/`, pushes it, and opens a pull request when the remote is GitHub and gh is
   authenticated.
3. `/kentra-rpir:review` presents the change for your code review while the retro
   runs, then applies the findings of the audit, when one is configured. The
   retro records its findings in the registries and review shows one line.
4. `/kentra-rpir:improve` ranks the findings recorded in the project, proposes
   the top five, and carries out the ones you accept.
   `/kentra-rpir:improve-plugin` does the same for kentra-rpir itself.

Each stage ends with one line naming the next. A SessionStart nudge reminds you
to run `improve` when enough findings have piled up.

## Configure

**Project.** The first stage run in a project writes `rpir/config.yaml` with a
stable `project:` id (the directory name). The first `/kentra-rpir:plan` also asks
three questions: the issue tracker, whether to read a constitution, and whether
`rpir/` is committed (`track`, default yes; `track: false` gitignores all of
`rpir/` and every stage then works untracked). Missing keys take the defaults in
[`templates/config.yaml`](templates/config.yaml): the agent and model per role,
the question batch size, the research pool's limits, the standalone switch, the
number of milestones in progress at once, the verifier's cache window, the
worktree location, and the `audit`. [`docs/process.md`](docs/process.md#rpirconfigyaml)
explains every key.

**User.** The first stage run on a machine asks four questions in one message and
writes `${XDG_CONFIG_HOME:-~/.config}/kentra-rpir/config.yaml` from
[`templates/user-config.yaml`](templates/user-config.yaml): record plugin
findings from retros (default yes), nudge about them at session start (default
no), the path of the plugin source (asked only when the nudge is on), and a
default audit skill (default none). [`docs/process.md`](docs/process.md#the-user-config)
describes the keys.

**Audit.** Set `audit: { skill: ponytail:ponytail-audit, args: "" }` in
`rpir/config.yaml` or the user config, and `/kentra-rpir:implement` launches that
skill in the background on each repository when it finishes. `/kentra-rpir:review`
applies the findings it judges worth applying and records each decision in
`<change>/audit/<repo>.md`.

## Watching an implement run

While `/kentra-rpir:implement` runs, a side pane draws the plan as a
graph. A small-tier change, which has no plan file, shows as one
milestone.

- **One box per milestone**, in dependency order, with lanes in a
  gutter on the left that run from each milestone down to the
  milestones that depend on it. A box that the pane is too narrow to
  draw every lane for says `+N edges` in its header, and every box
  lists its dependencies as `needs M<a>, M<b>`.
- **Each box** shows `M<n> <slug>`, the goal, the status,
  `impl <time> · verify <time>` (the lead's time and the verifiers'),
  the attempts (lead rounds) and verify rounds when there is more
  than one, the wall-clock time once merged, and the tool call the
  milestone's lead or verifier is running right now. The
  status is one of waiting, ready, implementing, implemented,
  verifying, verified, failed, fixing, passed, merged or stuck.
  `implementing`, `verifying` and `fixing` mean the milestone's lead
  or verifier is running, and only then do the times count. A lead
  that handed back `WAITING` keeps its milestone `implementing`
  until it is resumed with its implementer's report. Four
  statuses mean the milestone waits for the orchestrator, and the box
  says what for: `implemented · awaiting verify`,
  `verified · awaiting verdict`, `passed · awaiting merge` and
  `failed · awaiting fix`. `stuck` means the lead reported
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
then M2 and M3 in parallel, then M4, each sleeping 30 seconds and
writing one dummy file), Haiku leads, implementers and
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
Enter opens the transcript of the selected milestone's lead or
verifier (the running one, or else the most recent one), and `ctrl+x x` closes the
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
before, without the pane. The pane rebuilds the run from the
session's transcript, so a session that continues under a new id (a
background hand-off, a resume) shows the run where it is, and the
orchestrator's every turn end checks the pane against the transcript.
Timings come from the last session's record when there is one; a box
the pane first learns of from the transcript counts its time from
then. The pane finds the plan through the change's `.local/sessions`
file that registers the session, also when the session started in a folder
above the project (a folder of several repositories). It recognises a
dispatch by the prompt's first line; when the prompt points to a file
instead, by that file's name (`m<n>-<slug>.lead.<k>.md`,
`m<n>-<slug>.verify.<k>.md`) or, for a lead or verifier agent, by its
description (`Lead M<n> <slug>`, `Verify M<n> <slug>`). A run in
another terminal is not shown.

## History

This repository was `spec-lifecycle`: a gated, OpenSpec-format lifecycle with a
Go CLI. Its last release is v0.2.0; the history is in git.

## License

MIT
