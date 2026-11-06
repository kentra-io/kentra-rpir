# Software factories and agentic engineering organisations

Research date: 2026-11-05. Window for current practice: 2026-07-05 to 2026-11-05. Older sources are labelled **background** with their date.

Note on quotes: page text was retrieved with WebFetch, which returns model-processed text. Quotes below are as returned. I re-fetched every decision-relevant source myself and asked for exact wording on the key passages (Kiro factory posts, Kiro specs docs, Cognition Fusion, Anthropic harness and advisor posts, OpenAI long-horizon post). Wording is still worth a spot-check before it is quoted outside this report.

## 1. Current practice

### 1.1 Kiro (AWS): the most detailed in-window account of a running software factory

**"How we built a software factory with Kiro Crew to merge 1,000 PRs in a week"**, Zejiang (Joe) Guo, Bolin Chen and Zezhen Xu, Kiro blog, **2026-09-18**. https://kiro.dev/blog/software-factory-1000-prs/
- Throughput: "Last week, the three of us building Kiro Crew full time merged 1,000 pull requests in seven days." "Together they keep 30 to 50 sessions busy at the same time."
- Roles: "Several agents need different roles, scopes, and ways to collaborate. One may plan, another execute, and another review." The pipeline stages are "triage, implement, review, and merge."
- Artifacts: the post does not mention specs, plans or task files. The work queue is GitHub issues: "Labels on a GitHub issue are a perfectly good queue to start with." Coordination state must be durable: "If that lives only in a model's context, it disappears on the next compaction and nobody can reconstruct what happened. It has to be explicit and durable."
- Cost: "cheaper models for routine supervision, scripts for deterministic checks."
- Permissions: "Enforced by the host, not requested politely in a prompt."

**"Keeping a software factory stable at 1,000 PRs a week"**, same authors, **2026-10-26**. https://kiro.dev/blog/software-factory-stability/
- Tiered planning by complexity: "every feature request is now classified before anyone builds it." "a medium level feature needs a one-page design, and a complicated one needs a review by the whole team."
- Review loops cause over-engineering: "After five rounds, a ten-line fix has become a small subsystem that wasn't needed." On security findings: "Given one real finding, it will add three layers of defense." Their rule: "fix the actual user reachable problem with the smallest code changes."
- Bar for blocking findings: "A block finding needs a concrete location, quoted evidence, a trigger, and a consequence." "If a reviewer cannot name what breaks and how, the finding is advisory."
- Reviewer roles: a design reviewer ("whether a much simpler solution exists"), a first-principles reviewer ("whether the change fixes the root cause, and whether users really need it"), and a UX reviewer.
- Deterministic verification replaces human reading: "A human cannot read every change, but a pipeline can test all of them, every time, the same way." "Every pull request now gets builds, unit tests, and end-to-end tests automatically." Test coverage is "above 90%". "80+ checks" are rolled into one verdict.
- Tiered human review: "Simple tier PRs are approved and merged automatically, and for the rest, AI drafts review suggestions for the human."
- Escalation: "a second agent, the conductor, reads the retrospective's recommendation and makes the first call itself." "The human is pulled in only when the conductor cannot decide."
- The PR description is the per-change artifact, rewritten to match the code, with "a CI check that verifies the description strictly matches the code."

**Kiro Specs docs**, page updated **2026-10-15**. https://kiro.dev/docs/specs/
- Three files: requirements.md "Captures user stories, acceptance criteria, or bug analysis in structured notation". design.md "Documents technical architecture, sequence diagrams, and implementation considerations". tasks.md "Provides a detailed implementation plan with discrete, trackable tasks".
- Gates are optional for well-understood work: Quick Spec can "auto-generate all three artifacts without approval gates."
- The page does not say whether tasks contain code. It describes them as "Trackable tasks with clear outcomes".

**"Introducing Kiro workflows"**, **2026-09-30**. https://kiro.dev/blog/introducing-workflows/ (collector excerpt, not re-fetched)
- "Workflows are graphs composed of agent steps, sequences, loops, and parallel branches". "Each `step` runs an independent agent session." "`repeat` loops over steps with a stop condition, such as review approval." It "asks you before changing the design, expanding the PR's scope, or altering the user experience." Opt-in.

