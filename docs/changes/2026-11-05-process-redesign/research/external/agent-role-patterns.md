# Multi-agent role patterns: advisor escalation, lookup sub-agents, limited fan-out

Research date: 2026-11-05. Window for current practice: 2026-07-05 to 2026-11-05. Older sources are labelled "background" with their date.

Claude Code and Claude Platform documentation pages carry no publication date. They were fetched on 2026-11-05 and their version notes go up to Claude Code v2.1.318 (November 4, 2026), so this report treats them as current practice. The reasoner checked every claim marked "verified" on the primary page. Collector claims the reasoner could not re-check are marked **(unverified)**.

## Summary for the decision

1. **The worker-plus-advisor pattern is a shipped Claude Code feature, not something kentra-rpir has to build.** Claude Code has an experimental advisor tool (`/advisor`, the `advisorModel` setting, `--advisor`). It works on subscription and API accounts, and subagents inherit it. A Sonnet implementer can consult Opus inside its own context instead of ending its turn with NEEDS_CONTEXT or BLOCKED.
2. **The advisor is not a verifier.** It reads the executor's full transcript, so it shares the executor's framing. Every source that discusses review recommends a reviewer that does **not** share the builder's context: Anthropic, January and October 2026, and Cognition, April 2026. Keep kentra-rpir's fresh verifier. Use the advisor to cut re-dispatches, not to replace verification.
3. **The advisor has three limits in Claude Code that matter for kentra-rpir.** It is configured per session, and no per-subagent switch is documented, so Opus verifiers and Haiku lookups inherit it too. Each call re-reads the whole transcript at the advisor's input rate, uncached. With an Opus 5 or later advisor, which is the only Opus a Sonnet 5.5 main accepts, the advice comes back encrypted, so the transcript retro cannot read what the advisor said.
4. **Measured evidence that the advisor pattern helps is vendor-only and from the previous model generation.** The figures are Anthropic's own, from April 2026, on Sonnet 4.6 and Opus 4.6: +2.7 pp on SWE-bench Multilingual and −11.9% cost per task. The reasoner found no independent replication and no in-window measurement.
5. **The in-window evidence on fan-out points one way: fewer, longer-lived agents.** Anthropic's October 22, 2026 article recommends one model and one context window, keeping a subagent only for verification, parallel work, and a few other named cases. An October 16, 2026 benchmark (MS-Eval) found that sub-agent delegation lowered Claude-Sonnet-5's performance, efficiency and cost utilities.
6. **Claude Code can keep context with one agent instead of re-spawning.** `SendMessage` resumes a finished subagent "with full conversation history", and forks share the parent's prompt cache. kentra-rpir's implement skill currently re-dispatches a **new** implementer for each NEEDS_CONTEXT, BLOCKED or FAIL round.

---

## 1. Current practice

### 1.1 Worker + advisor escalation

**Claude Code advisor tool.** Source: https://code.claude.com/docs/en/advisor (undated, current; fetched 2026-11-05). Verified.

- What it is: "The advisor tool lets Claude consult a second, typically stronger model at key moments during a task, such as before committing to an approach, when stuck on a recurring error, or before declaring a task complete. The advisor receives the full conversation, including every tool call and result, and returns guidance that Claude applies before continuing."
- Plans: "The advisor runs server-side on Anthropic's infrastructure as a server tool, available to both subscription and API-billed accounts."
- Status: "The advisor tool is experimental and requires the Anthropic API. It is not available on Amazon Bedrock, Claude Platform on AWS, Google Cloud's Agent Platform, or Microsoft Foundry. Behavior, pricing, and availability may change."
- How to turn it on: "`/advisor` command … `advisorModel` setting … `--advisor` flag". The headless/SDK form of `/advisor` "requires Claude Code v2.1.260 or later".
- Subagents: "Subagents inherit the configured advisor and apply the same pairing check against their own model."
- Who decides when to call it: "Claude decides when to call the advisor. … the timing is model-driven rather than rule-based." Also: "There is no setting to cap or force advisor calls; if you want Claude to consult more or less often during a task, say so in your instructions."
- Advice is not binding: "Claude generally follows the advisor's guidance, but adapts when its own evidence contradicts a specific claim … Claude surfaces the conflict rather than following the guidance unconditionally."
- Caching: "The advisor model's own read of the conversation is not cached. Each advisor call processes the full transcript anew, with no reuse between calls." Toggling the advisor "does not invalidate your main model's prompt cache".
- Cost: "Subscription plans: advisor usage counts toward your plan's usage limits". Also: "pairing a faster main model with a stronger advisor typically costs less than running the stronger model throughout." The second sentence is a vendor claim with no measurement on the page.
- Feature flag: "In a session where a variable that turns flag fetching off is set, such as `DISABLE_TELEMETRY`, the advisor stays off."
- Kill switch: "`CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1`".
- Pairings (excerpt of the table):

  | Main model | Accepted advisors |
  |---|---|
  | Sonnet 5.5 | Fable, Opus 5 or later, Sonnet 5.5 |
  | Sonnet 5 or Haiku 5.5 | Fable, Opus 4.7 or later, Sonnet 5 or later, Haiku 5.5 |
  | Opus 5 or Opus 5.5 | Fable, Opus 5 or later |

  Also: "Haiku 4.5 can call the advisor but can't act as one."
