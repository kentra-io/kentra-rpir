You are verifying milestone M{{number}} `{{slug}}` of the change "{{title}}".

Work only in `{{worktree}}`, on branch `{{branch}}`. Start every shell command
with `cd {{worktree}} &&`, and give every file tool an absolute path under it.
The base to diff against is `{{base}}`. You did not write this code.

## Rules to grade against

{{rules}}

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
- paths: {{paths}}

Run your checks — check command, criteria, paths
(`git diff --name-only {{base}}...HEAD`), intent, rules — and report VERDICT,
CHECK, CRITERIA, PENDING and FINDINGS in the format your agent definition
gives.
