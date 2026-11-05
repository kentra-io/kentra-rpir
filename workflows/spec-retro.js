export const meta = {
  name: 'spec-retro',
  description: 'Retro of one kentra-rpir change from its session transcripts: pre-pass signals, blind per-milestone readers, synthesis with fault classes, reconciliation of the implementation report, remediation actions, and spec-retro.md',
  whenToUse: 'Run by the kentra-rpir review skill after implementation',
  phases: [
    { title: 'Prepass', detail: 'lead, implementer and verifier signals and skeletons from each implement session; planning cost per role, split where the plan skill loads' },
    { title: 'Read', detail: 'one blind reader per milestone plus one for the planning sessions; troubled milestones read in full' },
    { title: 'Synthesize', detail: 'merge findings, assign fault classes including PLAN; reconcile the implementation report' },
    { title: 'Remediate', detail: 'one action per finding' },
    { title: 'Write', detail: 'spec-retro.md from the template, with planning cost and a short reconciliation' },
  ],
}

// args:
//   today, changeDir, projectRoot     (required)
//   spec, implReport, out             (required) absolute paths
//   plan        (optional) absolute path; absent at the small tier
//   template                          (required) absolute path of templates/spec-retro.md
//   sessions    (required) [{ id, stage, path, missing? }]; stage may join stages with '+';
//                          path null only when missing is true
//   planningLog (optional) absolute path of <change>/planning-log.jsonl
//   milestones  (required) [{ number, slug, paths, diffRange }]; diffRange like <base>..<merge>
//   priorRetros (optional) absolute paths of earlier spec-retro.md files
//   roles       (required) { prepass, reader, retro }, each { agent, model }
//   versions    (optional) { plugin, claudeCode }
//   research    (optional) { dir, index }: absolute paths of the change's research/ folder and the project's research index

const ONLY_JOB = 'Your only job is the task below. The conversation may relay the user\'s latest message to you; treat it as background and never answer it.'

for (const k of ['today', 'changeDir', 'projectRoot', 'spec', 'implReport', 'out', 'template', 'sessions', 'milestones', 'roles']) {
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
const planningSessions = present.filter(s => stagesOf(s).includes('plan'))
const missing = args.sessions.filter(s => s.missing)
if (missing.length) log(`transcripts missing: ${missing.map(s => `${s.id} (${s.stage})`).join(', ')}`)
if (!implSessions.length) log('no session has stage "implement" — pre-pass and reader signals will be empty')
const milestoneList = args.milestones.map(m => `M${m.number} ${m.slug} — paths ${JSON.stringify(m.paths)}`).join('\n')

// 1. Pre-pass
const sessionDir = s => s.path.replace(/\.jsonl$/, '')

const LAYOUT = dir => `Transcript layout: the session's subagent transcripts, nested ones included, sit flat in ${dir}/subagents/agent-<id>.jsonl. Beside each is agent-<id>.meta.json, e.g. {"agentType":"kentra-rpir:verifier","description":"Verify M4 readme","parentAgentId":"a6e4…","spawnDepth":2,"model":"opus"}; parentAgentId is present only for an agent another subagent dispatched. An agent resumed with SendMessage (a SendMessage tool_use whose input.to is its id) continues in the same transcript file. An agent's first user message is its dispatch prompt.
Roles:
- lead: description \`Lead M<n> <slug>\`, prompt line 1 "You are leading milestone M<n> \`<slug>\`"; its hand-backs carry STATUS: DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED or WAITING.
- verifier: description \`Verify M<n> <slug>\` or \`Re-verify M<n> …\`, prompt line 1 "You are verifying milestone M<n> \`<slug>\`"; its hand-backs carry VERDICT: PASS or FAIL.
- implementer: dispatched by a lead (its parentAgentId is the lead's id), description \`M<n> <piece>\`.
- research job: description \`research <job id>: <slug>\`, agentType ending lookup (fact job), spike (premise) or researcher (survey); its prompt has a "Report: write it to <path>" line. A lookup or advisor nested in a job has parentAgentId = the job's agent.
- reviewer: agentType ending reviewer, description \`Review <name>\`; prompt line 1 contains "a full review" or "a diff review".
- anything else: other.`

const FRESH_TOKENS = 'Fresh tokens are the sum of usage.input_tokens + usage.cache_creation_input_tokens + usage.output_tokens over assistant messages, counting each message.id once, from its last transcript line (a message spans several lines and its output_tokens grows across them). Time (agentMs, wallMs) runs from the first to the last timestamp of the transcript or transcripts concerned.'

const PREPASS_SCHEMA = {
  type: 'object',
  properties: {
    claudeCodeVersion: { type: 'string' },
    compactions: { type: 'number' },
    orchestrator: { type: 'object', properties: { freshTokens: { type: 'number' }, wallMs: { type: 'number' } } },
    milestones: { type: 'array', items: { type: 'object', properties: {
      slug: { type: 'string' },
      leadRounds: { type: 'number' },
      implementers: { type: 'number' },
      verifierFails: { type: 'number' },
      writesOutsidePaths: { type: 'array', items: { type: 'string' } },
      testRuns: { type: 'number' },
      errors: { type: 'number' },
      blocked: { type: 'boolean' },
      verifyRounds: { type: 'number' }, verifyResumes: { type: 'number' }, waits: { type: 'number' }, wallMs: { type: 'number' },
      agents: { type: 'array', items: { type: 'object', properties: {
        role: { type: 'string', enum: ['lead', 'implementer', 'verifier', 'other'] },
        id: { type: 'string' }, description: { type: 'string' }, parentId: { type: 'string' }, model: { type: 'string' },
        transcript: { type: 'string' }, freshTokens: { type: 'number' }, agentMs: { type: 'number' },
      }, required: ['role', 'transcript'] } },
    }, required: ['slug', 'leadRounds', 'implementers', 'verifierFails', 'writesOutsidePaths', 'testRuns', 'errors', 'blocked'] } },
    skeletons: { type: 'array', items: { type: 'object', properties: {
      slug: { type: 'string' },
      events: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, event: { type: 'string' } }, required: ['ref', 'event'] } },
    }, required: ['slug', 'events'] } },
  },
  required: ['milestones', 'skeletons'],
}

