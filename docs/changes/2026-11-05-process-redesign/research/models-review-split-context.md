# Model fit, split plan review, and fresh versus shared contexts in kentra-rpir

**Data and method.** I recomputed costs from the transcripts of every agent listed in the manifest: all planning runs of the four changes plus the implement subagents, 572 agents in total. Not covered: the spec-retro run, side workflows such as `c360-*`, and the main orchestrator sessions.

- **Tokens** are each agent's final context size, summed over agents.
- **Cost** is in units. Each turn's usage is weighted (input 1, cache write 1.25, cache read 0.1, output 5), then multiplied by the model price ratio (haiku 1, sonnet 3, opus 5).
- **Total:** 794.7M units. That is about $795 if haiku input costs $1 per million tokens.
- **By model:** opus 89.6%, sonnet 9.7%, haiku 0.6%.

## 1. Model fit per role

| Role | Model | Agents | Tokens | Units (share) | Kind of work | Fit |
|---|---|---|---|---|---|---|
| Plan writer | opus | 63 | 10.97M | 293.3M (36.9%) | Writes the full code of each step from a settled skeleton, plus some design calls | **Too costly for most of it.** See below |
| Milestone reviewer (split review) | opus | 44 | 6.68M | 118.0M (14.8%) | Judgement | Correct |
| Ad-hoc research reasoner | opus | 17 | 2.36M | 69.3M (8.7%) | Judgement | Correct |
| Verifier | opus | 47 | 4.12M | 66.3M (8.3%) | Mostly re-running checks, some intent judgement | Mostly correct; see the tiering option |
| Spike designer | opus | 21 | 2.27M | 46.8M (5.9%) | Designing the experiment is judgement; writing and running it is sonnet-grade | Partly too costly |
| Implementer | sonnet | 45 | 3.76M | 36.9M (4.6%) | Carries out a settled spec | Correct |
| Research checker | sonnet | 145 | 6.64M | 30.6M (3.8%) | Docs lookup plus a verdict and confidence that decide escalation | Lookup work with a judgement output; see below |
| Spike judge | opus | 21 | 1.85M | 26.3M (3.3%) | Mandated to re-run every experiment (mechanical), then give a verdict (judgement) | Too costly for the re-run part |
| Diff, full, skeleton and plan-wide reviewers | opus | 31 | 3.26M | 49.9M (6.3%) | Judgement | Correct |
| Plan reviser | opus | 15 | 1.31M | 18.5M (2.3%) | Judgement plus editing | Correct |
| Triage | opus | 29 | 1.35M | 11.5M (1.4%) | Classifies the reviewer's own "no" answers | Judgement, but redundant (section 3) |
| Consolidator | opus | 4 | 0.50M | 7.1M (0.9%) | Merges reviews and settles conflicts | Correct, but small |
| Plan-review fixes | sonnet | 9 | 0.73M | 5.8M | Edits that require reading user decisions | **Cheaper model on judgement** |
| Ad-hoc research collector | haiku | 34 | 1.98M | 4.3M | Lookup | Correct; follows your rule |
| Spike runner (old) | sonnet | 21 | 0.76M | small | Ran one script, 2 tool calls | Haiku-grade; removed in 0.5.x |
| Report writer (old) | sonnet | 15 | 0.54M | small | Saved text the script had already built | Needed no model; removed in 0.5.x |

Configuration source: `templates/kentra-rpir.yaml` sets `checker: sonnet`, `designer: opus`, `reasoner: opus`, and the plan writer, reviewer and verifier on opus. Your rule (haiku collectors, opus reasoner) holds only for the ad-hoc `research` skill. `kentra-rpir:research` has no haiku tier.

### Where a costlier model did work a cheaper one could do

**1. Plan writers (the biggest lever).** Opus writes every line of code into the plan. The sonnet implementer then copies it.

- proto3 M7: "All 24 files are byte-identical to the plan".
- proto3 M8: byte-identical.
- proto-to-avro M3: "The SQL and the test were copied verbatim from the dispatch prompt."
- So 36.9% of all cost goes to authoring code at opus price, and 4.6% goes to transcribing it.
- Moving writers to sonnet saves 117M units gross (14.8%). If an opus advisor handles about 15% of writer cost for the real design calls, the net saving is about 90M units (around 11%).
- **Risk.** Writers do make judgement calls:
  - 27 interface requests in `wf_41f52ace`;
  - the avro-units writer found an ownership gap that would have broken the docs grep;
  - the generator-switch writer caught a grep criterion that could never pass;
  - the sql-tables writer chose nullable enums (the decision PL12 that was later refuted).
- Those calls are what the advisor would handle.

**2. Spike designer to sonnet, judge stays opus.** Saves 18.7M units (2.4%). Designer slips such as EventCatalog E1 (missing package), DDL e02 (ESM `require`) and the e06 miscount were all caught by the judge, so the judge already backstops the designer.

