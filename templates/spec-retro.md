# Retro — <title>

- **Change:** <folder> · **Tier:** small · standard · **Commits:** <base>..<head>
- **Models:** <role: model, for every role used, in the change and in this retro>
- **Versions:** kentra-rpir <version> · Claude Code <version> · skills <name@version, …>
- **Sessions read:** <session id: stage, for every session>

## Outcome

<Two or three sentences, from the verifier results, not from impl-report.md.>

## Planning cost

| Session | Part | Role | Agents | Fresh tokens | Time |
|---|---|---|---|---|---|
| <sid> | before the plan skill | main session | — | <n> | <m.m> min wall |
| <sid> | before the plan skill | <role> | <n> | <n> | <m.m> min |
| <sid> | plan stage | main session | — | <n> | <m.m> min wall |
| <sid> | plan stage | <role: reviewer · full, reviewer · diff, lookup · fact job, spike, researcher, lookup · nested, advisor, workflow, other> | <n> | <n> | <m.m> min |

Plan skill loaded at <ref>; work before it is not planning cost. A workflow row's Fresh tokens are followed by the Workflow tool's own count in parentheses. Question rounds: <n> · Status resets: <n> · Reviews: full <n>, diff <n> · Research jobs: fact <n>, premise <n>, survey <n>

## Research

| Report | Kind | Verdict · confidence | Rests on | Held up | Evidence |
|---|---|---|---|---|---|
| <research/slug.md> | fact · premise · survey | verified · refuted · unverified · <high · medium · low> | <source kinds from its Conclusion> | held · contradicted · not tested | <ref where the implementation bore it out or broke it> |

<"No research jobs ran." when the table is empty.>

## Implementation cost

| Milestone | Lead rounds | Implementers | Verify rounds (fresh / resumed) | Waits | Fresh tokens: lead / implementers / verifiers | Wall |
|---|---|---|---|---|---|---|
| M<n> <slug> | <n> | <n> | <n> (<n> / <n>) | <n> | <n> / <n> / <n> | <m.m> min |

Orchestrator: <n> fresh tokens · <m> min wall. Fresh tokens = input + cache writes + output, each message counted once, in both cost tables. Time in the Planning cost table sums each agent's own span, so agents that overlap count twice. — means not measured.

## Self-report reconciliation

| Claim in impl-report.md | Verdict | Evidence |
|---|---|---|
| <claim> | contradicted · unsupported | <transcript ref or commit> |

<n> other claims confirmed. · All <n> claims confirmed.

## Timeline

### Planning

| Step | Ref | Event |
|---|---|---|
| <n> | <session>:<line> | <what happened> **(decisive)** |

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
