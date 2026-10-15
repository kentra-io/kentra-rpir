export const meta = {
  name: 'plan-milestones',
  description: 'Writes every milestone of a kentra-rpir plan skeleton in parallel — one writer per milestone fills its own fragment file — researches the claims the writers depend on, and has each writer whose claims research did not verify revise its milestone',
  whenToUse: 'Run by the kentra-rpir plan skill after the skeleton review',
  phases: [
    { title: 'Write', detail: 'one writer per milestone fills its fragment file' },
    { title: 'Research', detail: 'the research workflow checks the claims the writers depend on' },
    { title: 'Revise', detail: 'each writer with a claim research did not verify revises its milestone' },
  ],
}

// args:
//   today, projectRoot, spec (required)
//   skeleton    (required) absolute path of the assembled skeleton plan.yaml
//   head        (required) absolute path of the draft's head.yaml
//   milestones  (required) [{ slug, file }] — one fragment file per milestone
//   only        (optional) slugs to (re)write; the rest are left alone
//   tier        (optional) 'full' | 'light', default 'full'
//   writer      (required) { agent, model }
//   research    (required) { workflow, checker, designer, reasoner }
//   researchDir, spikeDir (required) absolute paths
//   ledger      (optional) absolute paths holding the ledger: spec.md and the draft's tail.yaml

const ONLY_JOB = 'Your only job is the task below. The conversation may relay the user\'s latest message to you; treat it as background and never answer it.'

for (const k of ['today', 'projectRoot', 'spec', 'skeleton', 'head', 'milestones', 'writer', 'research', 'researchDir', 'spikeDir']) {
  if (!args || !args[k]) throw new Error(`plan-milestones needs args.${k}`)
}
const tier = args.tier || 'full'
const targets = args.only ? args.milestones.filter(m => args.only.includes(m.slug)) : args.milestones
if (!targets.length) throw new Error('plan-milestones: no milestone to write')

const TIER_TEXT = tier === 'light'
  ? 'This plan is `light` tier: some premises stay unverified on purpose. Write every step with the best code your knowledge supports. Where a step rests on an unverified premise, name the premise in the step (by its ledger ID when it has one) and state the outcome the code must reach, so the implementer can finish it.'
  : 'This plan is `full` tier: every step that changes code shows the complete code, and every step that runs a command shows the command and its expected result. A step resting on a claim research left unverified keeps its best code and names the claim; the plan\'s author takes that claim to the user.'

const WRITE_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    claims: { type: 'array', items: { type: 'object', properties: {
      claim: { type: 'string' }, why: { type: 'string' }, importance: { type: 'string', enum: ['critical', 'normal'] },
      premise: { type: 'string' }, reopen: { type: 'boolean' },
    }, required: ['claim', 'why', 'importance'] } },
    interface_requests: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['slug', 'claims', 'interface_requests', 'notes'],
}

const as = (label, phase) => ({ label, phase, agentType: args.writer.agent, model: args.writer.model, schema: WRITE_SCHEMA })

const writePrompt = m => `${ONLY_JOB}

Write milestone \`${m.slug}\` of the plan. Its skeleton is in ${m.file}; edit only ${m.file}.

- The spec: ${args.spec}
- The whole skeleton plan: ${args.skeleton}
- The plan-level description and rules: ${args.head}
${args.ledger && args.ledger.length ? `- The ledger (claims already settled; give a matching claim its premise id): ${args.ledger.join(', ')}\n` : ''}- The project: ${args.projectRoot}

${TIER_TEXT}

Keep the skeleton's slug, number, depends-on, paths, check, criterion names and cross-milestone signatures. When your milestone needs one of them changed, keep the skeleton's version and return the change under interface_requests.

You are done when ${m.file} holds the complete milestone and every claim your milestone depends on that the code and the ledger do not settle is listed under claims.`

