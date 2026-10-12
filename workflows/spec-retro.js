export const meta = {
  name: 'spec-retro',
  description: 'Retro of one kentra-rpir change from its session transcripts: pre-pass signals, blind per-milestone readers, synthesis with fault classes, reconciliation of the implementation report, remediation actions, and spec-retro.md',
  whenToUse: 'Run by the kentra-rpir review skill after implementation',
  phases: [
    { title: 'Prepass', detail: 'signals and skeleton timelines from each implement transcript; cost metrics from each planning session' },
    { title: 'Read', detail: 'one blind reader per milestone plus one for the planning sessions; troubled milestones read in full' },
    { title: 'Synthesize', detail: 'merge findings, assign fault classes including PLAN; reconcile the self-report' },
    { title: 'Remediate', detail: 'one action per finding' },
    { title: 'Write', detail: 'spec-retro.md from the template, with planning cost and a short reconciliation' },
  ],
}

// args:
//   today, changeDir, projectRoot     (required)
//   spec, plan, implReport, out       (required) absolute paths
//   template                          (required) absolute path of templates/spec-retro.md
//   sessions    (required) [{ id, stage, path, missing? }]; stage may join stages with '+';
//                          path null only when missing is true
//   planningLog (optional) absolute path of <change>/planning-log.jsonl
//   milestones  (required) [{ number, slug, paths, diffRange }]; diffRange like <base>..<merge>
//   priorRetros (optional) absolute paths of earlier spec-retro.md files
//   roles       (required) { prepass, reader, retro }, each { agent, model }
//   versions    (optional) { plugin, claudeCode }

const ONLY_JOB = 'Your only job is the task below. The conversation may relay the user\'s latest message to you; treat it as background and never answer it.'

for (const k of ['today', 'changeDir', 'projectRoot', 'spec', 'plan', 'implReport', 'out', 'template', 'sessions', 'milestones', 'roles']) {
  if (!args || !args[k]) throw new Error(`spec-retro needs args.${k}`)
}
const { roles } = args
for (const r of ['prepass', 'reader', 'retro']) {
  if (!roles[r] || !roles[r].agent || !roles[r].model) throw new Error(`spec-retro needs args.roles.${r}: { agent, model }`)
}
for (const s of args.sessions) {
  if (!s.path && !s.missing) throw new Error(`spec-retro: session "${s.id}" has no path`)
}
const as = (role, extra) => ({ agentType: roles[role].agent, model: roles[role].model, ...extra })
const stagesOf = s => String(s.stage).split('+')
const present = args.sessions.filter(s => !s.missing)
const implSessions = present.filter(s => stagesOf(s).includes('implement'))
const planningSessions = present.filter(s => stagesOf(s).some(x => x === 'spec' || x === 'plan'))
const missing = args.sessions.filter(s => s.missing)
if (missing.length) log(`transcripts missing: ${missing.map(s => `${s.id} (${s.stage})`).join(', ')}`)
if (!implSessions.length) log('no session has stage "implement" — pre-pass and reader signals will be empty')
const milestoneList = args.milestones.map(m => `M${m.number} ${m.slug} — paths ${JSON.stringify(m.paths)}`).join('\n')

// 1. Pre-pass
const PREPASS_SCHEMA = {
  type: 'object',
  properties: {
    claudeCodeVersion: { type: 'string' },
    compactions: { type: 'number' },
    milestones: { type: 'array', items: { type: 'object', properties: {
      slug: { type: 'string' },
      dispatches: { type: 'number' },
      verifierFails: { type: 'number' },
      writesOutsidePaths: { type: 'array', items: { type: 'string' } },
      testRuns: { type: 'number' },
      errors: { type: 'number' },
      blocked: { type: 'boolean' },
      transcripts: { type: 'array', items: { type: 'string' } },
    }, required: ['slug', 'dispatches', 'verifierFails', 'writesOutsidePaths', 'testRuns', 'errors', 'blocked'] } },
    skeletons: { type: 'array', items: { type: 'object', properties: {
      slug: { type: 'string' },
      events: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, event: { type: 'string' } }, required: ['ref', 'event'] } },
    }, required: ['slug', 'events'] } },
  },
  required: ['milestones', 'skeletons'],
}

