---
name: plan
description: Turns an agreed kentra-rpir spec.md into a milestoned-plan-dag plan.yaml detailed enough that an implementer never explores the codebase — deeper research, parallel-safe milestones, rules by reference, an independent self-review. Use when a spec is agreed, or to revise a plan.
---

# plan — stage 2 of kentra-rpir

Turn `spec.md` into `plan.yaml` in the same change folder. The plan must be
detailed enough that an implementer — a cheaper model, in a fresh context,
holding one milestone — builds it correctly without exploring the codebase.
This stage is mostly hands-off: ask the user only about intent, never about
facts you can look up.

**Where things are:**
- the config is `.kentra-rpir.yaml` (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/kentra-rpir.yaml`);
- the plan format is the `milestoned-plan-dag:plan-author` skill — load it now;
- the full process is `${CLAUDE_PLUGIN_ROOT}/docs/process.md`.

## Checklist

1. Read the spec, the constitution and the code
2. Research the details the plan depends on
3. Draft `plan.yaml`
4. Validate after every edit
5. Self-review
6. Present, agree, write the planning log, commit

### 1. Read

1. Run `milestoned-plan-dag --version`. If it is missing or below 0.2.0, stop
   and tell the user:
   `kentra-rpir plan needs milestoned-plan-dag ≥ 0.2.0 (found <X|none>): brew upgrade kentra-io/tap/milestoned-plan-dag`.
   If the loaded `plan-author` skill documents only `schemaVersion: 0.1.0`
   (no plan-level `rules`), tell the user once to run
   `claude plugin update milestoned-plan-dag@kentra-agentic-plugins`, and
   continue with `validate` as the authority on the schema — never probe the
   CLI to learn it.
2. Find the change: the folder the user names, else the newest entry for this
   project in `.kentra-rpir/sessions.map`, else the newest folder under
   `changesDir`. Confirm your choice with the user. Its `spec.md` should be
   `status: agreed`; if it is not, say so and ask whether to continue.
3. Register this session:
   `mkdir -p .kentra-rpir && echo "${CLAUDE_SESSION_ID} <change folder> plan" >> .kentra-rpir/sessions.map`.
4. Read `spec.md`, the constitution when enabled, and the code the change
   touches: the files the spec's design names, their tests, and the build file.

### 2. Research

List what the plan must state exactly and you do not know for certain:

- signatures of APIs the code will call;
- builder and method names;
- the versions to pin;
- the test framework's idioms in this repo.

Look up what the repo answers. Skip any premise already in the ledger (the
spec's Premises table, or an earlier `# premises:` row): the plan stage never
re-researches one, whatever its status, and never re-spikes a premise the
spec stage already settled. Assign each remaining claim an `importance`
(`critical` when a requirement, a design decision or a milestone criterion
breaks if it is wrong, else `normal`) and send it to research with its
importance; a `critical` claim spikes when the docs don't settle it. Use the
same args as the spec stage, `outDir` = `<change folder>/research` and
`spikeDir` = `<project root>/.kentra-rpir/spikes/<change folder name>/`
(create it with `mkdir -p` first, as in the spec stage).

If you spike something yourself, outside the research workflow:

> Spikes must be readable by the user approving them. Write each spike as a
> file with the Write tool, then run it with one short command such as `sh
> <file>`. Never use heredocs, inline `python3 -c`/`sh -c`/`node -e` programs,
> chained or piped commands, `&`, command substitution or redirects, and
> never run anything that reads stdin. Work only under `<spikeDir>/<slug>/`.
> Never run `git init` there or anywhere else.

Keep the spike files and a `result.md` under
`<change folder>/research/spikes/<slug>/`.

Record every result, and every spike the plan stage runs itself, in a
top-level YAML comment block `# premises:`, placed before `# writerGaps:`,
with IDs `PL1`, `PL2`, … so they never collide with the spec's `P<n>`:

```yaml
# premises:
#   PL1 | critical | verified | spike: research/spikes/1-bats-1-11-run-flag/ | bats 1.11 `run --separate-stderr` exists
#   PL2 | normal | unverified | — | shellcheck 0.10 flags SC2312 on this pattern
```

### 3. Draft `plan.yaml`

Follow `plan-author`. Set `schemaVersion: 0.2.0`. Every milestone carries:

- **`description`** — why it exists and how it fits the others, plus the design
  decisions an implementer would otherwise have to make. The plan-level
  `description` holds what every milestone shares.
- **`deliverables`** — every file, and the type each introduces with its
  responsibility.
- **`steps`** — bite-sized and ordered. Each step that changes code shows the
  code; each step that runs a command shows the command and its expected
  result. Tests come before implementation. A step that writes into a new
  directory creates it: git does not track empty directories, so a directory
  a later milestone needs must contain a committed file.
- **`contract`** — the repo's standard `check`, criteria naming the test that
  proves each behaviour with given/when/then written out, and `paths`.
- **`rules`** — references only (a skill name or a repo path) to what the
  implementer must load and the verifier grades against. What every milestone
  needs goes in plan-level `rules`. Leave out `CLAUDE.md`/`AGENTS.md` and
  path-scoped `.claude/rules`, which load by themselves. Include the
  constitution path when it is enabled.

**Implementation choices belong here, not in the spec.** File layout,
milestone structure, module split and the order of work go in the plan-level
or milestone `description`, `deliverables` and `paths` — even when the user
makes the choice during this stage. See "Spec amendments" below for when a
plan choice does change the spec.

**Design for parallel work:**

- Milestones with no dependency path between them get non-overlapping `paths`.
- Shared types, shared files and version pins go in the earliest milestone
  that needs them.
- Every type that crosses a milestone boundary is named with its signature in
  the milestone that introduces it.

**Coverage:** every spec requirement lands in at least one milestone criterion.

### 4. Validate

Run `milestoned-plan-dag validate <change folder>/plan.yaml` after every edit.
Fix every error. Read every warning: an overlap warning between independent
milestones means adding a dependency or narrowing `paths`.

### 5. Self-review

Run the `kentra-rpir:self-review` workflow with `"stage": "plan"`,
`"mode": "full"`, `"document": "<abs>/plan.yaml"`, `"spec": "<abs>/spec.md"`,
`"ledger": ["<abs>/spec.md", "<abs>/plan.yaml"]` and `"spikeDir"` (as in the
spec stage). The other args are as in the spec stage, without `transcripts`.

When it returns:

- Copy `plan.yaml` to
  `<project root>/.kentra-rpir/reviewed/<change folder name>/plan.yaml` (an
  absolute path) — the base for any diff review before the plan is committed.
- **`technical` findings:** apply each `fix`, re-validate, and tell the user in
  one line per fix. Record each one under a top-level YAML comment block
  `# writerGaps:` at the end of `plan.yaml`.
- **`decision` findings:** stop and ask the user each `question` with its
  `options`. A `critical` premise left `unverified` after its spike arrives
  as a decision finding: proceed on it, change the design, or drop the
  requirement.
- **Too many or irrelevant `rules`** (check P8): suggest to the user which skills
  to disable in the project's or user's settings.

### 6. Present and agree

1. Show the user the plan:
   - one line per milestone: number, goal, the tests it adds;
   - the DAG, as `milestoned-plan-dag resolve` orders it, marking which
     milestones can run in parallel;
   - every item self-review flagged.

   A later edit to `plan.yaml` sizes its review:

   | The edit | Review |
   |---|---|
   | A new document (first plan) | Full self-review, once (`mode: 'full'`). |
   | An edit to a reviewed or agreed document that changes a requirement, goal, non-goal, premise, design decision, milestone contract, `paths`, `deliverables`, or step code | Diff review (`mode: 'diff'`). |
   | Wording, typos, formatting; applying a self-review `technical` fix verbatim | No review. Show the user the diff. Technical fixes still go to the writer-gaps list. |

   When unsure, use a diff review. For a diff review, run
   `kentra-rpir:self-review` with:

   ```json
   { "today": "<YYYY-MM-DD>", "stage": "plan", "mode": "diff",
     "document": "<abs>/plan.yaml", "spec": "<abs>/spec.md",
     "base": "<the last reviewed snapshot's absolute path, `<project root>/.kentra-rpir/reviewed/<change folder name>/plan.yaml`, or, once plan.yaml is committed, `git log -1 --format=%H -- <document>`>",
     "decision": "<what the user decided, in plain words>",
     "projectRoot": "<project root>", "ledger": ["<abs>/spec.md", "<abs>/plan.yaml"],
     "constitution": "<abs path of constitution/constitution.md, or null when disabled>",
     "reviewer": { "agent": "<roles.reviewer.agent>", "model": "<roles.reviewer.model>" },
     "research": { "workflow": "<research.workflow>", "checker": "<research.checker>", "designer": "<research.designer>", "runner": "<research.runner>", "reasoner": "<research.reasoner>" },
     "researchDir": "<abs change folder>/research",
     "spikeDir": "<project root>/.kentra-rpir/spikes/<change folder name>/" }
   ```

   When it returns, copy the edited `plan.yaml` to
   `<project root>/.kentra-rpir/reviewed/<change folder name>/plan.yaml`
   again, then show the user the diff and any findings. A spec amendment
   (below) is reviewed the same way, with `"stage": "spec"`.
2. On approval:
   - set the spec's `status: planned`;
   - write the planning log:
     `sh "${CLAUDE_PLUGIN_ROOT}/scripts/planning-log.sh" --project "$(git rev-parse --show-toplevel)" --change "<change folder>" --out "<change folder>/planning-log.jsonl"`;
     on exit 3, tell the user which sessions' transcripts are missing, and
     commit anyway;
   - commit `plan.yaml`, `spec.md`, `planning-log.jsonl` and `research/` in
     one commit with
     `sh "${CLAUDE_PLUGIN_ROOT}/scripts/commit-change.sh" <change folder> "plan: <title>"`.

The stage is done when `plan.yaml` validates, is committed, and the spec says
`status: planned`. Then end with one line:

`Plan approved: <change folder>/plan.yaml, planning-log.jsonl (<short sha>). Next: /kentra-rpir:implement.`

## Spec amendments

The plan stage never edits `spec.md` for a "how" decision. It changes the
spec only when a requirement, goal, non-goal, or a spec Design decision
changes, or when a plan "how" choice contradicts a statement in the spec's
Design section — in both cases, as a **spec amendment**, editing only that
statement:

1. Make the smallest edit that carries the change.
2. Run a diff review with `kentra-rpir:self-review`:

   ```json
   { "today": "<YYYY-MM-DD>", "stage": "spec", "mode": "diff",
     "document": "<abs>/spec.md",
     "base": "<the agreed spec's commit: `git log -1 --format=%H -- <document>`>",
     "decision": "<what the user decided, in plain words>",
     "projectRoot": "<project root>", "ledger": ["<abs>/spec.md"],
     "constitution": "<abs path of constitution/constitution.md, or null when disabled>",
     "reviewer": { "agent": "<roles.reviewer.agent>", "model": "<roles.reviewer.model>" },
     "research": { "workflow": "<research.workflow>", "checker": "<research.checker>", "designer": "<research.designer>", "runner": "<research.runner>", "reasoner": "<research.reasoner>" },
     "researchDir": "<abs change folder>/research",
     "spikeDir": "<project root>/.kentra-rpir/spikes/<change folder name>/" }
   ```

3. Show the user the diff and any findings.
4. When the user approves the diff, commit it with
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/commit-change.sh" <change folder> "spec: amend <title>"`.

The spec's `status` stays `agreed`: never reset it to `draft` or run a new
full review. The plan self-review (step 5) then runs once, against the
amended spec.

## Red flags

| Thought | Reality |
|---|---|
| "The implementer can look up the class names" | It gets one milestone. The names go in the milestone. |
| "`check: go test ./internal/foo/...`" | Use the repo's standard check. A narrowed check hides regressions. |
| "I'll copy the architecture skill's rules into the description" | `rules` lists the skill by name. Never copy. |
| "The spec doesn't settle this; I'll decide here" | That is a decision finding. Ask the user. |
| "It validates, so it's ready" | `validate` checks grammar, not whether an implementer could start. |
| "The user picked a file layout; I'll write it into the spec" | It goes in `plan.yaml`. The spec changes only when a requirement changes, as an amendment. |
