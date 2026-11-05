# F22: where the planning-stage tokens went, and what would remove the waste

Scope: 74 completed workflow runs in 5 sessions, 43,752,168 tokens in all. Three more runs failed with 0 tokens. "Tokens" means the workflow's token total, which leaves out cache reads, so it is not a dollar figure. Haiku agents summarised each run (summaries.json). This analysis also uses the per-agent data (461 agents) and the plugin source at 0.5.4 (a908a85). The sessions ran plugin versions 0.3 to 0.5.2.

Main conclusion: half of the 43.75M is not kentra-rpir pipeline work. It is design conversation that ran before the spec skill loaded, where Ultracode turned each question into its own workflow of 5 to 8 agents.

The other half is 21.8M of pipeline work. The plan stage is 69% of that, and complete step code is what drives it. Less detailed plans only fix the plan, as you said, but the plan is the largest structural item.

A shared store or hooks would remove only about 2M (5%) of research. Most research cost comes from how deep each research call goes, not from repeats.

---

## 1. Token accounting

### 1.1 As labelled by the haiku summaries

| Kind | Runs | Tokens | Share |
|---|---|---|---|
| spec-research | 23 | 14.73M | 33.7% |
| self-review | 24 | 10.19M | 23.3% |
| plan-writing | 4 | 6.78M | 15.5% |
| other | 15 | 6.57M | 15.0% |
| spike | 5 | 3.81M | 8.7% |
| plan-fix | 1 | 0.72M | 1.7% |
| design-exploration | 1 | 0.53M | 1.2% |
| freshness-check | 1 | 0.41M | 0.9% |

| Initiated by | Runs | Tokens | Share |
|---|---|---|---|
| skill-step | 34 | 20.18M | 46.1% |
| user-asked | 33 | 19.42M | 44.4% |
| agent-initiative | 5 | 3.17M | 7.3% |
| unclear | 2 | 0.98M | 2.2% |

| Scope fit | Runs | Tokens | Share |
|---|---|---|---|
| needed-for-this-spec | 66 | 39.22M | 89.6% |
| general-design-evaluation | 6 | 3.78M | 8.6% |
| mixed | 2 | 0.76M | 1.7% |

Two of these labels are unreliable:
- **scopeFit:** haiku labelled the C360/EventCatalog runs "needed-for-this-spec", although they belong to no kentra change.
- **initiatedBy:** this undercounts the agent's own choices. In session 977d6d5f the agent chose a multi-agent workflow for each question under Ultracode. Haiku often labelled those runs "user-asked", because the user had asked the question, but the user never asked for a workflow.

| Change · stage (as attributed) | Runs | Tokens | Share |
|---|---|---|---|
| proto-to-avro spec+plan | 33 | 15.87M | 36.3% |
| proto3 spec | 25 | 14.25M | 32.6% |
| proto3 plan | 10 | 10.73M | 24.5% |
| continuous spec+plan | 6 | 2.89M | 6.6% |

### 1.2 Corrected segmentation

The attribution above is wrong in two places:
- The proto-to-avro retro counted every run in session 106feadb.
- The proto3 retro counted all of session 977d6d5f.

Splitting each session at the point where the spec skill loaded gives:

| Segment | Runs | Tokens | Share |
|---|---|---|---|
| A1: C360/EventCatalog design and build work in 106feadb, before the proto-to-avro spec started (wf_5cd14ac9 … wf_3855391a) | 19 | 9.48M | 21.7% |
| A2: event-format exploration in 977d6d5f, before the kentra spec skill loaded (wf_39bf4b0b … wf_27d47a9b) | 18 | 12.48M | 28.5% |
| B: kentra-rpir pipeline (spec, plan and their reviews) | 37 | 21.79M | 49.8% |

B per change: continuous 2.89M, proto-to-avro 6.40M, proto3 12.50M.

### 1.3 B by pipeline activity

