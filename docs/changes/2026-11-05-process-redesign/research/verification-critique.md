**Verdict:** most of the numbers hold up. The recommendations hold up less well. Four of Analysis A's eleven "what would be lost" lists leave things out, and A and B contradict each other on capping reviewers.

## What I checked

- **Totals.** I recomputed the premises (318 / 36 critical / 11%), the spec and plan splits (25/48 and 11/270), and the spike-outcome table (2 + 13 + 2 + 3 = 20). I also recomputed the split-review counts: 44 reviewers; b54c milestone reviewers 2.90M, 19 agents, 8 with nothing for 1.29M (44%); 99db 1.02M; 61f2 0.59M. All of these match.
- **B's arithmetic.** 117M writer saving, 20.4M checker saving, 3.5M per spike and the 0.86M batch read cost all reproduce. I could not rebuild B's 794.7M total from the 572-agent set. The manifest planning runs in `f22c/floor.json` come to 687M units, and adding the implement agents brings that to roughly 790M, so the total is plausible.
- **Plugin text at HEAD a908a85, version 0.5.4. All of it exists:**
  - `research.js:202`: the judge has to re-run every experiment.
  - `research.js:33`: runners are gone.
  - `research.js:224` and `:163`: a result below high confidence is downgraded to unverified.
  - `self-review.js:313`: `parallel()` over every milestone with no concurrency cap.
  - `self-review.js:159`: the ledger dedupe `!c.premise || c.reopen` skips any claim already in the ledger, whatever its status.
  - `self-review.js:189-207`: triage covers refuted and critical-unverified claims only, and has "When unsure, use decision".
  - `templates/kentra-rpir.yaml`: checker on sonnet.
- **Transcripts and run files I opened:** wf_61f2 result, wf_41879cb9 result, wf_81c98bbc and wf_a408 args and checks, session 50ce4279 lines 1137–1351, judges a5e4, a4a5, a50a and a2c4, and verifiers af33, a675, a314 and acf7.

## Analysis A

| Claim | Verdict | Evidence |
|---|---|---|
| §1 premises, criticality, spike counts | **Holds** | Recomputed exactly; 22 of 36 critical premises have spike evidence. |
| Triage added only 2 new findings | **Holds** | The 61f2 `banank/` prefix finding came from reviewer `P6@generator-switch (2)`, which triage only split out. |
| The judge's re-runs never differed from the designer's | **Holds, with a nit** | The DDL judge did record one difference ("e01 reported 'up to date' instead of 'added 3 packages'"). It was trivial. The 22/13 → 20/15 recount could be made by reading the output, as A says. |
| Item 1: fold triage into the main session; nothing lost if it reads the gaps | **Weakened** | The c-p "cancel does not wait" finding came from a verified claim, and the problem sits in its evidence ("D2 needs an extra mechanism, such as a lock, to satisfy R6"), not in its gaps. The rule must be "read every research outcome against the document". The lost list also leaves out the main session's context load: B's counter-evidence shows the long-lived orchestrator degrading. |
| Item 2: the consolidator becomes a script merge plus the planwide reviewer | **Weakened** | At HEAD the planwide reviewer reads contracts only, not steps. b54c's consolidator wrote P6 and P7 "no" answers for schema-ci-breaking, whose reviewer returned `checks: []`. The prompt's silent-reviewer clause only covers null results, so a script must also treat an empty result as silent. The planwide reviewer cannot answer step-level checks without reading every fragment, a cost A doesn't count. |
| Item 3: cap reviewers, saving 30–50% | **Refuted by B** | Cache reads dominate. Batches of 5 cost more than they save, and batches of 2–3 roughly break even. Neither analysis resolves the contradiction. |
| Item 8: plan diff reviews only found defects made by the Sonnet fix agents (0 would-break) | **Refuted in part** | wf_81c98bbc diffs from the same reviewed base as a408, so it covers the Sonnet edits plus the main session's own edits (session lines 1208–1316, including a YAML quoting slip it made itself). Its findings include dropping `--platform linux/amd64`, which yields an arm64 CI image holding the x86_64 buf binary, and a runbook check whose grep can never pass. Both are arguably would-break, so the "never caught anything" listing is wrong. Also, HEAD already tells the main session to apply technical fixes itself (`skills/plan/SKILL.md:259`). `plan-review-fixes` was an ad-hoc main-session workflow (`…/workflows/scripts/plan-review-fixes-wf_ce2a17b9-772.js`), not a plugin step, so item 8 is about following the skill, not a plugin change. |
| Item 9: verifier depth by risk saves ≈1.0M (p3 M1–M13 called "byte-identical copies") | **Weakened** | M1–M13 were not all copies: M9 rewrote `check-message-ids.mjs` (its verifier mutation-tested the rewrite), and M10 improvised a workaround. Under A's own rule, M2, M8, M9 and M10 (DONE_WITH_CONCERNS) and M4 (skipped-check claim) keep the full verifier. The remaining 8 cost ≈0.69M, not 1.0M. |
| Item 10: the orchestrator checks small fixes after a FAIL | **Weakened** | The M25 r3 R22 gap was found by the r3 verifier after the orchestrator's r2 fix, and the orchestrator's own M25 grep was wrong twice. Both belong in the lost list. |
| Item 6: writers run short-command premises, which would catch PL7 | **Weakened** | PL7 passes on the host. Only `npm ci` inside the node:22 image fails, so the catch depends on the writer running it in the image. |
| Item 4: the judge re-runs only the decisive experiment; nothing lost | **Holds now, at risk with B item 2** | If the designer moves to sonnet (B item 2), the re-run becomes the safeguard against misreported results. The old c-p E5 runner reported exit 0 when its own output showed a kill. |
| §4 misses table, item 7 (ledger dedupe), item 11 | **Hold** | Matches the code and the retros. |