- Recommended pairing: "Sonnet main + Opus advisor | Sonnet handles routine work and escalates planning, ambiguous failures, and completion checks to Opus".

**API advisor tool.** Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool (undated, current; beta header `advisor-tool-2026-03-01`). Verified.

- Isolation: "The advisor itself runs without tools and without context management. Its thinking blocks are dropped before the result returns. Only the advice text reaches the executor."
- **Encrypted advice:** "Claude Sonnet 5.5, Claude Fable 5.1, Claude Mythos 5.1, Claude Opus 5.5, Claude Opus 5, Claude Fable 5, Claude Mythos 5, and Claude Haiku 5.5 advisors return the encrypted `advisor_redacted_result`." Also: "With `advisor_redacted_result`, the `encrypted_content` field contains an opaque blob that you cannot read." Plaintext advisors include "Claude Opus 4.8".
- When to call it, from the suggested coding prompt: "Call advisor BEFORE substantive work … Also call advisor: When you believe the task is complete … When stuck — errors recurring, approach not converging … When considering a change of approach."
- Caching on the API surface: "Caching breaks even at roughly three advisor calls". The API has a `caching` field and `max_uses`. Claude Code exposes neither (see above).

**Managed Agents.** Source: https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration (undated, beta `managed-agents-2026-04-01`, type `multiagent_20261001`). Verified.

- "The advisor is not a subagent. … Only the session's primary thread can consult it; subagents can't." This differs from Claude Code, where subagents inherit the advisor.
- "Each consultation sends the advisor the primary thread's conversation so far, so consultations late in a long session use more input tokens."
- "Delegation is one level deep, and a session can have at most 25 child threads at a time".

**Background: the advisor strategy blog.** Source: https://claude.com/blog/the-advisor-strategy, April 9, 2026 (background, vendor blog). Verified.

- "This inverts a common sub-agent pattern, where a larger orchestrator model decomposes work". The executor drives the task and escalates.

**Background: Cognition, "Multi-Agents: What's Actually Working".** Source: https://cognition.com/blog/multi-agents-working, April 22, 2026 (background, vendor blog). Verified.

- They tried a "smart friend" tool that "the primary/smaller model could make a call out to", and report: "SWE 1.5 was not good enough at being the primary model for this setup to really work." In other words, the escalating model must be strong enough to know when to escalate.

### 1.2 Cheap lookup sub-agents reporting to one agent

**Claude Code subagents.** Source: https://code.claude.com/docs/en/sub-agents (undated, current). Verified.

- "Use one when a side task would flood your main conversation with search results, logs, or file contents you won't reference again: the subagent does that work in its own context and returns only the summary."
- Explore no longer runs on Haiku: "Model: the main conversation's model." Also: "A user or project subagent named `Explore` overrides the built-in and keeps its own `model` field, so define one with `model: haiku` to run exploration on a lower-cost model."
- Nesting: "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation." `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` changes the limit.
- The subagent frontmatter fields are `name, description, tools, disallowedTools, model, permissionMode, maxTurns, autoCompactWindow, skills, mcpServers, hooks, memory, background, omitClaudeMd, effort, isolation, color, initialPrompt, experimental`. **There is no advisor field**, so a subagent cannot set or turn off its own advisor (inferred from the field list and the advisor page).
- Version history, per the collector's reading of the changelog **(unverified by the reasoner; the fetch reached only v2.1.304 onward)**:
  - 2.1.217 (July 21, 2026) added the 20-concurrent cap and turned nesting off by default.
  - 2.1.219 (July 24, 2026) set default depth 3.
  - 2.1.203 (July 7, 2026): "agents are now less likely to re-delegate their entire task to another subagent".

