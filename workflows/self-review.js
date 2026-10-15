export const meta = {
  name: 'self-review',
  description: 'Independent yes/no review of a kentra-rpir spec or plan against its sources — a full review for a new document (split per milestone for a plan written from fragments), a skeleton review for a plan\'s shape, a diff review for an edit — with research on the claims that matter at the change\'s tier, and triage of every "no" into a user decision or a technical gap',
  whenToUse: 'Run by the kentra-rpir spec and plan skills before the user sees the document',
  phases: [
    { title: 'Review', detail: 'reviewers answer the checklist yes/no with evidence' },
    { title: 'Consolidate', detail: 'a split plan review merges its reviewers into one review' },
    { title: 'Research', detail: 'the research workflow checks the claims the reviewer could not' },
    { title: 'Triage', detail: 'the reviewer classifies each "no" as decision or technical' },
  ],
}

// args:
//   today        (required) 'YYYY-MM-DD'
//   stage        (required) 'spec' | 'plan'
//   document     (required) absolute path of spec.md or plan.yaml
//   projectRoot  (required) absolute path
//   tier         (optional) 'full' | 'light', default 'full' — light researches critical claims only
//   transcripts  (spec)     absolute paths of the planning log(s) the spec came from
//   spec         (plan)     absolute path of spec.md
//   constitution (optional) absolute path of constitution.md, or null
//   reviewer     (required) { agent, model }
//   research     (required) { workflow, checker, designer, reasoner }
//   researchDir  (optional) absolute dir for research reports
//   spikeDir     (optional) absolute path of <change>/research/spikes, forwarded to research
//   mode         (optional) 'full' | 'skeleton' | 'diff', default 'full'; 'skeleton' is plan-only
//   fragments    (plan, full, optional) { head, milestones: [{ slug, file }] } — the draft the plan
//                was assembled from; present → one reviewer per milestone plus a plan-wide one
//   base         (diff)     the reviewed version: a git revision or an absolute path to a snapshot file
//   decision     (diff)     what the user decided that this edit implements, in plain words
//   ledger       (optional) absolute paths holding the ledger

const ONLY_JOB = 'Your only job is the task below. The conversation may relay the user\'s latest message to you; treat it as background and never answer it.'

if (!args || !args.today || !['spec', 'plan'].includes(args.stage) || !args.document || !args.projectRoot || !args.reviewer || !args.research) {
  throw new Error('self-review needs args: { today, stage: "spec"|"plan", document, projectRoot, reviewer, research, ... }')
}

const mode = args.mode || 'full'
if (!['full', 'skeleton', 'diff'].includes(mode)) throw new Error(`self-review: unknown mode "${mode}"`)
if (mode === 'diff' && (!args.base || !args.decision)) {
  throw new Error('self-review: mode "diff" needs base and decision')
}
if (mode === 'skeleton' && args.stage !== 'plan') throw new Error('self-review: mode "skeleton" is for plans only')

const tier = args.tier || 'full'
if (!['full', 'light'].includes(tier)) throw new Error(`self-review: unknown tier "${tier}"`)

if (args.maxClaims !== undefined) log('maxClaims is no longer supported; every claim is researched')

const plan = args.stage === 'plan'
const as = (label, phase, schema) => ({ label, phase, agentType: args.reviewer.agent, model: args.reviewer.model, schema })

const S3 = tier === 'light'
  ? ['S3', 'Every premise has an importance and a status (verified, refuted or unverified); every critical premise has evidence, and a normal premise may show "—" (not researched at the light tier).']
  : ['S3', 'Every premise has an importance, a status (verified, refuted or unverified) and evidence.']