**"How Kiro fixes itself, and how we keep the fixes honest"**, **2026-10-20**. https://kiro.dev/blog/how-kiro-fixes-itself/
- A self-improvement loop: read failure, diagnose, one pre-registered hypothesis, controlled ON/OFF trial, a 3-stage gate, then a PR "where a human merges". "The gate, which is plain code, decides whether the change survives." "the proposer never judges its own change."

**"Spec it safe"**, **2026-10-30**. https://kiro.dev/blog/spec-it-safe/
- Requirements are in EARS format, and a tool hardens requirements.md "in place". "A developer reviews the hardened spec diff and uses judgment on each clause." The authors call it "a research prototype and a hypothesis".

### 1.2 Factory

**Missions docs** (undated; currency within the window is **unverified**). https://docs.factory.com/missions/planning.md
- "The planning phase is where Missions deliver the most value." The plan covers "the features, the ordering, the milestones, the skills involved, and how the work gets validated." "Droid will push back, ask questions, and iterate with you until the plan is solid."
- "Validation workers run at the end of each milestone, verifying its work." Cost model: "total runs ≈ #features + 2 * #milestones", "a floor rather than a ceiling." "For smaller, straightforward projects, a single milestone is often enough." Validation "you can disable it in the mission settings inside Mission Control."
- The docs do not say whether plans contain code or acceptance criteria, and do not name a model per role.

**Spec mode docs** (undated). https://docs.factory.com/autonomy-and-safety/specification-mode.md (collector excerpt)
- Droid "proposes a concrete implementation plan" and "calls `ExitSpecMode` to ask for approval." The docs recommend it for "architecture changes, migrations, security-sensitive work".

**"Droid 1.0: Building a Frontier Harness"**, Factory Research, **2026-10-29**. https://factory.com/news/frontier-harness
- No spec workflow described. On planning: "The model works out the whole sequence in its reasoning, and the program it writes is the plan." "Stronger models plan further ahead".
- Shipping gate: "Droid runs every step itself, and nothing ships until an engineer reviews and merges it."
- Harness slimming (relevant to the harness-bloat question): base prompt cut from 20,887 to 13,055 input tokens (−37%), and tool definitions sent up front cut from 11 to 2. Self-reported.

**"Factory Router cuts inference costs by 63%"**, **2026-09-23**. https://factory.com/news/factory-router-inference-savings
- Router "selects an efficient model when it can complete the workload reliably" and "moves to a stronger model when needed." Admins can route by workflow type, for example sending routine documentation updates to a cheaper model and critical-service changes to a stronger one.

**"HumanLayer is joining Factory"**, **2026-11-04**. https://factory.com/news/humanlayer
- HumanLayer published "the Research/Plan/Implement framework, one of the first viral 'skill packs' in August 2025". Factory plans "in-app collaboration on agent-written plans, product specs, and design docs".
- Related, **(unverified)**: secondary sources (agentpatterns.ai, a personal wiki) say Dex Horthy gave a talk, "Everything We Got Wrong About Research-Plan-Implement", that moves to QRSPI (Question, Research, Spec, Plan, Implement). The claimed lessons are that reviewers should read the code instead of long plan files, and that a short design discussion gives more chances to correct the agent than a long plan. I found no primary video, transcript or date. The secondary sources say "early 2026", which would make it background.

### 1.3 Cognition (Devin)

**"Introducing Fusion in Devin Desktop & CLI"**, **2026-09-11** (chart footnote updated 2026-10-19). https://cognition.com/blog/local-fusion
- Two models in two roles. The **lead** is a frontier model that "owns the plan, interprets ambiguity, and reviews the work". It writes a brief for each delegated task with constraints and success criteria. The **sidekick** is a cheaper model that explores code, implements, runs tests and reports back. The lead "can take control back when the sidekick is out of its depth."
- The two agents exchange only briefs, results and feedback, not full conversations. Each keeps its own persistent context, which takes advantage of prompt caching.
- The recommended pairing is Opus 5.5 as lead with GPT-6 Luna as sidekick.