**Background: Anthropic, "When to use multi-agent systems".** Source: https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them, January 23, 2026 (background, vendor blog). Verified.

- Agents outperform in three situations: "context pollution degrades performance", "tasks can run in parallel", "specialization improves tool selection or task focus".

### 1.3 Limiting fan-out and keeping context in one agent

**Anthropic, "Building agents: When to fold subagents into your main agent loop".** Source: https://claude.com/blog/building-agents-when-to-fold-subagents-into-your-main-agent-loop, **October 22, 2026, in window**, author Diane Sarkis, vendor blog. Verified.

- Default design: "One model and one context window running an open-ended tool loop, with limits (turn and cost budgets, write gates) set in the harness."
- Keep a subagent only when:
  - "A single agent loop hits measurable performance degradation from context bloat"
  - "Multiple tasks need to be tackled in parallel with fresh context windows that can be discarded once the task is done"
  - "A single agent struggles to select appropriate tools or there are conflicting instructions in the system prompt."
- Subagents "are effective at verification, parallel work, and modular permissioning."
- When agents are split by problem type they play a "telephone game", "with each handoff degrading fidelity".
- Method: fold subagents in one at a time, against an eval. "Even a set of 10 golden examples is enough to start".

**Background: Anthropic, January 23, 2026 (same blog as 1.2).** Verified.

- "Verification subagents succeed because they sidestep the telephone game problem."
- Split by context, not by problem type. Problem-centric splitting "creates constant coordination overhead". The agent that builds a feature should also write its tests.

**Background: Cognition, April 22, 2026.** Verified.

- "setups where multiple agents contribute intelligence to a task while writes stay single-threaded."
- On review: "we found this technique to work best when the coding and review agents do not share any context beforehand."

**Claude Code continuity mechanisms.** Source: sub-agents docs, current. Verified.

