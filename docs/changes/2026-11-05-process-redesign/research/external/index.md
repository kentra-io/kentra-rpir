# Planning research: cross-topic index

## Purpose and date

- **Date:** 2026-11-05. Current practice means sources from 2026-07-05 to 2026-11-05. Older sources count as background and carry their date.
- **Question:** Does kentra-rpir still need its strict planning process (spec, research spikes, a milestone plan with full code in each step, parallel Sonnet implementers with fresh Opus verifiers, transcript retro)? How should its agent roles change for cost and quality?
- **Source of truth:** the five reports linked below. This index only summarises them. Vendor figures are self-reported unless a row says otherwise.

## Topics

| Topic | Key facts | Strongest in-window evidence |
|---|---|---|
| [Modern planning](modern-planning.md) | No source recommends full code in plan steps. Vendors are cutting plan machinery: Claude Code removed ultraplan (v2.1.222, 2026-08-04), and Codex turned `update_plan` off by default (rust-v0.152.0, 2026-09-01). Claude Code's creator said plan mode "is no longer useful" to him with Opus 5.5 (HN, about 2026-09-26). Every source keeps a spec, a runnable check and an independent reviewer. Asana is shrinking its specs and says detail "repeated the code". | arXiv 2609.20804 (2026-09-17, open models, in-loop plan tool): planning lifts weak models (13.6% to 25.2%) and cuts cost about 30% for strong models with accuracy flat. Asana: +38% PRs per week, uncontrolled. |
| [Labs' own workflows](labs-own-workflows.md) | Neither lab has an in-window post on how its own teams plan. Anthropic's docs flow is interview, SPEC.md, fresh session, check, then a fresh reviewer against the spec, with no plan mode. OpenAI's ExecPlan recipe is archived and already said to "under-specify incidental implementation details". The advisor tool already provides the Sonnet-plus-Opus-advisor pattern. Anthropic (2026-10-22) recommends one loop with skills and splitting work by context. The workflow medium size guideline was lowered from 15 to 10 agents (2026-09-14). | Anthropic 2026-10-22: one customer ran about 2x faster with a single loop (anecdote). Claude Code's system prompt was cut by more than 80%, and tool choice degrades past 30-50 tools. |
| [Software factories](software-factories.md) | Kiro (2026-09-18, 2026-10-26): 1,000 PRs in 7 days with no plan artifact. Kiro sizes design to complexity, auto-merges the simple tier, and leans on deterministic CI with 80+ checks. Kiro's blocking-finding bar: "concrete location, quoted evidence, a trigger, and a consequence". Cognition Fusion: a frontier lead plus a persistent cheap sidekick that exchange only briefs. Factory Droid 1.0 cut its prompt 37% and its up-front tools from 11 to 2. HumanLayer (originator of RPI) joined Factory on 2026-11-04. | Cognition (2026-07-13): Fable 5 + sidekick scored 60.7 vs 60.8 alone at -54% cost. arXiv 2608.25202: detail in specs helps agents but makes specs decay. |
| [Agent role patterns](agent-role-patterns.md) | The advisor is set per session and subagents inherit it. No frontmatter field can turn it off, there is no cap, and each call re-reads the whole transcript uncached. Opus 5.x advisors return encrypted advice, so the retro may not be able to read it. The advisor is not an independent verifier. `SendMessage` resumes a subagent with its full history, but the implement skill re-dispatches a new implementer. Explore no longer runs on Haiku. To cap reviewers, chunk `parallel()` in `self-review.js`; fewer reviewers covering several milestones each cuts tokens. | MS-Eval arXiv 2610.22869 (2026-10-16): delegation gave Claude-Sonnet-5 negative returns (cost utility 34.1%, where 50% is parity). Advisor +2.7 pp at -11.9% cost is from 2026-04 on 4.6 models (background). |
| [Agentic verification](agentic-verification.md) | Fresh-context checkers are standard practice. Reviewer direction matters. An ungrounded LLM judge is unreliable. "A reviewer asked to find problems will always find something", and developers rejected 56.3% of agentic review comments. A few reviewers with distinct questions beat many reviewers of the same kind. Red-green instructions inside the implementer's loop show no gain, while a separate tester agent does help. Verification intensity should scale with model strength. | arXiv 2607.21656: Claude reviewing Codex drafts raised pass rate 71.6% to 89.7%; Codex reviewing Claude dropped it 91.4% to 82.8%. arXiv 2607.25152: the best judge accepted 44% of regressions, and the gap fell to 0 where success was checkable from the artifact. Jain (2026-10-13): the harness cost 6.6x for a frontier model with no gain, and took a cheap model from 3/10 to 10/10. |

## How the topics compare

### Where they agree

| Point | Reports that support it |
|---|---|
| Remove full code from plan steps. Write each milestone as a contract: goal, files, interfaces, acceptance criteria, validation commands, risks. | modern-planning, labs, factories (all; no counter-source) |
| Keep the spec and the research spikes. Shrink the spec once the code exists. | modern-planning, labs, factories |
| Keep the milestone DAG for parallel worktrees and checkpoints. | modern-planning, labs, factories |
| Scale the number of stages to the change: brief only, spec plus spikes, or the full DAG. | modern-planning (Asana), factories (Kiro, Factory), labs (gate evaluators by difficulty) |
| Keep a fresh verifier that does not share the builder's context, prompted for correctness gaps against the spec, skipping style, and required to show evidence. | all five |
| Prune each agent's toolset. | labs, factories, verification |
| Use fewer, longer-lived agents, and split work by context rather than by problem type. | labs, roles, verification |

### Where they compete or conflict

| Issue | Position A | Position B | Note |
|---|---|---|---|
| Agent topology | Cheap executor plus frontier advisor (Anthropic advisor tool; this matches the user's proposal) | Frontier lead plus persistent cheap sidekick (Cognition Fusion, the newer source) | No head-to-head comparison exists (factories) |
| A verifier on every milestone | Keep one fresh Opus verifier per milestone (verification, roles) | Tier by risk: CI first, Opus only where checks can't be mechanical (labs, factories) | Jain's data: verification pays off around Sonnet, not around Opus |
| Advisor as a fix | Cuts NEEDS_CONTEXT, BLOCKED and FAIL re-dispatches (modern-planning, labs) | Inherited by every subagent, uncached cost grows with transcript length, encrypted advice (roles) | `SendMessage` resume keeps context without the advisor (roles) |
| Contract-level plans vs implementer rules | Plans without code (planning, labs, factories) | Implementers are told "Do not explore the codebase" (roles, plugin source) | Dropping code means implementers must read the repo |
| Splitting plan review | One reviewer per milestone, with a cap of about 4 (labs: within shipped defaults) | Split reviewers by question, not by slice; fewer reviewers each covering several milestones (verification, roles) | A cap limits concurrency, not tokens |
| Judge then triage | Two sequential LLM passes | One proof-required verify step, with triage only sorting proven findings (verification) | Anchoring is opinion; no measurement |

### Factual conflicts between reports

| Fact | Conflict | Current reading |
|---|---|---|
| Subagent nesting default | v2.1.217 turned nesting off (verification); live docs say 3 levels (planning, roles) | Live docs win; the changelog step is unverified |
| Advisor on Claude Platform on AWS | The docs exclude it; changelog v2.1.300 added it (labs) | Unverified |
| Baseline for the advisor's -11.9% | Sonnet solo (primary blog) vs Opus solo (Builder.io) | Primary: Sonnet solo (roles) |
| Current OpenAI Sol version | GPT-5.6 Sol vs GPT-6.1 Sol (planning) | Unverified |

## Consolidated open questions

| # | Question | How to settle it |
|---|---|---|
| 1 | Do full-code plan steps beat contract-level milestones on defects, rework and tokens for Sonnet 5.5 implementers? | A/B one change; kentra retro data |
| 2 | What does each verification stage catch (plan reviewer, implementer's judge, Opus milestone verifier, triage), and how much do the stages overlap? | The verification-analysis workflow, from kentra transcripts |
| 3 | Sonnet 5.5 + Opus 5.5 advisor: call rate, cost on long transcripts, and effect on re-dispatches | Pilot on about 10 golden tasks, each run more than once; `/usage` per milestone |
| 4 | Can the advisor be set or turned off per agent, or by a plugin? Do workflow `agent()` calls inherit it, nest, or resume? | Test in Claude Code |
| 5 | Is advisor advice readable in session JSONL, so the retro can see it? | Inspect a transcript |
| 6 | Advisor topology vs Cognition-style frontier lead with a sidekick, on the same tasks | Kentra eval |
| 7 | Haiku lookups feeding a Sonnet worker vs Sonnet searching for itself | Kentra eval; MS-Eval warns about unnecessary delegation |
| 8 | Quality effect of capping reviewers, or merging per-milestone reviewers | Kentra eval |
| 9 | Does `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` override per-`agent()` model choices? | Test, or read the changelog for v2.1.296 |
| 10 | What does HumanLayer's QRSPI revision of RPI say? Is there a primary source? | Find the talk transcript |
| 11 | Does arXiv 2609.20804's finding hold for frontier models and upfront plans? | No source; inference only |
