# Planning for complex production systems built by coding agents

Research date: 2026-11-05. Window for current practice: 2026-07-05 to 2026-11-05. Sources from before the window are marked **BACKGROUND** with their date. Vendor marketing and partner testimonials are labelled as such.

**Question:** Does kentra-rpir still need its strict planning process: spec, then research spikes, then a detailed milestone plan with full code in each step, then parallel Sonnet implementers with fresh Opus verifiers, then a transcript retro? And how should its agent roles change for cost and quality?

## Bottom line

1. **No in-window source from Anthropic, OpenAI or a practitioner org recommends plans that contain full code.** The closest primary guidance says the opposite. OpenAI's ExecPlan template (BACKGROUND, undated, now marked archived) says to "under-specify incidental implementation details". Anthropic's harness post (BACKGROUND, 2026-03-24) kept its planner at "high level technical design" because errors in granular detail "would cascade". Asana (2026-09-16) found detailed specs repeated the code and warned about "code written in prose".
2. **The vendors are pulling back on plan artifacts and plan gates, but planning itself stays.** In the window:
   - Claude Code removed ultraplan (v2.1.222, 2026-08-04).
   - Codex CLI turned its `update_plan` tool off by default (v0.152.0, 2026-09-01).
   - Claude Code's creator wrote that plan mode "was useful, and is no longer useful" for him with Opus 5.5, because "planning had become interactive and iterative" (HN, about 2026-09-26).

   What every source keeps is a spec or definition of done, a check the agent can run, and an independent reviewer.
3. **The only controlled in-window study (arXiv 2609.20804, 2026-09-17) found that planning raises accuracy for weak models and mostly cuts cost for strong ones, with accuracy about the same.** It tested open models and an in-loop planning tool, not frontier Claude/GPT models or upfront plans. It is directional evidence only.
4. **Specs plus milestone decomposition are still widely used.** Spec Kit (v1.3.0, 2026-11-03), Kiro (plans in workflows, 2026-10-28), Asana's /spec-driven, OpenAI's plans.md and software factories all keep them. What is changing is plan granularity. Plans hold milestones, interfaces, acceptance criteria and validation commands. Code is left to the implementer.
5. **For roles, Claude Code now has a first-party advisor tool** (`/advisor`, the `advisorModel` setting, the `--advisor` flag). It is experimental and works on the Anthropic API only. It matches the "Sonnet implementer escalates to an Opus advisor" idea: the advisor reads the executor's full transcript server-side, so it does not need a fresh context. Subagents can spawn their own subagents up to three levels deep. Forks share the parent's prompt cache.

---

## 1. Current practice (claims with source, date, excerpt)

### 1.1 Vendors: Anthropic / Claude Code