| Activity | Tokens | Share of B | Share of total |
|---|---|---|---|
| plan-milestones (881k, 1,099k, 3,753k, 1,044k) | 6.78M | 31.1% | 15.5% |
| plan full reviews (52f0a61e 1,165k; 61f2ca4c 756k; 99db7c4c 1,188k; b54c4e89 3,197k) | 6.31M | 29.0% | 14.4% |
| standalone kentra research (spec premises) | 2.96M | 13.6% | 6.8% |
| spec diff reviews | 1.73M | 7.9% | 4.0% |
| spec full reviews | 0.79M | 3.6% | 1.8% |
| plan diff reviews (e5705ed3 167k; a408f453 270k; 81c98bbc 321k) | 0.76M | 3.5% | 1.7% |
| plan-fix | 0.72M | 3.3% | 1.7% |
| identity inventory | 0.48M | 2.2% | 1.1% |
| skeleton reviews | 0.47M | 2.1% | 1.1% |
| freshness check (killed) | 0.41M | 1.9% | 0.9% |
| explore | 0.40M | 1.8% | 0.9% |

The plan stage (plan-milestones, every plan review, and plan-fix) comes to 15.04M. That is 69% of B and 34% of the total.

### 1.4 By role and model

| Segment | Role (model) | Tokens |
|---|---|---|
| A2 | collect (haiku) | 4.79M |
| A2 | reason (opus) | 3.16M |
| A2 | report and rewrite (refs, write, update, review, fix) | ~2.2M |
| A2 | spike (sonnet) | 1.17M |
| A2 | critique + verify | 0.97M |
| A2 | judge | 0.19M |
| A1 | verify (opus) | 1.69M |
| A1 | collect (sonnet; CLAUDE.md asks for haiku) | 0.88M |
| B | write (opus, plan-writer) | 6.72M |
| B | review (opus) | 6.62M |
| B | check (sonnet) | 1.62M |
| B | design (opus, spike) | 1.21M |
| B | judge (opus) | 1.04M |
| B | triage (opus; 23 agents at ~37–55k) | 0.98M |
| B | run + research write (sonnet; roles removed in 0.4.0) | 1.29M |
| B | consolidate (opus) | 0.30M |

Opus does 77% of B's tokens, about 16.9M of 21.8M. Token counts barely depend on the model: the median agent uses 56.7k on haiku and 56.8k on sonnet. The model mix changes dollars, not tokens.

### 1.5 The per-agent floor

Every agent starts at about 34–35k tokens (min 34,363; p10 37,157; median 78,009). With 461 agents at about 34.5k each, roughly 15.9M (36% of the total) is spent before any agent does work. Any change that removes an agent saves at least 34k. This applies across every cause below.

---

## 2. Topics researched more than once

| Topic | Runs (in order) | Why the earlier result was not reused |
|---|---|---|
| Wire / kotlinx release facts | 39bf4b0b → 7411e6fa | The result lived only in the session. The CONTEXT said "Earlier finding: Wire 7.1.2 ... is current", yet collectors were told "latest 7.x as of Oct 2026". |
| Apicurio SerDe bound | 7411e6fa → 45982593 | The prompt said "Already confirmed in earlier research ...", and the topic was still sent to collectors. |
| Wire buf.validate handling | 7411e6fa → 5e7e7305 | Same session, with no file on disk. The new question included the old one. |
| Editions status (Wire, Apicurio) | spike → 75fbb6f6 → a7030c0f → 56c285dc | 75fbb6f6 said "Spike results already verified locally" and still re-collected. Later runs re-asked inside broader questions. |
| Swift prefix and keyword escaping | a7030c0f → 02783db9 | Re-asked inside a wider Swift codegen question. |
| Apicurio VALIDITY / BACKWARD | 02783db9 → 53b761ba | Re-asked inside a governance question. |
| CloudEvents binding | 02783db9 → 53b761ba → 028a53e8 → 7514564e | Four runs while the decision moved (drop, take back, drop). Each run re-collected. |
| Governance / Jikkou / transitivity | 53b761ba and 028a53e8, concurrent | Neither run knew of the other. |
| Kafka ecosystem | 56c285dc and f7295920, concurrent | Neither run knew of the other. |
| C360 sources | 5cd14ac9 → 65f9483e → 75e4fb68 | The prompt said "treat it as leads, not truth — re-verify against sources". |
| Customer360 Java files | 3fea14a1, 71a60f9c, 0c1d9660 | Every build or verify run re-read the code base. Verifiers re-ran checks in 6 builds. |
| Violation-copy 10s claim | 41879cb9 → 52f0a61e | The claim was reworded, and the LLM ledger match missed it. |
| protobufjs parses proto3 offline (P11) | predecessor spike → d729cba8 re-spike (208k) | The ledger only covers one change. |
| gradle-plugin srcDir import | predecessor (unverified/medium, Sync task) → 6f13ce80 spike (195k), refuted | The ledger only covers one change. The predecessor's plan already used the working Sync layout. |
| buf behaviour | e3fa0971 → 6f13ce80 → bff9d7b8 → 9653e3f0 | Different claims each time. bff9d7b8's spike never ran buf. |
| node-sql-parser | deferred 4 times | Each review got unverified/medium and passed the claim on. |
| Counts in the spec | 03b20603 | A reviewer re-derived them. |

