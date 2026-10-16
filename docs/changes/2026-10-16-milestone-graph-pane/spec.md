---
title: Milestone graph pane for implement runs
type: feature            # feature | bug | chore
status: agreed           # draft | agreed | planned | implementing | in-review | done
tier: light              # full | light — from .kentra-rpir.yaml's tier unless the user chose otherwise
issue:                   # tracker link, when a tracker is configured
planningLog: planning-log.jsonl   # trimmed spec and plan sessions, written when the plan is approved
---

## Problem

While `/kentra-rpir:implement` runs, the user cannot see the plan's progress at
a glance. The orchestrator dispatches implementer and verifier subagents from
the main session with the Agent tool, so the built-in `/workflows` view never
shows them. The built-in subagent panel lists agents without milestone names,
dependencies or per-role timings. The public mods and dashboards (claude-flightdeck,
claude-agentpane, Agent Flow and others) show subagents but know nothing about
milestones or the plan DAG.

The user wants a side panel, opened with a hotkey, that draws the whole plan as
a graph. Each node shows the milestone's name, its status, how long
implementation and verification took, and what the milestone's subagent is
doing right now.

## Goals

1. While an implement run is in progress, the user can open a side pane that
   draws every milestone of the run's plan as a graph in dependency order.
2. Each node shows the milestone's number, slug and goal, its status, the time
   spent implementing and verifying, the attempts and verify rounds, the
   wall-clock time from first dispatch to merge, and the current tool call of
   the milestone's running subagent.
3. The pane ships inside the kentra-rpir plugin, so anyone who installs or
   updates the plugin gets it with no extra setup beyond an optional
   keybinding.

## Non-goals

- Rebuilding the graph after the session is resumed, restarted or `/clear`ed.
  The pane tracks what it observed in this session only; state survives a mod
  reload, not a new session.
- Watching a run in another session or another terminal.
- Changing the implement skill, its prompts or its dispatch protocol. The pane
  reads what the skill already produces.
- Drawing SVG or other graphics. The graph is text and boxes.
- Desktop, VS Code or mobile-specific layouts. Whatever those surfaces draw of
  the same tree is a bonus, not a requirement.
- Changing `milestoned-plan-dag` (for example adding JSON output to `resolve`).
- A run history or a report: `impl-report.md` stays the record.

## Premises