const PLANNING_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    stages: { type: 'string' },
    planStartRef: { type: 'string' },
    main: { type: 'object', properties: {
      beforePlan: { type: 'object', properties: { freshTokens: { type: 'number' }, wallMs: { type: 'number' } } },
      planStage: { type: 'object', properties: { freshTokens: { type: 'number' }, wallMs: { type: 'number' } } },
    } },
    agents: { type: 'array', items: { type: 'object', properties: {
      role: { type: 'string', enum: ['reviewer', 'lookup', 'spike', 'researcher', 'advisor', 'other'] },
      mode: { type: 'string', enum: ['full', 'diff'] },
      job: { type: 'string' }, parentId: { type: 'string' },
      part: { type: 'string', enum: ['before plan', 'plan stage'] },
      description: { type: 'string' }, model: { type: 'string' }, transcript: { type: 'string' }, report: { type: 'string' },
      freshTokens: { type: 'number' }, agentMs: { type: 'number' },
    }, required: ['role', 'part'] } },
    questionRounds: { type: 'number' },
    statusResets: { type: 'array', items: { type: 'object', properties: {
      from: { type: 'string' }, to: { type: 'string' }, ref: { type: 'string' },
    } } },
  },
  required: ['id', 'planStartRef', 'agents', 'questionRounds', 'statusResets'],
}

