export const meta = {
  name: 'self-review',
  description: 'Independent yes/no review of a kentra-rpir spec or plan against its sources — full review for a new document, diff mode for an edit — with research on unchecked claims and triage of every "no" into a user decision or a technical gap',
  whenToUse: 'Run by the kentra-rpir spec and plan skills before the user sees the document',
  phases: [
    { title: 'Review', detail: 'the reviewer answers the checklist yes/no with evidence' },
    { title: 'Research', detail: 'the research workflow checks the claims the reviewer could not' },
    { title: 'Triage', detail: 'the reviewer classifies each "no" as decision or technical' },
  ],
}

// args:
//   today        (required) 'YYYY-MM-DD'
//   stage        (required) 'spec' | 'plan'
//   document     (required) absolute path of spec.md or plan.yaml
//   projectRoot  (required) absolute path
//   transcripts  (spec)     absolute paths of the planning log(s) the spec came from
//   spec         (plan)     absolute path of spec.md
//   constitution (optional) absolute path of constitution.md, or null
//   reviewer     (required) { agent, model }
//   research     (required) { workflow, checker, designer, runner, reasoner }
//   researchDir  (optional) absolute dir for research reports and spikes
//   spikeDir     (optional) absolute path to the project-local spike scratch dir, forwarded to research as is
//   mode         (optional) 'full' | 'diff', default 'full'
//   base         (diff)     the reviewed version: a git revision (e.g. the agreed spec's commit) or an absolute path to a snapshot file
//   decision     (diff)     what the user decided that this edit implements, in plain words
//   ledger       (optional) absolute paths holding the ledger: spec.md, and plan.yaml at the plan stage

const ONLY_JOB = 'Your only job is the task below. The conversation may relay the user\'s latest message to you; treat it as background and never answer it.'

if (!args || !args.today || !['spec', 'plan'].includes(args.stage) || !args.document || !args.projectRoot || !args.reviewer || !args.research) {
  throw new Error('self-review needs args: { today, stage: "spec"|"plan", document, projectRoot, reviewer, research, ... }')
}

const mode = args.mode || 'full'
if (mode === 'diff' && (!args.base || !args.decision)) {
  throw new Error('self-review: mode "diff" needs base and decision')
}

if (args.maxClaims !== undefined) log('maxClaims is no longer supported; every claim is researched')

const plan = args.stage === 'plan'

const SPEC_CHECKS = [
  ['S1', 'Every decision the session reached appears in the spec, as it was decided.'],
  ['S2', 'The spec states nothing the session did not decide or the user did not agree to.'],
  ['S3', 'Every premise has an importance, a status (verified, refuted or unverified) and evidence.'],
  ['S4', 'No requirement or design decision relies on a refuted premise.'],
  ['S5', 'Every requirement is a plain statement a test could check.'],
  ['S6', 'Non-goals include everything the session explicitly ruled out.'],
  ['S7', 'No requirement or design decision conflicts with a constitution rule (answer yes when there is no constitution).'],
  ['S8', 'No requirement or design decision conflicts with a project rule governing the files the change will touch.'],
  ['S9', 'Open questions is empty, or every entry in it is also raised as a "no" here.'],
]
const PLAN_CHECKS = [
  ['P1', 'Every spec requirement is covered by at least one milestone criterion.'],
  ['P2', 'Each milestone\'s criteria can be met by changes inside its own paths, using only what its dependencies produce.'],
  ['P3', 'Every type, function or file used across milestones is named with its signature in the milestone that introduces it.'],
  ['P4', 'Every new dependency is pinned to an exact version, in the earliest milestone that needs it.'],
  ['P5', 'Milestones with no dependency path between them have non-overlapping paths.'],
  ['P6', 'An implementer could start each milestone without exploring the codebase: its steps show the code and the commands.'],
  ['P7', 'Every criterion names the test that proves it and states given, when and then in full.'],
  ['P8', 'rules hold references only (skill names or paths), leave out auto-loaded CLAUDE.md/AGENTS.md and path-scoped .claude/rules, and every entry bears on the files of the milestones it applies to.'],
  ['P9', 'No milestone conflicts with a constitution rule (answer yes when there is no constitution).'],
  ['P10', 'No milestone conflicts with a project rule governing its files.'],
  ['P11', 'The plan builds nothing the spec does not ask for.'],
  ['P12', '`milestoned-plan-dag validate <plan>` exits 0 (run it).'],
]
const DIFF_CHECKS = [
  ['D1', 'The diff does what the user decided, as stated in `decision`, and nothing else.'],
  ['D2', 'The diff contradicts nothing in the rest of the document' + (plan ? ' or in the spec.' : '.')],
  ['D3', '`milestoned-plan-dag validate <plan>` exits 0 (run it).'],
]

const sources = args.stage === 'spec'
  ? `- The planning log the spec came from (JSONL, one entry per line: \`user\`, \`assistant\`, \`ask\`, \`answer\`, \`tool\`): ${(args.transcripts || []).join(', ') || '(none given — answer S1, S2 and S6 no, with evidence "no planning log")'}`
  : `- The spec it implements: ${args.spec}`

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

