# F22 critique

Replaces the earlier "blocked" stub. Helper data: `scratchpad/f22c/floor.json` (per-agent usage taken from 461 agent-*.jsonl files).

## 1. The 34k floor (§1.5, C6): the floor is real, but the analysis misreads what it is made of and what removing it buys

- **The floor is real.** The median first-turn context is 33.9k (p10 31.2k). After subtracting the task prompt (median about 0.3k), about 33.5k remains. Opus agents carry 34.4k, sonnet 33.3k, haiku 31.6k.
- **What the floor is made of.** I measured the `prompt_snapshot` and attachment entries (chars/3.6):
  - Tool schemas: about 21k tokens.
    - The `Artifact` tool alone is 55,375 chars, about 14k tokens. It is present in 267 of the 461 agents.
    - The other 192 agents carry `mcp__claude-artifacts__*` tools instead, about 6k tokens.
    - `SendFeedback` adds about 2.5k.
  - `skill_listing`: about 6.5k.
  - `deferred_tools_delta`: about 5k.
  - CLAUDE.md: about 1k.
  - System prompt: under 1k.
  - About 25k of the 34k is harness and MCP overhead with nothing to do with the task. The analysis never broke the floor down (§6).
- **Cache.** On the first turn, 66% of agents read about 19k from cache. First-turn context totals 16.6M: 11.4M cache writes and 5.2M cache reads.
- **What `totalTokens` actually measures.** It is each agent's *final context size*: it tracks the last turn's input + cache_creation + cache_read + output with a median error of 3%. It is not a sum over turns.
  - So the floor is counted once per agent, cached or not. "Leaves out cache reads" is only half true: the 704M tokens of per-turn cache re-reads are excluded.
  - The claim "removing an agent saves about 34k" holds **in this metric**.
- **Dollar-weighted picture.** I weighted input 1, cache write 1.25, cache read 0.1, output 5.
  - The floor is about 26% of cost, not 36%.
  - Agents with 4 or fewer turns are 9.2% of the metric but 3.7% of cost.
  - Plan writers are 15.5% of the metric but about 21% of cost (159M cache reads).
  - So the metric overstates agent-count savings (C6, triage, spike "run" agents) and understates long-agent savings (P1).
- **Example.** The 7 sonnet "run" agents in 0b2aa331 used 35.5–35.7k each, almost pure floor.

## 2. Segmentation (§1.2): holds

- **977d6d5f.** `Skill kentra-rpir:spec` is at line index 2772. It revises 2026-10-28-protobuf-java-schemas. 18 completed runs come before it (39bf4b0b … 27d47a9b, with e06d2b40 at 0 tokens), totalling 12,483,295.
- **106feadb.** `kentra-rpir:spec` is at index 3230. The 19 runs before it (5cd14ac9 … 3855391a) total 9,478,906.
- **Ultracode was on** in both sessions, from attachment `ultra_effort_enter` (977d6d5f idx 16, 106feadb idx 17). The reminder reads: "Ultracode is on: optimize for the most exhaustive, correct answer — not the fastest or cheapest. Use the Workflow tool on every substantive task; token cost is not a constraint."
  - The longer quote in C1 ("author and run a workflow… loop-until-dry") is from the workflow-authoring skill's Ultracode section, which the harness auto-loaded. It is not from the reminder.
  - A size guideline was also active: "medium — keep workflows under 10 agents".
- **Ultracode was also on in 50ce4279, 5368a2ba and fab7422e**, not just A1/A2.
- **Minor errors:**
  - The inventory has 4 sessions, not 5.
  - f4b1cd45 is proto-to-avro (106feadb idx 3982), not continuous. The continuous change had no plan-milestones run.

## 3. C1 "agent-chosen": mostly holds

The triggers I checked in runs.json are questions, not workflow requests:
- 39bf4b0b: "explain this response…"
- 7411e6fa: "Will generating java classes using Wire work…?"
- 75fbb6f6: "what's the support for different .proto standard versions?"
- 53b761ba and 56c285dc: questions.

Exceptions:
- 02783db9 (1.25M): the user wrote "I want it researched".
- a7030c0f (1.03M): "check compatibility only with these".

So agent-chosen is about 4.4–6.7M, depending on how those two count. Ultracode is the user's standing opt-in, so "never asked" overstates it.

## 4. C2 / P1: weakened

**The arithmetic holds.**
- Write phases: 0.82 + 1.10 + 3.75 + 1.04 = 6.72M.
- b54c4e89: 20 reviewers, 2.97M, plus a 179k consolidator.
- Plan stage: 15.04M. It should be 15.54M, because 6f13ce80 (498k, `prefix: plan`) is plan research, but the analysis filed it under "spec premises".