Keyword counts across all runs: Apicurio appears in 26, buf breaking 16, Wire 16, editions 10, CloudEvents 10, Jikkou 8, swift-protobuf 8. These counts include context mentions. The verified repeats above add up to about 2M (about 5%).

Why the earlier results were not reused, most common first:
1. **Not on disk.** The Oct 29 A2 results existed only inside workflow results.
2. **Known but not trusted.** The prompts, and the user-level research.js reasoner rule "Verify every decision-relevant claim against a primary source yourself", forced re-collection even when the earlier finding was quoted.
3. **Rewording.** A reworded claim defeated the LLM ledger match.
4. **Scope.** The ledger only covers one change, so the predecessor's findings were invisible.
5. **Concurrency.** Nothing registered a topic while it was in flight.

A store fixes causes 1, 4 and 5. Cause 2 needs a trust rule. Cause 3 needs a deterministic key.

---

## 3. Structural causes

### C1. A multi-agent workflow per design question (A1 + A2: 21.96M)

**What happened in A2.** The agent ran a research.js workflow of 5 to 8 agents for each question: Wire vs protoc, Apicurio vs buf, editions, Swift, CloudEvents, the Kafka ecosystem.
- **Agent-chosen runs:** 39bf4b0b, 7411e6fa, dc62d746, 45982593, 5e7e7305, 75fbb6f6, a7030c0f, 02783db9, 53b761ba and 56c285dc. Together about 6.67M.
- **Runs the user explicitly asked for:** about 5.81M ("Run the research workflow", "dispatch research agents", "run a spike on karapace", the Avro evaluation, the report and its rewrite).
- **Decisions kept moving:** drop Apicurio, then Apicurio, then CloudEvents, then drop CloudEvents, then reconsider Avro, then proto3. Ursa and Fluss were "just a thought". Karapace was discarded.
- **The report was written twice:** 1.34M + 0.93M.
- **wf_9653e3f0** was the agent's own choice ("Ultracode is on, so I'll answer this with a workflow rather than spot checks") and was killed at 411k.

**Text behind it:**
- **The Ultracode reminder:** "author and run a workflow for every substantive task by default. The goal is the most exhaustive, correct answer you can produce — token cost is not a constraint ... adversarial verify, multi-modal sweep, completeness critic, loop-until-dry".
- **~/.claude/workflows/research.js line 102:** "Verify every decision-relevant claim against a primary source yourself". The Nov 2 reasoners re-fetched what collectors had already fetched: 028a53e8 340k, 7514564e 585k (122 WebFetch calls, 90 distinct URLs), 56c285dc 371k, f7295920 603k. The Oct 29 reasoners used 60–130k.
- **A1 verify layers:**
  - 65f9483e: 5 opus verifiers, 762k.
  - 5cd14ac9: verifier 335k plus finalize 94k.
  - Build-run verifiers: 60–82k each, re-running checks.
  - A1 verify total: 1.69M.
  - A1 collectors ran on sonnet (0.88M), against the CLAUDE.md rule to use haiku.