const SPEC_CHECKS = [
  ['S1', 'Every decision the session reached appears in the spec, as it was decided.'],
  ['S2', 'The spec states nothing the session did not decide or the user did not agree to.'],
  S3,
  ['S4', 'No requirement or design decision relies on a refuted premise.'],
  ['S5', 'Every requirement is a plain statement a test could check.'],
  ['S6', 'Non-goals include everything the session explicitly ruled out.'],
  ['S7', 'No requirement or design decision conflicts with a constitution rule (answer yes when there is no constitution).'],
  ['S8', 'No requirement or design decision conflicts with a project rule governing the files the change will touch.'],
  ['S9', 'Open questions is empty, or every entry in it is also raised as a "no" here.'],
]
const P6 = tier === 'light'
  ? 'An implementer could start each milestone without exploring the codebase: its steps show the code and the commands. A step resting on an unverified premise may instead name the premise and state the outcome its code must reach.'
  : 'An implementer could start each milestone without exploring the codebase: its steps show the code and the commands.'
const PLAN_CHECKS = [
  ['P1', 'Every spec requirement is covered by at least one milestone criterion.'],
  ['P2', 'Each milestone\'s criteria can be met by changes inside its own paths, using only what its dependencies produce.'],
  ['P3', 'Every type, function or file used across milestones is named with its signature in the milestone that introduces it.'],
  ['P4', 'Every new dependency is pinned to an exact version, in the earliest milestone that needs it.'],
  ['P5', 'Milestones with no dependency path between them in the output of `milestoned-plan-dag resolve <plan>` (its `depends_on` edges; run it) have non-overlapping paths. Order in the file creates no edge.'],
  ['P6', P6],
  ['P7', 'Every criterion names the test that proves it, or `human:` and what the user checks when no test or command can prove it, and states given, when and then in full.'],
  ['P8', 'rules hold references only (skill names or paths), leave out auto-loaded CLAUDE.md/AGENTS.md and path-scoped .claude/rules, and every entry bears on the files of the milestones it applies to.'],
  ['P9', 'No milestone conflicts with a constitution rule (answer yes when there is no constitution).'],
  ['P10', 'No milestone conflicts with a project rule governing its files.'],
  ['P11', 'The plan builds nothing the spec does not ask for, apart from helpers its own criteria run, named as such in a description.'],
  ['P12', '`milestoned-plan-dag validate <plan>` exits 0 (run it).'],
]
const pick = ids => PLAN_CHECKS.filter(([id]) => ids.includes(id))
const MILESTONE_CHECKS = pick(['P2', 'P3', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11'])
const PLANWIDE_CHECKS = pick(['P1', 'P4', 'P5', 'P12'])
const SKELETON_CHECKS = pick(['P1', 'P2', 'P4', 'P5', 'P11', 'P12'])
const DIFF_CHECKS = [
  ['D1', 'The diff does what the user decided, as stated in `decision`, and nothing else.'],
  ['D2', 'The diff contradicts nothing in the rest of the document' + (plan ? ' or in the spec.' : '.')],
  ['D3', '`milestoned-plan-dag validate <plan>` exits 0 (run it).'],
]
const list = checks => checks.map(([id, q]) => `${id}. ${q}`).join('\n')
const doneWhen = checks => `You are done when every item (${checks.map(([id]) => id).join(', ')}) has an answer with evidence.`

const sources = args.stage === 'spec'
  ? `- The planning log the spec came from (JSONL, one entry per line: \`user\`, \`assistant\`, \`ask\`, \`answer\`, \`tool\`): ${(args.transcripts || []).join(', ') || '(none given — answer S1, S2 and S6 no, with evidence "no planning log")'}`
  : `- The spec it implements: ${args.spec}`
const sourceBlock = `Sources to check it against:
${sources}
- The constitution: ${args.constitution || '(none — this project has no constitution)'}
- The project rules, as defined below.
${args.ledger && args.ledger.length ? `- The ledger: ${args.ledger.join(', ')}` : ''}`

const projectRules = `"Project rules" are the rules that govern the files this change will touch:
- the CLAUDE.md and AGENTS.md files in those files' directories and every parent directory up to ${args.projectRoot};
- .claude/rules/*.md files whose \`paths\` frontmatter matches those files;
- the skills those files or the plan's \`rules\` call for (load them with the Skill tool).
Find the touched files from the ${args.stage === 'spec' ? "spec's design and the code it names" : "plan's deliverables and paths"}.`

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    checks: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, answer: { type: 'string', enum: ['yes', 'no'] }, evidence: { type: 'string' },
    }, required: ['id', 'answer', 'evidence'] } },
    unchecked_claims: { type: 'array', items: { type: 'object', properties: {
      claim: { type: 'string' }, why: { type: 'string' }, importance: { type: 'string', enum: ['critical', 'normal'] },
      premise: { type: 'string' }, reopen: { type: 'boolean' },
    }, required: ['claim', 'why', 'importance'] } },
    rules_read: { type: 'array', items: { type: 'string' } },
  },
  required: ['checks', 'unchecked_claims'],
}

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      check: { type: 'string' },
      kind: { type: 'string', enum: ['decision', 'technical'] },
      summary: { type: 'string' },
      evidence: { type: 'string' },
      question: { type: 'string' },
      options: { type: 'array', items: { type: 'string' } },
      fix: { type: 'string' },
    }, required: ['check', 'kind', 'summary', 'evidence'] } },
    research_outcomes: { type: 'array', items: { type: 'object', properties: {
      claim: { type: 'string' },
      premise: { type: 'string' },
      importance: { type: 'string', enum: ['critical', 'normal'] },
      status: { type: 'string', enum: ['verified', 'refuted', 'unverified'] },
      confidence: { type: 'string' },
      evidence: { type: 'string' },
    }, required: ['claim', 'importance', 'status', 'confidence', 'evidence'] } },
  },
  required: ['findings', 'research_outcomes'],
}

