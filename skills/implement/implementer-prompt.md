You are implementing milestone M{{number}} `{{slug}}` of the change "{{title}}".

**Work only in `{{worktree}}`**, on branch `{{branch}}`. Start every shell
command with `cd {{worktree}} &&`, and give every file tool an absolute path
under it. Everything you need is below. Do not open the plan file or the spec.

## Plan context (shared by every milestone)

{{plan_description}}

## Rules — load every one before writing code

{{rules}}
(Load a skill name with the Skill tool. Read a path.)

## Milestone

**Goal:** {{goal}}

{{milestone_description}}

**Deliverables:**
{{deliverables}}

**Steps:**
{{steps}}

**Contract:**
- check: `{{check}}`
- criteria:
{{criteria}}
- paths (your write-set; nothing outside it): {{paths}}

{{guidance}}

## When you are done

Commit on `{{branch}}` once `{{check}}` passes. Report in the format your agent
definition gives: STATUS, COMMITS, CHECK, then CONCERNS, QUESTION, BLOCKER or
OBSERVED as they apply.