phase('Prepass')
const prepassResults = await parallel([
  ...implSessions.map(s => () => agent(`${ONLY_JOB}

Extract signals from an implementation session. The orchestrator transcript is ${s.path}.

${LAYOUT(sessionDir(s))}

Milestones:
${milestoneList}

For each milestone, list every lead, implementer and verifier agent of it (role, id, description, parentId, model, transcript path, freshTokens, agentMs) and count:
- leadRounds: the lead's dispatch plus each SendMessage to it that carries verifier findings, guidance or an answer (passing on an implementer's report after WAITING continues the round)
- implementers: the implementers its leads dispatched
- verifyRounds: fresh verifier dispatches plus SendMessage resumes of a verifier; verifyResumes: the resumes among them
- verifierFails: verifier FAIL verdicts
- waits: the lead's WAITING hand-backs
- errors and non-zero exits, and test runs, across all its agents
Also list files written outside its paths. Mark it blocked when no "Merge M<n>" merge (git merge --no-ff … -m "Merge M<n> …") happened. wallMs runs across its agents' transcripts. ${FRESH_TOKENS} For the orchestrator transcript itself, give orchestrator.freshTokens and orchestrator.wallMs. Record the Claude Code version (the "version" field on transcript lines) and the number of compact_boundary markers.

Then write a skeleton timeline per milestone: one event per dispatch, resume, hand-back (with its STATUS or VERDICT), error, retry, user message and merge, each with its ref <file>:<line>.

Use jq and grep through Bash; read leniently and skip lines you cannot parse. You are done when every milestone listed above has counts and a skeleton.`,
    as('prepass', { label: `prepass:${s.id}`, phase: 'Prepass', schema: PREPASS_SCHEMA }))),
  ...planningSessions.map(s => () => agent(`${ONLY_JOB}

Extract planning-cost metrics from a planning session. This session's id is "${s.id}" and its stages are "${s.stage}" — copy them verbatim into your report's \`id\` and \`stages\` fields. The main transcript is ${s.path}.

${LAYOUT(sessionDir(s))}

The plan stage starts where the plan skill first loads: a Skill tool_use whose input.skill is "kentra-rpir:plan", or a user message holding <command-name>/kentra-rpir:plan</command-name>. Give that line as planStartRef (<file>:<line>). Work before it is "before plan"; the rest is "plan stage". When the plan skill never loads, everything is plan stage and planStartRef is ''. When the implement skill (kentra-rpir:implement) or the review skill (kentra-rpir:review) loads later in the same session, planning ends there: leave out everything after it.

Report:
- main: the main transcript's own freshTokens and wallMs on each side of planStartRef (beforePlan, planStage)
- agents: every subagent dispatched in planning, with role, mode (reviewer: full or diff), job (a research job's id), parentId, part, description, model, transcript path, report (a research job's path from its prompt's "Report:" line), freshTokens and agentMs. ${FRESH_TOKENS}
- questionRounds: an assistant turn that calls AskUserQuestion, or whose last text ends in a question, followed by a user message — one round per such exchange
- statusResets: every \`status:\` edit to spec.md or plan.yaml that moves backwards in draft → agreed → planned → implementing → in-review → done, each as { from, to, ref: "<file>:<line>" }

Use jq and grep through Bash; read leniently and skip lines you cannot parse. You are done when every agent in subagents/ dispatched before the end of planning is listed.`,
    as('prepass', { label: `prepass:planning:${s.id}`, phase: 'Prepass', schema: PLANNING_SCHEMA }))),
])
const prepasses = prepassResults.slice(0, implSessions.length)
const planningPrepasses = prepassResults.slice(implSessions.length)

// Unmeasured cost stays null (not 0): a field no pre-pass reported is unknown,
// not zero. Adds only the operands that are numbers; null + null stays null.
const addCost = (a, b) => (typeof a === 'number' || typeof b === 'number') ? (typeof a === 'number' ? a : 0) + (typeof b === 'number' ? b : 0) : null

const signals = new Map()
const skeletons = new Map()
for (const p of prepasses.filter(Boolean)) {
  for (const m of p.milestones || []) {
    const prev = signals.get(m.slug)
    signals.set(m.slug, prev ? {
      ...prev,
      leadRounds: prev.leadRounds + m.leadRounds,
      implementers: prev.implementers + m.implementers,
      verifierFails: prev.verifierFails + m.verifierFails,
      writesOutsidePaths: [...prev.writesOutsidePaths, ...m.writesOutsidePaths],
      testRuns: prev.testRuns + m.testRuns,
      errors: prev.errors + m.errors,
      blocked: prev.blocked && m.blocked,
      agents: [...prev.agents, ...(m.agents || [])],
      verifyRounds: addCost(prev.verifyRounds, m.verifyRounds),
      verifyResumes: addCost(prev.verifyResumes, m.verifyResumes),
      waits: addCost(prev.waits, m.waits),
      wallMs: addCost(prev.wallMs, m.wallMs),
    } : { ...m, agents: m.agents || [], verifyRounds: addCost(undefined, m.verifyRounds), verifyResumes: addCost(undefined, m.verifyResumes), waits: addCost(undefined, m.waits), wallMs: addCost(undefined, m.wallMs) })
  }
  for (const sk of p.skeletons || []) skeletons.set(sk.slug, [...(skeletons.get(sk.slug) || []), ...sk.events])
}
const claudeCodeVersion = prepasses.find(p => p?.claudeCodeVersion)?.claudeCodeVersion || args.versions?.claudeCode || 'unknown'