| # | Premise | Importance | Status | Evidence |
|---|---|---|---|---|
| P1 | A marketplace-installed plugin that ships skills, agents and workflows can also ship a hooks module (`hooks/hooks.json` with `modules`), and it loads as a mod with no extra trust prompt on Claude Code ≥ 2.1.287. | critical | verified | docs: https://code.claude.com/docs/en/plugins/mods/overview@2.1.287+ (research/spec-plugin-ships-mod.md) |
| P2 | The `agent.spawn` hook sees each Agent-tool dispatch from the main session with its `prompt` and `subagentType`. The `agentId` is known once `next(e)` resolves, and the same id is on that subagent's `tool.call` and `turn.complete` events and in `$.agent.list()`. | critical | verified | docs: plugin-authoring/types/claude-code.d.ts@2.1.301 (research/spec-agent-spawn-correlation.md) |
| P3 | `tool.call` hooks see every subagent's tool name and input with its `agentId`, and main-session calls without one. Awaiting `next(e)` gives the result, including Bash output and the Agent tool's final text. | critical | verified | docs: plugin-authoring/types/claude-code.d.ts@2.1.301 (research/spec-tool-call-visibility.md) |
| P4 | `$.ui.open` docks a pane beside the transcript in the fullscreen terminal layout: from 110 columns when the person asks (a command or a press), from 144 when unasked, and otherwise it draws inline above the prompt. Redraws are throttled to 30 per second. A Button press can call `$.ui.view({ agentId })` to open that subagent's transcript. | critical | verified | docs: plugin-authoring/types/claude-code.d.ts@2.1.301 (research/spec-pane-open-toggle-view.md) |
| P5 | A mounted Button whose `action` names an engine keybinding action is pressed by the person's chord for that action from the prompt, unless a dialog is up or an engine handler of that action is mounted. A plugin cannot define a chord of its own. | critical | verified | docs: plugin-authoring/types/claude-code.d.ts@2.1.301 ButtonProps.action; reference.md:158 (research/spec-hotkey-route.md) |
| P6 | A mod can read project files with `$.fs.read`, learn the session id with `$.session.id()`, and import a vendored JavaScript file shipped in the plugin. | critical | verified | docs: plugin-authoring/types/claude-code.d.ts@2.1.301 (research/spec-read-plan-files.md) |
| P7 | At least one engine keybinding action has no handler mounted while the prompt has focus, and the user can bind a chord to it in the `Global` or `Chat` context in `~/.claude/keybindings.json`, so the pane can borrow it. | normal | unverified | — |
| P8 | A vendored single-file YAML parser (for example `js-yaml`, MIT) runs in the mod environment, which has no Node and no DOM. | normal | unverified | — |
| P9 | On Claude Code older than 2.1.287, a plugin whose `hooks/hooks.json` holds a `modules` key still loads its skills, agents and workflows. | normal | unverified | — |
| P10 | `$.state` keeps tracked state across a mod reload within the session. | normal | unverified | — |
| P11 | `claude plugin test` can replay recorded event sequences (`agent.spawn`, `tool.call`, `turn.complete`) against the module and assert on tracked state and the drawn tree. It can raise synthetic `ui.scroll` and `ui.focus` events, but cannot press keys in a pane, implement `$.ui.focus`, or assert the focus ring or scroll offset. | normal | refuted (for key presses) | spike: research/spikes/spec-arrow-key-takeover/ |
| P12 | A mod can redraw once a second on a timer (`$.clock`). | normal | unverified | — |
| P13 | A pane can draw a gutter of lane characters beside a column of boxes and keep every lane row aligned with the boxes through height changes and scrolling, docked and inline, as long as every line is one row. A Button cannot hold a bordered Box, so a box's header line is the Button. | critical | verified | spike: research/spikes/spec-diff-review-the-mod-ui-can-draw-a-gutter-of-lane-charac/ |
| P14 | A mod can take over Up and Down in its pane. Graph taller than the pane: each arrow raises `ui.scroll` with `origin` person, `\|by\| == 1` and no pointer (the wheel has a pointer; page keys and Home/End have larger `by`); a hook returning `{}` stops the scroll, and `$.ui.focus({ requestId, key })` plus `$.ui.scroll({ to: { key } })` select the next header Button and keep it in view; the mod's own scroll does not re-enter its hook. Graph that fits: arrows raise only `ui.focus`, the same as Tab, and the engine walks and wraps the ring itself. | critical | verified | spike: research/spikes/spec-arrow-key-takeover/ |
| P15 | Two-column lanes drawn with box-drawing characters take exactly two cells each and are never wrapped or cut, so a 40-column pane fits 5 lanes beside 30-column boxes. | normal | unverified | — |

## Requirements

**Packaging**

1. The plugin ships the mod as `hooks/hooks.json` (`{ "modules": [...] }`) and a
   hooks module beside it. Installing or updating kentra-rpir is the only step
   needed to get the pane.
2. `claude plugin validate` passes on the plugin. The repo carries a
   `tsconfig.json` so the module can be type-checked against the Claude Code
   types by hand; type-checking is not part of the standard check, since
   TypeScript is not a repo dependency.
3. The plugin version is bumped, and the README documents the pane, the
   `/rpir-graph` command, the minimum Claude Code version for the pane
   (2.1.287) and the optional keybinding.

**Detecting a run**

4. The mod starts tracking a run when the main session dispatches its first
   Agent call whose prompt begins `You are implementing milestone M<n>
   \`<slug>\``.
5. The mod finds the run's plan as `<change folder>/plan.yaml`, where the
   change folder is this session's `implement` entry in
   `.kentra-rpir/sessions.map` (matched on `$.session.id()`, newest entry wins).
   If no entry matches, the pane says the plan could not be found and still
   lists the milestones it has seen dispatched.
6. The mod reads the plan's milestones (`number`, `slug`, `goal`,
   `depends-on`), and reads the plan again on each later dispatch, so an
   orchestrator's plan adjustment shows up.

**Tracking milestones**

7. Each dispatch is mapped to a milestone and a role from its prompt's first
   line: `You are implementing milestone M<n> …` is an implementer,
   `You are verifying milestone M<n> …` a verifier. Dispatches whose prompt
   does not start this way are ignored.
8. Each milestone has one status:
   - **waiting**: a dependency is not merged;
   - **ready**: every dependency is merged and nothing has been dispatched;
   - **implementing**: an implementer is running;
   - **verifying**: a verifier is running;
   - **fixing**: an implementer is running after a verifier's FAIL;
   - **passed**: the last verifier reported `VERDICT: PASS` and the merge has
     not been seen;
   - **merged**: the main session ran a `git … merge --no-ff …` whose message
     is `Merge M<n> …` and the command succeeded;
   - **stuck**: the last subagent finished with `STATUS: BLOCKED` or
     `NEEDS_CONTEXT`, or the last verifier reported FAIL, and nothing is
     running for the milestone.
