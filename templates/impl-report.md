# Implementation report — <title>

- **Change:** rpir/changes/<folder> · **Tier:** small · standard
- **Branch:** rpir/<slug> (one per repository: `<repo>: rpir/<slug>`) · **Pull request:** <url or "none">
- **Orchestrator session:** <session id> · **Models:** orchestrator <model>, lead <model>, implementer <model>, verifier <model>
- **Plugin:** kentra-rpir <version> · **Claude Code:** <version> · **maxParallel:** <n>

## Repositories

One row per repository; a single-repository change has one row. Copy them from
the state file's `repos`: review reads them here after the state file is gone.

| Repository (`repo`) | Path (absolute) | Integration worktree | Branch | Base (sha the branch was cut from) |
|---|---|---|---|---|
| <repo, or `.`> | <abs> | <abs> | <branchPrefix><slug> | <sha> |

## Merge order

Only for a plan that spans several repositories; omit it for one. List the
repositories in the order their pull requests merge: a repository whose
milestones others depend on merges first; repositories with dependency edges
both ways merge together, named as such.

## Milestones

One table per repository under a `### <repo>` heading; a single-repository
report keeps one table and no heading.

### <repo>

| # | Slug | Outcome | Lead rounds | Implementers | Verify rounds (fresh / resumed) | Merge commit |
|---|---|---|---|---|---|---|
| 1 | <slug> | merged · blocked · dropped | <n> | <n> | <n> (<n> / <n>) | <sha> |

Lead rounds: the first dispatch plus each resume with findings, guidance or
an answer. Implementers: the count from the lead's IMPLEMENTERS lines.

#### M<n> <slug>

- **Verifier FAILs:** <round: findings, one line each — or "none">
- **Pending criteria (human-checked):** <criterion: the user's answer — or "none">
- **Concerns raised (DONE_WITH_CONCERNS):** <the lead's final CONCERNS line, verbatim, and how each was settled — or "none">
- **Lead decisions:** <the DECISIONS lines of the lead's hand-backs — or "none">
- **Agents replaced:** <a lead or verifier replaced after a resume or compaction, and why — or "none">
- **Observed, not fixed:** <the lead's final OBSERVED line, verbatim — or "none">

## Plan adjustments

| Milestone | Change | Reason | Commit |
|---|---|---|---|

In untracked mode there are no commits: record each adjustment as a diff
against `<change>/.local/reviewed/plan.yaml`.

## Decisions the user made

| Question | Decision |
|---|---|

## Merge conflicts resolved

| Milestones | Files | Resolution |
|---|---|---|