// What counts as a claim, and how important it is. Shared by every reviewer.
const CLAIM_INSTRUCTION = 'List a claim only when the document would change if it were wrong; leave out what an implementer settles while writing the code, such as the exact syntax of a call the library plainly supports. For each, give why it matters and its importance: critical when, if it is wrong, the shape changes — the milestones, a design decision or the approach; normal when it would be fixed inside one milestone. When the claim matches a premise already in the ledger, give its ledger ID as premise, and set reopen to true only when this document changes something that premise rests on — a version, an API, a platform, or the behaviour relied on.'

// Skip any claim already in the ledger, unless the document reopened it. At
// the light tier only critical claims go to research; the normal ones come
// back as unverified outcomes, so the caller records them in the ledger.
function selectClaims(review) {
  const noes = review.checks.filter(c => c.answer === 'no')
  const fresh = review.unchecked_claims.filter(c => !c.premise || c.reopen)
  const claims = tier === 'light' ? fresh.filter(c => c.importance === 'critical') : fresh
  const deferred = fresh.filter(c => !claims.includes(c)).map(c => ({
    claim: c.claim, ...(c.premise ? { premise: c.premise } : {}), importance: c.importance,
    status: 'unverified', confidence: 'none', evidence: 'not researched (light tier)',
  }))
  log(`${noes.length} "no" answer(s), ${claims.length} claim(s) for research, ${deferred.length} deferred (light tier), ${review.unchecked_claims.length - fresh.length} skipped as already in the ledger`)
  return { noes, claims, deferred }
}

async function runResearch(claims) {
  if (!claims.length) return null
  try {
    return await workflow(args.research.workflow, {
      today: args.today,
      prefix: `${args.stage}-${mode === 'full' ? '' : `${mode}-`}review`, // e.g. plan-review, plan-skeleton-review, spec-diff-review
      topics: claims.map(c => ({ name: c.claim, focus: c.why, importance: c.importance })),
      question: `Self-review of ${args.document}: is each claim true?`,
      checker: args.research.checker,
      designer: args.research.designer,
      reasoner: args.research.reasoner,
      ...(args.researchDir ? { outDir: args.researchDir } : {}),
      ...(args.spikeDir ? { spikeDir: args.spikeDir } : {}),
    })
  } catch (e) {
    log(`research failed: ${e.message}`)
    return null
  }
}