**3. Spike judge's mandatory re-run.**

- proto-to-avro judges re-ran 5 of 5, 10 of 10 and 5 of 5 experiments, added 0 new experiments and changed no verdict.
- proto3 judges re-ran 10 of 10, 9 of 9 and 9 of 9: "matched the designer's outputs line for line".
- In protobuf-java-schemas, 21–83% of judge Bash calls were exact repeats of designer commands.
- The one useful correction (e06 counts 22/13 changed to 20/15) came from reading the output, not from re-running.
- A judge that reads the outputs and re-runs only where they disagree would save about half of 26.3M, roughly 13M units.

**4. Verifiers on verbatim-copy milestones.** In proto3 M1–M13, where the plan gave the exact code, 13 opus verifiers found nothing. In M14–M27, which were partly added at review with intent-level plans, there were 7 FAIL verdicts and 31 findings. Verification yield follows how much judgement the plan left to the implementer. Option: a sonnet verifier (byte-compare and re-run the check) when steps carry exact code, and opus when they carry outcomes. This saves up to about 26M units (3.3%), but you lose catches like M7's stray fence. The fence was visible to a byte-compare, so sonnet would likely have caught it too.

### Where a cheaper model was used for judgement

- **Plan-review fixes on sonnet.** Retro F21: "sonnet fix agents went past the user's decisions". That triggered two opus diff reviews plus triage (`wf_a408f453` and `wf_81c98bbc`, about 0.6M tokens), each finding "changes that no decision covers". The 5.8M units saved by using sonnet cost more downstream.
- **Research checker verdicts gate escalation.** Sonnet checkers often say "verified, medium":
  - 7 of 18 continuous-producers topics, which the script then downgraded to unverified;
  - 3 of 4 proto-to-avro spec topics escalated, and all came back verified (high).
  - Moving checkers to haiku saves 20.4M units gross (141k per checker), but one extra spike costs about 3.5M units (designer plus judge average). About 6 extra escalations across 145 topics would cancel the saving. **Do not move checkers to haiku without measuring the escalation rate first.**
- **Implementers making unplanned decisions.** M9 rewrote `check-message-ids.mjs` (right, as it turned out). M10 used a temporary settings file to get past the Gradle wrapper failure. M19 saw the worktree failure and left it, and its verifier then failed the milestone. These are the moments an advisor would cover.

**Net effect on cost.** Items 1–3 plus folding triage into the reviewer (section 3) save about 120–130M units, roughly 15–16%. Plan writers are about 90M of that.

## 2. Split plan review

**What `self-review.js` does.** When `fragments` is given in full mode, it starts:

- **one reviewer per milestone**, answering P2, P3, P6, P7, P8, P9, P10 and P11. It reads its own fragment and the head, and "the rest of the plan only for what this milestone uses from its dependencies", plus the spec and project rules.
- **one plan-wide reviewer**, answering P1, P4, P5 and P12. It reads the contracts and runs `resolve`.
- all of these in one `parallel()` call with no concurrency cap;
- then **one consolidator**, which merges the reviews, settles conflicts, adds cross-milestone "no" answers and fills in for any silent reviewer;
- then research and **one triage** agent.

So the run has milestones + 3 agents in total.

### Measured cost

| Run | Reviewers | Total tokens | Milestone reviewers | Units | Tokens per reviewer | "No" answers |
|---|---|---|---|---|---|---|
| proto3 `b54c4e89` | 19 + 1 | 3.37M | 2.90M | 61.6M | 153k | 16 from 11 reviewers; 8 reviewers found nothing; 1 returned `checks: []`; consolidator added 5 flips and 2 answers for the silent reviewer, 23 in total |
| proto-to-avro `99db7c4c` | 7 + 1 | 1.24M | 1.02M | 17.5M | 146k | 5, from 3 milestone reviewers plus the plan-wide one |
| proto-to-avro `61f2ca4c` | 5 + 1 | 0.80M | 0.59M | 10.1M | 117k | 8 |
| protobuf-java `c6143c10` | 13 + 1 | 3.08M | 2.17M | 49.3M | 167k | 17 + 1 + 2 cross-milestone from the consolidator |

**What `b54c` reviewers read.** I summed tool-result sizes over the 20 reviewers, about 1.53M tokens:

| Material | Tokens | Share |
|---|---|---|
| Own and dependency fragments | 648k | 42% |
| Command output | 530k | 35% |
| spec.md | 200k (about 10k each) | 13% |
| head.yaml | 118k (about 6k each) | 8% |
| Rules and skills | 14k | 1% |

The first-turn floor was about 32k per reviewer.

### Capped design: at most 4 reviewers, each reviewing a batch of about 5 milestones

