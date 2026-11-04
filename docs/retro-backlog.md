# Retro backlog

Retro findings about the plugin that are not acted on yet. Each entry names the
retro it came from, what happened and the proposed change. Delete an entry when
it ships or is rejected.

Source: `schema-management-design/docs/changes/2026-11-02-proto3-schema-libraries/spec-retro.md`
(kentra-rpir 0.5.2), unless an entry says otherwise.

## Open

- **F9 — Verifier red check.** Implementers skipped step order and red runs
  (M2, M7, M8, M17), even after the orchestrator added "do every step in order"
  to the dispatch wrapper. Proposed: the verifier runs the milestone's new tests
  at the base and expects them to fail. Open question first: whether red runs
  are wanted at all (see "Red-green" below). Issue #22 covers the implementer
  side.
- **F10 — Hand-back evidence.** Implementers reported what a check should do
  rather than what it did (M4 claimed buf was skipped; M17's exit status was
  redirected away). Proposed: `agents/implementer.md` requires the exit status
  read from `$?` and the parts of a chained check that ran.
- **F13 — Parallel Docker checks.** Four to seven milestones ran Docker checks
  on one host at once; M7's verifier check took about 15 minutes, past the
  600 s timeout, and agents spent turns polling. Proposed: an
  `implement.maxParallel` config key, honoured in implement step 2.
- **F17 — Stray code fences.** Bulk extraction of the prompt's code blocks left
  a `` ```java `` line in a source file (M15). The same slip appeared in every
  retro so far. Proposed: `scripts/check-fences.sh` run before each merge.
- **F18 — planning-log.sh drops queued messages.** User messages queued
  mid-turn arrive as `attachment.type == "queued_command"` and are not
  recorded, so the retro accused the agent of reversing a tier decision the
  user had asked it to reverse. Proposed: record queued human prompts as
  `kind: user`.
- **F19 — Pin policy at spec time.** The spec carried exact pins from spikes;
  the policy question (newest compatible or known-good) then came up at three
  stages. Proposed: the spec skill asks what a pin means when the change pins
  versions.
- **F20 — Lifecycle corner case eval.** The user, not research or review,
  found that deleting a schema and recreating one at the same path passes CI.
  Proposed: an eval case for the spec skill rather than a rule.
- **R1–R4 — Lossy impl-report.** The report is written from the orchestrator's
  log and dropped concerns and OBSERVED notes (M9, M12, M13, M17, M18).
  Proposed: `scripts/handbacks.sh` extracts the hand-back blocks verbatim per
  milestone for implement step 5.2.
- **Filed issues not shipped.** Issues #19–#22 from the proto-to-avro retro
  are still open; three of their classes recurred in this change (F3/F6, F9,
  F1/F2).

## Red-green

kentra-rpir itself does not ask for red runs. They come from the
milestoned-plan-dag `plan-author` skill ("write the failing test, run it and
see it fail, write the code, run it and see it pass, commit"), which plan
writers follow, and from guidance an orchestrator added to its dispatch
wrapper. The user rejected test-first ordering and mutation-named criteria in
plan writers (proposed as F2 of this retro). Decide whether plans keep red
runs before reopening F9 or issue #22.