async function runTriage(noes, claims, researchResult) {
  const triaged = await agent(`${ONLY_JOB}

You reviewed ${args.document}. Your "no" answers and the research on the claims you could not check are below.

For each "no", and for each claim research refuted, write one finding:
- kind "decision" when intent is ambiguous, there is a trade-off, the document conflicts with the ${args.stage === 'spec' ? 'session' : 'spec'}, or it conflicts with the constitution. Give the question for the user and 2-3 options.
- kind "technical" when the writer missed something with one clear answer. Give the exact fix (the text to add or change, and where).
- A critical claim that stays unverified after research (including a spike) is a "decision" finding too: the question is whether to proceed on it, with exactly these options: proceed, change the design, or drop the requirement.
When unsure, use "decision".

Then record each researched claim's outcome: verified, refuted or unverified, with its importance, its ledger id if it has one (as premise), its confidence and its evidence.

"No" answers (JSON): ${JSON.stringify(noes)}
Claims sent to research (JSON): ${JSON.stringify(claims)}
Research (JSON): ${JSON.stringify(researchResult ? researchResult.reports : 'research not run or failed — mark every claim unverified')}
Unresearched claims (research produced no report) (JSON): ${JSON.stringify(researchResult ? researchResult.failed : claims.map(c => c.claim))}

You are done when every "no" and every refuted or critical-unverified claim has exactly one finding.`,
    as('triage', 'Triage', TRIAGE_SCHEMA))

  if (!triaged) throw new Error('self-review: triage returned no result')
  return triaged
}

// Research and triage, shared by every mode once a single review exists.
async function finish(review) {
  const { noes, claims, deferred } = selectClaims(review)
  if (!noes.length && !claims.length) {
    return { stage: args.stage, mode, tier, checks: review.checks, findings: [], research: deferred }
  }
  const researchResult = await runResearch(claims)
  const triaged = await runTriage(noes, claims, researchResult)
  return {
    stage: args.stage,
    mode,
    tier,
    checks: review.checks,
    findings: triaged.findings,
    research: [...triaged.research_outcomes, ...deferred],
  }
}

if (mode === 'diff') {
  const diffCmd = args.base.startsWith('/')
    ? `git diff --no-index "${args.base}" "${args.document}"`
    : `git diff ${args.base} -- "${args.document}"`
  const checksToAsk = DIFF_CHECKS.filter(([id]) => id !== 'D3' || plan)

  const review = await agent(`${ONLY_JOB}

Review the diff to the ${args.stage} at ${args.document}, in the project at ${args.projectRoot}.

Read the diff by running: ${diffCmd}

What the user decided this edit implements: ${args.decision}
${plan ? `- The spec it implements: ${args.spec}\n` : ''}${args.ledger && args.ledger.length ? `- The ledger: ${args.ledger.join(', ')}\n` : ''}
Answer every item yes or no. Every "no" cites the diff line and the source it conflicts with.
${list(checksToAsk)}

List only the outside claims the diff introduces or changes that you could not check from the files, as unchecked_claims. ${CLAIM_INSTRUCTION}

${doneWhen(checksToAsk)}`,
    as('review:diff', 'Review', REVIEW_SCHEMA))

  if (!review) throw new Error('self-review: the reviewer returned no result')
  return await finish(review)
}

if (mode === 'skeleton') {
  const review = await agent(`${ONLY_JOB}

Review the skeleton of the plan at ${args.document}, in the project at ${args.projectRoot}. It is a skeleton: each milestone's single step is a placeholder its writer replaces later. Review the plan's shape — its milestones, edges, contracts, deliverables and the types that cross milestones — not its steps.

${sourceBlock}

${projectRules}

Answer every item yes or no. Every "no" cites the document line and the source it conflicts with.
${list(SKELETON_CHECKS)}

Then list every claim the plan's shape depends on that you could not check from the files, as unchecked_claims. ${CLAIM_INSTRUCTION}

${doneWhen(SKELETON_CHECKS)}`,
    as('review:skeleton', 'Review', REVIEW_SCHEMA))

  if (!review) throw new Error('self-review: the reviewer returned no result')
  return await finish(review)
}