**"Making Fable Cheaper Than Opus"**, Joon Hee Lee, **2026-07-13**. https://cognition.com/blog/making-fable-cheaper-than-opus
- "The lead agent owns the session: it talks to the user, plans, reviews the work, and commits." The lead has "a persistent `sidekick` subagent for delegating tasks", "powered by a much cheaper model". "routing decides whether the expensive model is involved at all."

Cognition published no in-window post describing a spec or plan artifact or a human plan-approval gate. The docs.devin.ai planning page returned 404 to the collector.

### 1.4 GitHub Spec Kit

**README** (undated; news list on the page runs to 2026-10-16). https://github.com/github/spec-kit
- Commands: `/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-converge`. "Define what to build and why, then turn the specification into a plan, tasks, and working code." "Run these skills in your agent's chat, not your terminal, one at a time, reviewing each result before continuing." "Repeat implement and converge until convergence reports `Converged`."
- The README does not define "Converged" and does not name the spec, plan and tasks files. The news list includes "Living Specs in SpecKit" (2026-10-15), about keeping capability-level specs as the project evolves. I could not open that post.
- License: MIT ("Spec Kit is MIT licensed"; the LICENSE file says "MIT License / Copyright GitHub, Inc."). About 147.6k stars.

**Releases.** https://github.com/github/spec-kit/releases/tag/v1.3.0
- v1.3.0 is "Latest", "released this 03 Nov 18:25". The page shows no year. 2026 is inferred from the © 2026 footer and the October 2026 news list. v1.3.0 removed core `/speckit.taskstoissues` in favour of the `github` extension. A search snippet naming v1.0.1 as latest is stale.

### 1.5 Augment Intent (background, last updated 2026-06-18)

https://www.augmentcode.com/blog/intent-a-workspace-for-agent-orchestration (published 2026-02-10)
- "A coordinator agent uses Augment's Context Engine to understand your task and propose a plan as a spec." "You review and approve that plan before any code is written." "the coordinator fans work out to implementor agents that can run in waves." "a verifier agent checks the results against the spec to flag inconsistencies, bugs, or missing pieces." "Work starts from a spec that evolves as agents make progress."
- No model per role and no measured results. I found no in-window Augment post.

### 1.6 StrongDM (background, 2026-02-06)

https://factory.strongdm.ai/, Justin McCarthy
- "specs + scenarios drive agents that write code, run harnesses, and converge without human review." "Code **must not be** written by humans". "Code **must not be** reviewed by humans".
- Scenarios are stored "outside the codebase", like a holdout set. "Satisfaction" is the fraction of observed trajectories "likely" to satisfy the user, judged by an LLM.
- No detailed plan or task artifact is described.

### 1.7 Lab practice from Anthropic and OpenAI (background or undated, included because the question names them)

**Anthropic, "Harness design for long-running application development"**, Prithvi Rajasekaran, **2026-03-24** (background). https://www.anthropic.com/engineering/harness-design-long-running-apps
- Planner detail: the planner should "stay focused on product context and high level technical design". The author found it better to "constrain the agents on the deliverables to be produced and let them figure out the path as they worked."
- Sprint contracts: the generator and evaluator agreed "what 'done' looked like for that chunk of work before any code was written."
- Simplifying with a newer model: "I started by removing the sprint construct entirely". With Opus 4.6, "the model could natively handle the job without this sort of decomposition." "every component in a harness encodes an assumption about what the model can't do on its own."
- Evaluator: "It is worth the cost when the task sits beyond what the current model does reliably solo."

**Anthropic, "The advisor strategy"**, **2026-04-09** (background). https://claude.com/blog/the-advisor-strategy
- "Sonnet or Haiku runs the task end-to-end as the executor". "When the executor hits a decision it can't reasonably solve, it consults Opus for guidance as the advisor." "The advisor never calls tools or produces user-facing output". The advisor typically writes 400 to 700 tokens per consult.
- This is an API beta tool (`advisor_20260301`). Which executor and advisor pairings the docs currently support for the 5.5 generation is **(unverified)**. The search summary listed only 4.x pairings.