**Savings.**

- Floor: 16 fewer agents. A sibling agent's floor costs about 13.5k cache-write tokens plus 20.5k cache-read tokens, about 19k weighted or 95k units at opus. That gives about 1.5M units.
- Shared spec and head reads: about 16.6k each, written once and then re-read for about 20 turns. That is about 270k units per reviewer, about 4.3M units in total.
- Smaller consolidator input.
- Total saving: about 6M units, about 10% of `b54c`.

**Added cost.** Cache reads dominate a reviewer's cost (51% of weighted milestone-reviewer cost). In a batch, milestone 1's fragment and command output (about 58k) stay in context for the roughly 108 turns spent on milestones 2–5. That adds about 2× 27 turns × 32k × 0.1 per milestone, roughly 0.9M units per milestone and about 16M units for 19 milestones. **At batches of 5, the cap costs more than it saves. At batches of 2–3 it roughly breaks even.** The 33–36k floor is only about 22% of a 150k reviewer, so fresh contexts are not where review money goes.

**What batching might miss.** The would-break findings all came from reviewers that dug deep into one milestone:

- `a3da` (61f2): generator-switch leaves a test importing a deleted converter. 167k tokens, 31 calls.
- `ad53` (99db): AsyncAPI count 5 against 4. 162k tokens, 43 calls.
- `ac1b` (99db): count test asserts `.avsc` in every commands folder. 176k tokens, 29 calls.

A batched reviewer would have to spend the same calls per milestone, with more attention spread across milestones.

**What batching would gain.** Consistency:

- The `b54c` consolidator flipped 5 answers from yes to no "for consistency". The same missing-blank-line header defect was reported for units-identity and missed by the reviewers of units-onboarding-b, units-public and proto-parser.
- The `c6143c10` consolidator added 2 cross-milestone "no" answers.
- Retro F21 traces 27 interface requests to writers working without shared conventions.

A reviewer that sees all four similar `units-*` milestones would apply one standard.

**Recommended default.**

- Keep one reviewer per milestone by default, but **group milestones of the same shape**: shared `paths` prefix, the same `rules`, or a slug family such as `units-*`. Put at most 3 in a group.
- **Cap concurrency separately**, with `review.maxParallel: 4`. This does not change tokens, but it cuts host contention when reviewers run Docker, npm or Gradle commands (retro F13: a check over 600 s at 4–7 parallel runs) and avoids a 20-agent burst.
- For `b54c` this means about 9 reviewers instead of 20. Tokens stay roughly flat (±5%). The gain is consistency, which removes the consolidator's flip work.

The real token levers in review are elsewhere:

- 8 of the 20 `b54c` reviewers (about 1.29M tokens, 44% of milestone-reviewer tokens) found nothing. A milestone whose steps are byte-copies of a template (`units-*`) could get a light check of P6 and P7 only.
- Command re-runs are 35% of what reviewers read.

## 3. Fresh contexts versus shared context

### Where fresh agents re-read what another agent had just read

1. **Research checkers:** the first-turn floor is 5.0M of their 6.64M tokens (75%). That is about 60% of a checker's weighted cost: harness bulk, not research. Haiku does not fix this; haiku collectors have the same ~31k floor. It belongs to the harness-bloat analysis.
2. **Triage:** the floor is 1.06M of 1.35M tokens (79%).
   - It re-reads what the reviewer already had: run 4 triage re-read spec.md lines 64–160 and 175–200 after the reviewer had read the whole file with `cat`; triage agents ran 1–7 Bash reads.
   - It dropped no "no" answer in any run. In proto3 the split was 8 decision and 5 technical findings, all restating reviewer evidence.
   - It does add value in one place: it sees research results the reviewer never saw. Two continuous-producers triage findings came from claims research had marked verified. One was would-break: "D2 as written cannot meet R6".
3. **Spike checker, designer and judge** are three fresh contexts on one topic.
   - The `wf_e259` checker and designer both ran `sed -n 295,325p` on spec.md and grepped ui-flow for the same terms.
   - Judges re-run everything (section 1).
4. **Implementer and verifier.** Every verifier re-ran the contract check the implementer had just reported, which is by design. Fix rounds start a fresh implementer (M19, M22, M23, M25) instead of continuing the existing one. M26 round 2 was already a SendMessage continuation.
5. **Plan writers.** 63 fresh opus contexts, about 34k floor each, each re-reading the spec, skeleton and code. The result was 27 interface requests and inconsistencies that reviewers and the consolidator had to fix later.
6. **Old research run:** 15 report writers (541k tokens) and 21 spike runners (761k tokens) were pure re-read overhead. Both were already removed.

### Where a fresh context demonstrably caught something