// mode === 'full'
if (plan && args.fragments && Array.isArray(args.fragments.milestones) && args.fragments.milestones.length) {
  const { head, milestones } = args.fragments

  const milestoneReview = m => () => agent(`${ONLY_JOB}

Review milestone \`${m.slug}\` of the plan at ${args.document}, in the project at ${args.projectRoot}. Its full text is in ${m.file}; the plan-level description and rules are in ${head}. Read the rest of the plan only for what this milestone uses from its dependencies. Other reviewers cover the other milestones and the plan as a whole.

${sourceBlock}

${projectRules}

Answer every item yes or no, for milestone \`${m.slug}\` only. Every "no" cites the line in ${m.file} and the source it conflicts with.
${list(MILESTONE_CHECKS)}

Then list every claim this milestone depends on that you could not check from the files, as unchecked_claims. ${CLAIM_INSTRUCTION}

${doneWhen(MILESTONE_CHECKS)}`,
    as(`review:${m.slug}`, 'Review', REVIEW_SCHEMA))

  const planwideReview = () => agent(`${ONLY_JOB}

Review the plan at ${args.document} as a whole, in the project at ${args.projectRoot}. Read every milestone's contract, deliverables and depends-on; other reviewers read each milestone's steps. Run \`milestoned-plan-dag resolve ${args.document}\` for the edges.

${sourceBlock}

Answer every item yes or no. Every "no" cites the document line and the source it conflicts with.
${list(PLANWIDE_CHECKS)}

Then list every claim the plan as a whole depends on that you could not check from the files, as unchecked_claims. ${CLAIM_INSTRUCTION}

${doneWhen(PLANWIDE_CHECKS)}`,
    as('review:plan', 'Review', REVIEW_SCHEMA))

  const reviews = await parallel([...milestones.map(milestoneReview), planwideReview])
  const labelled = reviews.map((r, i) => ({ reviewer: i < milestones.length ? milestones[i].slug : 'plan-wide', review: r }))
  const silent = labelled.filter(x => !x.review).map(x => x.reviewer)
  if (silent.length) log(`no review from: ${silent.join(', ')}`)

  const consolidated = await agent(`${ONLY_JOB}

You orchestrate the review of the plan at ${args.document}. ${milestones.length + 1} reviewers each answered part of the checklist: one per milestone, one for the plan as a whole. Their answers are below.

Merge them into one review:
- checks: one entry per check and milestone. Use the id "<check>@<milestone slug>" for a milestone's check and the bare id for a plan-wide check. Keep every "no" with its evidence.
- Where two reviewers' answers conflict — one milestone uses a type another says it never introduces, say — read the plan and settle it; keep the answer the plan supports.
- Compare across milestones for what no single reviewer could see: a signature introduced in one milestone and used differently in another, the same file created twice, a helper two milestones both build. Add each as a "no" under the check it breaks.
- unchecked_claims: one entry per distinct claim; merge duplicates and keep the higher importance.
${silent.length ? `- These reviewers returned nothing: ${silent.join(', ')}. Answer their checks yourself — for a milestone: ${MILESTONE_CHECKS.map(([id]) => id).join(', ')}; plan-wide: ${PLANWIDE_CHECKS.map(([id]) => id).join(', ')}. The milestone fragments: ${JSON.stringify(milestones)}; the plan-level head: ${head}.

${sourceBlock}

${projectRules}
\n` : ''}
The checks, for reference:
${list(PLAN_CHECKS)}

Reviews (JSON): ${JSON.stringify(labelled.filter(x => x.review))}

You are done when every check from every reviewer is in exactly one merged entry, every silent reviewer's checks are answered, and every distinct claim is listed once.`,
    as('consolidate', 'Consolidate', REVIEW_SCHEMA))

  if (!consolidated) throw new Error('self-review: the consolidator returned no result')
  return await finish(consolidated)
}

const checks = plan ? PLAN_CHECKS : SPEC_CHECKS

const review = await agent(`${ONLY_JOB}

Review the ${args.stage} at ${args.document}, in the project at ${args.projectRoot}.

${sourceBlock}

${projectRules}

Answer every item yes or no. Every "no" cites the document line and the source it conflicts with.
${list(checks)}

Then list every claim the document depends on that you could not check from the files, as unchecked_claims. ${CLAIM_INSTRUCTION}

${doneWhen(checks)}`,
  as('review', 'Review', REVIEW_SCHEMA))

if (!review) throw new Error('self-review: the reviewer returned no result')
return await finish(review)