**Structural part.** The exploration itself was the user's choice. The structural problem is the depth of each call:
- About 8 agents at the 34k floor each, plus a reasoner that re-fetches, for every turn of conversation. If each agent-chosen run had been one batched research call or one lookup (about 150k), those 10 runs would have cost about 1.5M instead of 6.67M.
- The A2 reasoners' re-fetching cost about 1.5–2M extra.
- The A1 verify layer cost about 1.7M.

### C2. Complete step code in plans (B: 15.04M, 34%; the predecessor adds about 13.4M outside the inventory)

**What happened:**
- **plan-milestones:**
  - continuous f4b1cd45: 5 writers, average 165k.
  - proto-to-avro 9d7b9b6b: 5 writers, average 220k, max 356k.
  - proto3 41f52ace: 19 writers, average 198k, max 342k and 678 tool calls.
  - proto3 f4c702a2: 8 writers re-run with `only`/`guidance` for interface requests, average 130k.
  - Proto3 F21: 27 interface requests, 23 "no" answers.
- **Predecessor wf_c1e3c95e, 6.95M in total:**
  - 13 writers: 2.51M.
  - 59 claim checks: 2.78M.
  - Spikes: 0.59M.
  - 12 revisers: 1.08M.
  - Claim research plus revision is 64% of the run.
- **Review and fixes:**
  - b54c4e89: 20 reviewers averaging 149k (2.97M), plus a 179k consolidator.
  - plan-fix: 723k.
  - plan diff reviews: 758k.
- **The plan code was wrong despite double review, in all three changes:** continuous F3; proto-to-avro F12–F15; proto3 F2, F3, F5, F6 (Java that never compiled, a wrong regex). Implementers copied plan code in with sed.
- **On the other side**, the proto3 retro lists under what went well: "plans that carried full file bodies let most milestones pass in one implementer and one verifier round".
- **Plan sizes:** continuous 2,030 lines; proto-to-avro 7,696; proto3 23,694; predecessor 18,884.
- **Planning vs building, proto-to-avro:** implementation cost about 1.57M fresh tokens plus 0.24M for the orchestrator. Pipeline planning cost about 6.4M.

**Text behind it:**
- **skills/plan/SKILL.md, Step code row:** full "complete code in every step".
- **plan-milestones.js TIER_TEXT, full tier:** "every step that changes code shows the complete code, and every step that runs a command shows the command and its expected result."
- **plan-milestones.js research and revision:** "every claim not in the ledger (unless reopened), once each". Then `toRevise` picks every writer with a claim that was not verified.
- **self-review.js:**
  - The split plan review gives each milestone its own reviewer for MILESTONE_CHECKS P2, P3, P6, P7, P8, P9, P10 and P11. One more reviewer runs PLANWIDE P1, P4, P5 and P12.
  - A consolidator then receives all the reviews inline.
  - Line 49: "maxClaims is no longer supported; every claim is researched".

**Mechanism.**
1. Complete code turns every API detail into a claim.
2. Each claim becomes a research topic.
3. Each claim that is not verified triggers a revision, and docs checks mostly end at unverified/medium.
4. Reviewers then re-read the code for each milestone.

So the cost grows with the lines of code written ahead of time, and nothing in the process compiles that code.

### C3. Verification that redoes the work (about 6.4M; overlaps C1 and C2)

| Layer | Where | Tokens |
|---|---|---|
| The spike judge re-runs every experiment | B 1.04M, A2 0.19M | 1.23M |
| Triage runs as a separate opus agent | 23 agents in B | 0.98M |
| The reasoner re-fetches the collectors' sources | A2 Nov 2 runs, above the Oct 29 baseline | about 1.5M (estimate) |
| Critique + verify | A2 | 0.97M |
| Opus verifiers re-run checks | A1 | 1.69M |

Text behind it:
- **The judge prompt:** "2. Re-run every experiment yourself with its command".
- **self-review.js** starts a separate opus triage agent whenever there is a "no" or a claim. A spec diff review without research costs 86–115k, and triage is 37–46k of that.

### C4. The spike threshold escalates on medium confidence (spikes in B: about 3.0M)