**OpenAI, "Run long horizon tasks with Codex"** (undated; mentions December 2025 as past; author Derrick Choi per the pt-BR page). https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Four files: Prompt.md, the spec ("Freeze the target so the agent doesn't 'build something impressive but wrong.'"); Plan.md, the milestones ("Acceptance criteria + validation commands per milestone"), each "small enough to complete in one loop"; Implement.md, the runbook; and Documentation.md, the status log ("the shared memory and audit log").
- "After milestones, it ran verification commands and repaired failures before continuing." The page does not say whether plans contain code.

I found no in-window OpenAI or Anthropic post on software-factory process.

### 1.8 Research on SDD in practice

**Agarwal, Singhal, Macvean, Vasilescu, Breaux, "Spec-Driven Development as Prescribed and as Practiced"**, arXiv:2608.25202, v1 2026-08-25, v4 2026-10-15. https://arxiv.org/abs/2608.25202
- Methods: Reddit thematic analysis, 21 interviews (8 tool makers), and 266 repositories from SpecMine, a corpus of 470,795 spec files from 73,030 repositories.
- Findings, from the collector's excerpts and my abstract summary: specs should capture intent, but "implementation detail may help agents while making specs prone to decay". Teams use SDD selectively, mostly for new features. Practitioners "reported more reliable agent behavior alongside greater planning and review costs". Spec-code checks happen "mainly when changes are completed rather than over time."

## 2. Measured results

All vendor numbers are self-reported. None are independently replicated.

| Source (date) | Result | Basis |
|---|---|---|
| Kiro, 2026-09-18 | 1,000 PRs merged in 7 days by 3 engineers; 30 to 50 concurrent sessions; "Over 120 a day, every one went through CI and review." | Self-reported team metric. No defect, revert or cost data. |
| Kiro, 2026-10-26 | Coverage >90%; 80+ checks per verdict; ~20% of engineering time spent on automation infrastructure; "a small change could take a day of back-and-forth" before automation | Self-reported. No reverts or incidents reported. |
| Kiro, 2026-10-20 | Self-fix loop: 8 PRs in the first week, 7 merged, none sent back in review; gate needs ON 10/10 and OFF ≤4/10, then ~890 confirmation runs | Self-reported. |
| Kiro Crew, 2026-08-04 | Adopted by "over 39,000 Amazon builders" in under 6 months; ~500 contributors (collector excerpt) | Company-stated adoption, not an outcome measure. InfoQ (2026-08-30) reports user concerns that Crew "can consume tokens significantly faster than Kiro CLI." |
| Cognition, 2026-07-13 | FrontierCode 1.1, 3,000 sessions: Fable 5 + sidekick scored 60.7 at $1.86/run; Fable 5 alone 60.8 at $4.03 (−54% cost, same score); Opus 4.8 + sidekick 54.6 at $2.04; Opus 4.8 alone 55.4 at $3.06. Fable-led runs had no lead code edits in 81% of runs (Opus-led 24%); Opus lead took 26.5 turns vs Fable's 11.5 | Self-reported, Cognition's own benchmark. |
| Cognition, 2026-09-11 | Fusion (Fable 5.1 + SWE-2) vs Fable 5.1 alone: DeepSWE 63.1 vs 64.3 at −46% cost; Terminal-Bench 4.0 56.1 vs 57.6 at −23%; Vals Code Migration 57.3 vs 54.6 at −41%. Artificial Analysis Coding Agent Index: Fusion (Opus 5.5 + GPT-6 Luna) 68.1 at 31% lower cost than Claude Code with Opus 5.5 (66) | Self-reported. Some public benchmarks, run by Cognition. |
| Anthropic, 2026-04-09 (background) | Sonnet 4.6 + Opus 4.6 advisor: +2.7 pp on SWE-bench Multilingual, −11.9% cost per task. Haiku 4.5 + Opus advisor on BrowseComp: 41.2% vs 19.7% alone | Vendor evaluation. |
| Anthropic, 2026-03-24 (background) | Retro game maker, Opus 4.5: solo run 20 min / $9; full planner-generator-evaluator harness 6 h / $200. "over 20x more expensive, but the difference in output quality was immediately apparent." | Single qualitative case. |
| OpenAI (undated) | "Codex ran for about 25 hours uninterrupted, used about 13M tokens, and generated about 30k lines of code" with spec, milestone plan, runbook and status files | Single case. |
| Factory, 2026-09-23 | Router: 63% lower aggregate cost (week ending 2026-09-13) vs frontier rates; 99% of Opus 4.7's Terminal-Bench 2 pass rate; 96% on Legacy-Bench | Self-reported. Counterfactual method not described. |
| Factory, 2026-10-29 | Droid 1.0 on Terminal-Bench 4 with Opus 5.5: 65.2% vs Claude Code 57.6%, $4.73 per passed task; base prompt −37% | Self-reported, run by Factory 2026-10-23 to 2026-10-28. |
| arXiv:2608.25202 | Qualitative only: more reliable agent behaviour, higher planning and review cost | Interviews and repository mining. |

