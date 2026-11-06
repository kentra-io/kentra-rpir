# Implementation report — <title>

- **Change:** <changesDir>/<folder> · **Tier:** small · standard
- **Branch:** rpir/<slug> · **Pull request:** <url or "none">
- **Orchestrator session:** <session id> · **Models:** orchestrator <model>, lead <model>, implementer <model>, verifier <model>
- **Plugin:** kentra-rpir <version> · **Claude Code:** <version> · **maxParallel:** <n>

## Milestones

| # | Slug | Outcome | Lead rounds | Implementers | Verify rounds (fresh / resumed) | Merge commit |
|---|---|---|---|---|---|---|
| 1 | <slug> | merged · blocked · dropped | <n> | <n> | <n> (<n> / <n>) | <sha> |

Lead rounds: the first dispatch plus each resume with findings, guidance or
an answer. Implementers: the count from the lead's IMPLEMENTERS lines.

### M<n> <slug>

- **Verifier FAILs:** <round: findings, one line each — or "none">
- **Pending criteria (human-checked):** <criterion: the user's answer — or "none">
- **Concerns raised (DONE_WITH_CONCERNS):** <and how each was settled — or "none">
- **Lead decisions:** <the DECISIONS lines of the lead's hand-backs — or "none">
- **Agents replaced:** <a lead or verifier replaced after a resume or compaction, and why — or "none">
- **Observed, not fixed:** <what agents noticed outside the milestone's scope — or "none">

## Plan adjustments

| Milestone | Change | Reason | Commit |
|---|---|---|---|

## Decisions the user made

| Question | Decision |
|---|---|

## Merge conflicts resolved

| Milestones | Files | Resolution |
|---|---|---|