| Claim | Source | Date | Verbatim excerpt |
|---|---|---|---|
| Ultraplan, the cloud planning feature, was removed. | Claude Code changelog (code.claude.com/docs/en/changelog), v2.1.222 | 2026-08-04 | "Removed ultraplan feature". The commands page now says: "`/ultraplan <prompt>` \| Removed. Use plan mode instead." |
| Claude Code's creator no longer uses plan mode. Planning happens interactively instead. | HN comment by bcherny ("[I work on Claude Code]") on "Plan mode is dead", news.ycombinator.com/item?id=49850929 | about 2026-09-26 (page showed "40 days ago"; parent story 2026-09-24) | "I broadly agree with the author's point: plan mode was useful, and is no longer useful." / "plan mode has always been a prompt — it has never changed the toolset" / "I realized that I wasn't using plan mode anymore because the model just got it, and because for the increasingly complex work I asked the model to do, planning had become interactive and iterative." / "With Opus 5.5, I feel Opus has gotten to that point too." / "plan mode isn't going away. You can always /plan or ask Claude to enter plan mode." |
| He explains complex diffs with artifacts after the fact, not plans before. | Same comment | about 2026-09-26 | "For complex diffs to core parts of the system, I will often ask it to make diagrams or even interactive demos so I can better understand the change and alternatives considered." |
| The official workflow is an interview, then SPEC.md, then a fresh build session, then review against the spec. It has no separate plan document. | Claude Code best practices (code.claude.com/docs/en/best-practices). The page is undated, but it names Opus 5.5 as the default, so it is current. | fetched 2026-11-05 | "Interview me until you could write the spec, then write it to SPEC.md." / "Once `SPEC.md` exists, start a fresh session to build from it, so the build begins with a clean context and a written definition of done." / "use a subagent to review the rate limiter diff against SPEC.md, check every requirement is implemented and the listed edge cases have tests" |
| Requirements for unattended runs: a definition of done, a check, and sign-off. A plan is not on the list. | Same page, "Let Claude run without you" | fetched 2026-11-05 | "Does it know what done looks like? A goal condition, a spec file, or a failing test it has to turn green." / "Can it check its own work? The test suite, a `Stop` hook, some kind of review step." |
| Older advice the docs now call unnecessary includes delegating to a subagent "for a better answer". A fresh reviewer is the exception. | Same page, "What you can stop doing" | fetched 2026-11-05 | "Every one of these was good advice when it was written. Most were workarounds for something the model couldn't reliably do yet". Table rows: "Delegate to a subagent for a better answer \| Handing the same task to a subagent doesn't make the answer any better. A fresh reviewer does help, because it hasn't seen your reasoning". "Tell Claude to keep going, loop until done \| ... Giving Claude a check to pass is different, and still worth doing." "Describe your architecture and file layout in `CLAUDE.md` \| Claude reads the repo itself." |
| Subagent cost guidance: use Haiku for simple collection, and remember that subagents cost tokens and sometimes time. | Same page, "Know what subagents cost" | fetched 2026-11-05 | "a fresh subagent first has to gather context your conversation already had, so it can end up *slower* than doing the task where you are." / "Set `model: haiku` in a subagent's definition if its work is simple" |
| `/goal` puts a separate evaluator on a verifiable end state. "Implementing a design doc until all acceptance criteria hold" is one of its listed uses. | code.claude.com/docs/en/goal | fetched 2026-11-05 | "`/goal` adds a separate evaluator that checks your condition after every turn, so completion is decided by a fresh model rather than the one doing the work." / "It doesn't run commands or read files independently" |
| An advisor tool exists in Claude Code. The executor consults a stronger model, which sees the full transcript. | code.claude.com/docs/en/advisor | fetched 2026-11-05 | "The advisor receives the full conversation, including every tool call and result, and returns guidance". Pairing table row: "Sonnet main + Opus advisor \| Sonnet handles routine work and escalates planning, ambiguous failures, and completion checks to Opus". "Subagents inherit the configured advisor and apply the same pairing check against their own model." "There is no setting to cap or force advisor calls". "experimental and requires the Anthropic API" |
| Subagents can nest, and forks share the parent's cache. | code.claude.com/docs/en/sub-agents | fetched 2026-11-05 | "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation." / "Because a fork's system prompt and tool definitions are identical to the parent, its first request reuses the parent's prompt cache ... a fork costs less than a fresh subagent for tasks that need the same context." |
| Anthropic engineers review the intent of a change, not every line. Adversarial review can push Claude to over-engineer. | "Redesigning source control at Anthropic", anthropic.com/engineering | 2026-10-13 | "they now examine the *intent* of the change as opposed to reading every line of code" / "Anthropic also makes extensive use of adversarial review" ... "it can also be myopic, so skilled engineers needed to steer Claude away from over-engineering parts of the system" / "Very often, we found that the role of the engineers was to tell Claude 'no.'" The post does not mention specs or design docs. |
| **BACKGROUND (2026-03-24).** The planner should stay at product and high-level design. Sprints were dropped with Opus 4.6. Planner and evaluator were kept. | "Harness design for long-running application development", anthropic.com/engineering | 2026-03-24 | "stay focused on product context and high level technical design rather than detailed technical implementation" / "the errors in the spec would cascade into the downstream implementation" / "every component in a harness encodes an assumption about what the model can't do on its own" / "I kept both the planner and evaluator, as each continued to add obvious value." On the evaluator: "It is worth the cost when the task sits beyond what the current model does reliably solo." |