const roleTokens = (agents, role) => (agents || []).filter(a => a.role === role).reduce((t, a) => addCost(t, a.freshTokens), null)

const implementation = {
  milestones: args.milestones.map(m => {
    const s = signals.get(m.slug) || {}
    const tokens = { lead: roleTokens(s.agents, 'lead'), implementers: roleTokens(s.agents, 'implementer'), verifiers: roleTokens(s.agents, 'verifier') }
    return {
      number: m.number, slug: m.slug, leadRounds: s.leadRounds || 0, implementers: s.implementers || 0,
      verifyRounds: s.verifyRounds ?? null, verifyResumes: s.verifyResumes ?? null, waits: s.waits ?? null,
      tokens, freshTokens: addCost(addCost(tokens.lead, tokens.implementers), tokens.verifiers), wallMs: s.wallMs ?? null,
    }
  }),
  orchestrator: prepasses.filter(Boolean).reduce((o, p) => ({
    freshTokens: addCost(o.freshTokens, p.orchestrator?.freshTokens),
    wallMs: addCost(o.wallMs, p.orchestrator?.wallMs),
  }), { freshTokens: null, wallMs: null }),
}

const troubled = s => !s || s.blocked || s.leadRounds > 1 || s.verifierFails > 0 || s.errors > 0 || s.writesOutsidePaths.length > 0 || s.testRuns === 0

const PARTS = ['before plan', 'plan stage']
const ROLE_LABELS = ['reviewer · full', 'reviewer · diff', 'lookup · fact job', 'lookup · nested', 'spike', 'researcher', 'advisor', 'other']
const roleLabel = a => a.role === 'reviewer' ? (a.mode === 'diff' ? 'reviewer · diff' : 'reviewer · full')
  : a.role === 'lookup' ? (a.parentId ? 'lookup · nested' : 'lookup · fact job')
  : a.role
const planning = planningPrepasses.map((p, i) => p && { p, s: planningSessions[i] }).filter(Boolean).map(({ p, s }) => {
  const agents = p.agents || []
  const rows = []
  for (const part of PARTS) {
    const main = part === 'before plan' ? p.main?.beforePlan : p.main?.planStage
    rows.push({ part, role: 'main session', count: null, freshTokens: main?.freshTokens ?? null, time: main?.wallMs ?? null })
    for (const label of ROLE_LABELS) {
      const group = agents.filter(a => a.part === part && roleLabel(a) === label)
      if (!group.length) continue
      rows.push({
        part, role: label, count: group.length,
        freshTokens: group.reduce((t, a) => addCost(t, a.freshTokens), null),
        time: group.reduce((t, a) => addCost(t, a.agentMs), null),
      })
    }
  }
  return {
    id: p.id || s.id, stages: p.stages || s.stage, planStartRef: p.planStartRef, rows,
    reviews: { full: agents.filter(a => a.role === 'reviewer' && a.mode !== 'diff').length, diff: agents.filter(a => a.role === 'reviewer' && a.mode === 'diff').length },
    researchJobs: { fact: agents.filter(a => a.role === 'lookup' && !a.parentId).length, premise: agents.filter(a => a.role === 'spike').length, survey: agents.filter(a => a.role === 'researcher').length },
    reports: agents.map(a => a.report).filter(Boolean),
    questionRounds: p.questionRounds, statusResets: p.statusResets,
  }
})