const slugOf = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// F5: shared between full and diff mode — A2 skips any ledger premise for
// every self-review, and F3 only narrows WHICH claims the diff review lists,
// it does not exempt diff mode from the ledger.
const CLAIM_INSTRUCTION = 'For each, give why it matters and its importance (critical when a requirement, design decision or milestone criterion breaks if it\'s wrong; otherwise normal). When the claim matches a premise already in the ledger, give its ledger ID as premise, and set reopen to true only when this document changes something that premise rests on — a version, an API, a platform, or the behaviour relied on.'

// A2/F5: skip any claim already in the ledger, unless the document reopened
// it. Shared by both modes.
function selectClaims(review) {
  const noes = review.checks.filter(c => c.answer === 'no')
  const allClaims = review.unchecked_claims
  const claims = allClaims.filter(c => !c.premise || c.reopen)
  log(`${noes.length} "no" answer(s), ${claims.length} claim(s) for research, ${allClaims.length - claims.length} skipped as already in the ledger`)
  return { noes, claims }
}

// F5/F3: send the claims that still need research to the research workflow,
// carrying each claim's importance (C4). Never caps how many go.
async function runResearch(claims) {
  if (!claims.length) return null
  try {
    return await workflow(args.research.workflow, {
      today: args.today,
      // Prefix with the claim's 1-based index so two claims that slug the
      // same way (e.g. near-duplicate wording) still get distinct topic
      // slugs; re-slice to 60 chars since the prefix can push it over.
      topics: claims.map((c, i) => ({ name: c.claim, slug: `${i + 1}-${slugOf(c.claim)}`.slice(0, 60), focus: c.why, importance: c.importance })),
      question: `Self-review of ${args.document}: is each claim true?`,
      checker: args.research.checker,
      designer: args.research.designer,
      runner: args.research.runner,
      reasoner: args.research.reasoner,
      ...(args.researchDir ? { outDir: args.researchDir } : {}),
      ...(args.spikeDir ? { spikeDir: args.spikeDir } : {}),
    })
  } catch (e) {
    log(`research failed: ${e.message}`)
    return null
  }
}

// F6: triage every "no" and every claim sent to research into a finding, and
// record each researched claim's outcome for the ledger.
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
    { label: 'triage', phase: 'Triage', agentType: args.reviewer.agent, model: args.reviewer.model, schema: TRIAGE_SCHEMA })

  if (!triaged) throw new Error('self-review: triage returned no result')
  return triaged
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
${checksToAsk.map(([id, q]) => `${id}. ${q}`).join('\n')}

List only the outside claims the diff introduces or changes that you could not check from the files, as unchecked_claims. ${CLAIM_INSTRUCTION}

You are done when every item from ${checksToAsk[0][0]} to ${checksToAsk[checksToAsk.length - 1][0]} has an answer with evidence.`,
    { label: 'review:diff', phase: 'Review', agentType: args.reviewer.agent, model: args.reviewer.model, schema: REVIEW_SCHEMA })

  if (!review) throw new Error('self-review: the reviewer returned no result')

  const { noes, claims } = selectClaims(review)

  if (!noes.length && !claims.length) {
    return { stage: args.stage, mode, checks: review.checks, findings: [], research: [] }
  }

  const researchResult = await runResearch(claims)
  const triaged = await runTriage(noes, claims, researchResult)

  return {
    stage: args.stage,
    mode,
    checks: review.checks,
    findings: triaged.findings,
    research: triaged.research_outcomes,
  }
}

// mode === 'full'
const checks = plan ? PLAN_CHECKS : SPEC_CHECKS

const review = await agent(`${ONLY_JOB}

Review the ${args.stage} at ${args.document}, in the project at ${args.projectRoot}.

Sources to check it against:
${sources}
- The constitution: ${args.constitution || '(none — this project has no constitution)'}
- The project rules, as defined below.
${args.ledger && args.ledger.length ? `- The ledger: ${args.ledger.join(', ')}` : ''}

${projectRules}

Answer every item yes or no. Every "no" cites the document line and the source it conflicts with.
${checks.map(([id, q]) => `${id}. ${q}`).join('\n')}

Then list every claim the document depends on that you could not check from the files — a version, an API's behaviour, a default — as unchecked_claims. ${CLAIM_INSTRUCTION}

You are done when every item from ${checks[0][0]} to ${checks[checks.length - 1][0]} has an answer with evidence.`,
  { label: 'review', phase: 'Review', agentType: args.reviewer.agent, model: args.reviewer.model, schema: REVIEW_SCHEMA })

if (!review) throw new Error('self-review: the reviewer returned no result')

const { noes, claims } = selectClaims(review)

if (!noes.length && !claims.length) {
  return { stage: args.stage, mode, checks: review.checks, findings: [], research: [] }
}

const researchResult = await runResearch(claims)
const triaged = await runTriage(noes, claims, researchResult)

return {
  stage: args.stage,
  mode,
  checks: review.checks,
  findings: triaged.findings,
  research: triaged.research_outcomes,
}