9. For each milestone the mod records: implement time (the sum of every
   implementer subagent's run time), verify time (the sum of every verifier's),
   the number of implementer dispatches, the number of verify rounds, and the
   wall-clock time from the first dispatch to the merge. A running subagent's
   time counts up live.
10. For each running subagent the mod records its latest tool call (tool name
    and a one-line summary of its input, such as the Bash command), and clears
    it when the subagent finishes.
11. Tracked state lives in `$.state`, so a mod reload during a run keeps it.

**Drawing the pane**

12. The pane draws every plan milestone as a box, in one column, ordered by
    dependency depth (a milestone sits below its deepest dependency) and then
    by number. Dependencies are drawn as lines in a gutter to the left of the
    boxes, one lane per milestone that has dependents: the lane leaves that
    milestone's box, runs down past the boxes in between, and branches with an
    arrow into each dependent's box. A lane ends at its last dependent, and its
    column is reused below. Lines may cross; a crossing is drawn, not avoided.
12a. When the pane is too narrow for every lane while keeping boxes at least
    30 columns wide, the lanes that do not fit are not drawn, and each
    dependent whose edge was left out says so in its header (for example
    `+2 edges`).
12b. Every gutter and box line is exactly one row. The mod cuts every text,
    including a box's header label, to its width itself, so the terminal never
    wraps a line and the gutter stays aligned with the boxes.
13. Each box shows: `M<n> <slug>`, the goal (cut to the box width), a status
    mark and word, `impl <time> · verify <time>`, attempts and verify rounds
    when above one, the wall-clock time once merged, the current tool call
    while a subagent runs, `needs M<a>, M<b>` for its dependencies, and
    `+N edges` in the header when requirement 12a left some out.
14. The pane header shows the change's title, a count per status, and the
    run's elapsed time.
15. The pane redraws when tracked state changes and once a second while any
    subagent is running, and stops the timer when none is.
16. While the pane has focus, Up and Down select the previous and next box,
    and the selected box stays in view. Each box's header line is a Button;
    Enter on the selected box opens the transcript of its running subagent, or
    else its most recent one. PageUp, PageDown, Home, End and the wheel still
    scroll.
    - When the graph is taller than the pane, the mod handles the arrows
      itself (P14): its `ui.scroll` hook stops the engine's one-row scroll,
      moves the selection one box, and scrolls the box into view. The
      selection stops at the first and last box.
    - When the graph fits, the engine moves the selection: the arrows walk
      the header Buttons and wrap at the ends. Tab may also land on the
      pane's other controls, such as its close mark ✕. The mod's `ui.focus`
      hook only keeps its own record of the selection in step.
17. The layout works from 40 columns wide: boxes take the width the lanes
    leave, and text is cut rather than wrapped.

**Opening and closing**

18. A `/rpir-graph` command toggles the pane.
19. The pane opens by itself when a run starts (requirement 4). When the
    terminal is too narrow to dock it, it waits rather than drawing inline;
    `/rpir-graph` still opens it.
20. While a run is tracked, a one-line band above the prompt summarises it
    (for example `rpir: 2 merged · M3 verifying · M4 implementing`) and holds a
    Button bound to a borrowed engine keybinding action (P7), so the chord the
    user binds to that action toggles the pane from the prompt. The README
    names the action and gives the `keybindings.json` entry to add. If no
    action can be borrowed (P7 refuted), the band keeps its summary, the
    hotkey Button and its README entry are dropped, and `/rpir-graph` is the
    only toggle.
21. Closing the pane does not stop tracking; reopening it shows the current
    state.

**Testing**

22. `claude plugin test` tests replay recorded event sequences: parallel
    milestones, a FAIL followed by a fix and a PASS, a blocked milestone, a
    merge, a dispatch with no matching plan, and an ignored non-milestone
    dispatch. They check the tracked state and the drawn tree. Layout tests
    draw a chain, a diamond and a DAG with crossing edges at 40, 60 and 100
    columns, and check every edge is drawn or counted as left out, and that
    no line is wider than the pane. Navigation tests raise synthetic
    `ui.scroll` and `ui.focus` events and check that only arrow-shaped
    scrolls (person, `|by| == 1`, no pointer) are stopped and move the
    selection, that wheel, page and Home/End scrolls pass through, and that
    the selection clamps at the ends; the selection logic is tested as a
    plain function. Real key presses are not testable this way (P11) and are
    checked in the live run (requirement 24).
23. `tests/run.sh` runs `claude plugin validate` and `claude plugin test` on
    the plugin when `claude` is on PATH, and skips them with a message when it
    is not.