**The mechanism does not hold for B.**
- Every B plan ran the **light** tier: results show `"tier": "light"`. "Complete code in every step" is full-tier text and never applied.
- HEAD plan-milestones.js does research claims and revise them (lines 76–137). But at light tier it researches only `critical` claims.
- In B, the only plan-milestones research was one topic in f4b1cd45 (58k). There were no Revise phases.
- The claims → research → revisions chain (64% of c1e3c95e, verified) explains only the full-tier predecessor.

**Other problems:**
- "Nothing compiles that code" is wrong. Writers ran builds and tests: 146 gradle/buf/node calls in 41f52ace, 56 in f4b1cd45 ("The code in every step was run before it went into the plan").
- The +3.4M implementer offset is an unmeasured assumption (§6 admits this).
- Counter-evidence:
  - proto3 impl-report: 21 of 27 milestones took 1 dispatch and 1 verify round.
  - spec-retro.md:438 credits "plans that carried full file bodies".
- The comparison of planning cost with proto-to-avro's implementation fresh tokens is roughly valid. The two metrics agree within about 7% in aggregate (46.7M vs 43.75M).

**Verdict.** The plan stage really is the largest pipeline cost. The supported levers are writer exploration and split review. The 7.5M net saving is not supported.

## 5. C4: holds

- research.js:137–139 matches the quoted text exactly. The confidence rule is at :157.
- In 0b2aa331 the checker returned `verified`/`medium`, citing the 4.2 javadoc for 4.3.1, and was still spiked. Calling this "avoidable" is arguable.
- The refutations are confirmed:
  - 0de56a7e: headless Chrome, refuted/high.
  - 6f13ce80: srcDir, refuted/high.
- **Gap:** the claim "node-sql-parser deferred 4 times" conflicts with 3fe8d900, where a spike verified it at high.

## 6. Predecessor: holds

- fab7422e has 16 runs totalling 15,833,779.
- c1e3c95e is 6,950,450, at the full tier:
  - Write: 2.51M.
  - Research: 2.78M from 59 sonnet agents.
  - Spikes: 0.59M.
  - Revise: 1.08M.
- The plan stage is about 13.1M (excluding about 2.7M of spec-stage runs).
- 1b48f44 was committed 2026-10-30 17:12 +0100. "We're going with proto3" was said at 14:49Z the same day.

## Corrected numbers

| Item | Analysis | Corrected |
|---|---|---|
| Floor share | 36% (metric) | 36% of the metric, about 26% of cost. About 25k of the 34k is harness/MCP overhead. |
| Plan stage in B | 15.04M | 15.54M |
| Claim-research + revise loop in B | implied large | 0.06M |
| Agent-chosen A2 | 6.67M | 4.4–6.7M |
| P1 net | 7.5M | Unsupported. The gross removable parts are writer exploration (≤6.7M), split reviews (5.1M) and plan-fix (0.7M), with an unknown implementer offset. |
| P5 | 5.2M | Not a plugin saving (see below) |

## 7. Missed causes and proposals that would not have worked

**Missed causes:**
- **Harness overhead in every subagent.** The Artifact/claude-artifacts schemas, skill listing and deferred-tool list cost about 20–25k × 461 agents, or about 9–11M of the metric, without removing a single agent. This is the largest lever no proposal names. Two options, both untested:
  - Disable the claude-artifacts MCP for workflow runs.
  - Give the plugin's agents a `tools:` allowlist.
- **Ultracode inside B.** Ad-hoc workflows in B came to about 2.0M: 2b7458f5 395k, 03b20603 477k, 9653e3f0 411k, and ce2a17b9 plan-fix 723k as a 9-agent workflow. The analysis charges plan-fix to C2.
- **A1 (9.48M) is not planning work.** It is C360/ui-flow work, including build runs: ed31f599 859k, b2447d72 832k, 733f3384 709k. No kentra proposal touches it, so ranking C1 first at 50% inflates the plugin's share.
- **Main-session cost is not measured.** Moving A2 research into the main session (P5) looks free in this metric, but it is not.

**Proposals that would not have prevented the cited runs:**
- **P5 spec step 5.** A2 ran before the skill loaded (the analysis admits this). The questions came one per user turn over 5 days, so they could not have been batched. Only switching Ultracode off would have helped, and that is a user setting.
- **P1's "remove claim research and revision".** In B that loop cost 0.06M.
- **P4 against the predecessor.** Its plan ran Oct 29, when A2 had only begun, and the spec was committed after "going with proto3". The gate relies on the user having said yes.