// Planning pre-pass (5.1.3) — cost metrics from each planning session, read
// alongside the implement pre-pass in the same parallel batch below.
const PLANNING_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    stages: { type: 'string' },
    wallMs: { type: 'number' },
    workflows: { type: 'array', items: { type: 'object', properties: {
      runId: { type: 'string' },
      name: { type: 'string' },
      stage: { type: 'string' },
      mode: { type: 'string' },
      status: { type: 'string' },
      durationMs: { type: 'number' },
      agentCount: { type: 'number' },
      totalTokens: { type: 'number' },
      startTime: { type: 'string' },
    } } },
    questionRounds: { type: 'number' },
    statusResets: { type: 'array', items: { type: 'object', properties: {
      from: { type: 'string' }, to: { type: 'string' }, ref: { type: 'string' },
    } } },
    fullReviews: { type: 'object', properties: { spec: { type: 'number' }, plan: { type: 'number' } } },
    diffReviews: { type: 'object', properties: { spec: { type: 'number' }, plan: { type: 'number' } } },
  },
  required: ['id', 'workflows', 'questionRounds', 'statusResets', 'fullReviews'],
}

phase('Prepass')
const prepassResults = await parallel([
  ...implSessions.map(s => () => agent(`${ONLY_JOB}

Extract signals from an implementation session. The orchestrator transcript is ${s.path}; its subagents' transcripts are under ${s.path.replace(/\.jsonl$/, '')}/subagents/. Each subagent's first user message is its dispatch prompt and names its milestone.

Milestones:
${milestoneList}

For each milestone, count: implementer dispatches, verifier FAIL verdicts, errors and non-zero exits, test runs. List files written outside its paths, and the transcript files that belong to it. Mark it blocked if it was never merged. Record the Claude Code version (the "version" field on transcript lines) and the number of compact_boundary markers.

Then write a skeleton timeline per milestone: one event per dispatch, verdict, error, retry, user message and merge, each with its ref <file>:<line>.

Use jq and grep through Bash; read leniently and skip lines you cannot parse. You are done when every milestone listed above has counts and a skeleton.`,
    as('prepass', { label: `prepass:${s.id}`, phase: 'Prepass', schema: PREPASS_SCHEMA }))),
  ...planningSessions.map(s => () => agent(`${ONLY_JOB}

Extract planning-cost metrics from a planning session. This session's id is "${s.id}" and its stages are "${s.stage}" — copy them verbatim into your report's \`id\` and \`stages\` fields. The orchestrator transcript is ${s.path}; its workflow run journals are at ${s.path.replace(/\.jsonl$/, '')}/workflows/*.json.

Use jq to read each journal for \`runId\`, \`workflowName\`, \`status\`, \`durationMs\`, \`agentCount\`, \`totalTokens\`, \`startTime\`, \`args.stage\` and \`args.mode\` (a missing \`mode\` on a self-review is \`full\`).

Read the transcript for question rounds: an assistant turn that calls AskUserQuestion, or whose last text ends in a question, followed by a user message — count one round per such exchange.

Also find every \`status:\` edit to spec.md or plan.yaml that moves backwards in draft → agreed → planned → implementing → in-review → done; record each as { from, to, ref: "<file>:<line>" }.

Report: the session's wall time (wallMs, first to last transcript timestamp), every workflow run you found (as \`workflows\`), the question rounds, the status resets, and how many full vs. diff self-reviews ran for spec and for plan.

Use jq and grep through Bash; read leniently and skip lines you cannot parse. You are done when every workflow run in the journals is accounted for.`,
    as('prepass', { label: `prepass:planning:${s.id}`, phase: 'Prepass', schema: PLANNING_SCHEMA }))),
])
const prepasses = prepassResults.slice(0, implSessions.length)
const planningPrepasses = prepassResults.slice(implSessions.length)