### 1.2 Vendors: OpenAI / Codex

| Claim | Source | Date | Verbatim excerpt |
|---|---|---|---|
| The built-in planning tool is now off by default in Codex CLI. | github.com/openai/codex release rust-v0.152.0 (primary, checked with `gh`) | 2026-09-01 | "The planning tool is disabled by default; enable it with `tools.update_plan.enabled = true`. (#41744)" |
| A Codex lead at DevDay said users face "decision fatigue" over subagents and reasoning levels. | Simon Willison's live blog of OpenAI DevDay (secondary account of a talk) | 2026-09-29 | Thibault Sottiaux: people are "hitting decision fatigue over when to use subagents" ... "In six months we'll get back to the simplicity of a system that actually understands what you need." The live blog has no statements about planning or specs. |
| **BACKGROUND (undated, now archived).** In an ExecPlan the agent writes a self-contained, living plan and keeps incidental implementation detail out of it. | OpenAI Cookbook "Using PLANS.md for multi-hour problem solving", developers.openai.com/cookbook/articles/codex_exec_plans | undated; page says "This recipe is archived and may reference outdated models or APIs." | "Err on the side of over-explaining user-visible effects and under-specifying incidental implementation details." / "Every ExecPlan must enable a complete novice to implement the feature end-to-end without prior knowledge of this repo." / Required sections: "`Progress` ... `Surprises & Discoveries` ... `Decision Log` ... `Outcomes & Retrospective`" |
| **BACKGROUND (undated; references GPT-5.3-Codex as recent, so about early 2026).** Codex writes the plan itself from a spec, as milestones with acceptance criteria and validation commands. | "Run long horizon tasks with Codex", developers.openai.com/blog | undated | "Milestones small enough to complete in one loop"; "Acceptance criteria + validation commands per milestone"; "Stop-and-fix rule: if validation fails, repair before moving on"; the prompt told Codex "to treat the prompt/spec file as the full project specification and generate a milestone-based plan". No code appears in the plan. |

### 1.3 Practitioner organisations and field reports (in window)

| Claim | Source | Date | Verbatim excerpt |
|---|---|---|---|
| Asana runs a spec-centred harness that produces a spec, a plan, research.md and parallel task execution. After three months it is shrinking specs and the core. | Asana, "Spec-driven development: The Good Parts", Walter Li and Rohan Batra | 2026-09-16 | "a workflow harness with a spec at its center" / The workflow "orders tasks by dependency and keeps overlapping file changes in separate execution rounds" and "sends independent work to multiple agents in parallel" / Specs should "grow while the project is uncertain" and "shrink once the code can explain the implementation" / "much of that detail repeated the code" / Critics warn SDD can "turn a detailed spec into code written in prose" / "Use spec-first to agree on a direction" / next version to "move toward a smaller, more focused core" |
| A planning-product founder concluded that a separate plan stage stopped working. | Ayman Nadeem, "Plan mode is dead", aymannadeem.com (HN story, 593 points) | 2026-09-24 | "I think the biggest mistake I made was turning the plan into an artifact instead of designing a process for improved human understanding." / "Each decision the model could reliably make by itself was one fewer decision that needed to be surfaced." / "early users had surprisingly little appetite for that spec." / Replacement loop: "understand → act → inspect → clarify → adjust → act again". This is opinion; the post has no metrics. |
| Practitioners who still plan say they do it to catch wrong decisions before implementation. | HN thread on "Plan mode is dead" (item 49840054) | about 2026-09-24 | akersten: "It's useful because it let's me see the decisions the model will make before it wastes a ton of time implementing them." / wvenable: "plan mode lets me ensure that I have specified everything correctly before it gets built" / dmix: plain iteration "is just not as effective unless you're working on something simple or experimental." |
| Software factories run requirements, then specs or tickets, then PRs, then review agents. Humans approve the key decisions. | Igor Ostrovsky (co-founder/CTO, Augment), "Software Factories in September 2026", igoro.com | about 2026-09-10 | Factories have agents that "read and write artifacts such as specs, issues, and pull requests, while people approve key decisions." Vercel example: "The factory classified the request, wrote a specification, implemented and tested the feature, and opened a PR." The post does not discuss how detailed plans should be. |
| GitHub Spec Kit still ships specify, plan, tasks and implement, and has added a converge loop. | github.com/github/spec-kit README and releases (checked with `gh`) | v1.3.0 released 2026-11-03; MIT; 147,649 stars | "/speckit-plan ... /speckit-tasks /speckit-implement /speckit-converge" / "Repeat implement and converge until convergence reports `Converged`." v1.3.0 removed `/speckit.taskstoissues` from core. |
| Kiro workflows show a plan with an agent, model and effort level for each step. | kiro.dev/changelog | 2026-10-28 and 2026-11-03 | "Its plan shows each step's agent, model, effort, and first task." / "Workflows show their plan before starting." Vendor product notes. |
| Harness (vendor) says to keep specs in the repo. Its outcome figures are marketing. | harness.io blog | 2026-08-05, updated 2026-10-16 | "The solution is moving specs into code repositories." **Vendor marketing**, figures in §2. |
| Community advice replacing plan mode: a short brief with done criteria, validation, scope exclusions and guardrails. | MindStudio blog (secondary, vendor) | 2026-10-23 | The brief covers done criteria, validation, scope exclusions and guardrails. It suggests asking Claude to interview you first. This is low-authority commentary. |

