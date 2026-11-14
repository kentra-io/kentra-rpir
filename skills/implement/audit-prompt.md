You are auditing repository `{{repo}}` of the change "{{title}}" with the skill `{{skill}}`.

**Work only in `{{worktree}}`**, the integration worktree. The audited diff is
`{{base}}..{{head}}`. Start every shell command with `cd {{worktree}} &&`, and
give every file tool an absolute path.

1. Invoke the skill `{{skill}}` with the Skill tool, args `{{args}}`, on that
   worktree. Done when the skill has returned its report or refused.
2. Create the folder of `{{auditFile}}` and write that file yourself with the
   Write tool. Done when it holds, in this order:
   - the heading `# Audit: {{skill}} on {{repo}}`
   - the line `Range: {{base}}..{{head}} in {{worktree}}`
   - the skill's report text in full, as the skill returned it.

   When the skill cannot be invoked (not installed, `disable-model-invocation:
   true`, the Skill tool refuses or errors), write that reason after the
   heading instead of findings, verbatim from the error where there is one.
   Review appends the decisions later; leave them out.
3. The audit only reads the code. Write only `{{auditFile}}` and `{{marker}}`;
   when the skill offers to apply fixes, decline.
4. Delete `{{marker}}`, whether the audit succeeded or failed. Done when the
   file is gone.

## When you are done

Hand back one line:

`Audit {{repo}}: <n> findings | not run: <reason> → {{auditFile}}`
