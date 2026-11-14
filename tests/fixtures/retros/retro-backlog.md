# Retro backlog

Retro findings about the plugin that are not acted on yet. Each entry names the
retro it came from, what happened and the proposed change. Delete an entry when
it ships or is rejected.

Source: `/path/to/project/rpir/changes/2026-11-02-change-d/spec-retro.md`
(kentra-rpir 0.5.2), unless an entry says otherwise.

## Open

- **F10 — Hand-back evidence.** Implementers reported what a check should do
  rather than what it did (M2 said the type checker passed while its output had
  been sent to /dev/null; M9's exit status was lost in a pipe). Proposed:
  `agents/implementer.md` requires the exit status read from `$?` and the
  parts of a chained check that ran.
- **F17 — Stray code fences.** Bulk extraction of the prompt's code blocks left
  a `` ```js `` line in a source file (M6). The same slip appeared in every
  retro so far. Proposed: `scripts/check-fences.sh` run before each merge.
- **F18 — planning-log.sh drops queued messages.** User messages queued
  mid-turn arrive as `attachment.type == "queued_command"` and are not
  recorded, so the retro accused the agent of ignoring a request the
  user had made while it was working. Proposed: record queued human prompts as
  `kind: user`.
- **F20 — Rename corner case eval.** The user, not research or review,
  found that renaming a note and creating a new one under the old name passes the tests.
  Proposed: an eval case for the spec skill rather than a rule.
- **R1–R4 — Lossy impl-report.** The report is written from the orchestrator's
  log and dropped concerns and OBSERVED notes (M3, M5, M7, M11, M12).
  Proposed: `scripts/handbacks.sh` extracts the hand-back blocks verbatim per
  milestone for implement step 5.2.
- **Filed issues not shipped.** Issues #19–#22 from the change-b retro
  are still open; two of their classes recurred in this change.

## From change-e (kentra-rpir 0.6.0)

Source: `/path/to/project/rpir/changes/2026-11-09-change-e/spec-retro.md`
(2026-11-09). That folder is gitignored in that project, so the report exists only on that
machine; read it there for evidence lines. The user chose to keep these here instead of filing
GitHub issues.

- **F12/F13: Unreviewed edits reach `planned` (high, third time).** The diff review of D3 was
  stopped at the user's "that's enough, approve it", and the plan was marked planned. A later
  self-review found D3 left the `--dry-run` guard unable to fire. The fixes from that review were not
  diff-reviewed either. Earlier: change-b F7, change-a F31. Proposed:
  `scripts/commit-change.sh` compares spec.md and plan.yaml with `.kentra-rpir/reviewed/<change>/`
  and exits 1 on a difference unless `--unreviewed '<what and why>'` is passed, which appends a
  Review-log row to the spec. Note: in that project `changesDir` is gitignored, so the commit
  script is not run there; the guard also needs to sit where `status: planned` is set.
- **F1: Milestone paths miss the readers of what they change (medium, recurring).** M2 made
  the `--format` option mandatory, which broke `test_defaults.py`; M4's exemption also lived in
  `cli.py`, its test and `settings.toml`. Both cost a NEEDS_CONTEXT round trip and an extra
  lead round. Proposed: `skills/plan/SKILL.md` contract bullet: before writing `paths`, grep the base
  for every reader of a symbol, flag, option or rule the milestone changes, and list each file or
  say in a risk why it stays green. This restores the grep rule the coarse plan rewrite dropped.
- **F3: Leads back criteria with green runs, not assertions (medium, recurring).** M2's lead passed
  a two-half `then` whose test asserted one half; M5's lead cited a run where the test task was
  cached. Proposed: `agents/lead.md` step 6: map each given/when/then clause to its assertion
  line (file:line) and the test's entry in this run's results; a cached test task is not
  evidence, rerun it.
- **F4: Fix rounds grow scope.** The orchestrator added a rename sweep and an extra
  test to M2's fix rounds; the sweep stayed incomplete. Proposed: `skills/implement/SKILL.md` step 4:
  a resume carries only what settles the hand-back; anything else goes to impl-report.md as a
  follow-up.
- **F10: Leads call claims untraceable without grepping (recurring, change-a F5).**
  The M6 lead deleted a changelog line that a grep would have found backed. Proposed: a **Facts**
  bullet in the `agents/lead.md` brief: every repo fact, including "unsupported", comes with the
  read or grep that shows it.
- **F14: Normal premises get full spikes.** A normal premise (font loading speed) ran 3 lookups
  and an experiment, then stopped being load-bearing. Proposed: `scripts/research-queue.sh add
  premise` requires a `critical:`/`normal:` prefix and records it; a `normal` spike runs no
  experiment.
- **F16: Audit findings over-scope the spec; question caps ignored.** The first spec carried every
  audit finding, the user cut several, and 8 questions were asked against a cap of 3. Proposed:
  `skills/plan/SKILL.md` step 2: carry a finding into requirements only when the goal needs it now,
  list the rest as Non-goals; a user's question cap is a session total, not a batch size.
- **F17/F18: Premise rows claim more than the report tested.** P3 read "works on all browsers" though the
  spike covered only one engine; P5 and P8 dropped their caveats. Proposed:
  `skills/plan/SKILL.md` step 4: the row says only what was tested, with `untested: <half>` for each
  part the Conclusion names as untested or inferred.
- **F6, already fixed:** blocked `sleep 60` in leads is handled by 0.6.2's `agents/lead.md`.