const signals = new Map()
const skeletons = new Map()
for (const p of prepasses.filter(Boolean)) {
  for (const m of p.milestones || []) {
    const prev = signals.get(m.slug)
    signals.set(m.slug, prev ? {
      ...prev,
      dispatches: prev.dispatches + m.dispatches,
      verifierFails: prev.verifierFails + m.verifierFails,
      writesOutsidePaths: [...prev.writesOutsidePaths, ...m.writesOutsidePaths],
      testRuns: prev.testRuns + m.testRuns,
      errors: prev.errors + m.errors,
      blocked: prev.blocked && m.blocked,
      transcripts: [...(prev.transcripts || []), ...(m.transcripts || [])],
    } : m)
  }
  for (const sk of p.skeletons || []) skeletons.set(sk.slug, [...(skeletons.get(sk.slug) || []), ...sk.events])
}
const claudeCodeVersion = prepasses.find(p => p?.claudeCodeVersion)?.claudeCodeVersion || args.versions?.claudeCode || 'unknown'

const troubled = s => !s || s.blocked || s.dispatches > 1 || s.verifierFails > 0 || s.errors > 0 || s.writesOutsidePaths.length > 0 || s.testRuns === 0

const planning = planningPrepasses.filter(Boolean)

// 2. Blind readers
const READ_SCHEMA = {
  type: 'object',
  properties: {
    milestone: { type: 'string' },
    mode: { type: 'string', enum: ['full', 'skim'] },
    timeline: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, event: { type: 'string' }, decisive: { type: 'boolean' } }, required: ['ref', 'event'] } },
    findings: { type: 'array', items: { type: 'object', properties: {
      summary: { type: 'string' },
      decisive_ref: { type: 'string' },
      wrong_belief: { type: 'string' },
      symptom_ref: { type: 'string' },
      evidence: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, quote: { type: 'string' } }, required: ['ref', 'quote'] } },
    }, required: ['summary', 'evidence'] } },
    went_well: { type: 'array', items: { type: 'string' } },
  },
  required: ['milestone', 'mode', 'timeline', 'findings', 'went_well'],
}

phase('Read')
const planningRead = () => agent(`${ONLY_JOB}

MODE: full

You are a blind reader for the planning sessions (the spec and plan stages) of the change in ${args.changeDir}. You have not seen what the implementing agents said about their own work, and you must not look for it — do not open any report file in the change folder.

Read:
- the planning log first, and the planning transcripts in place where the log is not enough: ${args.planningLog || '(no planning log given)'}${planningSessions.length ? `; transcripts ${planningSessions.map(x => x.path).join(', ')}` : ''}
- the spec: ${args.spec}, with its writer-gap list and \`# premises:\`
- the plan: ${args.plan}, with its writer-gap list and \`# premises:\`
- the planning cost metrics: ${JSON.stringify(planning)}

Look for: research or review whose cost did not match the risk; a plan gap the self-review should have caught; status resets and re-reviews; questions the user had to ask that a stage should have answered.

Report milestone as "planning". Every claim cites <file>:<line> and a short verbatim quote. Note what went well. You are done when the timeline is written and every finding has evidence.`,
  as('reader', { label: 'read:planning', phase: 'Read', schema: READ_SCHEMA }))