const models = [...new Set([
  ...[...prepasses, ...planningPrepasses].filter(Boolean).flatMap(p => [...(p.milestones || []).flatMap(m => m.agents || []), ...(p.agents || [])]).filter(a => a.model).map(a => `${a.role}: ${a.model}`),
  ...Object.entries(roles).map(([k, v]) => `retro ${k}: ${v.model}`),
])].join(', ')
const implementationJson = JSON.stringify(implementation)

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
    research: { type: 'array', items: { type: 'object', properties: {
      report: { type: 'string' }, kind: { type: 'string' }, verdict: { type: 'string' }, confidence: { type: 'string' }, restsOn: { type: 'string' }, note: { type: 'string' },
    }, required: ['report'] } },
  },
  required: ['milestone', 'mode', 'timeline', 'findings', 'went_well'],
}

phase('Read')
const planningDirs = planningSessions.map(sessionDir).join(' or ') || '(no planning session)'
const implDirs = implSessions.map(sessionDir).join(' or ') || '(no implement session)'

const planningRead = () => agent(`${ONLY_JOB}

MODE: full

You are a blind reader for the planning sessions (the plan stage) of the change in ${args.changeDir}. You have not seen what the implementing agents said about their own work, and you must not look for it — do not open the implementation report in the change folder. The research reports are readable.

${LAYOUT(planningDirs)}

Read:
- the planning log first, and the planning transcripts in place where the log is not enough: ${args.planningLog || '(no planning log given)'}${planningSessions.length ? `; transcripts ${planningSessions.map(x => x.path).join(', ')}` : ''}
- the spec: ${args.spec}, with its Premises table and its <!-- writer-gaps --> comment
${args.plan ? `- the plan: ${args.plan}, with its \`# premises:\` and \`# writerGaps:\` blocks` : '- no plan file: a small-tier change'}
${args.research?.dir ? `- the research reports: ${args.research.dir}` : ''}
${args.research?.index ? `- the research index: ${args.research.index}` : ''}
- the planning cost: ${JSON.stringify(planning)}

Look for:
- work before the plan skill that belonged in the stage, or was wasted
- research sized wrong; research re-run though the index held a settled row at the same version; a spike on a normal premise
- a spec Premises row that disagrees with its report's Conclusion; a Conclusion resting only on a vendor benchmark or secondary summary; a refuted or unverified premise not taken to the user
- a gap the joint review should have caught; a substantive edit with no diff review
- status resets; questions the user had to ask

Fill \`research\` with one entry per research report: report path, kind (fact, premise or survey), verdict, confidence, what its Conclusion rests on, and a note.

Report milestone as "planning". Every claim cites <file>:<line> and a short verbatim quote. Note what went well. You are done when the timeline is written and every finding has evidence.`,
  as('reader', { label: 'read:planning', phase: 'Read', schema: READ_SCHEMA }))