## Analysis B

| Claim | Verdict | Evidence |
|---|---|---|
| Role and model table, writer saving | **Holds** | Reproduces apart from the overall total. |
| Batching analysis; `maxParallel` as a separate knob | **Holds** | Better grounded than A's item 3. It answers the user's "max 4 parallel" with no change in tokens. |
| Sonnet fix agents cost more downstream (≈0.6M) | **Weakened** | Same attribution problem as A item 8: 81c9 also reviewed the main session's edits, and the fix agents are not a plugin role. |
| Review → triage by continuing the reviewer with SendMessage | **Unverified** | No HEAD workflow continues an agent, and I didn't establish that the workflow script API can. |
| Verifier yield follows how much judgement the plan left | **Holds, confounded** | M22–M27 were written by the orchestrator at review, outside the pipeline, and many of the 31 findings there are cosmetic. |

## Corrected numbers

- Implementer agents: **45**, not A's ≈56 (c-p 5 + p2a 9 + p3 31).
- Skeleton-review triage findings: **18**, not 16 (2 + 2 + 4 + 10).
- Split milestone reviewers that found nothing: 13 of the 31 known, plus 1 of 13 in pjs, so **14 of 44 (32%)**, not "at least 40%".
- Would-break findings labelled in split milestone reviews: **4** (all p2a), with p3 severities unknown, not ≈6. That puts the cost at ≈1.6M per would-break finding.
- A item 9 saving: **≈0.69M**, not 1.0M.

## What both analyses missed

1. **Plugin cost vs main-session cost.** Neither separates what the plugin prescribes from what the main session launched on its own: `plan-review-fixes`, the killed 9-agent pin-freshness run (411k), and the pre-spec design workflows that F22 put at about half of 43.75M. This split is what the user's planned with/without Ultracode test needs.
2. **Harness floor is paid every turn.** It is re-read as cache on every turn, not paid once per agent. Merging agents saves only the first write, but shrinking the harness saves on every turn of every agent. That should feed the harness-bloat subagent.
3. **Triage and consolidator models.** At HEAD they inherit `args.reviewer.model` (`self-review.js:52`), so they can't be put on a cheaper model without a new config role.
4. **Conflicting recommendations.** A item 4 conflicts with B item 2, and A item 3 conflicts with B §2. They need one reconciled recommendation.
5. **Haiku vs sonnet checkers.** The user's CLAUDE.md asks for haiku collectors in research.js-shaped workflows, but `kentra-rpir:research` runs sonnet checkers. B's "measure first" advice should be put to the user as a conflict with their rule, not decided implicitly.