**No in-window source measures spec-first vs plan-light delivery for defects, rework or cost.** No vendor publishes a comparison of detailed (code-level) plans against goal-level plans.

## 3. Where sources disagree

1. **How much should humans review code?** StrongDM (background, 2026-02): "Code must not be reviewed by humans." Factory Droid 1.0 (2026-10-29): "nothing ships until an engineer reviews and merges it." Kiro (2026-10-26) sits between: simple-tier PRs auto-merge, and humans see AI-drafted suggestions on the rest. The newest primary account (Kiro) favours tiering by risk over either extreme.
2. **How detailed should the plan be?**
   - Detailed: Kiro docs describe tasks.md as "a detailed implementation plan", and Factory says planning is "where Missions deliver the most value". OpenAI's long-horizon run used milestone plans with acceptance criteria and validation commands.
   - Light: Anthropic's planner was told to stay at "high level technical design". Kiro's own factory posts keep no plan artifact and size the design to the feature ("one-page design" for medium features). Factory's Droid 1.0 treats the model's own generated program as the plan.
   - The arXiv study connects the two: implementation detail helps agents but makes specs decay.
   - No primary source recommends putting full code in plan steps.
3. **Which model leads?**
   - Cognition (2026-07 and 2026-09): a frontier lead owns plan and review and delegates execution to a persistent cheap sidekick. Their data shows the stronger lead delegates more, edits less and costs less overall.
   - Anthropic advisor (background, 2026-04): a cheap executor runs end to end and consults a frontier advisor on hard decisions.
   - Both report lower cost at similar or better quality. Neither compares itself to the other. The newer source (Cognition) favours frontier-lead.
4. **Separate evaluator or verifier?**
   - For a separate verifier: Augment (verifier against spec), Factory (validators per milestone, can be disabled), Kiro self-fix ("the proposer never judges its own change").
   - Against a default one: Anthropic says the evaluator is worth it only beyond the model's reliable solo range. Kiro found that repeated LLM review rounds over-engineer fixes and moved weight to deterministic CI checks plus a strict bar for blocking findings.
5. **Spec Kit version.** A search snippet said v1.0.1 (21 Aug) was latest. The releases page shows v1.3.0 (03 Nov). The releases page wins.

## 4. Implications for kentra-rpir

The pipeline under review: spec → research spikes → detailed milestone plan with full code in steps → parallel Sonnet implementers with fresh Opus verifiers → transcript retro.

1. **Full code in plan steps is an outlier.** No in-window or recent primary source from a vendor or lab writes code into plans.
   - Current artifacts are a spec or requirements (all sources), an optional design sized to the feature (Kiro: "one-page design" for medium features), and milestones carrying acceptance criteria and validation commands (OpenAI; Factory Missions).
   - Anthropic deliberately kept its planner at "high level technical design", and the arXiv study links implementation detail to spec decay and higher review cost.
   - A lighter, defensible shape: spec + spikes, then a plan of milestones that each carry a goal, interfaces or contracts, acceptance criteria and validation commands, with no code. Implementers write the code.
   - The evidence supports this direction but does not measure it. Treat it as a hypothesis to A/B on a real change, not a settled result.