### 1.4 Who still writes detailed plans, who dropped them, and what replaced them

- **Still write plans:**
  - Asana: spec plus plan plus research.md, with dependency-ordered parallel rounds. They are moving toward shorter specs.
  - Spec Kit and Kiro, which have tool-level plan and task stages.
  - OpenAI's long-horizon guidance (BACKGROUND): an agent-written milestone plan with validation commands.
  - HN practitioners who plan in markdown files for large features.
- **None of these show full code in plan steps.** The only full-code plan template found is the community "superpowers" writing-plans skill. Mirrors describe it as having "complete code in each step"; its current state is **(unverified)**, since only third-party mirrors were seen.
- **Dropped the plan gate:**
  - Claude Code's creator, for his own use.
  - Nuanced (Ayman Nadeem).
  - Claude Code dropped ultraplan.
  - Codex made `update_plan` opt-in.
- **What replaced it:** a spec or brief with a definition of done, interactive and iterative planning inside the loop, a verifiable check (`/goal`, tests, Stop hooks), an independent reviewer, and explanation artifacts after the change.

---

## 2. Measured results

| Result | Source | Quality |
|---|---|---|
| Planning on vs off, at 128k context with the full tool set. Nemotron-3 30B on SWE-Bench Verified: 13.6% → 25.2% success, cost $0.02 → $0.09. Nemotron-3 550B: 67.8% → 65.8%, $3.31 → $2.33 (about −30% cost). Mistral-Medium-3.5-128B: 69.0% → 68.6%, $4.65 → $3.14 (about −32%). For strong models "planning primarily improves stopping behavior by reducing redundant post-edit verification." | arXiv 2609.20804, "An Empirical Study of Harness Design for Coding Agents", 2026-09-17 (176 matched settings, SWE-Bench Verified and Terminal-Bench 2.1) | Controlled, but uses open-weight models only, no Claude or GPT. "Planning" means an in-loop `update_plan` tool, not an upfront human-reviewed plan. |
| /spec-driven PRs: +38% PRs per week. Implementation additions ×2.66 (+66% without an outlier window). Revert rate 1.2% vs 1.66%. 91% of about 150 migrations needed no revision. Shipped more than a month early. Spec creation took 30 minutes to several days. Guidance surfaced a useful question or boundary in 8 of 9 historical comparisons. | Asana, 2026-09-16 (7 engineers, 524 PRs, 4 months) | Uncontrolled, by the authors' own statement: "These comparisons weren't controlled". |
| Plan mode vs no plan for spreadsheet programming: "similar task outcomes with both tools". Plan mode reduced refinement and improved how users perceived the tool. | arXiv 2607.23670 (Microsoft authors, VL/HCC 2026), 2026-07-26 | User study, N=24, spreadsheet domain. |
| Agent success on 8 to 16 hour tasks with zero interventions rose from 10% (January) to 35% (July 2026). | OpenAI DevDay slide via Simon Willison live blog, 2026-09-29 | Secondary report of a vendor slide. Not specific to Codex. **(unverified)** against an OpenAI primary. |
| Opus 5.5 "uses fewer tokens per task, which nets out to a 40% drop in costs". Partners report about 40% fewer calls (Kiro), a third to half fewer steps (Lovable), and 20–25% fewer output tokens (Factory). | anthropic.com/news/claude-opus-5-5, 2026-09-22 | Vendor claim plus selected partner testimonials. |
| Sonnet executor + Opus advisor: +2.7 pp on SWE-bench Multilingual vs Sonnet alone, −11.9% cost per task. Haiku + Opus advisor on BrowseComp: 41.2% vs 19.7% for Haiku alone, but 29% below Sonnet solo at 85% lower cost. Advisor output is about 400–700 tokens per call. | claude.com/blog/the-advisor-strategy, 2026-04-09 (BACKGROUND, measured on older model generations) | Vendor-measured. Not re-measured for the 5.5 family. |
| Opus 4.5 frontend: solo run 20 minutes and $9, full planner/generator/evaluator harness 6 hours and $200. Opus 4.6 V2 harness (no sprints): 3 hours 50 minutes and $124.70. | Anthropic harness post, 2026-03-24 (BACKGROUND) | Single runs, author-reported. |
| A seven-person team built and migrated to a new source-control system in five months. | Anthropic, 2026-10-13 | Anecdotal. Not about planning. |
| Vercel's factory produced 25–35% of merged PRs and closed more than 75% of July's closed issues. | Via Ostrovsky, about 2026-09-10 (secondary) | Secondary. Vercel primary not checked. **(unverified)** |
| "Harness shipped 23% more features, reduced incidents by 44%, and achieved 45% AI ROI." | harness.io, 2026-08-05 | **Vendor marketing.** No baseline or method given. |
| BACKGROUND: one Codex run lasted about 25 hours, used about 13M tokens and produced about 30k lines, with GPT-5.3-Codex at Extra High reasoning. | OpenAI long-horizon blog (undated, about early 2026) | Single run, vendor. |