- **proto-to-avro M7.** The verifier (`agent-a675718daf25a2cd1`) found a stray fence at CONVENTIONS.md:54. The contract check printed ALLPASS, and the implementer reported a pass.
- **proto3 M4.** The verifier (`acf7f18ae917ce1c1`) disproved the implementer's claim that buf was skipped.
- **proto3 M19.** The verifier (`acd95ab6878e6fae6`) failed the milestone on the README `SCHEMA_CI_BUF` worktree failure. The implementer had seen it, and the orchestrator had written "Leaving the README as written is reasonable".
- **proto3 M15.** The verifier (`a762931b284599156`) ran a mutation test: with the registry lookup removed, all 17 tests still passed.
- **proto3 M2.** The verifier ran the red step the implementer had skipped (54 tests failed, as expected).
- **proto-to-avro planning.** The full plan review caught plan-shape errors that the skeleton review and five writers had missed (retro F9).

### Counter-evidence

- **proto-to-avro M1.** The verifier (`ad1a5f8470e903a4a`) re-ran the same host-only check and missed the npm 10 lockfile failure in Docker. A fresh context still inherits the plan's frame.
- **The long-lived orchestrator degraded in a shared context.**
  - impl-report dropped hand-back concerns (proto3 R1–R4).
  - The orchestrator's own M25 grep was wrong twice.
  - It accepted the M19 problem without sending it back.
  - So routing everything into one agent has its own failure mode.

### Pattern (a): sonnet worker, haiku lookups, opus advisor that answers back to the same worker

| Role | Fit | Evidence for savings and risks |
|---|---|---|
| **Plan writing** | **Best fit.** Sonnet writers do the code, raise interface and design questions to an opus advisor that holds the skeleton and conventions, and use haiku for repo and version lookups. | About 90M units net (11%). The advisor also gives one place for conventions, which addresses the 27 interface requests and the consolidator flips. Risk: plan code errors spread, because implementers copy it verbatim. Reviewers and verifiers remain. |
| **Implement** | Good fit. The advisor replaces the re-dispatch rung of the escalation ladder. | Each fresh re-dispatch costs 50–100k sonnet tokens plus orchestrator turns. Cases that needed one: continuous M4, proto3 M22, M25 (×2) and M10. The advisor must not replace the verifier: four of the six catches above contradicted what the implementer or orchestrator believed. |
| **Research** | Partial fit. A sonnet checker could call haiku to fetch sources, but the checker *is* the lookup, and escalation already goes to opus (the designer). Keep the checker on sonnet. The cheaper change: designer on sonnet, opus judge as the advisor. | About 18.7M units. |
| **Review** | Poor fit. Reviewing is judgement; a sonnet reviewer would escalate most "no" answers. Haiku lookups for version and docs facts during review could replace some research round-trips, but research already runs only on claims that cannot be checked from files. | — |
| **Verify** | Only as tiering: a sonnet verifier with an opus advisor when steps carry exact code. | Up to 26M units. Risk: missing intent-level findings. Those concentrated in milestones with outcome-level plans, so tier by plan detail. |

### Pattern (b): limit span, helpers report into one agent

The cost model sets the limit. Merging N fresh contexts into one long agent removes N−1 floors (about 95k units each at opus). But everything the merged agent read stays in context and is paid for again as cache reads on every later turn. **Merge where the follow-on agent does few turns. Keep separate agents where each does heavy, independent work.**

| Role | Recommendation | Expected effect |
|---|---|---|
| **Review → triage** | Continue the reviewer (or consolidator) after research, via SendMessage, to triage its own "no" answers. | Saves about 8M units (most of 11.5M; triage needs 1–7 calls). Keeps the triage value, since research outcomes still reach a context that knows the document. |
| **Research: designer → judge** | Have the designer report to a judge that reads outputs and re-runs only where they disagree; keep the judge independent. Leave checkers parallel: each is short, and its floor is a harness problem. | About 13M units. |
| **Plan writing** | A plan lead holds the skeleton and conventions; sonnet writers report back into it (combines with pattern a). | Directly targets F21. Not one long agent writing 19 milestones: writers average 174k context, and serialising them would multiply cache reads. |
| **Implement** | Continue the same implementer for fix rounds (as M26 did). Keep the verifier fresh, and keep the orchestrator summarising only from hand-back text it extracts mechanically (retro proposal `handbacks.sh`). | — |
| **Split review** | Group same-shape milestones (up to 3), concurrency 4, as in section 2. | — |

### Is an extra verifier worthwhile?

The evidence says an extra verifier pays where the plan leaves judgement to the implementer. With an outcome-level or light plan, the opus verifier is where the money should go; with a byte-exact plan it found nothing in 13 milestones. That links this analysis to your planning-research question: dropping exact-code plans would move cost from the 36.9% opus writer line to the implementer and verifier, where independent context has actually caught defects.