24. One live `/kentra-rpir:implement` run on a small plan with at least two
    parallel milestones and one dependent milestone, watched in the pane,
    confirms requirements 4–21 by eye.

## Design

**Where the mod lives.** Inside the kentra-rpir plugin (`hooks/hooks.json` and
a hooks module), chosen by the user. Options not taken: a standalone mod repo
added as a submodule, following the harness pattern for standalone tools. The
mod depends on kentra-rpir's prompt wording, `sessions.map` and change-folder
layout, so it is not standalone, and shipping it with the plugin keeps the
prompts and the parser in step under one version.

**How dispatches map to milestones.** From the prompt's first line, which both
dispatch templates already start with `You are implementing|verifying
milestone M{{number}} \`{{slug}}\``. Options not taken: requiring a
`description: "M<n> <slug> impl|verify"` on every Agent dispatch (a skill
change, and it depends on the orchestrator following an instruction), or
matching on `subagentType` (the role's agent type is configurable in
`.kentra-rpir.yaml`, so the prompt line is the stable signal). The mod and
the prompt templates must change together; a test pins the first line of each
template.

**Where the graph comes from.** The plan file, read directly with `$.fs.read`
and parsed with a vendored single-file YAML parser (P8). Options not taken:
running `milestoned-plan-dag resolve` with `$.process.run` (it prints YAML too,
so a parser is still needed, and it adds a process call and a PATH
dependency), or a hand-written parser for the plan subset (brittle against
YAML's block and flow forms). If P8 turns out false, the fallback is the
`resolve` route with a small parser for its fixed output shape.

**Statuses and results.** The verifier's verdict and the implementer's status
come from the Agent tool's result in the main session (`VERDICT: PASS|FAIL`,
`STATUS: …`), and the merge from the main session's Bash call, matched on the
implement skill's fixed message `Merge M<n> <mslug>`. Timing is the span from
the spawn to the subagent's `turn.complete`, measured with `$.clock.now()`.

**Layout.** One column of boxes in dependency order, with edges drawn as
lanes in a left gutter, the way `git log --graph` draws branches: one lane
per milestone with dependents, branching into each of them (chosen by the
user over one lane per edge, which needs more lanes). Each lane
takes two columns, so the graph keeps its lines in a narrow side pane and
handles any DAG, crossings included. Each box still lists `needs M<a>, M<b>`,
so a dropped edge (requirement 12a) loses no information. The user asked for
visible lines and accepted an imperfect drawing to get them. Options not
taken: boxes laid side by side per layer with lines between rows (needs a
wide pane, and the routing breaks when edges cross), needs-lists with no lines
(rejected by the user), or an indented tree (a DAG is not a tree; shared
dependencies would repeat).

**Box selection.** Up and Down move between boxes, handled by the mod (P14),
chosen by the user. A spike (P13) showed the engine's own arrows scroll an
overflowing pane instead of moving focus. Options not taken: Tab and
Shift+Tab as the only way between boxes (works with no mod code, but the user
wants arrows), or no box selection at all. In a graph that fits, the arrows
cannot be told apart from Tab (P14), so the user accepted the engine's
wrapping walk there over clamping both keys.

**Run summary band.** While a run is tracked, the band above the prompt shows a
one-line summary and holds the hotkey Button (requirement 20). Chosen by the
user: it serves terminals too narrow to dock the pane. Option not taken: a band
that holds only the hotkey Button.

**Status set.** Eight statuses (requirement 8), chosen by the user over the
earlier six (waiting, ready, implementing, verifying, failed → retrying,
merged): `passed` and `stuck` name the states that list had no word for, and
`fixing` replaces `failed → retrying`.

**Hotkey.** A plugin cannot add a chord of its own (P5). The pane borrows an
engine keybinding action through a Button in an always-mounted band, shown only
while a run is tracked, and the user binds a chord to that action. The band
earns its place on its own: it shows the run's summary in terminals too narrow
for the docked pane (see "Run summary band"). Which action is borrowed is settled while the band is
built: candidate actions are tried in order, the first that `claude plugin
validate` accepts ships, and the live run confirms the chord works (P7). The user agreed that if no action can be borrowed,
the pane ships with `/rpir-graph` alone and the hotkey becomes a follow-up.
Options not taken: a Button `hotkey` (works only while the pane already has
focus), or asking the user to type the command.

**Auto-open.** The pane opens itself on the first milestone dispatch, chosen by
the user. Unasked opens need 144 columns to dock (P4); narrower, it waits
instead of taking space above the prompt, where the band already summarises
the run.

## Open questions

<!-- writer-gaps: technical gaps self-review found and fixed, one per line -->