**No in-window study measures plans with full code against plans without code.** Nothing found compares quality or cost for full-code steps against milestone and acceptance-criteria plans for Claude 5.x or GPT-6-class implementers. Every claim on that point is inference.

---

## 3. Where sources disagree

1. **Is the plan gate dead?**
   - Bcherny (about 2026-09-26) and Nadeem (2026-09-24) say the separate plan stage no longer pays off.
   - HN practitioners (same thread) and Spec Kit and Kiro, which still ship plan stages, keep it.
   - The two sides differ on scope more than on facts. Bcherny says planning moved into the loop ("interactive and iterative"), and the practitioners value seeing decisions before implementation. Both are compatible with a spec that records decisions without a code-level plan.
   - The newer primary sources (Claude Code changelog 2026-08-04, Codex release 2026-09-01) favour lighter plan machinery.
2. **What does planning buy?**
   - Anthropic's harness post (BACKGROUND, March 2026) kept a planner because without it "the generator under-scoped".
   - arXiv 2609.20804 (September 2026, newer) finds in-loop planning is mostly a cost saver for strong models.
   - They measure different things: product-scope expansion vs an in-loop todo list. Scope and spec planning still has support. Step-level planning has the weakest support.
3. **Independent review.**
   - Claude Code docs say a fresh reviewer helps because it "hasn't seen your reasoning".
   - Anthropic's source-control post (2026-10-13) says adversarial review "can also be myopic" and drove over-engineering, so engineers had to say "no".
   - The harness post says an evaluator is worth its cost only beyond what the model does reliably solo.
   - None of these sources says to remove review. They disagree on how aggressive it should be.
4. **Model naming.**
   - Anthropic's Opus 5.5 table (2026-09-22) and Kiro (2026-10-30) list "GPT-5.6 Sol" and "GPT-6 Astra".
   - Simon Willison's DevDay live blog (2026-09-29) reports a "GPT-6.1 Sol" launch.
   - GPT-6-class models (Astra) exist. The exact current Sol version is **(unverified)**.
