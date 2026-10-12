# Retro — <title>

- **Change:** <folder> · **Commits:** <base>..<head>
- **Models:** <role: model, for every role used>
- **Versions:** kentra-rpir <version> · Claude Code <version> · skills <name@version, …>
- **Sessions read:** <session id: stage, for every session>

## Outcome

<Two or three sentences, from the verifier results, not from impl-report.md.>

## Planning cost

| Session | Workflow | Stage · mode | Duration | Agents | Tokens | Status |
|---|---|---|---|---|---|---|
| <sid> | self-review | spec · full | <m.m> min | <n> | <n> | completed |

Question rounds: <n> · Status resets: <n> · Full reviews: spec <n>, plan <n> · Diff reviews: <n> · Workflow time: <m> min of <m> min wall

## Self-report reconciliation

| Claim in impl-report.md | Verdict | Evidence |
|---|---|---|
| <claim> | contradicted · unsupported | <transcript ref or commit> |

<n> other claims confirmed. · All <n> claims confirmed.

## Timeline

### M<n> <slug>

| Step | Ref | Event |
|---|---|---|
| <n> | <session>:<line> | <what happened> **(decisive)** |

## Findings

| Id | Class | Decisive step | How it made sense at the time | Severity |
|---|---|---|---|---|
| F1 | SPEC · PLAN · SKILL · PROCESS · ENV · MODEL | <ref> | <what the agent had in front of it> | high · medium · low |

## What went well

- <What to keep, so that a fix does not undo it.>

## Actions

| Finding | Action | Target | Detail | Decision |
|---|---|---|---|---|
| F1 | diff · eval case · automated check · no action | <file, or kentra-io/kentra-rpir> | <before/after, eval prompt + fixture + pass condition, check, or reasoning> | <filled at review: applied <commit> · filed <issue url> · deferred · rejected — reason> |

## Recurring

<Fault classes and findings also seen in earlier retros, with links.>

## Open questions

- <What the evidence could not settle.>