The rule in research.js is `needsSpike = topic.spike===true || (topic.importance==='critical' && (!check || check.confidence!=='high'))`. The checker sets confidence to high only when "a primary source ... at the relevant version states the behaviour directly". Docs checks mostly end at medium: 6 of 7 in 6f13ce80 and 2 of 2 in e3fa0971. So nearly every critical premise gets spiked.

Checker verdicts recovered from the transcripts:
- 0b2aa331 spiked after the checker had returned **verified/medium**: 379k.
- 3fe8d900 spiked 3 topics after unverified/medium.
- c1e3c95e spiked 3 topics after unverified/medium.

Spikes in B: 0b2aa331 379k, 0de56a7e 318k, 52f0a61e 497k, 3fe8d900 454k, e259f821 110k, e3fa0971 545k, bff9d7b8 289k, 6f13ce80 195k, d729cba8 208k.

Outcomes:
- **Refuted (2), both valuable:** headless Chrome SSE, and gradle-plugin direct srcDir.
- **Unverified (2):** the vault key; and bff9d7b8, which never ran buf.
- **The rest** confirmed what the docs already said.

About 0.9M was avoidable: the spike after a verified check (0b2aa331), the re-spike (d729cba8), and the spike that never ran (bff9d7b8). The threshold is too low, but spikes themselves are worth keeping.

### C5. Design still open while the plan is written (about 2.0M in the inventory; 15.8M outside it)

- **The predecessor change 2026-10-28-protobuf-java-schemas** (session fab7422e, full tier, edition 2023):
  - It cost 15,833,779 tokens and produced an 18,884-line plan. The spec was agreed and committed on Oct 30 (1b48f44).
  - It was then superseded; proto3-schema-libraries spec.md line 18 says so.
  - Its plan was written on Oct 29, while 977d6d5f was still deciding the format. The user said "We're going with proto3" on Oct 30.
- **Proto-to-avro F4/F5:** spec gaps forced a re-skeleton and rewrites. That cost about 1.27M of rework, plus a full review that was thrown away (61f2ca4c, 756k).
- **Proto-to-avro F8:** plan-milestones ran 3 times.
- **Proto3 F18:** the tier flipped from full to light after 498k of full-tier research had already been dispatched.
- **Proto3 F19:** pin policy came up at 3 stages. The R13 amendment review cost 323k.

No skill text causes this directly. The plan skill never checks whether the design is still moving.

### C6. The per-agent floor times the number of agents (about 15.9M, cross-cutting)

This is the multiplier behind C1 to C3. Every extra layer, split or triage agent costs at least 34k before it does anything.

### C7. Self-review re-reads

- **Per-milestone reviewers** in b54c4e89 averaged 149k each. Each one reads the spec, the skeleton, its milestone and the code it touches. The consolidator then received all 20 reviews inline (179k).
- **Research inside full reviews:**
  - 41879cb9: 372k of 484k.
  - 52f0a61e: 973k of 1,165k.
- **Research inside diff reviews with spikes:**
  - e259f821: 155k of 293k.
  - bff9d7b8: 329k of 431k.
  - d729cba8: 245k of 323k.

agents/reviewer.md already says "In a diff review, read only the diff". The re-read cost sits in split plan reviews and grows with plan length (C2).

### C8. Design exploration inside spec sessions

The explore (395k) and identity inventory (477k) runs in B were reasonable. The large exploration was A2, which ran before the spec skill loaded, so no tier or premise rule applied to it. Spec step 5, "Propose approaches", has no budget and does not ask for questions to be batched into one research call.

### Already fixed

Version 0.4.0 (1fe76f0) removed the research runner and writer roles, which had cost about 1.29M.

---

## 4. Ranking

Shares are of 43.75M. The causes overlap, so the shares do not add up to 100%.