const reads = await parallel([
  ...args.milestones.map(m => () => {
    const s = signals.get(m.slug)
    const mode = troubled(s) ? 'full' : 'skim'
    return agent(`${ONLY_JOB}

MODE: ${mode}

You are a blind reader for milestone M${m.number} ${m.slug} of the change in ${args.changeDir}. You have not seen what the implementing agents said about their own work, and you must not look for it — do not open any report file in the change folder.

Read:
- the spec: ${args.spec}
- the plan: ${args.plan} (milestone ${m.slug})
- the diff: \`git -C ${args.projectRoot} diff ${m.diffRange}\`
- the signals: ${JSON.stringify(s || 'none — the pre-pass found nothing for this milestone')}
- the skeleton timeline: ${JSON.stringify(skeletons.get(m.slug) || [])}
- the transcripts: ${JSON.stringify(s?.transcripts || (implSessions.length ? implSessions.map(x => x.path) : 'no transcript'))}
${args.planningLog ? `- the planning log, when a finding may trace back to the spec or plan: ${args.planningLog}` : ''}

${mode === 'full'
      ? 'Read the transcripts in full. Write the timeline. For every failure, retry or deviation, find the decisive point: the earliest step where an agent acted on a wrong belief, working back from the first visible symptom.'
      : 'The signals look clean. Read the skeleton, the diff and the verifier\'s transcript; confirm the verification ran the named tests and checked what the criteria say. A passing run can still be a lucky pass. Read in full only if something does not add up.'}

Every claim cites <file>:<line> and a short verbatim quote. Note what went well. You are done when the timeline is written and every finding has evidence.`,
      as('reader', { label: `read:${m.slug}`, phase: 'Read', schema: READ_SCHEMA }))
  }),
  planningRead,
])

const nullReads = args.milestones.filter((m, i) => !reads[i])
if (nullReads.length) log(`no read for: ${nullReads.map(m => m.slug).join(', ')}`)
if (nullReads.length === args.milestones.length) throw new Error('spec-retro: every blind reader returned no result')

// 3. Synthesis and reconciliation, in parallel
const SYNTH_SCHEMA = {
  type: 'object',
  properties: {
    outcome: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' },
      class: { type: 'string', enum: ['SPEC', 'PLAN', 'SKILL', 'PROCESS', 'ENV', 'MODEL'] },
      summary: { type: 'string' },
      decisive_ref: { type: 'string' },
      made_sense: { type: 'string' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      milestones: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'class', 'summary', 'decisive_ref', 'made_sense', 'severity'] } },
    went_well: { type: 'array', items: { type: 'string' } },
  },
  required: ['outcome', 'findings', 'went_well'],
}
const RECON_SCHEMA = {
  type: 'object',
  properties: {
    claims: { type: 'array', items: { type: 'object', properties: {
      claim: { type: 'string' },
      verdict: { type: 'string', enum: ['confirmed', 'contradicted', 'unsupported'] },
      evidence: { type: 'string' },
    }, required: ['claim', 'verdict', 'evidence'] } },
  },
  required: ['claims'],
}

phase('Synthesize')
const readsJson = JSON.stringify(reads.filter(Boolean))
const [synthesis, reconciliation] = await parallel([
  () => agent(`${ONLY_JOB}

Merge the blind readers' findings for the change in ${args.changeDir} into one list. Merge duplicates; keep every distinct finding. Give each an id (F1, F2, …) and one fault class:
- SPEC: the spec was ambiguous or wrong
- PLAN: the plan was ambiguous, wrong, or could not be built as written (a missing step, file, directory, type or pin)
- SKILL: a skill, agent definition or prompt was missing, wrong or harmful
- PROCESS: the workflow itself — a handoff, a verification step, the order of steps
- ENV: tools, dependencies, sandbox, flaky infrastructure
- MODEL: the model failed with adequate context in front of it
For each, say how the action made sense to the agent at the time, given what was in its context. Ask how, not why.
Write the outcome in two or three sentences from the verifier results in the readers' evidence — not from any report.

Readers' output (JSON): ${readsJson}
Planning cost metrics (JSON): ${JSON.stringify(planning)}

You are done when every reader finding is in exactly one merged finding.`,
    as('retro', { label: 'synthesis', phase: 'Synthesize', schema: SYNTH_SCHEMA })),
  () => agent(`${ONLY_JOB}

Check every claim in the implementation report ${args.implReport} against the blind readers' evidence below and, where that is silent, against the transcripts and \`git -C ${args.projectRoot} log\`. A claim is a statement of fact: an outcome, a count, a test passing, a decision, a concern settled. Verdict per claim: confirmed, contradicted or unsupported, with evidence.

Readers' output (JSON): ${readsJson}

You are done when every claim in the report has a verdict.`,
    as('retro', { label: 'reconcile', phase: 'Synthesize', schema: RECON_SCHEMA })),
])

