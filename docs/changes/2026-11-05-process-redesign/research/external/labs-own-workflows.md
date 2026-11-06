# OpenAI and Anthropic on their own agentic engineering workflows

Research date: 2026-11-05. Window for "current practice": 2026-07-05 to 2026-11-05.

Question: does kentra-rpir (spec → research spikes → detailed milestone plan with full code in steps → parallel Sonnet implementers with fresh Opus verifiers → transcript retro) still need its strict planning process, and how should its agent roles be restructured for cost and quality?

## Summary

- **Neither lab publishes a dated, in-window engineering post on how its own teams plan and decompose agent-built software.** The Anthropic engineering index has one in-window post (Oct 13, 2026, source control), and it says nothing about planning. No in-window OpenAI engineering post was found. What is current is each lab's **product documentation**. Those docs are undated, but they name current models (Opus 5.5 / Fable 5.1; GPT-6.1 Sol), and the changelogs are dated in-window.
- **Neither lab's current guidance calls for a plan that contains the code.** Anthropic's documented flow is: interview → `SPEC.md` → fresh session → a check to pass → a fresh reviewer against the spec. Its best-practices page does not mention plan mode at all. OpenAI recommends plan mode for "complex, ambiguous" tasks and optionally a `PLANS.md`/ExecPlan for long work. The ExecPlan recipe is now marked **archived**, and it already told authors to "under-specify incidental implementation details."
- **Milestones survive, but as verifiable checkpoints rather than code scripts.** They carry acceptance criteria and validation commands (OpenAI long-horizon blog; ExecPlan; Anthropic's sprint contracts, which were later dropped as models improved).
- **The "Sonnet worker plus Opus advisor" idea already ships as a product feature.** It is the advisor tool, `/advisor` in Claude Code, and subagents inherit it. Anthropic's own pairing guidance is "Sonnet handles routine work and escalates planning, ambiguous failures, and completion checks to Opus."
- **Anthropic's newest agent-architecture guidance (Oct 22, 2026) favours fewer, larger-context agents.** A single loop with skills "often" beats subagent designs, and work should be split "by context" rather than by problem type, to avoid a "telephone game". Subagents are kept for verification, parallel work and permissioning. This matches the user's "limit the span" idea.

---

## 1) Current practice (claim, source, date, verbatim excerpt)

### Anthropic

**A1. Interview → SPEC.md → fresh session is the documented starting point.**
Source: Claude Code docs, *Best practices*, https://code.claude.com/docs/en/best-practices. The page is undated. It names "Opus 5.5" as the default model and "Claude Fable 5.1", so it reflects the current lineup. Fetched and verified 2026-11-05.
> "I want to add rate limiting to the public API but haven't thought it through yet. Interview me until you could write the spec, then write it to SPEC.md."
> "Once `SPEC.md` exists, start a fresh session to build from it, so the build begins with a clean context and a written definition of done. It's also the file you'll point the reviewer at later"

I searched the fetched page text for "plan mode", "/plan" and "milestone". It contains **no recommendation to use plan mode** and no milestone plan step. The only plan-like features it mentions are `/batch`, which "splits the work into 5 to 30 units and shows you the plan", and `/goal`.

**A2. The emphasis is on a check, not a plan.** Same page, verified.
> "If you give it something that comes back pass or fail, Claude can close that loop itself."
> "Whichever option you use, ask Claude for *evidence*: the command it ran and its output, or the screenshot. "All tests pass" on its own tells you very little"
> Five questions before an unattended run: "1. Does it know what done looks like? A goal condition, a spec file, or a failing test it has to turn green. 2. Can it check its own work? ... 5. Where does the result go, and who signs off?"

**A3. Review against the spec in a fresh context, scoped to correctness.** Same page, verified.
> "use a subagent to review the rate limiter diff against SPEC.md, check every requirement is implemented and the listed edge cases have tests, report gaps that affect correctness and skip style"
> "Don't drop the `skip style` part of that prompt. A reviewer that's asked to find problems will always find *something*. If you fix every finding, you end up with extra abstraction layers and tests for cases that can't happen."

**A4. What subagents are for, and what they do not buy you.** Same page, verified.
> "And by default it's the same model (or a smaller one) on the same task. You get parallelism or a fresh pair of eyes out of it, but not a smarter answer."
> "Set `model: haiku` in a subagent's definition if its work is simple, like collecting the files that import a module or checking links in the docs."
> "a fresh subagent first has to gather context your conversation already had, so it can end up *slower* than doing the task where you are."
> "What you can stop doing" table: "Delegate to a subagent for a better answer | Handing the same task to a subagent doesn't make the answer any better. A fresh reviewer does help, because it hasn't seen your reasoning" and "Use subagents to protect your context window | Running out of context is rarely the problem anymore."
> "Describe your architecture and file layout in `CLAUDE.md` | Claude reads the repo itself. Only write down what isn't in there."

**A5. Fold subagents into one loop unless you need fresh context, parallelism or verification.**
Source: Claude Platform resources, "Building agents: When to fold subagents into your main agent loop", Diane Sarkis, **Oct 22, 2026** (in window). https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop. Verified via fetch. The excerpts are fetch-tool extractions, so the wording may differ slightly.
> Subagents are "effective at verification, parallel work, and modular permissioning."
> "for longer-running agents, we want the context from several different tasks to sit in the main context window."
> Keep subagents when "A single agent loop hits measurable performance degradation from context bloat" or "Multiple tasks need to be tackled in parallel with fresh context windows that can be discarded once the task is done".
> Split "by context". Splitting by problem type creates a "telephone game" where fidelity degrades at each handoff.

**A6. The advisor tool is the escalation pattern as a product feature.**
Source: Claude Code docs, *Escalate hard decisions with the advisor tool*, https://code.claude.com/docs/en/advisor. Undated; the pairing table includes Opus 5.5 and Fable 5.1. Verified.
> "The advisor tool lets Claude consult a second, typically stronger model at key moments during a task, such as before committing to an approach, when stuck on a recurring error, or before declaring a task complete. The advisor receives the full conversation, including every tool call and result"
> "Sonnet main + Opus advisor | Sonnet handles routine work and escalates planning, ambiguous failures, and completion checks to Opus"
> "Subagents inherit the configured advisor and apply the same pairing check against their own model."
> "There is no setting to cap or force advisor calls"
> Requirement: "Anthropic API only ... not available on Amazon Bedrock, Claude Platform on AWS, Google Cloud's Agent Platform, or Microsoft Foundry". It is also off when feature-flag fetching is disabled (e.g. `DISABLE_TELEMETRY`). The underlying API tool is beta (`advisor-tool-2026-03-01`). Its API docs list beta availability on the Claude API, Claude Platform on AWS and Google Cloud (Anthropic managed). **That conflicts with the Claude Code page**, which excludes Claude Platform on AWS. The Claude Code changelog v2.1.300 (Oct 14, 2026) says "Added `/advisor` on Claude Platform on AWS". The newer changelog entry suggests the Claude Code docs page lags here **(unverified which is current)**.
> Claude Code changelog dates: `/advisor` text form for `-p`/Agent SDK in v2.1.260; Sonnet 5.5 can advise Opus 4.7/4.8 from v2.1.287 (released 2026-10-01, GitHub release API).

**A7. Dynamic workflows: the harness's own fan-out primitive, with advisory size guidelines.**
Source: Claude Code docs, *Orchestrate subagents at scale with dynamic workflows*, https://code.claude.com/docs/en/workflows. Undated. Verified.
> Size guideline: "`small` | Fewer than 5 agents"; "`medium` | Fewer than 10 agents"; "`large` | Fewer than 50 agents". "The default is `medium`, or `small` when you're signed in on a Pro plan". The guideline is "advice, not a cap".
> "Up to 16 concurrent agents by default ... set `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` to a value from 1 to 256".
> "A workflow fits best when the task is larger than one agent can hold in context, or when the same step needs to run across many items."
> "No mid-run user input ... For sign-off between stages, run each stage as its own workflow".
> Changelog: v2.1.219 (released 2026-07-24) "aim for fewer than 15 agents". v2.1.271 (released 2026-09-14) "lowered the medium size guideline from 15 to 10 agents". Release dates are from the GitHub releases API.

**A8. Plan mode exists and is maintained, but is not in the best-practices flow.**
Source: Claude Code docs, *Permission modes*, https://code.claude.com/docs/en/permission-modes (collector-verified; I did not re-fetch). The changelog is in window: fixes in v2.1.290, 2.1.292 and 2.1.299 (Oct 5 to 14, 2026).
> "Plan mode tells Claude to research and propose changes without making them."
The `opusplan` alias "uses `opus` during plan mode, then switches to `sonnet` for execution" (model-config docs, verified).

**A9. A `verify` skill is a recognised hook point.** Claude Code changelog v2.1.286 (released 2026-09-30), verified in the raw CHANGELOG.md:
> "when your project or user skills include one named `verify`, Claude is now told to run it right before committing, except for docs-only and tests-only commits"

**A10. How Anthropic's own engineers work (the only in-window engineering post).**
Source: "Redesigning source control at Anthropic", Oct 13, 2026 (updated Oct 15). https://www.anthropic.com/research/redesigning-source-control. Verified. It says nothing about planning or specs.
> "the role of the engineers was to tell Claude "no.""
> "Agents will sometimes violate core system constraints to satisfy a pattern"
> "they now examine the _intent_ of the change as opposed to reading every line of code."
> "Anthropic also makes extensive use of adversarial review"

**A11. Background, outside the window: Anthropic's harness-design post, Mar 24, 2026.** https://www.anthropic.com/engineering/harness-design-long-running-apps. Verified.
> The planner was told to "stay focused on product context and high level technical design rather than detailed technical implementation". The reason given: "the errors in the spec would cascade into the downstream implementation."
> With Opus 4.6 the sprint construct was removed because "the model could natively handle the job without this sort of decomposition", and with a single final evaluator pass, "for tasks within that boundary, the evaluator became unnecessary overhead."
> "every component in a harness encodes an assumption about what the model can't do on its own" and these assumptions "can quickly go stale as models improve."

### OpenAI

**O1. Plan mode for complex or ambiguous work; PLANS.md optional for long work.**
Source: Codex *Best practices*, https://learn.chatgpt.com/guides/best-practices (redirected from developers.openai.com/codex/learn/best-practices). Undated; names GPT-6.1 Sol / GPT-6 Luna. Verified.
> "If the task is complex, ambiguous, or hard to describe well, ask Codex to plan before it starts coding."
> "Use Plan mode: For most users, this is the easiest and most effective option."
> "you can configure Codex to follow a `PLANS.md` or execution-plan template for longer-running or multi-step work."
> "When Codex makes the same mistake twice, ask it for a retrospective and update `AGENTS.md`."
> "A short, accurate `AGENTS.md` is more useful than a long file full of vague rules."
> "At OpenAI, Codex reviews 100% of PRs." **(vendor claim, no method or data given)**

**O2. The ExecPlan recipe is archived and specifies behaviour, not code.**
Source: OpenAI Cookbook, "Codex Exec Plans", https://developers.openai.com/cookbook/articles/codex_exec_plans. Undated, no author. Verified.
> The page states the recipe "is archived and may reference outdated models or APIs."
> "Err on the side of over-explaining user-visible effects and under-specifying incidental implementation details."
> "Each milestone must be independently verifiable and incrementally implement the overall goal of the execution plan."
> "it should always be possible to restart from _only_ the ExecPlan and no other work."
> Required living sections: "Progress", "Surprises & Discoveries", "Decision Log", "Outcomes & Retrospective". "Validation is not optional."
The archive date is not shown **(unverified when it was archived)**.

**O3. Long-running work is now framed as a goal with completion criteria, not a plan.**
Source: Codex docs, *Long-running work*, https://learn.chatgpt.com/docs/long-running-work.md. Undated. Verified.
> "If the outcome is still unclear, start with `/plan`."
> "The goal text becomes both the first prompt and the completion criteria for the task."
> "Add tests, measurements, or review criteria that prove the work is complete."
The page does not mention milestones or specs. `/goal` launched experimental in Codex CLI 0.128.0 (Apr 30, 2026) and went GA on May 21, 2026, according to secondary coverage only **(unverified against OpenAI release notes)**.

**O4. Subagents: parallelise reads, be careful with parallel writes.**
Source: Codex docs, *Subagents*, https://learn.chatgpt.com/docs/agent-configuration/subagents.md. Undated. Verified.
> "As a starting point, use parallel agents for read-heavy tasks such as exploration, tests, triage, and summarization."
> "Be more careful with parallel write-heavy workflows, because agents editing code at once can create conflicts"
> "subagent workflows consume more tokens than comparable single-agent runs."
> `gpt-6-luna`: "Use for fast, narrowly scoped agents handling clear, repeatable, or high-volume work."
The concurrency default is not stated ("Codex chooses the default"). The example config uses 8.

**O5. Review guidance.** Codex docs, *Working with agents*, https://learn.chatgpt.com/docs/working-with-agents.md. Undated. Verified.
> "Fluent writing or a confident summary is not enough to establish that a task succeeded."
> "Match the depth of review to the consequences."

**O6. Background, outside or undated: the long-horizon Codex blog.** https://developers.openai.com/blog/run-long-horizon-tasks-with-codex. No date or byline on the page. It references GPT-5.3-Codex, so it predates the window. Verified.
> Artifacts: prompt.md (spec), plans.md, implement.md, documentation.md.
> plans.md: "Milestones small enough to complete in one loop" and "Acceptance criteria + validation commands per milestone."
> "Run validation after each milestone (fix failures immediately)."
> The spec's purpose: "Freeze the target so the agent doesn't 'build something impressive but wrong.'"

**O7. Background, Feb 2026: "Harness engineering" (openai.com/index/harness-engineering).** The primary page returned HTTP 403. The following is known only from InfoQ (Feb 21, 2026): a docs directory of "maps, execution plans, and design specifications" as "the single source of truth for agents". These are **(unverified against primary)**.

---

## 2) Measured results

| Result | Source and date | Notes |
|---|---|---|
| Solo run 20 min / $9 vs full planner-generator-evaluator harness 6 h / $200 ("over 20x more expensive"); quality difference "immediately apparent" but not scored | Anthropic harness-design post, Mar 24, 2026 (background) | Opus 4.5 era. v2 harness on Opus 4.6: 3 h 50 min, $124.70, no solo baseline |
| Sonnet 4.6 + Opus 4.6 advisor vs Sonnet alone: +2.7 pp SWE-bench Multilingual, −11.9% cost per task | "The advisor strategy", claude.com/blog, Apr 9, 2026 (background) | 5 trials × 300 problems. Vendor-run benchmark |
| Haiku 4.5 + Opus advisor: BrowseComp 41.2% vs 19.7% solo; trails Sonnet solo by 29% but costs 85% less | Same | Vendor-run |
| Advisor `max_tokens` 2048 cut advisor output about 7x with "no detectable quality degradation" (n = 40 per configuration) | Advisor tool API docs, undated/current | Small n; "within noise" |
| "Sonnet executor at medium effort with an Opus advisor achieves intelligence comparable to Sonnet at default effort, at lower cost" | Same | No figures given **(unquantified)** |
| Single agent loop about 2x faster than a multi-agent harness (one customer); single agents with skills often lower cost and latency | Anthropic, Oct 22, 2026 | One customer; method not given |
| Claude Code system prompt cut "by over 80%" for advanced models; tool choice degrades past 30 to 50 tool definitions | Same | Relevant to per-agent tool pruning |
| Anthropic merged changes: about 2,500/day (May 2026) to over 30,000/day (Sep 2026) | Anthropic source-control post, Oct 13, 2026 | The post does not say what share is agent-authored |
| Codex: 25 h uninterrupted, about 13M tokens, about 30k LOC with a spec plus milestone plan | OpenAI long-horizon blog (undated, pre-window) | Single demo run |
| Self-evaluating loop: 56% of "improvement" cycles had zero or negative delta; strongest in-band judge accepted 44% regressions and rejected 38% of real improvements; the mirage fell to zero where success is verifiable from the artifact | arXiv 2607.25152, Park & Choi, v1 Jul 27, v2 Sep 29, 2026 | Not a lab source. The abstract confirms the direction; the percentages are collector-quoted |

No source measures **detailed-code plans vs spec-only plans**, or **the number of reviewer passes vs defects found**. These are gaps.

---

## 3) Where sources disagree

1. **Is plan mode a default step?** OpenAI says "Use Plan mode: For most users, this is the easiest and most effective option" for complex or ambiguous tasks. Anthropic's best-practices page omits plan mode and instead uses an interview to write `SPEC.md`, then a fresh session. The two agree on the substance: settle intent before building. They differ on the artifact (an ephemeral plan vs a persistent spec).
2. **Living execution plans.** The ExecPlan recipe requires a plan you can "restart from _only_". It is now marked archived, and OpenAI's newer long-running-work page frames long work as `/goal` with completion criteria. I give the newer, primary `/goal` framing more weight as current OpenAI direction. The archive notice could also just reflect outdated model references **(unverified intent)**.
3. **Many agents vs one loop.** Anthropic's workflows docs promote "dozens to hundreds of agents" and ultracode, which can turn one request into several workflows. Anthropic's Oct 22, 2026 article says single loops "often" win on quality, cost and latency. The two reconcile through the workflows page's own rule: use a workflow when "the task is larger than one agent can hold in context, or when the same step needs to run across many items." The newer article is more conservative, and the size-guideline default was lowered from 15 to 10 on Sep 14, 2026, which points the same way.
4. **Is an evaluator worth it?** Anthropic (Mar 2026) found the evaluator "unnecessary overhead" for tasks within the model's solo ability and "worth the cost" beyond it. The Oct 2026 docs still recommend a fresh reviewer and warn that reviewers "always find *something*". Both say to gate verification by difficulty and scope it to correctness.
5. **Advisor availability.** The Claude Code advisor page excludes Claude Platform on AWS. Changelog v2.1.300 (Oct 14, 2026) added it there. I prefer the newer changelog **(unverified)**.
6. Minor: the Claude Code 2.1.317 release date is given as Nov 3 (official docs) vs Nov 2 (ClaudeWorld). I prefer the official docs.

---

## 4) Implications for kentra-rpir

These follow from the evidence above. Where a point is inference rather than a source statement, it says so.

1. **The full-code-in-steps milestone plan is the part of kentra-rpir least supported by either lab.** Every relevant lab source keeps plans at the level of behaviour and acceptance:
   - Anthropic's planner was kept to "high level technical design rather than detailed technical implementation", because errors would cascade.
   - ExecPlan: "under-specify incidental implementation details".
   - Codex long-horizon plans hold milestones, acceptance criteria and validation commands, not code.
   - Anthropic: "Claude reads the repo itself."

   Inference: a plan holding the full code mostly does the implementer's job at Opus planning cost, then pays again for plan review and verification of that code. A lighter alternative consistent with both labs:
   - keep spec plus spikes;
   - reduce the plan to a milestone DAG where each milestone has its scope and file boundaries (needed for parallel worktrees), acceptance criteria, validation commands, and the spike findings it depends on;
   - let implementers read the code.
2. **Keep milestones for parallelism and checkpoints, not for prescription.** OpenAI's guidance supports milestones as "independently verifiable" checkpoints. It also says to be "more careful with parallel write-heavy workflows". Kentra's worktree isolation addresses that, so the decomposition into non-conflicting milestones is the part of the plan that still earns its cost.
3. **Implementer-plus-advisor needs no custom agent.** Claude Code's advisor tool provides it:
   - "Sonnet main + Opus advisor" is the documented pairing;
   - it reads the full conversation, so no context handoff is needed;
   - subagents inherit it.

   This matches the user's proposal and their "single agent holds the context" idea. Caveats:
   - it is experimental;
   - it runs only on the Anthropic API;
   - it is off when telemetry or flag fetching is disabled;
   - call frequency cannot be capped or forced in Claude Code.

   Kentra could set `advisorModel: opus` and have Sonnet implementers run with it, instead of escalating to a separate Opus agent. Inference: this could replace part of the escalation ladder and some plan detail, because the implementer can consult Opus at the moment it hits an ambiguity.
4. **Verification: keep one fresh, spec-scoped reviewer and ground it in executable checks.**
   - Both labs endorse a fresh reviewer and require evidence ("the command it ran and its output").
   - Anthropic warns that reviewers "always find *something*", so prompts should say "report gaps that affect correctness and skip style".
   - The harness post says evaluators are overhead for tasks within the model's solo ability.
   - The arXiv paper shows in-band judges are unreliable unless success is checkable from the artifact.

   Inference: tier verification by milestone risk instead of a fresh Opus verifier on every milestone. Tests, typecheck and a `verify` skill come first; an Opus reviewer is added where acceptance cannot be checked mechanically; the advisor's "before declaring a task complete" consult may cover low-risk milestones. Measure this against kentra's own retro data. No external source gives catch rates per reviewer stage.
5. **Limit parallel reviewers and agents.** Anthropic's own default size guideline is under 10 agents (medium) and under 5 (small), and was lowered in Sep 2026. Workflows run 16 concurrent agents by default; Codex's example uses 8 threads. A configurable cap of about 4 parallel plan reviewers is within the range the labs ship as defaults. No source gives an optimal number.
6. **Model tiering matches the docs:**
   - Haiku for "simple jobs" and lookups;
   - Sonnet for routine implementation;
   - Opus as the default for most coding, and as advisor or reviewer.

   Anthropic also says delegation does not make answers smarter, so dispatching a subagent should be justified by parallelism, fresh eyes, noise isolation or tool restriction.
7. **Tool pruning per agent is officially recommended.** Examples: "only `tools: Read, Grep, Glob`" for reviewers, "fewer tools than the main session", tool choice degrading past 30 to 50 tool definitions, and an 80% system-prompt cut. This supports the separate harness-bloat analysis.
8. **Keep the retro, keep it light.** OpenAI: "When Codex makes the same mistake twice, ask it for a retrospective and update `AGENTS.md`". ExecPlan has an "Outcomes & Retrospective" section. Neither lab describes transcript-mining retros, so kentra's version goes further than either documents.

---

## 5) Open questions the sources do not settle

- No lab measures the quality or cost of a code-level plan against a spec-plus-acceptance-criteria plan for parallel implementers. Kentra's own run data is the only way to answer this.
- No catch-rate or overlap data for stacked verifiers: plan reviewer vs implementer self-check vs fresh milestone verifier.
- How often the advisor fires inside subagents in practice, and its cost there. Claude Code exposes no cap. The API `max_uses` is per request only.
- Whether OpenAI archived ExecPlans because they are superseded (by `/goal` or plan mode) or only because of stale model references.
- No in-window first-party talk or post from either lab on internal planning practice was found. Code with Claude (May 6, 2026) and OpenAI DevDay (Sep 29, 2026) were checked through search only. The DevDay recap page returned HTTP 403, and no planning-specific session transcript was found **(unverified that none exists)**.
- Whether `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` (v2.1.296, released 2026-10-09: "run every workflow agent on one model while other subagents keep theirs") overrides per-`agent()` model choices or only sets a default. The changelog wording is ambiguous **(unverified)**. This matters for whether workflow model tiering is honoured.

## Sources (all fetched 2026-11-05 unless noted)

- https://code.claude.com/docs/en/best-practices (undated, current lineup)
- https://code.claude.com/docs/en/advisor (undated, current lineup)
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool (undated, beta)
- https://code.claude.com/docs/en/workflows (undated)
- https://code.claude.com/docs/en/model-config (undated; `opusplan`)
- https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md plus GitHub releases API dates (v2.1.202 2026-07-06, v2.1.219 2026-07-24, v2.1.271 2026-09-14, v2.1.286 2026-09-30, v2.1.287 2026-10-01, v2.1.296 2026-10-09, v2.1.300 2026-10-14)
- https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop (Oct 22, 2026)
- https://claude.com/resources/articles/message-threads (Nov 2, 2026; threads cut median TTFT about 35% at 500k to 1M tokens)
- https://www.anthropic.com/research/redesigning-source-control (Oct 13, 2026)
- https://www.anthropic.com/engineering/harness-design-long-running-apps (Mar 24, 2026, background)
- https://claude.com/blog/the-advisor-strategy (Apr 9, 2026, background)
- https://learn.chatgpt.com/guides/best-practices (undated, GPT-6.1 era)
- https://learn.chatgpt.com/docs/long-running-work.md (undated)
- https://learn.chatgpt.com/docs/agent-configuration/subagents.md (undated)
- https://learn.chatgpt.com/docs/working-with-agents.md (undated)
- https://developers.openai.com/cookbook/articles/codex_exec_plans (undated, marked archived)
- https://developers.openai.com/blog/run-long-horizon-tasks-with-codex (undated, pre-window)
- https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/ (Feb 21, 2026, secondary, background)
- https://arxiv.org/abs/2607.25152 (Jul 27 / Sep 29, 2026, not a lab source)