5. **Spec-driven development's standing.**
   - Asana reports positive but uncontrolled results.
   - Asana quotes outside critics calling SDD "emerging and contested". Thoughtworks put SDD in Assess (BACKGROUND, Nov 2025). Its placement in the 2026 Radar volumes is **(unverified)**.

---

## 4. Implications for kentra-rpir

This section is inference from the evidence above. Tags: [strong] means several primary sources agree, [moderate] means one primary source or consistent secondary sources, [weak] means extrapolation.

1. **Drop full code from plan steps.** [moderate]
   - Against it: OpenAI's ExecPlan (under-specify incidental detail), Anthropic's harness post (granular errors cascade), Asana ("code written in prose", detail "repeated the code").
   - For it: nothing in the window.
   - Full code also makes the plan reviewer and the milestone writers do implementation work twice. That is likely where much of the planning stage's token cost and review findings come from. Check this against kentra-rpir's own transcripts in the parallel analysis workflow.
2. **Keep the milestone DAG, but make each milestone a contract, not a script.** [moderate]
   - kentra-rpir runs parallel implementers in worktrees and merges them, so it still needs dependency order, file-overlap separation and interface contracts between milestones. Asana's dependency-ordered rounds and Kiro's per-step agent and model assignment are the same idea.
   - Per milestone, keep: goal, files and areas touched, interfaces and contracts it exposes or consumes, acceptance criteria, validation commands, and known risks. This is the shape of OpenAI's plans.md.
   - This makes the plan much smaller and the per-milestone plan review cheaper. It may make a per-milestone split review unnecessary.
3. **Keep the spec and the research spikes. Shrink the spec after use.** [strong]
   - Every source keeps a written definition of done: Claude Code SPEC.md, /goal conditions, Asana, Spec Kit, factories.
   - Spikes match Asana's research.md and Anthropic's "tell Claude what it can't see". Asana flagged that agent research was sometimes "vague, imprecise, or slightly wrong", which supports kentra-rpir verifying critical premises.
   - Asana's lesson is to let specs shrink to decisions, constraints and risks once the code exists. That fits kentra-rpir's retro stage.
4. **Implementers: give Sonnet 5.5 the decision space and an Opus advisor.** [moderate]
   - Claude Code's advisor tool is the first-party version of the "implementer escalates to advisor" pattern. The advisor sees the full transcript, so there is no context hand-off. It is billed at advisor rates only for its short outputs. Subagents inherit it.
   - This fits the user's aim of not multiplying fresh contexts better than spawning an Opus subagent.
   - Caveats: it is experimental and Anthropic-API-only. You cannot cap or force calls. Whether a plugin's agent definition can set its own advisor, instead of inheriting the session setting, is **(unverified)**. The measured gain (+2.7 pp, −11.9% cost) comes from older models.
5. **Lookups: nested Haiku subagents under the implementer are supported.** [moderate]
   - Up to three levels of nesting are allowed. Use them only for collection tasks with a definite answer. Docs warn a fresh subagent "has to gather context your conversation already had".
   - For side tasks that need the parent's context, forks reuse the parent's prompt cache and cost less than a fresh subagent.
6. **Verifiers: keep one independent verifier per milestone, against the spec, with a calibrated prompt.** [moderate]
   - Fresh-context review is the one kind of delegation the Claude Code docs still endorse.
   - Anthropic's source-control post warns adversarial review drives over-engineering. A "relaxed" prompt that reports only correctness gaps against the spec matches the docs' own example: "report gaps that affect correctness and skip style".
   - `/goal` is a cheap completion check, but its evaluator does not read files or run commands, so it cannot replace a verifier.
7. **Fewer stages, set by task size.** [moderate]
   - Asana's guidelines: a conversation or short plan for small changes, spec-first for direction, anchored specs only when decisions must survive handoffs.
   - kentra-rpir could offer tiers: brief only; spec plus spikes; spec plus spikes plus contract-level milestone DAG. The full pipeline would be reserved for multi-milestone parallel work.