| Rank | Cause | Tokens | Share | Structural or one-off |
|---|---|---|---|---|
| 1 | C1: multi-agent workflow per design question | 21.96M | 50.2% | Mixed. The structural part is about 8–9M (about 19%): about 5M excess depth, 1.5–2M reasoner re-fetch, 1.7M A1 verify. |
| 2 | C2: complete step code in plans | 15.04M | 34.4% | Structural, and grows with plan size. The predecessor adds about 13.4M. |
| 3 | C3: verification that redoes the work | about 6.4M | about 14.6% | Structural; part of ranks 1 and 2. |
| 4 | C4: spike threshold on medium confidence | 3.0M (0.9M avoidable) | 6.9% (2.1%) | Structural. |
| 5 | C5: design open while planning | about 2.0M (+15.8M outside) | 4.6% | Process. The largest case happened once. |
| 6 | Literal repeats a store would catch | about 2M | about 4.6% | Structural. |
| — | C6: per-agent floor | about 15.9M | 36% | A multiplier. |

One-offs:
- The general evaluation of Ursa, Fluss and Karapace (about 3.78M), which the user asked for.
- The report rewrite (0.93M).
- The killed freshness check (411k).
- The old runner and writer roles (1.29M, already removed).
- The bff9d7b8 spike that never ran buf (289k).
- The tier flip after research had been dispatched (498k).

---

## 5. Proposed plugin changes

### P1. Contract-only plans: your less-detailed-plans idea (addresses C2, C7, part of C4)

**Change:**
- **skills/plan/SKILL.md, Step code row:** "Steps state the contract, not the code: files and paths, cross-milestone signatures, the command that proves the criterion and its expected result, and the premises relied on. Write code only where the exact text is itself the decision (a wire format, a regex, a config key)."
- **plan-milestones.js:** change TIER_TEXT to match, and have writers return only the claims the contract depends on.
- **self-review.js:** drop the per-milestone split for plans and use one reviewer.
- **agents/plan-writer.md:** same wording as the skill.
- **Implementation:** the verifier at implement time checks the code against a compiler.

**What it removes:** writer exploration, the claim-research and revision loop, the split review, and plan-fix.

**Saving, gross:**
- The plan stage cost 15.04M.
- Kept under P1:
  - Skeleton reviews: 0.47M.
  - Contract writing: about 0.75M per change, so about 2.2M.
  - One review per change: about 0.5M each, so 1.5M.
- That leaves about 4.2M, so the gross saving is about 10.8M (25%).

**Saving, net:**
- Implementers then explore more. Assume they redo half of the 6.72M writer exploration: about +3.4M, at sonnet prices.
- The net saving is about 7.5M tokens (17%), and more in dollars.
- In the predecessor, about 13.4M would have become about 2–3M.

**Risk:** the proto3 retro credits full file bodies for one-round milestones. Keep code where the code is the decision, such as the F6 regex.

**Verdict:** strong. This is the largest structural item inside the plugin.

### P2. Research depth rules (addresses C3, C4)

- **The spike rule in research.js:** change `needsSpike` to spike only when `check.verdict==='unverified'` and a new checker field `decisive` (would the spec or plan change?) is true. Never spike after a verified check.
- **The judge prompt:** "Re-run the one experiment the verdict rests on; read the rest."
- **Saving from these two:** about 1.0–1.3M (2.5–3%).
- **self-review.js:** fold triage into the consolidator. In single reviews, the main session triages from the review JSON. Saving: about 0.7M (1.6%).
- **The reasoner in ~/.claude/workflows/research.js line 102 (user-level):** "Synthesize from the collectors' excerpts. Fetch a source yourself only when two excerpts conflict or an excerpt lacks the version." Saving: about 1.5M in A2 (3.4%).

**Verdict:** good and cheap. Keep spikes for decisive claims, since both refutations came from spikes.

### P3. A shared findings store across changes

**Change:**
- **Index:** add docs/research/index.yaml with claim, subject@version, verdict, confidence, evidence path, date and change.
- **Lookup phase:** add one to research.js before Check. Match deterministically on subject@version, then by LLM match on the claim.
- **Trust rule:** skip the topic when the stored verdict is verified or refuted at the same version and is younger than N days.
- **In-flight registration:** write a "pending" row when a topic starts.
- **Readers:** spec step 4 and plan-milestones read the index the way they read the ledger.
- **docs/process.md:** "Every premise is researched once" then holds across changes.