- Resume: "Resumed subagents retain their full conversation history, including all previous tool calls, results, and reasoning." Also: "Claude uses the `SendMessage` tool with the agent's ID or name as the `to` field to resume it."
- Fork: "A fork is a subagent that inherits the entire conversation so far … Because a fork's system prompt and tool definitions are identical to the parent, its first request reuses the parent's prompt cache. … a fork costs less than a fresh subagent for tasks that need the same context."
- Concurrency: "By default, when 20 subagents are running in a session, spawning another with the Agent tool fails with `Concurrent subagent limit reached`". Override with `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. The limit is not enforced with ultracode on.

**Claude Code dynamic workflows.** Source: https://code.claude.com/docs/en/workflows (undated, current). Verified.

- "Up to 16 concurrent agents by default … To change the limit, set `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` to a value from 1 to 256". The variable is global, not per script.
- `workflowSizeGuideline`: `small` means fewer than 5 agents. "Claude Code sends the guideline to Claude as advice, not a cap". It steers the workflows Claude writes. That it does not affect a saved plugin script is inferred.
- Fan-out cache sharing: agents with the same "model, effort level, agent type, tools, output schema, and working directory" read a sibling's cache. Claude Code holds the rest for up to 5 s so they hit it.
- The workflows page does not mention the advisor. Whether workflow `agent()` subagents inherit `advisorModel` follows from "subagents inherit" but is not stated **(unverified)**. The page documents no resume or `SendMessage` for a workflow agent, so a workflow agent cannot be continued from the script **(unverified as a negative)**.

---

## 2. Measured results

| Claim | Number | Source, date | Kind |
|---|---|---|---|
| Sonnet + Opus advisor vs Sonnet solo, SWE-bench Multilingual | +2.7 pp, cost per task −11.9% | Anthropic blog, 2026-04-09 (background). Footnote: Sonnet 4.6 + Opus 4.6 advisor, 5 trials × 300 problems; solo used adaptive thinking, advisor run used thinking off | Vendor-reported |
| Haiku + Opus advisor, BrowseComp | 41.2% vs 19.7% solo; "trails Sonnet solo by 29% in score but costs 85% less per task" | Same; 1,266 problems, one attempt each | Vendor-reported |
| Typical advisor output | 400–700 text tokens, or 1,400–1,800 with thinking | API advisor docs (current) | Vendor docs |
| Advisor `max_tokens` (n=40 per configuration) | Unset gives about 4,200–5,900 output tokens; 2048 gives about 630–840 with ~0% truncated; "Accuracy differences … within noise" | API advisor docs | Vendor internal |
| Turn-2 "consult the advisor" nudge | Haiku 4.5: about +7 pp. Sonnet: no measurable effect. Opus: slightly lower | API advisor docs | Vendor internal |
| Opus checkpoint prompt | +7–10 pp on under-calling tasks; "roughly flat" net on a mixed workload | API advisor docs | Vendor internal |
| Single loop vs multi-agent harness | "roughly 2x faster runtime" for the single loop | Anthropic, 2026-10-22 (in window) | One customer; anecdote |
| Tool-selection degradation | beyond "30-50 tool definitions" | Anthropic, 2026-10-22 | Vendor claim |
| Multi-agent token overhead | "3-10x more tokens than single-agent" | Anthropic, 2026-01-23 (background) | Vendor testing, no data shown |
| MS-Eval: sub-agent delegation (MAD-SAE) on Claude-Sonnet-5 | Spec variant: performance utility 45.9%, efficiency 46.8%, cost 34.1% (50% = parity with single agent); "negative orchestration returns across the board" | arXiv 2610.22869, 2026-10-16 (in window) | Independent academic, 166 annotated tasks, 8 models |
| MS-Eval: benefit sources | 148 cheaper-or-efficient successes from context offloading; 124 cases of overhead from unnecessary delegation; Main-Agent-Only gave 305 beneficial and 254 adverse cases (48.8% of benefits); 625 beneficial vs 703 adverse cases overall | Same | Independent academic |
| MS-Eval: cost premium | "+$0.1 for GLM-5.3-Flash to +$4.2 for GPT-5.6-Sol per task" | Same | Independent academic |
| Single vs multi agent at equal reasoning tokens | "SAS consistently match or outperform MAS on multi-hop reasoning" | Tran & Kiela, arXiv 2604.02460, 2026-04-02 (background) | Independent. Collector excerpt only; the reasoner did not re-check it **(unverified)** |
| Fresh-context AI reviewer | "an average of 2 bugs per PR, of which roughly 58% are severe" | Cognition, 2026-04-22 (background) | Vendor internal |

No source measures the effect of capping parallel reviewers, for example a cap of 4 against one reviewer per milestone, on quality or cost. No source measures Haiku lookups feeding one Sonnet agent against that agent searching for itself.

---

## 3. Where sources disagree

- **Who can use the advisor.** In Managed Agents, "only the session's primary thread can consult it; subagents can't". In Claude Code, "Subagents inherit the configured advisor". Both pages are current. They describe different products, and kentra-rpir runs on Claude Code, so the Claude Code rule applies.
- **Advisor caching.**
  - API: an opt-in `caching` field, break-even at about 3 calls.
  - Managed Agents: "Prompt caching on the advisor's side is automatic".
  - Claude Code: "not cached … processes the full transcript anew".
  - The Claude Code page is the one that governs kentra-rpir.
- **Baseline for the 11.9% saving.** The Anthropic blog's sentence ties it to "Sonnet alone". Builder.io (2026-04-12, secondary) says it is "11.9% less than running Opus solo". The newer secondary source conflicts with the primary one. The reasoner prefers the primary blog: the saving is relative to Sonnet solo. The two runs used different thinking settings (solo adaptive, advisor off), so part of the saving may come from turning thinking off **(the reasoner's inference)**.
- **Whether a small model can drive the escalation.** Anthropic reports Haiku + Opus doubling Haiku's BrowseComp score (vendor). Cognition reports that its smaller primary model "was not good enough … for this setup to really work" and calls it "a training" problem (vendor, different models). Neither result is in window. Both support using Sonnet, not Haiku, as the executor that decides when to escalate.
- **Multi-agent benefit.** The Anthropic 2025 research-system post (background) reports large wins for parallel research. MS-Eval (in window) and Tran & Kiela (background) find single agents match or beat multi-agent setups once cost is normalized. The newer evidence is more sceptical, and Anthropic's own October 2026 article agrees with it.
- **Explore's model.** Older guides say Explore runs on Haiku. Current docs say it uses "the main conversation's model". The current docs win.

---

## 4. Implications for kentra-rpir

Checked against the plugin source in `/path/to/project/kentra-rpir` at version 0.5.4:

- `agents/implementer.md` uses `model: sonnet`.
- `agents/verifier.md`, `reviewer.md`, `plan-writer.md` and `retro.md` use `model: opus`.
- `workflows/research.js` uses a `sonnet` checker by default, with `opus` designer and judge.
- The implement skill re-dispatches a **new** implementer on NEEDS_CONTEXT, BLOCKED and FAIL. It allows two re-dispatches and then asks the user.

1. **Implementer escalation is where the advisor fits best.** Today each NEEDS_CONTEXT or BLOCKED ends the implementer's turn. The orchestrator then works out the answer and spawns a fresh implementer, which re-reads the milestone, rules and files. With `advisorModel: opus`, the implementer can consult Opus at the moments the API docs recommend: after orientation, when stuck, and before declaring DONE. It keeps its own context. This matches the user's "implementer (Sonnet) + advisor (Opus)" idea and is the vendor's top-listed pairing. **Expected effect:** fewer orchestrator round-trips. It is not measured for this pipeline, so pilot it on a few changes and compare re-dispatch counts and tokens.
2. **Keep the fresh Opus verifier.** The advisor reads the implementer's whole transcript, so it is not independent. Anthropic (Jan and Oct 2026) and Cognition (Apr 2026) both say verification is a good subagent boundary precisely because no context is shared. The advisor can cut FAIL rounds, but it does not replace the verifier.
3. **Account for session-wide inheritance.**
   - `advisorModel` applies to the whole session, and every subagent inherits it. This covers the Opus verifiers, plan writers and reviewers ("Opus main + Opus advisor" is an accepted pairing) and any Haiku lookups.
   - No subagent frontmatter field turns the advisor off. Options:
     - accept it, and tell non-implementer agents in their prompts not to consult the advisor ("say so in your instructions");
     - leave the advisor off and rely on the existing ladder;
     - run implementation in its own session launched with `--advisor opus`.
   - Plugins cannot set `advisorModel` for the user. That is inferred: no plugin-settings mechanism for it was found **(unverified)**.
4. **Cost risk grows with transcript length.** In Claude Code each advisor call re-reads the full transcript at Opus input rates, uncached. Claude Code has no `max_uses`. Long implementer sessions that call the advisor several times may cost more than the vendor's "typically costs less" suggests. Measure it with `/usage` per milestone before adopting.
5. **The retro cannot read the advice.**
   - The default `opus` alias resolves to Opus 5 or later. A Sonnet 5.5 main accepts only "Fable, Opus 5 or later, Sonnet 5.5". Opus 5.x advisors "return the encrypted `advisor_redacted_result`".
   - So with the likely default pairing, the transcript retro sees that a consultation happened but not what was advised. That holds if Claude Code stores the encrypted blob in the JSONL as the API returns it **(unverified for Claude Code transcripts)**.
   - The retro's fault classification therefore cannot attribute a bad decision to bad advice.
   - The only plaintext Opus advisor, Opus 4.8, pairs with Haiku 5.5 or Sonnet 5 executors, not with Sonnet 5.5.
6. **Haiku lookup subagents for the Sonnet worker are supported but unmeasured.**
   - Define a plugin agent, for example `lookup` with `model: haiku`, read-only `tools`, and `omitClaudeMd`. Claude Code's built-in Explore no longer defaults to Haiku.
   - Nesting depth 3 lets an implementer launched by the main session spawn its own lookups. Implementers are told "Do not explore the codebase", so the plan supplies what they need, and lookups would mostly serve research and checkers rather than implementers.
   - For `research.js`, the same shape means one Sonnet checker per topic that spawns Haiku lookups and reasons over their results itself. Today's script fans Haiku collectors out to a separate Opus reasoner.
   - Lookup results land in the Sonnet worker's context, which is the "one agent has all the context" property the user wants.
   - Whether workflow `agent()` subagents may nest subagents was not confirmed **(unverified)**.
7. **Continue an agent instead of spawning a fresh one.**
   - The implement skill runs on the Agent tool, so it can use `SendMessage` to resume the same implementer with verifier findings or guidance. A resumed agent keeps "full conversation history".
   - The re-dispatch rule ("Never re-send a failing dispatch unchanged") still holds. Only the transport changes.
   - This is the cheapest way to "not spam fresh contexts", and it needs no advisor.
   - In workflow scripts (`plan-milestones.js`, `self-review.js`, `research.js`), no resume is documented. Continuity there would need the script to pass prior output forward, or a move from the workflow to Agent-tool orchestration for that stage.
8. **Limiting reviewer fan-out.**
   - `self-review.js` launches one reviewer per milestone plus one plan-wide reviewer in a single `parallel()`.
   - A configurable cap such as "max 4 parallel" is best done in the script, by chunking the `parallel()` call, rather than with `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`, which is global.
   - A cap on concurrency limits overhead and rate pressure but not total tokens. To cut tokens, have **fewer reviewers, each owning several milestones**. That is the "limited span, one agent holds the context" idea, and Anthropic's October 2026 article favours it (context-centric split, fewer handoffs).
   - Agents sharing model, agent type, tools and schema share a prompt-cache prefix in a fan-out, so keep the reviewer prompts' fixed parts identical.
9. **Evaluate before restructuring.** Anthropic's October 2026 method is to build a small end-to-end eval of about 10 golden tasks, change one role at a time, run each task more than once, and keep what holds up. kentra-rpir already has transcript retros, which can supply the per-change metrics: re-dispatches, verifier FAIL rounds, tokens per milestone.

---

## 5. Open questions the sources do not settle

- No independent or in-window measurement of the advisor pattern on current models (Sonnet 5.5 + Opus 5.5) was found. All numbers are Anthropic's April 2026 figures on 4.6 models.
- Do workflow `agent()` subagents inherit `advisorModel`, and can they spawn nested subagents? Neither is stated on the workflows page.
- Is there any per-subagent way to turn the advisor off in Claude Code? None is documented.
- Does a Claude Code session transcript store readable advisor text for plaintext advisors, and only an opaque blob for encrypted ones? This decides whether the retro can analyse advice.
- What does an advisor call cost on a long implementer transcript under subscription limits? Claude Code exposes no cap and no cache, and no source quantifies it.
- Does a Haiku-lookup-feeding-Sonnet setup beat a Sonnet agent that searches for itself, on quality or cost? No source measures it. MS-Eval's "unnecessary delegation" category (124 overhead cases) is a warning.
- What is the quality effect of capping parallel reviewers, or of merging per-milestone reviewers into fewer reviewers? No source measures it.
- Rationale for Claude Code's defaults (20 concurrent subagents, depth 3, 16 workflow agents): the docs give "Bounds local resource use" for the workflow cap and no benchmark for any of them.

## Sources

- https://code.claude.com/docs/en/advisor (current, fetched 2026-11-05)
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool (current, beta)
- https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration (current, beta)
- https://code.claude.com/docs/en/sub-agents (current)
- https://code.claude.com/docs/en/workflows (current)
- https://code.claude.com/docs/en/changelog (2.1.305 to 2.1.318 read by the reasoner; earlier entries per collector)
- https://claude.com/blog/building-agents-when-to-fold-subagents-into-your-main-agent-loop (2026-10-22)
- https://arxiv.org/abs/2610.22869 and https://arxiv.org/html/2610.22869v1 (2026-10-16)
- https://claude.com/blog/the-advisor-strategy (2026-04-09, background)
- https://cognition.com/blog/multi-agents-working (2026-04-22, background)
- https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them (2026-01-23, background)
- https://arxiv.org/abs/2604.02460 (2026-04-02, background, collector excerpt only)
- https://www.builder.io/blog/the-claude-advisor-pattern (2026-04-12, secondary, background)
- kentra-rpir source: /path/to/project/kentra-rpir/agents/*.md, skills/implement/SKILL.md, workflows/*.js