8. **What the evidence does not support:** dropping the decomposition stage entirely for parallel multi-worktree builds. [weak]
   - Bcherny's and Nadeem's arguments come from a single interactive session with a human in the loop. kentra-rpir's parallel unattended implementers do not have that loop, so the interface contracts the plan provides do work that interactivity does for them.

---

## 5. Open questions the sources do not settle

1. No source in or out of the window measures full-code plan steps against contract-level milestones for Claude 5.x or GPT-6-class implementers, on quality, rework or total tokens. kentra-rpir's own transcript data is the only available evidence. An A/B test on one change is the cheapest way to settle it.
2. Does arXiv 2609.20804's "planning is a cost saver for strong models" hold for Opus 5.5 or Sonnet 5.5, and for upfront human-reviewed plans rather than an in-loop todo tool? Untested.
3. Can a Claude Code plugin agent definition set its own advisor model, or only inherit the session's `advisorModel`? How does the advisor interact with workflow-spawned agents? The docs read so far do not say. **(unverified)**
4. How does the advisor behave on Sonnet 5.5 executors (call rate, cost) compared with the April 2026 figures for older models? No updated numbers are published.
5. How much does fresh-verifier review find compared with what it costs, per stage? No public per-stage numbers exist. This belongs to the separate verification-analysis workflow.
6. Practitioner reports on which teams dropped milestone plans with code are thin. In the window there are only Asana (who are shrinking specs, not dropping plans) and anecdotes. Will Larson's "Trying the software factory pattern" (September 2026) was seen only through secondary summaries. **(unverified)**
7. Anthropic's and OpenAI's own internal planning practice for large systems is undocumented apart from the source-control post's "intent review". No in-window first-party post addresses plan granularity directly.

---

## Sources checked directly by the reasoner

- Claude Code changelog with dates: https://code.claude.com/docs/en/changelog (v2.1.222, 2026-08-04, "Removed ultraplan feature")
- Claude Code commands: https://code.claude.com/docs/en/commands.md (`/ultraplan` removed; `/advisor`)
- Claude Code advisor: https://code.claude.com/docs/en/advisor.md
- Claude Code best practices: https://code.claude.com/docs/en/best-practices
- Claude Code sub-agents: https://code.claude.com/docs/en/sub-agents
- Advisor tool API: https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
- Advisor strategy (2026-04-09): https://claude.com/blog/the-advisor-strategy
- Opus 5.5 announcement (2026-09-22): https://www.anthropic.com/news/claude-opus-5-5
- Redesigning source control (2026-10-13): https://www.anthropic.com/engineering/redesigning-source-control
- Harness design (2026-03-24, background): https://www.anthropic.com/engineering/harness-design-long-running-apps
- bcherny HN comment: https://news.ycombinator.com/item?id=49850929 ; thread: https://news.ycombinator.com/item?id=49840054
- Plan mode is dead (2026-09-24): https://www.aymannadeem.com/artificial/intelligence,/developer/tools/2026/09/24/plan-mode-is-dead.html
- Codex rust-v0.152.0 (2026-09-01): https://github.com/openai/codex/releases/tag/rust-v0.152.0
- OpenAI DevDay live blog (2026-09-29): https://simonwillison.net/2026/Sep/29/openai-devday-2026-live-blog/
- OpenAI PLANS.md cookbook (archived, undated): https://developers.openai.com/cookbook/articles/codex_exec_plans
- OpenAI long-horizon blog (undated): https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Asana (2026-09-16): https://asana.com/inside-asana/spec-driven-development
- arXiv 2609.20804 (2026-09-17): https://arxiv.org/abs/2609.20804
- arXiv 2607.23670 (2026-07-26): https://arxiv.org/abs/2607.23670
- Software Factories in September 2026: https://igoro.com/archive/software-factories/
- Spec Kit releases and README (checked with `gh`): https://github.com/github/spec-kit
- Kiro changelog: https://kiro.dev/changelog/
- Harness (vendor): https://www.harness.io/blog/engineering-for-the-agentic-era-how-to-spec-build-test-and-operate-ai-systems