if (!synthesis) throw new Error('spec-retro: synthesis returned no result')
if (!reconciliation) throw new Error('spec-retro: reconciliation returned no result')

const contradicted = reconciliation.claims.filter(c => c.verdict === 'contradicted')
const notConfirmed = reconciliation.claims.filter(c => c.verdict !== 'confirmed')
const confirmedCount = reconciliation.claims.length - notConfirmed.length

// 4. Remediation
const REMEDY_SCHEMA = {
  type: 'object',
  properties: {
    actions: { type: 'array', items: { type: 'object', properties: {
      finding: { type: 'string' },
      kind: { type: 'string', enum: ['diff', 'eval case', 'automated check', 'no action'] },
      target: { type: 'string' },
      detail: { type: 'string' },
    }, required: ['finding', 'kind', 'target', 'detail'] } },
    recurring: { type: 'array', items: { type: 'string' } },
  },
  required: ['actions', 'recurring'],
}

const remediation = await agent(`${ONLY_JOB}

Propose exactly one action per finding below. Contradicted self-report claims are findings too: give them ids R1, R2, … and class PROCESS unless the evidence says otherwise.
- diff: a change to a named skill, agent definition, template or CLAUDE.md, written as before and after. Say what text it removes, or why its added length pays for itself.
- eval case: the prompt, the fixture commit, and what counts as a pass.
- automated check: a hook, lint, test or schema rule, and where it lives.
- no action: model variance, with the reasoning.
Prefer an automated check to more prose. The target is a file path in ${args.projectRoot}, or "kentra-io/kentra-rpir: <file>" when the fix belongs in a kentra-rpir skill, agent, workflow or template.

Then compare with earlier retros and list recurring fault classes and findings: ${(args.priorRetros || []).join(', ') || '(no earlier retros)'}

Findings (JSON): ${JSON.stringify(synthesis.findings)}
Contradicted claims (JSON): ${JSON.stringify(contradicted)}

You are done when every finding and every contradicted claim has one action.`,
  as('retro', { label: 'remediate', phase: 'Remediate', schema: REMEDY_SCHEMA }))

if (!remediation) throw new Error('spec-retro: remediation returned no result')

// 5. Write
const written = await agent(`${ONLY_JOB}

Write ${args.out} following the template ${args.template}. Fill every section from the JSON below; do not add findings of your own. Write nothing else.

Header facts: change ${args.changeDir}; commits ${args.milestones.map(m => m.diffRange).join(', ')}; models ${JSON.stringify(Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, v.model])))}; kentra-rpir ${args.versions?.plugin || 'unknown'}; Claude Code ${claudeCodeVersion}; sessions ${args.sessions.map(s => s.missing ? `${s.id}: ${s.stage} (transcript missing)` : `${s.id}: ${s.stage}`).join(', ')}.
${missing.length ? `Missing transcripts — list these in Open questions too: ${missing.map(s => `${s.id}: ${s.stage} (transcript missing)`).join(', ')}` : ''}

Readers (timelines): ${readsJson}
Planning cost metrics (JSON): ${JSON.stringify(planning)}
Synthesis: ${JSON.stringify(synthesis)}
Reconciliation (only the contradicted and unsupported claims; ${confirmedCount} other claims were confirmed): ${JSON.stringify(notConfirmed)}
Remediation: ${JSON.stringify(remediation)}

You are done when ${args.out} has every template section filled.`,
  as('retro', { label: 'write', phase: 'Write' }))

if (!written) throw new Error('spec-retro: the writer returned no result')

return {
  out: args.out,
  findings: synthesis.findings,
  contradicted,
  actions: remediation.actions,
  planning,
}
