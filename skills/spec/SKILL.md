---
name: spec
description: Turns an idea, bug or chore into an agreed spec.md for kentra-rpir — interactive questions in batches, background research checking the premises that matter, an independent self-review. Use when starting a change, or when the user wants to write or revise a spec.
---

# spec — stage 1 of kentra-rpir

Turn the user's idea into `spec.md` in a new change folder, and keep going until
the user says the spec is right. This stage is a conversation. Your job is to
find out what the user means, check what the change assumes, and write it
down.

**Where things are:**
- the config is `.kentra-rpir.yaml` at the project root (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/kentra-rpir.yaml`);
- the spec template is `${CLAUDE_PLUGIN_ROOT}/templates/spec.md`;
- the full process is `${CLAUDE_PLUGIN_ROOT}/docs/process.md`.

## Checklist

Make a task for each item and complete them in order.

1. Set up the project and the change folder
2. Explore the context
3. Ask, and record premises as they surface
4. Research premises in the background
5. Propose approaches for the open design choices
6. Write `spec.md`
7. Self-review
8. Agree, commit

### 1. Set up

- **First use in this project** (no `.kentra-rpir.yaml`): ask these four
  questions in one message, then write the file from the template with the
  answers.
  - Where should change folders live? (default `docs/changes`)
  - Which issue tracker: none, GitHub or Jira?
  - Should the spec, plan and self-review stages read
    `constitution/constitution.md`? Recommend yes when that file exists.
  - Which process tier should changes default to? `full` for code that
    ships (complete research and plans); `light` for a proof of concept, a
    demo or a sandbox (research only what could change the plan's shape).
- **Every run:** make sure `.gitignore` holds `.kentra-rpir/`, the
  `worktreesDir` (default `.worktrees/`) and `<changesDir>/*/research/spikes/`,
  adding whichever is missing. Spikes live in the change folder and never
  reach git.
- **Change folder:** `<changesDir>/<today>-<slug>/`. The slug is 2–4 kebab-case
  words. Copy the spec template into it as `spec.md`, with `status: draft`
  and `tier` set from `.kentra-rpir.yaml`'s `tier` (default `full`).
- **Register this session:**
  `mkdir -p .kentra-rpir && echo "${CLAUDE_SESSION_ID} <change folder> spec" >> .kentra-rpir/sessions.map`
- **Tracker:**
  - `github`: link the issue the user names, or create one with
    `gh issue create`.
  - `jira`: link the key the user gives.

  Put the link in the frontmatter `issue:`.

### 2. Explore the context

Read what this change touches: the README, the constitution when enabled, the
code in the area, and `git log --oneline -20`. Read enough to ask good
questions, and no more.

### 3. Ask

- Ask up to `spec.questionBatch` questions in one message when they do not
  depend on each other's answers. Ask one at a time when an answer changes what
  you ask next.
- Prefer multiple choice, and put your recommendation first.
- Cover the problem, the goals, what is out of scope, and how the user will
  know it works.
- **Premises.** A premise is anything the change assumes is true: how an API
  behaves, what a library version supports, what users do. Record one only
  when the spec or plan would change if it were wrong. Add each to the spec's
  Premises table as `unverified` the moment it surfaces, with an
  `importance`: `critical` when, if it is wrong, the shape changes — a
  requirement, a design decision or the milestones; `normal` when it would be
  fixed inside one milestone.
- **Tier.** The spec's `tier` comes from the config. When what you learn
  about the change fits the other tier better, recommend it with a one-line
  reason and let the user choose (`light` fits a throwaway, a proof of
  concept, a demo or a sandbox; `full` fits code that ships to users,
  handles data or security, or that other code will build on), then write
  their choice into the spec's `tier`.

### 4. Research in the background

Research every premise that has no Evidence yet (`—`), at the spec's tier:
`full` researches every such premise; `light` researches only the `critical`
ones and leaves the `normal` ones `unverified`. Skip a premise once it has
Evidence (`docs: …` or `spike: …`): the spec stage never re-researches one,
whatever its status, unless an edit re-opens it.

Start the research workflow (`research.workflow`) for each premise still
needing research, about an external system, with its `importance` carried
onto the topic. Run it in the background, with args:

```json
{ "today": "<YYYY-MM-DD>", "prefix": "spec", "topics": [{ "name": "<the premise as a claim>", "focus": "<why the change depends on it>", "importance": "<critical|normal>" }],
  "question": "Is this premise true for <change title>?", "outDir": "<abs change folder>/research",
  "checker": "<research.checker>", "designer": "<research.designer>", "reasoner": "<research.reasoner>",
  "spikeDir": "<abs change folder>/research/spikes" }
```

Create `spikeDir` with `mkdir -p` first; step 1 made sure it is gitignored.

Keep talking while it runs. When a report arrives, set the premise's status
(`verified`, `refuted` or `unverified`) and Evidence from its `evidence`
(`docs: …` or `spike: research/spikes/<slug>/`). A **refuted** premise goes to
the user immediately: it usually changes the design. A `normal` premise the
docs could not settle stays `unverified`; show it to the user, who can ask
for a spike (a re-run of research on that topic with `spike: true`).

If you spike something yourself, outside the research workflow:

> Spikes must be readable by the user approving them. Write each spike as a
> file with the Write tool, then run it with one short command such as `sh
> <file>`. Never use heredocs, inline `python3 -c`/`sh -c`/`node -e` programs,
> chained or piped commands, `&`, command substitution or redirects, and
> never run anything that reads stdin. Write and run experiments only under
> `<spikeDir>/<slug>/`. Never run `git init` there or anywhere else.

Name the folder `spec-<slug>` and write `result.md` beside the spike files
in it.

### 5. Propose approaches

For each design choice the conversation leaves open, give 2–3 options with
their trade-offs and your recommendation. Record the choice and the options not
taken in the Design section.

### 6. Write `spec.md`

Fill the template. The sections scale with the change: a bug's spec can be a
few lines. Requirements are plain, numbered, testable statements. Show the user
the spec section by section, and adjust as they react.

### 7. Self-review

Write the planning log so far, so the reviewer reads the conversation as it
is, not the raw transcript:

```
mkdir -p "<project root>/.kentra-rpir/reviewed/<change folder name>"
sh "${CLAUDE_PLUGIN_ROOT}/scripts/planning-log.sh" --project "$(git rev-parse --show-toplevel)" --change "<change folder>" --out "<project root>/.kentra-rpir/reviewed/<change folder name>/planning-log.jsonl"
```

Run the `kentra-rpir:self-review` workflow with:

```json
{ "today": "<YYYY-MM-DD>", "stage": "spec", "tier": "<the spec's tier>", "mode": "full", "document": "<abs path>/spec.md", "projectRoot": "<project root>",
  "transcripts": ["<project root>/.kentra-rpir/reviewed/<change folder name>/planning-log.jsonl"],
  "ledger": ["<abs path>/spec.md"],
  "constitution": "<abs path of constitution/constitution.md, or null when disabled>",
  "reviewer": { "agent": "<roles.reviewer.agent>", "model": "<roles.reviewer.model>" },
  "research": { "workflow": "<research.workflow>", "checker": "<research.checker>", "designer": "<research.designer>", "reasoner": "<research.reasoner>" },
  "researchDir": "<abs change folder>/research",
  "spikeDir": "<abs change folder>/research/spikes" }
```

When it returns:

- Copy `spec.md` to
  `<project root>/.kentra-rpir/reviewed/<change folder name>/spec.md` (an
  absolute path) — the base for any diff review before the spec is
  committed.
- **`technical` findings:** apply each `fix`. Tell the user in one line per
  fix, and add each as a line in the `<!-- writer-gaps -->` comment at the end
  of `spec.md`.
- **`decision` findings:** stop. Ask the user each `question` with its
  `options`, then edit the spec to match their answers. A `critical` premise
  left `unverified` after its spike arrives as a decision finding: proceed on
  it, change the design, or drop the requirement.
- **`research` outcomes:** fill each premise's Importance, Status and
  Evidence in the Premises table. An outcome marked `not researched (light
  tier)` goes into the table as `unverified` with Evidence `—`.

### 7a. Edits after review

Once the spec has had its first self-review, size each further edit:

| The edit | Review |
|---|---|
| A new document (first spec) | Full self-review, once (`mode: 'full'`). |
| An edit to a reviewed or agreed document that changes a requirement, goal, non-goal, premise, design decision, milestone contract, `paths`, `deliverables`, or step code | Diff review (`mode: 'diff'`). |
| Wording, typos, formatting; applying a self-review `technical` fix verbatim | No review. Show the user the diff. Technical fixes still go to the writer-gaps list. |

When unsure, use a diff review.

For a diff review, run `kentra-rpir:self-review` with:

```json
{ "today": "<YYYY-MM-DD>", "stage": "spec", "tier": "<the spec's tier>", "mode": "diff",
  "document": "<abs path>/spec.md",
  "base": "<the last reviewed snapshot's absolute path, `<project root>/.kentra-rpir/reviewed/<change folder name>/spec.md`, or, once spec.md is committed, `git log -1 --format=%H -- <document>`>",
  "decision": "<what the user decided, in plain words>",
  "projectRoot": "<project root>", "ledger": ["<abs path>/spec.md"],
  "constitution": "<abs path of constitution/constitution.md, or null when disabled>",
  "reviewer": { "agent": "<roles.reviewer.agent>", "model": "<roles.reviewer.model>" },
  "research": { "workflow": "<research.workflow>", "checker": "<research.checker>", "designer": "<research.designer>", "reasoner": "<research.reasoner>" },
  "researchDir": "<abs change folder>/research",
  "spikeDir": "<abs change folder>/research/spikes" }
```

When it returns, copy the edited `spec.md` to
`<project root>/.kentra-rpir/reviewed/<change folder name>/spec.md` again,
then show the user the diff and any findings.

### 8. Agree

When the user says the spec is right:

1. Make sure Open questions is empty.
2. Set `status: agreed`.
3. Commit the change folder with
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/commit-change.sh" <change folder> "spec: <title>" [.kentra-rpir.yaml .gitignore]`,
   passing `.kentra-rpir.yaml` and `.gitignore` as extra paths if step 1
   created or changed them.

Once the spec is `agreed`, an edit that changes a requirement, goal,
non-goal, or a spec Design decision is a **spec amendment**: make the
smallest edit that carries the change, run a diff review (step 7a), show the
user the diff, and on approval commit it the same way. The status stays
`agreed`; never reset it to `draft` or run a new full review.

The stage is done when the spec is committed with `status: agreed`. Then end
with one line:

`Spec agreed: <change folder>/spec.md (<short sha>). Next: /kentra-rpir:plan, ideally in a fresh session.`

## Red flags

| Thought | Reality |
|---|---|
| "This premise is obviously true" | Then research confirms it quickly. Start it whenever the tier researches it. |
| "I'll ask all twelve questions at once" | Up to `spec.questionBatch`, and only questions that do not depend on each other. |
| "The user seems happy, I'll mark it agreed" | Only the user's explicit agreement sets `status: agreed`. |
| "Self-review flagged a decision, but I know the answer" | A decision finding goes to the user. |
| "I'll re-check this premise to be safe" | It's in the ledger; it's re-opened only when an edit changes it. |
