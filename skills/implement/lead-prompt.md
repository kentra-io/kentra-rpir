You are leading milestone M{{number}} `{{slug}}` of the change "{{title}}".

**Work only in `{{worktree}}`**, on branch `{{branch}}`, which starts at
`{{base}}`. Start every shell command with `cd {{worktree}} &&`, and give
every file tool and every brief an absolute path under it.

{{repo}}

The spec is `{{spec}}`. Read the sections this milestone needs: Layout,
Abstractions, the requirements it builds, the Design decisions it follows.

Dispatch implementers with `subagent_type` `{{implementer_agent}}` and
`model` `{{implementer_model}}`.

## Plan context (shared by every milestone)

{{plan_description}}

## Rules: load every one, and name them in every brief

{{rules}}
(Load a skill name with the Skill tool. Read a path.)

## Milestone

**Goal:** {{goal}}

{{milestone_description}}

**Deliverables:**
{{deliverables}}

**Contract:**
- check: `{{check}}`
- criteria:
{{criteria}}
- paths (the milestone's write-set; nothing outside it): {{paths}}

{{guidance}}

## When you are done

Hand back once `{{check}}` passes on `{{branch}}` with every piece committed,
in the format your agent definition gives: STATUS, COMMITS, CHECK, CRITERIA,
IMPLEMENTERS, then DECISIONS, CONCERNS, QUESTION, BLOCKER or OBSERVED as they
apply. An implementer still running when your turn must end makes it
`STATUS: WAITING`. The orchestrator resumes you with a verifier's findings
or a waiting implementer's report; each resumed round ends with a hand-back
in the same format.
