# Verification in agentic coding pipelines

Research date: 2026-11-05. Current-practice window: 2026-07-05 to 2026-11-05. Sources outside the window are marked **background** with their date. Claims I could not confirm against a primary source are marked **(unverified)**. Vendor statements about their own products are marked **[vendor]**.

Verification status: the reasoner re-fetched every source marked "verified". The collectors' excerpts for the rest are reported as they gave them.

---

## 1. Current practice

### 1.1 Separate the checker from the author, and give the checker a fresh context

- **Anthropic, Claude Code best-practices docs** (undated, live docs fetched 2026-11-05; verified) [vendor]:
  - "By someone who didn't write the code: in the terminal, `/code-review` reviews the diff in a fresh subagent that never saw your conversation. It isn't swayed by the reasoning that produced the code."
  - Myths table: "Handing the same task to a subagent doesn't make the answer any better. A fresh reviewer does help, because it hasn't seen your reasoning, which is a different thing from delegating."
  - "And by default it's the same model (or a smaller one) on the same task. You get parallelism or a fresh pair of eyes out of it, but not a smarter answer."
- **Anthropic engineering, "Harness design for long-running apps"** (Prithvi Rajasekaran, **background, 2026-03-24**; verified): agents "reliably skew positive when grading their own work"; "Separating the agent doing the work from the agent judging it proves to be a strong lever to address this issue." The evaluator remains "inclined to be generous towards LLM-generated outputs" (collector quote).
- **Augment Code guide "Adversarial Code Review"** (2026-07-24, updated 2026-08-20) [vendor, secondary; not re-fetched]: "Wire a fresh-context reviewer with read-only tools and a pinned model from a different family."

### 1.2 Several narrow reviewers in parallel, then a verify step that filters findings

- **Anthropic, "How Anthropic secures its AI-native software development lifecycle"** (Jason Clinton, Deputy CISO, **2026-07-21**; verified) [vendor]:
  - "When a PR is opened at Anthropic, multiple agents automatically review it."
  - "Each review agent is designed and scoped to a specific, narrow focus"; "They do not share biases and blindspots"; "Effort isn't spread too thinly across multiple focus areas"; "This is much more effective than one mega-prompt or super security agent".
  - Confidence grew by "requiring the agents to write a proof that their finding is valid".
  - "Every approval is logged with the signals and reasoning behind it, and a risk-weighted sample is reviewed by humans." Human review is kept for "regulated or truly critical code".
- **Claude Code docs, Code Review** (undated live docs; verified) [vendor]: "1. **Find**: several agents examine the diff and the surrounding code in parallel. 2. **Verify**: a verification step checks the candidate findings against the code and filters out false positives. 3. **Rank**: the findings that remain are deduplicated and ranked by severity." Also: "a review works from reading the diff and the surrounding code, without building or running your code." And: "By default, Code Review focuses on correctness: bugs that would break production, not formatting preferences or missing test coverage."
- **Claude Code docs, local `/code-review`** (undated live docs; verified): "At `low`, the review reports the findings it's most confident in, so you see fewer false positives. From `medium` through `max`, the review broadens coverage." Changelog 2.1.311 (**2026-10-26**; verified): "Changed `/code-review` to tell Claude to put the effort level first and use max only when asked". The skill listing in this session also says max "starts many reviewer subagents".
- **OpenAI Codex subagents docs** (undated, fetched 2026-11-05; collector quote, not re-fetched): "This pattern splits review across three focused custom agents: `reviewer` looks for correctness, security, and test risks." **(unverified by reasoner)**

### 1.3 Scope the reviewer to the spec and correctness, and do not fix every finding

- **Claude Code best-practices docs** (verified): "use a subagent to review the rate limiter diff against SPEC.md, check every requirement is implemented and the listed edge cases have tests, report gaps that affect correctness and skip style". Also: "Don't drop the `skip style` part of that prompt. A reviewer that's asked to find problems will always find *something*. If you fix every finding, you end up with extra abstraction layers and tests for cases that can't happen."
- Same page, example reviewer agent: `tools: Read, Grep, Glob`, "report only the gaps that affect correctness. Skip style." It notes that the read-only limit "is enforced by Claude Code rather than requested in a prompt."

### 1.4 Ground verification in something executable, and demand evidence

