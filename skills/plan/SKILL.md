---
name: plan
description: Turns an agreed kentra-rpir spec.md into a milestoned-plan-dag plan.yaml an implementer builds without exploring the codebase — research on the plan's shape, a skeleton, one writer per milestone in parallel, an independent self-review. Use when a spec is agreed, or to revise a plan.
---

# plan — stage 2 of kentra-rpir

Turn `spec.md` into `plan.yaml` in the same change folder. You are the plan's
**author**: you decide its shape — the milestones, their edges, their
contracts and the types that cross between them — and one writer per
milestone fills in the detail, in parallel. You own coherence: every
milestone keeps to the skeleton, and the assembled plan reads as one plan.
Ask the user only about intent, never about facts you can look up.

**Where things are:**
- the config is `.kentra-rpir.yaml` (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/kentra-rpir.yaml`);
- the plan format is the `milestoned-plan-dag:plan-author` skill — load it now;
- what a finished milestone carries is `${CLAUDE_PLUGIN_ROOT}/agents/plan-writer.md`;
- the full process is `${CLAUDE_PLUGIN_ROOT}/docs/process.md`.

**Paths:**
- `<change>` is the change folder and `<name>` its folder name.
- `<draft>` = `<project root>/.kentra-rpir/plan/<name>/` holds the plan while
  you write it (gitignored): `head.yaml`, `milestones/<NN>-<slug>.yaml` (`NN`
  the milestone number, two digits), and `tail.yaml`.
- `<spikeDir>` = `<abs change>/research/spikes` (gitignored).
- **Assemble** = `sh "${CLAUDE_PLUGIN_ROOT}/scripts/assemble-plan.sh" <draft> <change>/plan.yaml`.

Until the plan is committed, the fragments in `<draft>` are the source: edit
the fragment, then assemble. Once committed, edit `plan.yaml` itself.

**Tier.** The spec's frontmatter `tier` (`full` or `light`; absent means the
config's `tier`) sets how far research goes and how complete each step's
code is:

| | `full` | `light` |
|---|---|---|
| Research | every claim that is not in the ledger | `critical` claims only; `normal` ones stay `unverified` |
| Spikes | a `critical` claim the docs don't settle at high confidence | the same |
| Step code | complete code in every step | the best code available knowledge supports; a step resting on an unverified premise names it and states the outcome its code must reach |

**Claims.** A claim is something the plan depends on that the repo doesn't
answer. List one only when the plan would change if it were wrong.
`critical`: if it is wrong, the shape changes — the milestones, a design
decision or the approach. `normal`: it would be fixed inside one milestone.
Leave out what an implementer settles while writing the code, such as the
exact syntax of a call the library plainly supports.

## Checklist

1. Read the spec, the constitution (when enabled) and the code
2. Research the plan's shape
3. Write the skeleton
4. Skeleton review
5. Write the milestones
6. Assemble, validate, self-review
7. Present, agree, write the planning log, commit

### 1. Read

1. Run `milestoned-plan-dag --version`. If it is missing or below 0.3.0, stop
   and tell the user:
   `kentra-rpir plan needs milestoned-plan-dag ≥ 0.3.0 (found <X|none>): brew upgrade kentra-io/tap/milestoned-plan-dag`.
   If the loaded `plan-author` skill documents a `schemaVersion` below
   `0.3.0`, tell the user once to run
   `claude plugin update milestoned-plan-dag@kentra-agentic-plugins`, and
   continue with `validate` as the authority on the schema.
2. Find the change: the folder the user names, else the newest entry for this
   project in `.kentra-rpir/sessions.map`, else the newest folder under
   `changesDir`. Confirm your choice with the user. Its `spec.md` should be
   `status: agreed`; if it is not, say so and ask whether to continue.
3. Register this session:
   `mkdir -p .kentra-rpir && echo "${CLAUDE_SESSION_ID} <change folder> plan" >> .kentra-rpir/sessions.map`.
4. Make sure `.gitignore` holds `<changesDir>/*/research/spikes/`.
   `commit-change.sh` refuses to commit spikes that aren't ignored. If you add
   the line, pass `.gitignore` as an extra path to `commit-change.sh` in
   step 7.
5. Read `spec.md`, the constitution when enabled, and the code the change
   touches: the files the spec's design names, their tests, and the build file.
   When the change fits the other tier better than the spec's `tier`, say so
   in one line and let the user choose.

### 2. Research the plan's shape

List the claims the plan's shape rests on: the versions to pin, whether an
API or tool supports what a milestone needs, platform behaviour a criterion
relies on. Look up what the repo answers. Skip any premise already in the
ledger (the spec's Premises table, or a `# premises:` row): you never
re-research one, whatever its status, and never re-spike a premise the spec
stage settled; only a writer or a reviewer reopens one, when the plan
changes something it rests on. Send the rest to `research.workflow`, at the
tier:

```json
{ "today": "<YYYY-MM-DD>", "prefix": "plan", "topics": [{ "name": "<the claim>", "focus": "<why the plan depends on it>", "importance": "<critical|normal>" }],
  "question": "Is this claim true for the plan of <change title>?", "outDir": "<abs change>/research",
  "checker": "<research.checker>", "designer": "<research.designer>", "reasoner": "<research.reasoner>",
  "spikeDir": "<spikeDir>" }
```

Create `<spikeDir>` with `mkdir -p` first.

If you spike something yourself, outside the research workflow:

> Spikes must be readable by the user approving them. Write each spike as a
> file with the Write tool, then run it with one short command such as `sh
> <file>`. Never use heredocs, inline `python3 -c`/`sh -c`/`node -e` programs,
> chained or piped commands, `&`, command substitution or redirects, and
> never run anything that reads stdin. Write and run experiments only under
> `<spikeDir>/<slug>/`. Never run `git init` there or anywhere else.

Name the folder `plan-<slug>` and write `result.md` beside the spike files in
it.

Record every result in `<draft>/tail.yaml`, in a YAML comment block
`# premises:`, with IDs `PL1`, `PL2`, … so they never collide with the
spec's `P<n>`:

```yaml
# premises:
#   PL1 | critical | verified | spike: research/spikes/plan-bats-1-11-run-flag/ | bats 1.11 `run --separate-stderr` exists
#   PL2 | normal | unverified | — | shellcheck 0.10 flags SC2312 on this pattern
```

### 3. Write the skeleton

`mkdir -p <draft>/milestones`, then write:

- **`head.yaml`** — `schemaVersion: 0.3.0`, the plan-level `description`
  (what every milestone shares) and `rules` (references every milestone
  needs, such as the constitution path when it is enabled), and last the
  line `milestones:`.
- **One fragment per milestone**, a single list item indented under
  `milestones:`, holding:
  - `number`, `slug`, `goal`;
  - `description` — why the milestone exists, how it fits the others, and
    the design decisions its writer must follow;
  - `deliverables` — every file, and each type it introduces with its
    responsibility. A type that crosses a milestone boundary gets its full
    signature here: the writers on both sides build against it — use the
    prose form of `deliverables`, since the structured `create`/`modify`/
    `test` form holds file lists only;
  - `contract` — the repo's standard `check`; one criterion per behaviour,
    named after the test that proves it, with given/when/then at the level
    of the spec's requirement; a behaviour no test or command can prove —
    how a page looks, say — names `human:` and what the user checks in
    place of a test; and `paths`;
  - `depends-on` — every milestone whose output this one uses. A milestone
    without `depends-on` is a root and starts at once;
  - `rules` — references only (a skill name or a repo path) to what the
    implementer must load and the verifier grades against. Leave out
    `CLAUDE.md`/`AGENTS.md` and path-scoped `.claude/rules`, which load by
    themselves;
  - `steps` — the single placeholder `"[ ] The milestone writer replaces this step."`.
- **`tail.yaml`** — the `# premises:` block from step 2.

**Design for parallel work:**

- Order in the file creates no edge: a milestone waits only for what its
  `depends-on` lists. Give independent milestones no edge between them.
- Milestones with no dependency path between them get non-overlapping `paths`.
- Shared types, shared files and version pins go in the earliest milestone
  that needs them.

**Coverage:** every spec requirement lands in at least one criterion.

**Helpers:** a helper the plan's own criteria run — a screenshot script, a
fixture generator — may be a milestone deliverable, committed to the
project. Say in that milestone's `description` that the criteria need it.

**Implementation choices belong here, not in the spec.** File layout,
milestone structure, module split and the order of work go in the plan —
even when the user makes the choice during this stage. See "Spec amendments"
below for when a plan choice does change the spec.

Assemble, then run `milestoned-plan-dag validate <change>/plan.yaml`. Fix
every error in the fragment it names. An overlap warning between independent
milestones means adding an edge or narrowing `paths`.

### 4. Skeleton review

Run `kentra-rpir:self-review` with `"mode": "skeleton"`:

```json
{ "today": "<YYYY-MM-DD>", "stage": "plan", "mode": "skeleton", "tier": "<the spec's tier>",
  "document": "<abs change>/plan.yaml", "spec": "<abs change>/spec.md",
  "projectRoot": "<project root>", "ledger": ["<abs change>/spec.md", "<draft>/tail.yaml"],
  "constitution": "<abs path of constitution/constitution.md, or null when disabled>",
  "reviewer": { "agent": "<roles.reviewer.agent>", "model": "<roles.reviewer.model>" },
  "research": { "workflow": "<research.workflow>", "checker": "<research.checker>", "designer": "<research.designer>", "reasoner": "<research.reasoner>" },
  "researchDir": "<abs change>/research", "spikeDir": "<spikeDir>" }
```

When it returns, handle the findings as in step 6 — a `technical` fix here
edits the skeleton and is not a writer gap — then go on.

### 5. Write the milestones

Run the `kentra-rpir:plan-milestones` workflow:

```json
{ "today": "<YYYY-MM-DD>", "projectRoot": "<project root>", "spec": "<abs change>/spec.md",
  "skeleton": "<abs change>/plan.yaml", "head": "<draft>/head.yaml",
  "milestones": [{ "slug": "<slug>", "file": "<draft>/milestones/<NN>-<slug>.yaml" }],
  "tier": "<the spec's tier>",
  "writer": { "agent": "<roles.plan-writer.agent>", "model": "<roles.plan-writer.model>" },
  "research": { "workflow": "<research.workflow>", "checker": "<research.checker>", "designer": "<research.designer>", "reasoner": "<research.reasoner>" },
  "researchDir": "<abs change>/research", "spikeDir": "<spikeDir>",
  "ledger": ["<abs change>/spec.md", "<draft>/tail.yaml"] }
```

When it returns:

- **`research`:** add each outcome to `# premises:` in `tail.yaml`, with a new
  `PL` id. An outcome marked `not researched (light tier)` goes in as
  `unverified` with `—`. Then write each new `PL` id into the steps that name
  its claim.
- **Unsettled claims:** a `critical` claim still `unverified`, or a refuted
  claim the revision did not absorb, goes to the user as a decision: proceed
  on it, change the design, or drop the requirement. Once it is in the
  ledger, no later review raises it again, so this is where the user sees it.
- **`interface_requests`:** settle each one. When it changes the skeleton — a
  signature, an edge, `paths` — edit every fragment it touches and run the
  workflow again with `"only": [<the affected slugs>]`. Otherwise run the
  workflow again with `"only": [<slug>]` and
  `"guidance": { "<slug>": "<what to keep, and why>" }`.
- **`missing`:** a milestone listed under `missing` — its writer or its
  reviser returned nothing — gets one more run with `"only"`. If it fails
  again, write that milestone yourself. When every writer returns nothing,
  the workflow stops with an error instead; run it once more, then write the
  milestones yourself.

### 6. Assemble, validate, self-review

Assemble, then run `milestoned-plan-dag validate <change>/plan.yaml` and fix
every error in its fragment. Then run `kentra-rpir:self-review` with the
step 4 args, but `"mode": "full"` and:

```json
"fragments": { "head": "<draft>/head.yaml", "milestones": [{ "slug": "<slug>", "file": "<draft>/milestones/<NN>-<slug>.yaml" }] }
```

The review runs one reviewer per milestone and one for the plan as a whole,
then merges them.

When a self-review returns:

- Copy `plan.yaml` to
  `<project root>/.kentra-rpir/reviewed/<name>/plan.yaml` — the base for any
  diff review before the plan is committed.
- **`technical` findings:** apply each `fix` in its fragment (a check id like
  `P6@cli` names the milestone), assemble, re-validate, and tell the user in
  one line per fix. Record each one under a YAML comment block
  `# writerGaps:` at the end of `tail.yaml`.
- **`decision` findings:** stop and ask the user each `question` with its
  `options`. A `critical` premise left `unverified` after its spike arrives
  as a decision finding: proceed on it, change the design, or drop the
  requirement.
- **`research` outcomes:** add each to `# premises:`.
- **Too many or irrelevant `rules`** (check P8): suggest to the user which
  skills to disable in the project's or user's settings.

### 7. Present and agree

1. Show the user the plan:
   - one line per milestone: number, goal, the tests it adds;
   - the DAG, as `milestoned-plan-dag resolve` orders it, marking which
     milestones can run in parallel;
   - every item self-review flagged.

   A later edit to `plan.yaml` sizes its review:

   | The edit | Review |
   |---|---|
   | A new document (first plan) | Skeleton review, then full self-review, once each. |
   | An edit to a reviewed or agreed document that changes a requirement, goal, non-goal, premise, design decision, milestone contract, `paths`, `deliverables`, or step code | Diff review (`mode: 'diff'`). |
   | Wording, typos, formatting; applying a self-review `technical` fix verbatim | No review. Show the user the diff. Technical fixes still go to the writer-gaps list. |

   When unsure, use a diff review. For a diff review, run
   `kentra-rpir:self-review` with:

   ```json
   { "today": "<YYYY-MM-DD>", "stage": "plan", "mode": "diff", "tier": "<the spec's tier>",
     "document": "<abs change>/plan.yaml", "spec": "<abs change>/spec.md",
     "base": "<the last reviewed snapshot's absolute path, `<project root>/.kentra-rpir/reviewed/<name>/plan.yaml`, or, once plan.yaml is committed, `git log -1 --format=%H -- <document>`>",
     "decision": "<what the user decided, in plain words>",
     "projectRoot": "<project root>", "ledger": ["<abs change>/spec.md", "<abs change>/plan.yaml"],
     "constitution": "<abs path of constitution/constitution.md, or null when disabled>",
     "reviewer": { "agent": "<roles.reviewer.agent>", "model": "<roles.reviewer.model>" },
     "research": { "workflow": "<research.workflow>", "checker": "<research.checker>", "designer": "<research.designer>", "reasoner": "<research.reasoner>" },
     "researchDir": "<abs change>/research", "spikeDir": "<spikeDir>" }
   ```

   When it returns, copy the edited `plan.yaml` to
   `<project root>/.kentra-rpir/reviewed/<name>/plan.yaml` again, then show
   the user the diff and any findings. A spec amendment (below) is reviewed
   the same way, with `"stage": "spec"`.
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
   { "today": "<YYYY-MM-DD>", "stage": "spec", "mode": "diff", "tier": "<the spec's tier>",
     "document": "<abs change>/spec.md",
     "base": "<the agreed spec's commit: `git log -1 --format=%H -- <document>`>",
     "decision": "<what the user decided, in plain words>",
     "projectRoot": "<project root>", "ledger": ["<abs change>/spec.md"],
     "constitution": "<abs path of constitution/constitution.md, or null when disabled>",
     "reviewer": { "agent": "<roles.reviewer.agent>", "model": "<roles.reviewer.model>" },
     "research": { "workflow": "<research.workflow>", "checker": "<research.checker>", "designer": "<research.designer>", "reasoner": "<research.reasoner>" },
     "researchDir": "<abs change>/research", "spikeDir": "<spikeDir>" }
   ```

3. Show the user the diff and any findings.
4. When the user approves the diff, commit it with
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/commit-change.sh" <change folder> "spec: amend <title>"`.

The spec's `status` stays `agreed`: never reset it to `draft` or run a new
full review. The plan self-review (step 6) then runs once, against the
amended spec.

## Red flags

| Thought | Reality |
|---|---|
| "The implementer can look up the class names" | It gets one milestone. The names go in the milestone. |
| "`check: go test ./internal/foo/...`" | Use the repo's standard check. A narrowed check hides regressions. |
| "I'll copy the architecture skill's rules into the description" | `rules` lists the skill by name. |
| "The spec doesn't settle this; I'll decide here" | That is a decision finding. Ask the user. |
| "It validates, so it's ready" | `validate` checks grammar, not whether an implementer could start. |
| "The user picked a file layout; I'll write it into the spec" | It goes in the plan. The spec changes only when a requirement changes, as an amendment. |
| "Milestone 2 comes after 1 in the file, so it waits for 1" | Order creates no edge. A milestone waits only for what its `depends-on` lists. |
| "I'll write this milestone's steps myself, it's quicker" | Writers write milestones in parallel; you own the skeleton and coherence. |
| "I'll fix the assembled plan.yaml directly" | Before the commit, the fragments are the source. Edit the fragment, then assemble. |