2. **Size the planning to the change.** Kiro classifies every feature before building: medium gets a one-page design, complicated gets team review, and simple goes straight through and auto-merges. Kiro Quick Spec skips approval gates for well-understood work. Factory says one milestone is often enough for small projects. kentra-rpir could have a light tier that skips the detailed plan and goes from spec to implement for small changes, and keep the full plan for complicated ones.
3. **Verification: cut the LLM review loops, keep deterministic gates and a strict blocking bar.**
   - Kiro's finding that "after five rounds, a ten-line fix has become a small subsystem" bears directly on kentra-rpir's stacked verifiers (implementer's judge, Opus milestone reviewer, plan reviewer).
   - Kiro's rule, "A block finding needs a concrete location, quoted evidence, a trigger, and a consequence", with everything else advisory, is a ready-made relaxed verifier prompt.
   - Anthropic's guidance suggests running the fresh Opus verifier only where the milestone is at the edge of what the implementer does reliably. Everywhere else, rely on tests, lint and build.
4. **Agent topology: two published shapes. The user's proposal matches one, and the newer evidence leans to the other.**
   - **Advisor (Anthropic, April 2026):** a cheap executor (Sonnet) consults Opus on hard decisions. This matches the user's proposal of Sonnet with an Opus advisor and Haiku lookups. The advisor is a server-side API tool. Claude Code subagents can only approximate it, because a subagent does not see the executor's transcript unless it is passed in.
   - **Frontier lead with a persistent cheap sidekick (Cognition Fusion, July and September 2026):** Opus owns plan and review in one persistent context, and a cheaper model executes. They exchange briefs and results only, each with its own persistent context, which helps prompt caching. This is the user's other idea of "limit the subagent span so a single agent has all the context". Cognition's self-reported data says a stronger lead delegates more and costs less overall.
   - For kentra-rpir, Fusion maps to one Opus milestone owner with a persistent Sonnet implementer that it re-briefs, replacing a fresh Opus verifier spawned per milestone. Kiro's warning applies: coordination state must also be written to durable files, because "If that lives only in a model's context, it disappears on the next compaction".
5. **Keep the retro, and gate its fixes.** Kiro's self-fix loop ships harness changes only after a controlled ON/OFF trial, a regression suite and a separate judge. "The proposer never judges its own change" applies to remediation actions from kentra-rpir's transcript retro.
6. **Harness bloat.** Factory cut its base prompt 37% and its up-front tool definitions from 11 to 2 (self-reported). This supports giving each kentra-rpir agent role a restricted toolset.
7. **Human checkpoints in current practice:** spec approval (universal), plan approval only for complex work (Kiro, Factory Spec mode, Augment), and code review tiered by risk (Kiro). kentra-rpir's end-of-pipeline human verification of the local merge fits this pattern.

## 5. Open questions the sources do not settle

- Does dropping code from plans raise defect or rework rates for Sonnet-class implementers on production systems? No measured comparison exists. Kiro, Factory and Cognition all run frontier-class models as lead.
- Frontier-lead with cheap sidekick vs cheap executor with frontier advisor: no head-to-head comparison on the same tasks. Both sets of numbers are vendor self-reports on different benchmarks.
- Horthy's revision of RPI (QRSPI, "Everything We Got Wrong About Research-Plan-Implement"): its date, content and evidence are **(unverified)**. It is the source closest to kentra-rpir's own lineage. A transcript would show whether the RPI originator now advises against reading long plans.
- What Spec Kit's `/speckit-converge` checks, and what the "Living Specs in SpecKit" post (2026-10-15) recommends: not retrieved.
- Factory Missions: whether milestone plans include acceptance criteria or code, which model runs each role, and whether the docs fall inside the window. The docs are undated.
- Kiro factory: defect, revert and cost rates behind the 1,000 PRs per week. They are not published, so throughput cannot be weighed against quality.
- Whether Anthropic's advisor tool supports the 5.5-generation pairings (Sonnet 5.5 with Opus 5.5): **(unverified)**.
- Kiro tasks.md: the docs say "detailed implementation plan" but do not show whether tasks contain code.