- **Claude Code best-practices docs** (verified): "If you give it something that comes back pass or fail, Claude can close that loop itself." And: "ask Claude for *evidence*: the command it ran and its output, or the screenshot. 'All tests pass' on its own tells you very little". Its checklist for unattended runs: "Does it know what done looks like? A goal condition, a spec file, or a failing test it has to turn green." and "Can it check its own work? The test suite, a `Stop` hook, some kind of review step."
- **Same page, on specs** (verified): "Once `SPEC.md` exists, start a fresh session to build from it, so the build begins with a clean context and a written definition of done. It's also the file you'll point the reviewer at later". The page recommends a spec plus a reviewer checked against it. It does not mention a separate detailed implementation plan.

### 1.5 Test-first: practitioners are dropping red-green rituals and keeping executable checks

- **Birgitta Böckeler, "TDD inside the agent loop - theater or actual value?"** (martinfowler.com, **2026-08-10**, date from the series index; verified): "agents still sometimes skipped or faked the red step"; "When the agent both writes the test and confirms it failed, a red test tells you the agent ran it and saw failure, not that the failure was for the right reason" (collector quote); "I personally have stopped telling my coding agents to write tests first, let alone do TDD"; "Regression effectiveness can be monitored and improved with mutation testing"; "we should find as many ways as we can to monitor the outcomes and give feedback".
- **aihero.dev "/tdd skill"** (undated; refers to a June 2026 change; secondary, not re-fetched): the skill dropped the refactor step "because agents almost never performed it, and because review and implementation work better as separate sessions." **(unverified)**
- **Simon Willison, "Red/green TDD"** (undated; secondary): "It's important to confirm that the tests fail before implementing the code to make them pass." This is the pro-ritual view. The date is unknown, so it may be background.

### 1.6 Scale verification to the task and the model

- **Naresh Jain, "Are Harnesses Worth the Cost?"** (martinfowler.com, **2026-10-13**; verified). See the measured results in 2.4. Conclusions as the page summarises them: frontier models still need "an independent final acceptance check", and cost-optimised models gain from sensors running throughout development.
- **Anthropic harness post** (**background, 2026-03-24**; verified): the evaluator "is worth the cost when the task sits beyond what the current model does reliably solo". For tasks inside that boundary it became "unnecessary overhead". The author removed the sprint construct for Opus 4.6 but "kept both the planner and evaluator, as each continued to add obvious value."

### 1.7 Platform facts relevant to fan-out (Claude Code)

- v2.1.217 (21 Jul; the GitHub page shows no year, 2026 inferred; verified): "Added a cap on concurrently-running subagents (default 20, override with `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`)"; "Changed subagents to no longer spawn nested subagents by default; set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to allow deeper nesting".
- Conflict: the live sub-agents docs (collector quote) say "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation." The docs are newer than v2.1.217, so the default seems to have changed again after July. **(unverified: the exact change is not located in the changelog)**. Check this before you design a Sonnet worker that calls its own Haiku and Opus subagents.
- v2.1.316 (**2026-10-31**; verified): "Added `CLAUDE_CODE_SUBAGENT_EFFORT` to set the effort level subagents run at when nothing else names one, instead of inheriting the session's".
- v2.1.215 (19 Jul; verified): "Claude no longer runs the `/verify` and `/code-review` skills on its own". The current `/code-review` docs say Claude can start it again when asked in plain language, from v2.1.246 onward.

---

## 2. Measured results

### 2.1 Does an independent reviewer raise correctness, and does reviewer strength matter?

