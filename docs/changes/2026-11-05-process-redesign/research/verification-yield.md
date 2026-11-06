# Verification analysis: kentra-rpir across four changes (continuous-producers, proto-to-avro, protobuf-java-schemas, proto3-schema-libraries)

Abbreviations used below:

| Short | Change |
|---|---|
| c-p | continuous-producers |
| p2a | proto-to-avro |
| pjs | protobuf-java-schemas |
| p3 | proto3-schema-libraries |

Other terms:

- **wb**: "would-break" severity.
- **Tokens**: last-usage per agent (the collectors' basis).
- **Severities**: from the collectors' labels, spot-checked against the cited rows. Many are "unknown", so the counts below are approximate.

Two of the costs in this data are already gone in HEAD `research.js`:
- **Spike runners** (21 Sonnet agents, 761k in c-p) were separate agents; the designer now runs the experiments itself.
- **Report writers** (15 Sonnet agents, 541k in c-p) only saved text the script had already built; the checker now writes its own report.

## 1. Premises, topics, criticality, spikes

| Change | Premises (spec / plan) | Critical | Critical % | Kentra research topics | Critical topics spiked |
|---|---|---|---|---|---|
| c-p | 5 / 8 | 4 / 2 | 46% | 19 (5 critical) | 4 of 5 (80%) |
| p2a | 8 / 46 | 5 / 1 | 11% | 6 (all critical); 54 claims deferred as light tier | 4 of 6 (67%) |
| pjs | 15 / 93 | 8 / 7 | 14% | 105 claims checked (about 13 critical) | 8 of about 13 (about 60%) |
| p3 | 20 / 123 | 8 / 1 | 6% | 14 (5 critical), plus 15 topics from the generic research workflow with no checker | 4 of 5 (80%) |
| **All** | **318** | **36** | **11%** | | **20 spikes** |

**Critical premises sit almost entirely in the spec.**
- Specs: 25 of 48 premises are critical (52%).
- Plans: 11 of 270 are critical (4%).
- Plan premises are mostly unchecked: p3 has 120 of 123 unverified, 113 with no evidence. p2a has 42 of 46 unverified.

**Critical premises with spike evidence in the ledger:** 22 of 36 (61%). Some p3 rows reuse spikes from pjs.

**What the 20 spikes concluded, compared with the docs checker's verdict:**

| Checker said | Spike said | Count | Topics |
|---|---|---|---|
| unverified | **refuted** | 2 | Headless Chrome hangs with an open EventSource (c-p PL1, so the plan moved to a CDP script). Gradle plugin srcDir layout (p3 PL1, so the plan moved to a prefix-keeping Sync). Both wb. |
| unverified | verified | 13 | Plain confirmation, except for the document changes listed below |
| verified, medium | verified | 2 | Admin.listOffsets (c-p), input.type (c-p). These changed nothing. |
| unverified | unverified | 3 | Vault key (p2a), date-of-birth text (pjs). Package layout (p3 bff9d7b8): the buf binary was absent, so the spike never ran buf. |

The spike verdict was not the only output. Spikes also changed these documents:
- **p3 P5:** R22 now uses `--error-format=json`, because text output has no rule IDs. The spike also found that `subdir` and a missing tag exit 1. Without this, R23 could not filter by rule ID (wb).
- **p3 P4:** registration and lookup by content (R25 and R27).
- **p2a P3:** "`--` comments are dropped from the AST", from experiment e07.

The checker refuted two critical premises on its own, at high confidence: pjs P2 and p3 P3 (Apicurio version strings).

## 2. Yield per verification step

"Zero-change" means a decision the user answered with "accept as written".

| Step | Agents or runs | Issues raised | Real: wb / minor | False positive or zero-change | Tokens | Tokens per real issue |
|---|---|---|---|---|---|---|
| Spec full review (reviewer + triage) | 4 runs | 11 "no" + 2 from research | 3 / 6 | 0 FP; 2 zero-change (c-p S2, p2a "unasked choices") | ≈0.75M | ≈85k |
| Spec diff reviews | 14 runs | ≈26 | ≈7 / 15 | 1 run with no findings | ≈1.5M (+0.5M research) | ≈70k |
| Skeleton review | 4 runs | 10 "no", which triage split into 16 | ≈3 / 11 (7 of unknown severity in p3 e136) | 0 | ≈0.87M | ≈60k |
| Plan full review, single reviewer (c-p) | 1 | 3 + 1 from research | 0 / 4 | 0 | 0.20M | 50k |
| Split review: milestone reviewers | 44 agents | ≈42 "no" | ≈6 / 34 | ≥13 of 31 known agents found nothing (p2a 61f2 1 of 5, 99db 4 of 7; p3 8 of 19 plus 1 with empty checks) | ≈6.6M | ≈165k (≈1.1M per wb) |
| Split review: planwide reviewer | 4 | 5 | 0 / 5 (all "spec clause has no criterion") | 0 | ≈0.49M | ≈100k |
| Split review: consolidator | 4 | 2 cross-milestone (pjs), 5 flips (p3), 8 answers for a silent reviewer (p3) | 0 / 4 new | 5 flips that duplicate existing findings | ≈0.50M | ≈125k |
| Plan diff reviews | 4 | 4 | 0 / 4, all caused by the Sonnet plan-review-fixes agents | c-p and pjs found nothing | ≈0.90M | ≈225k |
| Triage (Opus) | ≈28 | Restates every "no" (≈100 findings) | **2 new** (c-p: cancel does not wait, wb; replay-buffer regex, minor) | — | ≈1.3M | ≈650k per new issue |
| Research checker (Sonnet) | ≈150 | 8 refutations, plus gaps | ≈3 / 5 | Script downgraded 7 verified/medium reports to "unverified" | ≈6.6M (pjs 4.96M) | ≈800k |
| Spike, all parts (designer, runners, judge) | 20 spikes | 2 refuted, plus corrections | 3 / 2 | 2 spikes on already-verified checks | ≈4.7M | ≈0.9M |
| … of which the spike judge | 20 | Judge-only output: P5 corrections, DDL recount, Chrome marker caveat | (1) / 2 | 0 re-run differences | ≈1.76M | — |
| Plan-writer claim research (pjs run A, full tier) | 59 checkers + 3 spikes + 12 revisions | 3 refuted | ?/3 | — | ≈4.4M | ≈1.5M |
| Plan-writer claim research, light tier | 0 agents, 128 claims deferred | — | 1 missed wb later (p2a PL7 lockfile) | — | 0 | — |
| Implementer self-check | ≈56 | ≈50 concerns | ≈1 / 10 | ≈35 cosmetic deviations, all accepted | Part of the build | ≈0 extra |
| Verifier (fresh Opus) | 47 | ≈36 | ≈2 / 18 (+≈14 cosmetic) | ≈33 of 47 passed with no finding; p3 M1–M13 found 0 of 13 | ≈4.1M | ≈120k |
| Orchestrator (main session) | — | ≈12 catches | 1 / 6 | Caused 3 errors itself (worktree loop, M25 criterion grep twice) | Not measured | — |
| User | — | ≈8 | 3 / 5 | — | — | — |
| Retro | 3 | 53 F-findings | Product defects found only by the retro: 0 wb / ≈3 minor | 1 FP (p3 F18: the user did ask for the tier change) | p3 alone ≈2.4M | — |

**What the numbers say:**
- **Cheapest per real issue:** diff reviews, skeleton review, spec full review and the single plan reviewer, at 50–85k each.
- **Most expensive:** triage, full-tier claim research, checkers and spikes. Spikes still earned their keep, because two refutations would each have broken a milestone.
- **Split milestone reviewers:** they did catch the plan-shape wb defects. Examples: a test importing a deleted converter, an AsyncAPI count of 5 against 4, a count test assuming `.avsc` in every folder, a path missing its `banank/` prefix. But at least 40% of those agents returned nothing.

## 3. Overlap

### Spike judge against designer

Re-run share, by change:

| Change | Experiments the judge re-ran |
|---|---|
| c-p (old prompt) | 1 of 21 |
| p2a | 25 of 25 |
| pjs | 52 of 91 judge Bash calls repeat a designer command exactly (21–83% per spike) |
| p3 | 33 of 33 (e00 was denied) |

Output differences:
- Recorded differences between the judge's re-run outputs and the designer's: **0**. Quotes include "My re-runs of e01-e09 … matched the designer's outputs line for line" and "nothing differed".
- The one designer error the judge reproduced (DDL e02, ESM `require`) was a real failure, and the judge reported it the same way.

What the judge contributed, all of it by reading:
- **The verdict itself.** The designer issues no verdict, so a verdict step is needed.
- **Corrections:** P5 (four points), the DDL count (22/13 to 20/15), the Chrome marker caveat.

The re-run, about half of each judge's tool calls, never changed anything.

### Triage against reviewer and research

Triage cost about 1.3M across about 28 Opus agents. In a diff review it is 37–50k of an 86–115k run.

What it did:
- Kept every "no" and dropped none: p3 23 → 23, p2a 25 raw → 37 split.
- Made 0–7 reads, all re-locating lines the reviewer had already cited. It did no research.

What it added:
1. **Splitting and fix text.** p3 e136 split 3 "no" into 10 findings.
2. **Decision labels.** Its rule is "when unsure, decision": 13 of 37 in p2a, 10 of 23 in p3 b54c. At least 3 of those decisions came back from the user as "accept as written".
3. **Two genuinely new findings, both in c-p.** They came from claims research had marked *verified*, which the prompt does not cover.

Nothing else was new across four changes.

### Other duplication

- **Consolidator:** p2a merged answers one-to-one twice (72k and 75k tokens). p3 flipped 5 answers "for consistency", each a duplicate of an existing finding.
- **Planwide reviewer:** repeats the skeleton's P1 coverage check.
- **Verifier:** re-runs the implementer's contract check every time. This caught one false claim (p3 M4 said buf was skipped; it was not) and missed one real defect (the p2a M1 lockfile, because it re-ran the same host-only check).

## 4. Misses: found later by a step that should not have been the one to find them

| Issue (severity) | Found by | Step meant to catch it |
|---|---|---|
| p2a: protobuf UNSPECIFIED carried into Avro as the enum default (wb). Caused a spec amendment, a new skeleton and a second plan-milestones run. | First split plan review, then the user | Spec full review (wf_629805c6) |
| p2a: identity and key model (wb). Added 211 spec lines and 2 milestones. | User, at the SQL milestone | Spec questions or spec review |
| p3: deleting and recreating a schema passes CI (wb). Became R24. | User | Spec full review and about 20 research runs |
| p3: no version-pin policy (minor). | User, then the plan review | Spec review |
| p2a: PL7, a host npm 11 lockfile rejected by `npm ci` in the image (wb). | Catalog rebuild after all milestones merged | Light-tier research (skipped) and the M1 verifier |
| p2a: count test, AsyncAPI 5 vs 4, SQL test comparing a file with itself (wb). | Split milestone reviewers | Skeleton review and the writers |
| p3 M19: `SCHEMA_CI_BUF` fails inside a git worktree (wb). | Verifier, round 1 FAIL | Plan review. The implementer *saw* it and left it. |
| p3 M15: the lookup-before-register decision had no test (minor). | Verifier | Plan full review |
| c-p M3: a UI-only milestone can show no red run (minor). | Verifier | Plan full review |
| p2a M7: stray code fence (minor). The contract check passed. | Verifier | Plan check design |
| p2a M5 fixture omitted; p3 M9 regex wrong; p3 M10 wrapper bootstrap (minor). | Implementer, by running code | Plan review, which runs nothing |
| p3: 3 critical claims skipped as ledger hits (PL12, PL89, P5 in its local `.git#tag=` form). | Nobody | Self-review research. The ledger dedupe drops unverified critical claims. |
| c-p: collateral rejects at 3–8%; p3 M17 red run never checked; p2a M6 red never shown. | Retro or nobody | Verifier |

**Which step catches what:**
- **Spec review** catches untestable criteria and choices the user never made. It misses domain-model gaps, which only the user caught.
- **Diff reviews** reliably catch edits that contradict the rest of the document.
- **Skeleton review** catches shape errors. It misses errors that need step text.
- **Milestone reviewers** catch step-level contradictions, but run no code.
- **Implementers and verifiers** catch whatever needs execution.

**Steps that never caught anything the next step would not also catch:**
- Triage, apart from 2 findings.
- Consolidator merging, apart from 2 minor cross-milestone findings.
- Judge re-runs.
- Spike runners and report writers (already removed in HEAD).
- Plan diff reviews whose only findings were defects introduced by the Sonnet fix agents.
- Verifiers on byte-identical copy milestones: p3 M1–M13 gave 0 findings for 1.24M tokens.

## 5. Simplified design: what changes, and what it would have lost

| # | Change | Est. saving here | Real issues that would have slipped |
|---|---|---|---|
| 1 | **Fold triage into the main session.** The reviewer classifies decision or technical and gives fix text in its own schema. The main session presents the findings and also reads each research report's gaps. | ≈1.3M, ≈28 agents | c-p "cancel does not wait" (wb) and the replay regex (minor), *unless* the main session reads the gaps. Keep that read and nothing is lost. |
| 2 | **Replace the consolidator** with a script merge. The planwide reviewer does the cross-milestone comparison and answers for any silent reviewer. | ≈0.5M | pjs CONVENTIONS top-level rule and the Names.camel duplication (both minor). The planwide reviewer could plausibly catch these. |
| 3 | **Cap split reviewers.** `review.maxReviewers` defaults to 4, and each reviewer gets a group of neighbouring milestones in dependency order. The planwide reviewer stays. | Not measured; likely 30–50% of 6.6M (fewer per-agent floors and fewer spec re-reads) | Unknown. The wb defects caught here were cross-milestone (deleted import, counts), and wider reviewers see more of that. Risk: shallower reading of each milestone. |
| 4 | **Judge reads outputs and re-runs only the decisive experiment**, plus any with a timeout, an exit-code mismatch or an anomaly. It still writes the verdict. | ≈0.8M | None. No re-run differed. The P5, DDL and Chrome corrections came from reading. |
| 5 | **Spike only when the topic is critical, the checker did not say verified, and the answer is decisive** (it changes a milestone or a design). | ≈0.6M (listOffsets, input.type) | None. Both refutations and the P5 and P4 findings started from "unverified". |
| 6 | **Writer claim research stays critical-only** (HEAD light tier). Writers *run* any premise that a short command can test, instead of researching it. | ≈4.4M against pjs run A | pjs run A's 3 refuted claims (severity unknown). **Gains** p2a PL7, the lockfile wb, because one `npm ci` in the image would have shown it. |
| 7 | **Ledger dedupe never skips a critical claim that is unverified or in a different form.** | Costs a little | Closes the 3 critical claims p3 skipped. |
| 8 | **Drop the Sonnet plan-review-fixes workflow.** The main session applies technical fixes, which triage already gives as exact text. | ≈0.73M, plus follow-up diff reviews of ≈0.6M | None. All 4 plan diff findings were defects the fix agents introduced. |
| 9 | **Verifier depth by risk.** A milestone whose files are byte-identical to the plan, with the check passed and no concerns, gets a scripted diff and a check run. A fresh Opus verifier still runs for prose steps, concerns, deviations, a reported skipped check, and review-stage milestones. | ≈1.0M (p3 M1–M13 style) | The p3 M4 false "buf skipped" claim would still be verified under the "skipped check" rule. Possibly the M3 README stale note (deferred anyway). |
| 10 | **Small fixes after a FAIL** (one line or wording) are checked by the orchestrator, without a full new verifier round. | ≈0.3M (p2a M7 r2, p3 M25 r2/r3) | p2a README item 3 (cosmetic) and the M25 r3 R22 gap (minor, which the orchestrator fixed anyway). |
| 11 | **Research reports record "verified (medium)"** instead of downgrading the verdict to "unverified". | 0 | None. It removes noise from the ledger. |

**Keep as they are.** Each of these caught real defects:
- Spec full review.
- All diff reviews.
- The skeleton review.
- The planwide coverage check.
- Spikes for unverified critical premises.
- Fresh verifiers on non-copy milestones: M19 wb, M7 fence, M3 red, M15, M22–M26.

**Add.** Two cheap checks aimed at what only users and execution caught:
- **Spec review:** a "keys, identity and lifecycle" check and an "adversarial change" check. The first targets the p2a identity model; the second targets p3 delete-and-recreate.
- **Verifier:** a "consumers" check, for example build the image, aimed at p2a PL7.

**Net effect.** In these four changes, items 1–11 drop roughly 10–13M tokens. The only real issues at risk are 2 c-p findings (one wb), and item 1's gap-reading rule keeps those. Item 6 would have caught the one costly light-tier miss.

**Caveats:**
- Severities and outcomes are partly the collectors' own calls.
- pjs spec diff-review tokens and the c-p and p2a retro tokens are estimates.
- The saving from item 3 is not measured.

The source data, including the pjs per-record file, is in /private/tmp/claude-501/-Users-jony-code-banank/578be2d0-ae57-4c60-9f8e-704dc044f699/scratchpad/verif/ and /private/tmp/claude-501/-Users-jony-code-banank/578be2d0-ae57-4c60-9f8e-704dc044f699/scratchpad/f22/.