const reads = await parallel([
  ...args.milestones.map(m => () => {
    const s = signals.get(m.slug)
    const mode = troubled(s) ? 'full' : 'skim'
    const agentList = s?.agents?.length
      ? s.agents.map(x => ({ role: x.role, description: x.description, transcript: x.transcript }))
      : (implSessions.length ? implSessions.map(x => x.path) : 'no transcript')
    return agent(`${ONLY_JOB}

MODE: ${mode}

You are a blind reader for milestone M${m.number} ${m.slug} of the change in ${args.changeDir}. You have not seen what the implementing agents said about their own work, and you must not look for it — do not open the implementation report in the change folder. The research reports are readable.

${LAYOUT(implDirs)}

Read:
- the spec: ${args.spec}
- ${args.plan ? `the plan: ${args.plan} (milestone ${m.slug})` : `no plan file: a small-tier change, the spec is the whole contract; the milestone's paths are ${JSON.stringify(m.paths)}`}
- the diff: \`git -C ${args.projectRoot} diff ${m.diffRange}\`
- the signals: ${JSON.stringify(s || 'none — the pre-pass found nothing for this milestone')}
- the skeleton timeline: ${JSON.stringify(skeletons.get(m.slug) || [])}
- the milestone's agents (role, description, transcript): ${JSON.stringify(agentList)}
${args.planningLog ? `- the planning log, when a finding may trace back to the spec or plan: ${args.planningLog}` : ''}

${mode === 'full'
      ? `Read the transcripts in full. Read the lead's briefs and its review of each hand-back; a wrong belief often starts in a brief. Write the timeline. For every failure, retry or deviation, find the decisive point: the earliest step where an agent acted on a wrong belief, working back from the first visible symptom. When a finding traces to a premise, cite the research report the spec's Premises row links${args.research?.dir ? ` (reports are in ${args.research.dir})` : ''}.`
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
    research: { type: 'array', items: { type: 'object', properties: {
      report: { type: 'string' }, kind: { type: 'string' }, verdict: { type: 'string' }, restsOn: { type: 'string' },
      heldUp: { type: 'string', enum: ['held', 'contradicted', 'not tested'] }, evidence: { type: 'string' },
    }, required: ['report', 'heldUp', 'evidence'] } },
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
const planningResearch = reads[reads.length - 1]?.research || []
const [synthesis, reconciliation] = await parallel([
  () => agent(`${ONLY_JOB}

Merge the blind readers' findings for the change in ${args.changeDir} into one list. Merge duplicates; keep every distinct finding. Give each an id (F1, F2, …) and one fault class:
- SPEC: the spec was ambiguous or wrong, including a premise a research report settled wrongly
- PLAN: the plan was ambiguous, wrong, or could not be built as written (a missing step, file, directory, type or pin)
- SKILL: a skill, agent definition or prompt was missing, wrong or harmful
- PROCESS: the workflow itself — a handoff, a verification step, the order of steps
- ENV: tools, dependencies, sandbox, flaky infrastructure
- MODEL: the model failed with adequate context in front of it
For each, say how the action made sense to the agent at the time, given what was in its context. Ask how, not why.
Write the outcome in two or three sentences from the verifier results in the readers' evidence — not from any report.

Readers' output (JSON): ${readsJson}
Planning cost (JSON): ${JSON.stringify(planning)}
Implementation cost (JSON): ${implementationJson}
Research reports the planning reader listed (JSON): ${JSON.stringify(planningResearch)}

Also fill \`research\`: one entry per research report in that list — report, kind, verdict, what it rests on, whether it held up (held, contradicted or not tested) judged against the milestone readers' evidence, and the evidence.

You are done when every reader finding is in exactly one merged finding.`,
    as('retro', { label: 'synthesis', phase: 'Synthesize', schema: SYNTH_SCHEMA })),
  () => agent(`${ONLY_JOB}

Check every claim in the implementation report ${args.implReport} against the blind readers' evidence below and, where that is silent, against the transcripts and \`git -C ${args.projectRoot} log\`. A claim is a statement of fact: an outcome, a count, a test passing, a decision, a concern settled. Verdict per claim: confirmed, contradicted or unsupported, with evidence.

Readers' output (JSON): ${readsJson}
Implementation counts from the pre-pass (JSON): ${implementationJson}
The report's Milestones table claims lead rounds, implementers and verify rounds (fresh / resumed) per milestone; the counts above are the pre-pass counts. Check those claims against them.

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

Write ${args.out} following the template ${args.template}. Fill every section from the JSON below; do not add findings of your own. A null field in it was not measured: write — for it. Write nothing else.

Header facts: change ${args.changeDir}; commits ${args.milestones.map(m => m.diffRange).join(', ')}; tier ${args.plan ? 'standard' : 'small'}; models ${models}; kentra-rpir ${args.versions?.plugin || 'unknown'}; Claude Code ${claudeCodeVersion}; sessions ${args.sessions.map(s => s.missing ? `${s.id}: ${s.stage} (transcript missing)` : `${s.id}: ${s.stage}`).join(', ')}.
${missing.length ? `Missing transcripts — list these in Open questions too: ${missing.map(s => `${s.id}: ${s.stage} (transcript missing)`).join(', ')}` : ''}

Readers (timelines): ${readsJson}
Planning cost (JSON): ${JSON.stringify(planning)}
Research (JSON): ${JSON.stringify(synthesis.research || [])}
Implementation cost (JSON): ${implementationJson}
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
  implementation,
  research: synthesis.research || [],
}