**Saving:** about 1–2M (2–4.5%). The store would catch the P11 re-spike (208k), the srcDir spike (195k) and the concurrent pairs (about 0.5M). It catches A2 repeats only if the user-level research.js uses the store too.

**Condition:** the trust rule is required. Without it, cause 2 in section 2 continues.

**Verdict:** worth doing, but small. It does not touch depth per call.

### P4. A "design settled" gate before the plan (addresses C5)

**Change:** add a step 0 to skills/plan/SKILL.md. List the spec's Design decisions and ask: "Is any of these still being explored elsewhere?" A yes stops the plan. A tier change after research has been dispatched also stops for confirmation.

**Saving:** little inside the inventory (about 0.5M). Outside it, the predecessor's plan stage of about 13.4M.

**Verdict:** cheap. It depends on the user knowing the design is unstable, which here they did.

### P5. One batched research call per batch of design questions (addresses C1, C8)

**Change:**
- **Spec step 5:** "When an open design choice needs outside facts, add them as topics to one research call per batch of questions; never start a separate workflow per question; use a single lookup agent for a single fact."
- **Session setting:** switch Ultracode off for spec and design conversations. Its "token cost is not a constraint" contradicts every tier rule in the plugin. A2 ran before the skill loaded, so only the session setting reaches it.

**Saving:** 6.67M minus about 1.5M, so about 5.2M (12%).

**Verdict:** the largest saving outside plan detail. The plugin cannot enforce the session setting.

### P6. Hooks

The plugin's hooks/ folder holds UI modules only, not tool hooks. Options:
- **A PreToolUse lookup hook:** it would inject "prior finding at <path>". This duplicates P3's Lookup phase.
- **An in-flight registration hook:** this would catch the concurrent pairs (about 0.5M), but research.js can register topics itself.
- **An agent-count cap during spec:** this is a blunt form of monitoring.

**Verdict:** weak. In every repeat the earlier result was already in context or quoted in the prompt, and the prompt still required re-verification. The fix is the trust rule (P3) and the depth rules (P2, P5).

### P7. Cost attribution in the retro (fixes the measurement, saves nothing)

The spec-retro should count only runs after the session was registered in .kentra-rpir/sessions.map, and show pre-spec work on its own line. As things stand, proto-to-avro was charged 9.48M of C360 work and proto3 12.48M of format exploration.

### Combined

P1 net about 7.5M, P2 about 3M, P3 about 1.5M and P5 about 5.2M, with rough allowance for overlap. Together about 15–17M (35–40%) in tokens, and more in dollars, because opus agents are the ones removed.

---

## 6. What could not be determined

- **Dollar cost:** cache reads are excluded and were not extracted.
- **Proto3 implementation cost:** no implementation dispatches were recorded. The plan-vs-build comparison rests on proto-to-avro alone.
- **Exploration shifted to implementers under P1:** the +3.4M is an assumption.
- **Why the predecessor was superseded,** beyond the format flip. Its 15.8M is outside the 74-run inventory.
- **What makes up the 34k floor:** system prompt, tool schemas, skill listings or CLAUDE.md. It was not broken down.
- **The exact repeated fraction inside collector runs:** URLs were not compared run by run. The about-2M figure counts whole runs and topics.
- **Checker verdicts before most spikes:** only 0b2aa331, 3fe8d900, c1e3c95e, e259f821 and 0a1dd126 had a checker result I could recover.
- **The haiku labels for initiatedBy and scopeFit** are unreliable. The segmentation in 1.2 uses session timing, checked by hand.
- **Whether the user-requested A2 research was worth its cost:** only the user can judge that.

Note: the analysis.md file was not written. The harness blocked the subagent from writing report files, so the full analysis is above instead of at /private/tmp/claude-501/-Users-jony-code-banank/578be2d0-ae57-4c60-9f8e-704dc044f699/scratchpad/f22/analysis.md. The input data is at /private/tmp/claude-501/-Users-jony-code-banank/578be2d0-ae57-4c60-9f8e-704dc044f699/scratchpad/f22/summaries.json and /private/tmp/claude-501/-Users-jony-code-banank/578be2d0-ae57-4c60-9f8e-704dc044f699/scratchpad/f22/agents.json.