phase('Write')
const written = await parallel(targets.map(m => () => agent(writePrompt(m), as(`write:${m.slug}`, 'Write'))))
const missing = targets.filter((m, i) => !written[i]).map(m => m.slug)
if (missing.length) log(`no result from the writer of: ${missing.join(', ')}`)
const results = targets.map((m, i) => written[i] && { ...written[i], slug: m.slug }).filter(Boolean)
if (!results.length) throw new Error('plan-milestones: no writer returned a result')

// Research: every claim not in the ledger (unless reopened), once each; at
// the light tier, critical claims only.
const byClaim = new Map()
for (const r of results) {
  for (const c of r.claims) {
    if (c.premise && !c.reopen) continue
    const prev = byClaim.get(c.claim)
    const importance = prev && prev.importance === 'critical' ? 'critical' : c.importance
    byClaim.set(c.claim, { ...c, importance, slugs: [...(prev ? prev.slugs : []), r.slug] })
  }
}
const fresh = [...byClaim.values()]
const toResearch = tier === 'light' ? fresh.filter(c => c.importance === 'critical') : fresh
const deferred = fresh.filter(c => !toResearch.includes(c)).map(c => ({
  claim: c.claim, importance: c.importance, status: 'unverified', confidence: 'none', evidence: 'not researched (light tier)', slugs: c.slugs,
}))

let outcomes = []
if (toResearch.length) {
  phase('Research')
  let res = null
  try {
    res = await workflow(args.research.workflow, {
      today: args.today,
      prefix: 'plan',
      topics: toResearch.map(c => ({ name: c.claim, focus: c.why, importance: c.importance })),
      question: `Plan for ${args.spec}: is each claim a milestone depends on true?`,
      checker: args.research.checker,
      designer: args.research.designer,
      reasoner: args.research.reasoner,
      outDir: args.researchDir,
      spikeDir: args.spikeDir,
    })
  } catch (e) {
    log(`research failed: ${e.message}`)
  }
  outcomes = toResearch.map(c => {
    const r = res && res.reports.find(x => x.topic === c.claim)
    return r
      ? { claim: c.claim, importance: c.importance, status: r.verdict, confidence: r.confidence, evidence: r.evidence, slugs: c.slugs }
      : { claim: c.claim, importance: c.importance, status: 'unverified', confidence: 'none', evidence: 'research produced no report', slugs: c.slugs }
  })
}

// Revise: a writer whose claim research did not verify reworks its milestone.
const unsettled = outcomes.filter(o => o.status !== 'verified')
const toRevise = targets.filter(m => unsettled.some(o => o.slugs.includes(m.slug)))
let revised = []
if (toRevise.length) {
  phase('Revise')
  revised = await parallel(toRevise.map(m => () => agent(`${ONLY_JOB}

You wrote milestone \`${m.slug}\` in ${m.file}. Research on the claims it depends on is below. Revise ${m.file} so the milestone rests only on what research verified: rework the code a refuted claim broke, and treat a claim still unverified by the tier rule below. Edit only ${m.file}.

${TIER_TEXT}

Research outcomes (JSON): ${JSON.stringify(unsettled.filter(o => o.slugs.includes(m.slug)))}

You are done when no step in ${m.file} relies on a refuted claim, and every step resting on an unverified claim follows the tier rule.`,
    as(`revise:${m.slug}`, 'Revise'))))
}

const latest = new Map(results.map(r => [r.slug, r]))
// A revision adds to the first write: keep both rounds' interface requests and notes.
toRevise.forEach((m, i) => {
  if (!revised[i]) return
  const prev = latest.get(m.slug)
  latest.set(m.slug, {
    ...revised[i],
    slug: m.slug,
    interface_requests: [...new Set([...prev.interface_requests, ...revised[i].interface_requests])],
    notes: [prev.notes, revised[i].notes].filter(Boolean).join('\n'),
  })
})

return {
  tier,
  milestones: [...latest.values()].map(r => ({ slug: r.slug, notes: r.notes })),
  missing,
  research: [...outcomes, ...deferred],
  interface_requests: [...latest.values()].flatMap(r => r.interface_requests.map(request => ({ slug: r.slug, request }))),
}
