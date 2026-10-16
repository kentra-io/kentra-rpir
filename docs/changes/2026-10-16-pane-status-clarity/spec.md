---
title: Pane statuses that tell running from waiting, and an end-to-end demo
type: bug
status: agreed
tier: light
issue:
planningLog: planning-log.jsonl
---

## Problem

The milestone graph pane (change `2026-10-16-milestone-graph-pane`, PR #23)
cannot tell a milestone whose subagent is **running** from one whose
subagent **finished and now waits for the orchestrator**. The user's first
test showed this: in the demo session M2's implementer reported
`STATUS: DONE`, no verifier was dispatched, and the pane kept showing
`● implementing` with a timer frozen at 5s. (That session was a scripted
prompt that dispatched three agents, not a real implement-skill run.) The header's elapsed time
froze at 1m23s, and M1 sat at `◑ passed` with no merge. Nothing was running,
but the pane read as stuck mid-run.

The tracker followed the agreed rules (a finished implementer "waits for
its verifier" under status `implementing`; a verifier FAIL reads `stuck`),
so the defect is in those rules: three hand-off states share a status with
a running one or with a real blocker. The demo was also too thin to test
with: it dispatched only part of the plan and could not merge, so no run
ever ended with every box merged.

The user also asked for new colours: running statuses light-ish blue, done
green, waiting grey (as now).

## Goals

1. Every box says whether its milestone's subagent is running, or which
   step of the orchestrator it waits for.
2. The header and band say when no subagent is running at all.
3. The colours the user asked for.
4. A committed demo that runs the real `/kentra-rpir:implement` on a small
   throwaway plan, so a human test ends with every box merged.

## Non-goals

- Changing how the implement skill dispatches, merges or reports, or its
  prompt templates.
- Pausing a running agent's timer while the subagent idles on its own
  background command (the known limit from the first change's report).
- Making the colours configurable.
- Running the demo in CI (it spends model tokens and needs a terminal).

## Premises

| # | Premise | Importance | Status | Evidence |
|---|---|---|---|---|
| P1 | A raw hex colour such as `#5FAFFF` in a `Text` `color` prop draws as that colour in the terminal surface. | normal | unverified | — |
| P2 | `◌` and `✗` draw one cell wide in the terminal, like the existing marks. | normal | unverified | — |
| P3 | `claude --plugin-dir <repo> "<prompt>"` starts an interactive session whose first prompt is `<prompt>`, and a slash command in it runs that plugin's skill. | normal | unverified | — |
| P4 | A plugin loaded with `--plugin-dir` takes precedence over an installed plugin of the same name, so the demo runs this branch's implement skill and mod. | normal | unverified | — |
| P5 | Haiku implementers and verifiers finish the demo's trivial milestones (write one file each, check `sh check.sh`). | normal | unverified | — |

## Requirements

**Statuses.** The tracker's status set becomes, in order of precedence:

1. `merged`: as now (the orchestrator's merge of that milestone succeeded).
2. `implementing`, `verifying`, `fixing`: a subagent of the milestone is
   running (`verifying` when it is a verifier, `fixing` when it is an
   implementer after an earlier FAIL). These three apply only while that
   subagent runs.
3. `implemented`: the newest agent is an implementer that finished with
   `DONE`, `DONE_WITH_CONCERNS` or no recognised outcome. The milestone waits
   for its verifier. Replaces the old "implementer finished → implementing".
4. `verified`: the newest agent is a verifier that finished with no
   recognised verdict. The milestone waits for the orchestrator to read the
   verdict. Replaces the old "verifier finished without verdict → verifying".
5. `passed`: as now (the newest verifier said `PASS`). The milestone waits
   for its merge.
6. `failed`: the newest agent is a verifier that said `FAIL`. The milestone
   waits for a fix dispatch. Replaces the old "verifier FAIL → stuck".
7. `stuck`: the newest agent is an implementer that reported `BLOCKED` or
   `NEEDS_CONTEXT`.
8. `ready` and `waiting`: as now.

So the set is waiting, ready, implementing, implemented, verifying, verified,
failed, fixing, passed, merged, stuck.

9. A box's status line names what a hand-off status waits for:
   `implemented · awaiting verify`, `verified · awaiting verdict`,
   `passed · awaiting merge`, `failed · awaiting fix`.
10. A box's timer line counts only while that milestone has a running
   subagent. In a hand-off status it shows the times reached so far.

**Header and band.**

11. When no tracked subagent is running, the pane header ends with `idle`
    in place of the elapsed time's live count. It shows the elapsed time
    from the first dispatch to the last agent's end, followed by `· idle`.
    When every plan milestone is merged it ends with `· done` instead.
12. The band lists the running milestones and the hand-off ones, each with
    its status (for example `rpir: 1 merged · M2 verifying · M3 implemented`),
    and ends with `· idle` when nothing runs.

**Colours.**

13. Each box's border and text take the colour of its status:
    - implementing, verifying, fixing, implemented, verified: light-ish blue,
      `#5FAFFF`;
    - passed and merged: green, the theme's `success`;
    - waiting: grey (dim), as now;
    - ready: the theme's default text colour;
    - failed: the theme's `warning`;
    - stuck: the theme's `error`.
14. Status marks: implemented and verified `◌`, failed `✗`, stuck `⊘`; the
    others stay as they are.

**Demo.**

15. `tests/demo/run-demo.sh [<dir>]` creates a throwaway git repository in
    `<dir>` (default: a new temporary directory). It holds:
    - a `kentra-rpir` change folder whose spec is `status: planned`;
    - a valid four-milestone plan, M1 root, M2 and M3 on M1, M4 on M2 and
      M3, each milestone writing one file and checked by `sh check.sh`;
    - a `.kentra-rpir.yaml` with Haiku implementers and verifiers and
      `openPullRequest: false`;
    - a bare repository beside it as `origin`, so the final push succeeds.
16. The script then starts
    `claude --plugin-dir <this repo> "/kentra-rpir:implement <change folder>"`
    in that repository, unless run with `--print-only`. With `--print-only` it
    creates the repository and prints the command and the path, without
    starting Claude Code.
17. `tests/run.sh` runs `run-demo.sh --print-only` into a temporary
    directory. It checks that the plan validates with `milestoned-plan-dag`
    when that tool is on PATH, that the repository has a clean working tree
    with one commit, and that `origin` is set.
18. The README's "Watching an implement run" section tells a reader how to
    try the pane with the demo.

## Design

**Hand-off statuses are their own statuses, not a flag on `implementing`.**
Options: (a) new statuses `implemented`, `verified` and `failed`, with `passed` as is;
(b) keep the old statuses and add an "idle" flag the layout draws as a
suffix; (c) keep the statuses and only stop the timer. (a) is chosen: the
header counts, the band and the colours all key on the status, so a flag
would have to be threaded through every one of them, and (c) leaves the
`● implementing` label that misled the user. `failed` splits from `stuck`
because a verifier FAIL is routine: the orchestrator re-dispatches with the
findings. Red is kept for a blocker that needs a person.

**Colours.** `#5FAFFF` (xterm 75) is a fixed hex value. The theme keys that
lean blue (`suggestion`, `permission`) draw lavender or violet in some
themes, and the user asked for a specific hue. Green and the rest follow the
theme, so they stay readable on light and dark backgrounds. A hand-off status
keeps the running colour (blue), because the milestone is still in
progress. Only passed and merged, which need no more agent work, are green.

**The demo runs the real implement skill.** Options: (a) a scripted
"simulation" prompt that dispatches fake agents and runs fake merges (what
the first test used); (b) the real `/kentra-rpir:implement` on a tiny real
plan in a throwaway repository; (c) a replay of a recorded event stream
through the mod outside Claude Code. (b) is chosen: it exercises the same
dispatch prompts, background agents, worktrees and `git merge --no-ff`
lines the mod reads, and ends with every box merged. Haiku roles keep it
cheap. (a) drifts from the real skill, as the first test showed. (c) skips
the engine, which is where both of the first change's live defects were.

**Where it lives.** The statuses change `types/index.d.ts` (`Status`),
`hooks/tracker.ts` (`viewOf`), `hooks/layout.ts` (marks, labels, header,
band) and `hooks/register.tsx` (colours). The demo is
`tests/demo/run-demo.sh` plus its fixture files under `tests/demo/`. This
change amends the first change's status rules (its requirement 8). That
change's spec stays as written, and this spec supersedes it on those points.

**Decisions made under the user's delegation.** The user asked that calls be
made without them. The writer chose the statuses, the colours beyond the three
the user named, the marks, the header and band wording and the demo approach
above; self-review confirmed them as written, and settled a verifier that ends
without a verdict as its own hand-off status `verified` (Requirement 4) rather
than a frozen `verifying`.

## Open questions

<!-- writer-gaps: technical gaps self-review found and fixed, one per line
Problem: noted that the observed session was a scripted three-agent prompt, not an implement-skill run.
Design: option (a) names `verified` among the new hand-off statuses.
-->