| Source | Setup | Result |
|---|---|---|
| Xiang et al., "Cross-Model LLM Code Review", arXiv 2607.21656 (**2026-07-22**; verified) | 116 hard and medium LiveCodeBench tasks. The reviewer sees the problem and the draft but cannot run tests | Claude reviewing Codex drafts: 71.6% → 89.7% (p_BH=.001). Codex self-review: 71.6% → 84.5% (p_BH=.022). Codex reviewing Claude: 91.4% → **82.8%** (p_BH=.046). Claude self-review: 91.4% unchanged |
| Park & Choi, "When Do Agent Loops Mistake Stagnation for Progress?", arXiv 2607.25152 (v1 **2026-07-27**, v2 2026-09-29; verified) | Long-running autonomous loops, 54 cycles | Self-verdict claimed improvement in every cycle, while 56% of cycles had a real-world delta ≤ 0. The best state eroded by 19%. The strongest in-band judge (full artifact, diff and verdict history) accepted real regressions 44% of the time and rejected 38% of real improvements. The authors' preregistered hypothesis that a stronger judge closes the gap was rejected. Where success could be checked from the artifact, the gap fell to **zero**. A gate that returned only accept or reject matched full feedback (110.0 vs 113.0) |
| Wan et al., "From Runnable to Shippable", arXiv 2605.17242 (v1 2026-05-17 **background**; v2 **2026-09-16** in window; verified) | Multi-agent TDD, 20 full-stack web apps, multiple backbones, two coding agents, three TDD implementations | "With sufficiently capable backbones, TDD improves accuracy by 15.5–23.7 percentage points". For a weaker backbone, "replacing unreliable feedback with a stronger tester restores positive gains" |
| Deng et al., ARBITER, arXiv 2610.18760 (**2026-10-13**; verified) | Trained 35B MoE agentic code judge that produces counterexamples | Counterexample success on incorrect programs: 40.61% → 62.67%. USACO-JUDGE verdict accuracy: 71.41% → 87.41% |
| Huang et al., DeepSWE, arXiv 2607.07946 (**2026-07-08**; verified) | Independent LLM judge re-reviews graded runs | The judge disagrees with hand-written verifiers 1.4% of the time and with SWE-Bench Pro's inherited tests 32.4% of the time. The 789/67/189 FP/FN breakdown is **(unverified)**: it is not in the abstract |

### 2.2 Multi-agent and adversarial review: catch rate against cost

