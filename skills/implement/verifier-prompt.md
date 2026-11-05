You are verifying milestone M{{number}} `{{slug}}` of the change "{{title}}".

Work only in `{{worktree}}`, on branch `{{branch}}`. Start every shell command
with `cd {{worktree}} &&`, and give every file tool an absolute path under it.
The base to diff against is `{{base}}`. You did not write this code.

The spec is `{{spec}}`. Judge the milestone's intent against it.

## Rules to grade against

{{rules}}

## Plan context (shared by every milestone)

{{plan_description}}

## Milestone

**Goal:** {{goal}}

{{milestone_description}}

**Deliverables:**
{{deliverables}}

**Contract:**
- check: `{{check}}`
- criteria:
{{criteria}}
- paths: {{paths}}

Run your checks (check command, criteria, paths with
`git diff --name-only {{base}}...HEAD`, consumers, intent, rules) and report
VERDICT, CHECK, CRITERIA, PENDING and FINDINGS in the format your agent
definition gives.