- **Qiu & Gill, "Adversarial Review"**, arXiv 2608.18167 (v1 **2026-08-16** per the abstract page. The collector's 2026-08-20 is a later metadata date; verified). Abstract: AR (coder, reviewer and critic) reaches "the highest pass rate among tested methods" on LiveCodeBench and beats a **five-agent** baseline with three agents. On SWE-PRBench, naive AR shows a "false-consensus failure mode". An explicit disagreement prompt gives the highest F1. Body text (collector quotes, not re-fetched): "AR uses more tokens than Zero-shot on all three benchmarks"; "For easy tasks, the review loop may be wasted computation"; "The R–C loop adds findings without filtering them"; "the reviewer proposes too many weak findings and the critic confirms them." The abstract gives no pass-rate or token numbers.
- **Li et al., "OpenCodeReview"**, arXiv 2608.09290 (v1 **2026-08-10**; verified). Rule-guided file and criteria selection, a curated tool set with parallel sub-agents, and an "independent reflection" filter that sees only the diff. On AACR-Bench (200 PRs, 1,505 expert-verified comments) it scores up to 2.17× higher SEM-F1 (25.10% vs 11.57%) than Claude Code and Codex, with **5–15× fewer tokens**.
- **Rajan, "Multi-Agent Code Verification via Information Theory"**, arXiv 2511.16708 (**background, 2025-11-20**, v3 2025-12-03). SD Times (Nitish Mane, "Frontier Models Write the Code. Local Models Should Review It.", undated, written after September 2026 because it cites a September 2026 NVIDIA benchmark) reports these figures: one agent caught 32.8% of bugs, two 47.7%, three 61.2%, four 72.4%. The best pair (correctness + performance) caught 79.3%. Correlation between the agents' flags was 0.05–0.25. The agents were **deterministic static analysers specialised by role, not LLMs**, and the 99-sample dataset is small. The per-count figures come only from SD Times **(partly unverified)**. The 79.3% and 76.1% figures appear in search summaries of the arXiv page.
- **SD Times / Mane** (same article; design opinion, not measured): "Two reviewers that fail the same way are one reviewer and two bills"; "A second reviewer that reads the first reviewer's findings is anchored by them"; "give each a different question to answer, not a different model."
- **Anthropic SDLC post** (2026-07-21; verified) [vendor, no methodology or baseline]: the share of PRs with substantive review comments "has grown from 16 to 54%". About "a third of the bugs behind past claude.ai incidents would have been caught" by current automated processes. Intercom "auto-approves 19% of its PRs"; "Deployment doubled while downtime from breaking code changes dropped 35%."
- **Anthropic Code Review launch post** (**background, 2026-03-09**) [vendor]: about 20 minutes and "$15–25" per review on average. The current docs give no per-review dollar figure.

### 2.3 False positives and how humans receive review findings

- **Lin et al., "Is Agentic Code Review Helpful?"**, arXiv 2607.03316 (v1 **2026-07-03**, v2 2026-07-23; verified). 31,073 review and feedback pairs, 10,191 PRs, 239 repositories, CodeRabbit. 36.4% of reviews accepted, 7.3% led to discussion, **56.3% rejected**, mostly as false positives, redundant, out of scope or misaligned with developer intent. A lightweight rejection predictor reached up to 76% F1.
- Google Tricorder kept an analyser only while its effective FP rate stayed below 10%. This is **background, 2018**, cited second-hand by Augment (2026-09-08) **(unverified)**.
- Augment [vendor]: "Thorough Reviews mode catches 50% more bugs than Precise mode", and "SWR-Bench" found multi-agent approaches "underperform[ed] a simple PR-Reviewer baseline". **(unverified)**

### 2.4 Cost against benefit of a verification harness, by model strength

- **Jain, martinfowler.com** (**2026-10-13**; verified). Java service, 178 independent acceptance tests, 10 paired runs per model at low reasoning effort:
  - GPT-6 Sol (frontier): 10/10 accepted with the harness and 10/10 without. With the harness: about 11.3M tokens, 19m53s, ~$2.68. Without: about 1.08M tokens, 6m51s, ~$0.41. That is about **6.6× the cost for no acceptance gain**.
  - GPT-6 Luna (cost-optimised): **10/10 with the harness vs 3/10 without**, ~$0.27 vs ~$0.09. Harnessed Luna cost about 33% less per run than unharnessed Sol.
  - Caveats from the author: small sample, one service, an unusually detailed brief. Guides and sensors were not tested separately.
- **Böckeler** (**2026-08-10**; verified). Small informal study: Sonnet 4.6 generated the solutions, Opus 4.8 ranked them blind. "There was no clearly discernable difference based on TDD workflow versus no TDD workflow"; "more than once Opus ranked the non-TDD workflow solutions slightly higher in design and test quality"; "Mutation scores across the solutions didn't show any signals." Tests sometimes "checked the implementation's output against itself".
- **TDAD**, arXiv 2603.17973 (**background, 2026-03-18**; collector quote, not re-fetched). TDD instructions without targeted test context raised regressions to 9.94% against a 6.08% baseline. The study used small open-weight models.
- **Anthropic harness post** (**background, 2026-03-24**): solo run 20 min and $9, full planner/generator/evaluator harness 6 h and $200, "over 20x more expensive".
- **Anthropic multi-agent research post** (**background, 2025-06-13**; collector quote): multi-agent systems "use about 15× more tokens than chats".

---

## 3. Where sources disagree

1. **Does TDD help agents?** The multi-agent TDD paper (2605.17242 v2, Sept 2026) reports +15.5–23.7 pp. Böckeler (Aug 2026) found no difference, and TDAD (March 2026) found TDD instructions alone made regressions worse. These measure different things. The positive result comes from a **separate tester agent** producing executable feedback with a capable backbone. The neutral and negative results come from **procedural red-green instructions inside one agent's loop**. Read together: executable acceptance checks, held by someone other than the implementer, help. Asking the implementer to perform the red-green ritual does not. Both newest sources are in the window, so this reading is my synthesis, not a stated consensus.
2. **Does a stronger judge fix a weak verifier?** Cross-model review (July 2026) says a stronger reviewer lifts a weaker writer by +18 pp without running code, while a weaker reviewer drags a stronger writer down by −8.6 pp. Park & Choi (July/Sept 2026) say a stronger in-band judge does not close the gap. Their tasks differ: closed, checkable programming problems versus open-ended loops whose success signal lies outside the transcript. Both agree that reviewer **direction** matters (strong reviewing weak) and that **grounding** beats judge size when success cannot be read from the artifact.
3. **Many reviewers or few?** Anthropic (July 2026) favours several narrow agents. Adversarial Review (Aug 2026) beats a five-agent baseline with three agents and warns about weak-finding inflation and false consensus. OpenCodeReview (Aug 2026) beats open-ended agents with a more deterministic, cheaper pipeline. Augment cites a benchmark where multi-agent loses to a single reviewer **(unverified)**. Common ground: diversity of **question or focus** plus an evidence filter helps. More agents of the same kind, or loops where one agent confirms another, do not.
4. **Is an evaluator always worth it?** Anthropic's SDLC post (July 2026) runs multiple review agents on every PR. Anthropic's harness post (March 2026, background) and Jain (Oct 2026) say the evaluator is overhead for tasks inside the model's solo capability. These fit together: the always-on review at Anthropic is about production and security risk at scale, while the other two measure task acceptance.
5. **Nested subagents in Claude Code.** v2.1.217 (July 2026) turned nesting off by default. The live docs (Nov 2026) describe nesting allowed three layers deep by default. The newer source wins, but the change is **(unverified)** in the changelog.

---

## 4. What this implies for kentra-rpir

The pipeline under review runs: spec → research spikes → detailed milestone plan (full code in steps) → parallel Sonnet implementers with fresh Opus verifiers → transcript retro. It also has a self-review (yes/no review plus triage of every "no"), a research stage (docs checker escalating to spikes and judges), and per-milestone split plan review.

1. **Keep the fresh Opus verifier per milestone, and make it out-of-band.** Every source agrees that author and checker should be separate. The reviewer direction in kentra (Opus checking Sonnet) is the direction that helped in 2607.21656: +18 pp for strong-reviews-weak, −8.6 pp for weak-reviews-strong. Mapping Codex/Claude onto Sonnet/Opus is an analogy **(unverified)**. Park & Choi show that a judge reading the transcript and diff is unreliable (44% of regressions accepted) unless it checks against something executable. So the verifier should **run** the milestone's acceptance checks itself and return the commands and output as evidence, not just read the implementer's report. A plain accept/reject gate grounded this way did about as well as rich feedback (110.0 vs 113.0).
2. **Do not mandate red-green TDD for the Sonnet implementer.** Put executable acceptance tests in the spec or plan, owned by the planner or verifier side, which is the "stronger tester" pattern in 2605.17242. Have the verifier run them. Mutation testing is an optional check on test quality. Böckeler found no signal from it in a small study, so treat it as experimental.
3. **Collapse sequential judge-on-judge steps.** The user asked whether the spike judge and the Opus triage agent repeat work. The evidence points one way. A second LLM pass that reads the first one's findings is anchored by them (SD Times, opinion). A critic confirming a reviewer adds findings without filtering them (Adversarial Review). Two reviewers with correlated errors are "one reviewer and two bills". A second pass earns its cost only when it brings **new information**: it executes code, it sees a different input (OpenCodeReview's reflector sees only the diff), or it answers a different question. A concrete simplification: one verify step that requires a proof or reproduction for every "no" (Anthropic's "write a proof that their finding is valid"), with triage limited to sorting proven findings into "user decision" and "technical gap". This replaces a full second judgement. Measuring how often the triage agent overturns the judge would settle it for kentra. No public source answers that.
4. **Relax the review prompt; do not fix every finding.** Anthropic's own docs warn that a reviewer told to find problems "will always find *something*", and fixing everything adds abstraction and pointless tests. In the field, 56.3% of agentic review comments were rejected (CodeRabbit study). Scope reviewers to "correctness against the spec, skip style". Use a confidence or severity threshold (the `/code-review` low-effort mode: "reports the findings it's most confident in"). Make the yes/no review produce **blocking** items only, with the rest reported without action.
5. **Cap parallel reviewers and split by question, not just by milestone.** Splitting plan review per milestone is diversity of scope: each reviewer asks the same question about a different slice. That is fine for context size, but it does not decorrelate errors, and its cost grows linearly with milestone count. The evidence favours a few reviewers, each with a distinct question (for example: spec coverage and acceptance tests, cross-milestone interfaces and ordering, risky premises), with gains that diminish after the first two or three. The diminishing-returns curve comes from static analysers, so it is suggestive only for LLM reviewers. A configurable cap such as max 4 is consistent with this evidence. Claude Code's own platform cap is 20 concurrent subagents (v2.1.217).
6. **Scale verification intensity to the implementer's model and the task risk.** Jain's data (Oct 2026): a full harness cost a frontier model about 6.6× with no acceptance gain, and took a cost-optimised model from 3/10 to 10/10. For kentra, sensors and the verifier are well justified around **Sonnet** implementers. Extra layers around **Opus**-authored artifacts, such as plans reviewed by Opus, need their own justification. The best-practices docs and Jain both still keep one independent final acceptance check even for frontier models.
7. **Plan review has no external evidence base.** No in-window source measures what plan or spec review agents catch, or how that compares with downstream defects. Anthropic's public guidance describes spec + fresh build session + reviewer against the spec, with no separate detailed plan. Anthropic's harness post (background) removed sprint decomposition for a stronger model but kept a planner. kentra's own retro transcripts are the only data source for the per-stage issue counts the user asked about (implementer judge, Opus milestone reviewer, plan reviewer). Measure them before you cut stages.
8. **Cost reference points.** Multi-agent review at Anthropic costs about $15–25 per PR (March 2026, vendor). A full generator/evaluator harness cost about 20× a solo run (March 2026). Deterministic, scoped reviewers can be 5–15× cheaper **and** more accurate (OpenCodeReview). Tighter reviewer scope (files, criteria, tools) is a cost lever and a quality lever, not a trade-off between them.
9. **Platform knobs that help.** `CLAUDE_CODE_SUBAGENT_EFFORT` (2.1.316) sets reviewer and lookup effort centrally. Read-only `tools:` allowlists enforce a non-editing verifier. Check the current nesting depth default before you design a Sonnet worker that spawns its own Haiku lookups and Opus advisor (see 3.5).

---

## 5. Open questions the sources do not settle

1. **Plan and spec review value**: no measured catch rate for agent review of plans or specs, in or out of the window, and no comparison against the defects that reach implementation.
2. **Advisor or escalation patterns** (a Sonnet worker escalating to Opus, a Haiku lookup tier): no in-window measurement for coding verification was found.
3. **Opus reviewing Sonnet specifically**: the cross-model evidence uses Claude and Codex. No public number exists for Opus 5.5 verifying Sonnet 5.5 against Sonnet self-review.
4. **Optimal number of LLM reviewers**: the diminishing-returns curve comes from static analysers (Nov 2025). No in-window study measures it for LLM reviewers with different questions.
5. **Precision of Anthropic Code Review or `/code-review`**: no published false-positive rate or catch rate. The 16% → 54% figure has no methodology.
6. **Sequential judge then triage**: no study isolates the value of a second LLM pass over the first pass's verdicts on the same evidence. The anchoring claim is opinion, not measurement.
7. **Mutation testing as an agent-test quality gate**: only one small practitioner study, with no signal.
8. **Adversarial Review numbers**: the pass-rate and token figures beyond the abstract were not read.
9. **OpenAI in-window guidance on verification**: not found. The Codex best-practices page redirects and was not read.

---

## Sources (primary unless noted)

- https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle (2026-07-21)
- https://code.claude.com/docs/en/best-practices (live, fetched 2026-11-05)
- https://code.claude.com/docs/en/code-review and https://code.claude.com/docs/en/code-review-local (live)
- https://code.claude.com/docs/en/changelog (2.1.311, 2.1.316)
- https://github.com/anthropics/claude-code/releases/tag/v2.1.215 and /v2.1.217
- https://arxiv.org/abs/2607.21656 (2026-07-22)
- https://arxiv.org/abs/2607.25152 (2026-07-27, v2 2026-09-29)
- https://arxiv.org/abs/2608.18167 (2026-08-16)
- https://arxiv.org/abs/2608.09290 (2026-08-10)
- https://arxiv.org/abs/2605.17242 (v2 2026-09-16)
- https://arxiv.org/abs/2610.18760 (2026-10-13)
- https://arxiv.org/abs/2607.07946 (2026-07-08)
- https://arxiv.org/abs/2607.03316 (2026-07-03, v2 2026-07-23)
- https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html (2026-08-10)
- https://martinfowler.com/articles/are-harnesses-worth-the-cost.html (2026-10-13)
- https://sdtimes.com/sdt_dev/frontier-models-write-the-code-local-models-should-review-it/ (secondary, undated, after Sept 2026)
- Background: https://www.anthropic.com/engineering/harness-design-long-running-apps (2026-03-24); https://claude.com/blog/code-review (2026-03-09); https://www.anthropic.com/engineering/multi-agent-research-system (2025-06-13); https://arxiv.org/abs/2511.16708 (2025-11-20); https://arxiv.org/abs/2603.17973 (2026-03-18)
- Vendor or secondary, not re-verified: Augment Code guides (2026-07-24, 2026-09-08); aihero.dev /tdd skill; simonwillison.net red/green TDD
