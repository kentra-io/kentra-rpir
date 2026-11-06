// Per-workflow dry-run cases for tests/check-workflows.mjs.
// overrides: agent label prefix → the value that agent returns.
const roles = {
  reviewer: { agent: 'kentra-rpir:reviewer', model: 'opus' },
  prepass: { agent: 'kentra-rpir:retro', model: 'haiku' },
  reader: { agent: 'kentra-rpir:retro', model: 'sonnet' },
  retro: { agent: 'kentra-rpir:retro', model: 'opus' },
}

const specRetroArgs = {
  today: '2026-10-11', changeDir: '/p/docs/changes/2026-10-11-demo', projectRoot: '/p',
  spec: '/p/c/spec.md', plan: '/p/c/plan.yaml', implReport: '/p/c/impl-report.md', out: '/p/c/spec-retro.md',
  template: '/plugin/templates/spec-retro.md',
  sessions: [{ id: 's1', stage: 'plan', path: '/p/s1.jsonl' }, { id: 's2', stage: 'implement', path: '/p/s2.jsonl' }],
  planningLog: '/p/c/planning-log.jsonl',
  research: { dir: '/p/c/research', index: '/p/docs/research/index.jsonl' },
  milestones: [{ number: 1, slug: 'core', paths: ['src/core/**'], diffRange: 'a..b' }, { number: 2, slug: 'cli', paths: ['src/cli/**'], diffRange: 'b..c' }],
  priorRetros: [], roles, versions: { plugin: '0.6.0' },
}
const { plan: _plan, ...smallTierArgs } = specRetroArgs

const sub = id => `/p/s2/subagents/agent-${id}.jsonl`
const specRetroPrepassOverride = {
  'prepass:s2': { claudeCodeVersion: '2.1.296', milestones: [
    { slug: 'core', leadRounds: 1, implementers: 2, verifierFails: 0, writesOutsidePaths: [], testRuns: 2, errors: 0, blocked: false,
      verifyRounds: 1, verifyResumes: 0, waits: 0, wallMs: 300000,
      agents: [
        { role: 'lead', id: 'l1', description: 'Lead M1 core', model: 'opus', transcript: sub('l1'), freshTokens: 50000, agentMs: 200000 },
        { role: 'implementer', id: 'i1', description: 'M1 parser', parentId: 'l1', model: 'sonnet', transcript: sub('i1'), freshTokens: 70000, agentMs: 150000 },
        { role: 'implementer', id: 'i2', description: 'M1 lexer', parentId: 'l1', model: 'sonnet', transcript: sub('i2'), freshTokens: 5000, agentMs: 50000 },
        { role: 'verifier', id: 'v1', description: 'Verify M1 core', model: 'opus', transcript: sub('v1'), freshTokens: 30000, agentMs: 60000 },
      ] },
    { slug: 'cli', leadRounds: 2, implementers: 1, verifierFails: 1, writesOutsidePaths: [], testRuns: 3, errors: 2, blocked: false,
      verifyRounds: 2, verifyResumes: 1, waits: 1, wallMs: 900000,
      agents: [
        { role: 'lead', id: 'l2', description: 'Lead M2 cli', model: 'opus', transcript: sub('l2'), freshTokens: 100000, agentMs: 500000 },
        { role: 'implementer', id: 'i3', description: 'M2 args', parentId: 'l2', model: 'sonnet', transcript: sub('i3'), freshTokens: 150000, agentMs: 300000 },
        { role: 'verifier', id: 'v2', description: 'Verify M2 cli', model: 'opus', transcript: sub('v2'), freshTokens: 90000, agentMs: 100000 },
      ] },
  ], skeletons: [], orchestrator: { freshTokens: 80000, wallMs: 1500000 } },
}
const specRetroPlanningOverride = {
  'prepass:planning:s1': {
    id: 's1', stages: 'plan', planStartRef: '/p/s1.jsonl:40',
    main: { beforePlan: { freshTokens: 11111, wallMs: 60000 }, planStage: { freshTokens: 22222, wallMs: 120000 } },
    agents: [
      { role: 'workflow', part: 'before plan', runId: 'wf_abc-123', description: 'research', freshTokens: 7000, harnessTokens: 7500, agentMs: 30000 },
      { role: 'workflow', part: 'plan stage', runId: 'wf_def-456', description: 'review', freshTokens: 9000, harnessTokens: 9500, agentMs: 40000 },
      { role: 'other', part: 'before plan', description: 'Explore repo', model: 'haiku', transcript: '/p/s1/subagents/agent-b1.jsonl', freshTokens: 3000, agentMs: 20000 },
      { role: 'reviewer', mode: 'full', part: 'plan stage', description: 'Review plan', model: 'opus', transcript: '/p/s1/subagents/agent-r1.jsonl', freshTokens: 40000, agentMs: 90000 },
      { role: 'spike', job: 'p1', part: 'plan stage', description: 'research p1: parser', model: 'opus', transcript: '/p/s1/subagents/agent-sp.jsonl', report: '/p/c/research/x.md', freshTokens: 50000, agentMs: 100000 },
      { role: 'lookup', part: 'plan stage', parentId: 'sp', description: 'nested lookup', model: 'haiku', transcript: '/p/s1/subagents/agent-n1.jsonl', freshTokens: 2000, agentMs: 10000 },
      { role: 'advisor', part: 'plan stage', parentId: 'sp', description: 'advisor', model: 'opus', transcript: '/p/s1/subagents/agent-a1.jsonl', freshTokens: 4000, agentMs: 15000 },
    ],
    questionRounds: 2, statusResets: [],
  },
}
const overridesAll = { ...specRetroPrepassOverride, ...specRetroPlanningOverride }
const prompt = (c, label) => c.agents.find(a => a.label === label).prompt

export const fixtures = {
  'spec-retro': {
    'two milestones, one troubled': {
      args: specRetroArgs,
      overrides: specRetroPrepassOverride,
      expect: {
        'implement pre-pass labels are `prepass:s2` only': (_, c) => c.agents.filter(a => a.label.startsWith('prepass:') && !a.label.startsWith('prepass:planning:')).map(a => a.label).join() === 'prepass:s2',
        'one reader per milestone': (_, c) => c.agents.filter(a => a.label.startsWith('read:') && a.label !== 'read:planning').length === 2,
        'troubled milestone read in full': (_, c) => prompt(c, 'read:cli').includes('MODE: full'),
        'full mode reads the lead\'s briefs': (_, c) => prompt(c, 'read:cli').includes('briefs'),
        'several implementers with one lead round and clean signals is skimmed': (_, c) => prompt(c, 'read:core').includes('MODE: skim'),
        'readers never see impl-report': (_, c) => c.agents.filter(a => a.label.startsWith('read:')).every(a => !a.prompt.includes('impl-report.md')),
        'reconciliation reads impl-report': (_, c) => prompt(c, 'reconcile').includes('/p/c/impl-report.md'),
        'reconcile prompt carries the pre-pass lead rounds': (_, c) => { const p = prompt(c, 'reconcile'); return p.includes('"leadRounds":2') && p.includes('"leadRounds":1') && p.includes('"verifyResumes":1') },
        'writer targets the out path': (_, c) => prompt(c, 'write').includes('/p/c/spec-retro.md'),
        'models follow roles': (_, c) => c.agents.find(a => a.label === 'read:cli').model === 'sonnet' && c.agents.find(a => a.label === 'synthesis').model === 'opus',
        'no prompt mentions self-review': (_, c) => c.agents.every(a => !a.prompt.includes('self-review')),
      },
    },
    'lead, nested implementer and spike job': {
      args: specRetroArgs,
      overrides: overridesAll,
      expect: {
        'read:core names the lead and the nested implementer transcripts': (_, c) => { const p = prompt(c, 'read:core'); return p.includes(sub('l1')) && p.includes(sub('i1')) },
        'core tokens are the per-role sums': r => { const m = r.implementation.milestones.find(x => x.slug === 'core'); return m.tokens.lead === 50000 && m.tokens.implementers === 75000 && m.tokens.verifiers === 30000 && m.freshTokens === 155000 },
        'core carries lead rounds, implementers, verify rounds': r => { const m = r.implementation.milestones.find(x => x.slug === 'core'); return m.leadRounds === 1 && m.implementers === 2 && m.verifyRounds === 1 && m.verifyResumes === 0 && m.waits === 0 },
        'research jobs counted': r => JSON.stringify(r.planning[0].researchJobs) === JSON.stringify({ fact: 0, premise: 1, survey: 0 }),
        'reviews counted': r => r.planning[0].reviews.full === 1 && r.planning[0].reviews.diff === 0,
        'research reports collected': r => r.planning[0].reports.join() === '/p/c/research/x.md',
        'main session rows on both sides of the plan skill': r => { const rows = r.planning[0].rows; const b = rows.find(x => x.part === 'before plan' && x.role === 'main session'); const p = rows.find(x => x.part === 'plan stage' && x.role === 'main session'); return b.freshTokens === 11111 && b.time === 60000 && p.freshTokens === 22222 },
        'one spike row with count 1': r => { const x = r.planning[0].rows.find(y => y.role === 'spike'); return x && x.count === 1 && x.freshTokens === 50000 },
        'nested lookup row, separate from the fact-job lookup': r => { const rows = r.planning[0].rows; return rows.find(x => x.role === 'lookup · nested').count === 1 && !rows.some(x => x.role === 'lookup · fact job') },
        'advisor row': r => r.planning[0].rows.some(x => x.role === 'advisor' && x.count === 1),
        'reviewer row is full': r => r.planning[0].rows.some(x => x.role === 'reviewer · full' && x.count === 1),
        'writer prompt has the before-plan main session tokens': (_, c) => prompt(c, 'write').includes('11111'),
        'writer prompt has the tier and the role models': (_, c) => { const p = prompt(c, 'write'); return p.includes('tier standard') && p.includes('lead: opus') && p.includes('implementer: sonnet') },
      },
    },
    'implement pre-pass reads the new roles': {
      args: specRetroArgs,
      overrides: overridesAll,
      expect: {
        'prompt names leads, verifiers, parentAgentId and the subagents dir': (_, c) => { const p = prompt(c, 'prepass:s2'); return p.includes('Lead M') && p.includes('Verify M') && p.includes('parentAgentId') && p.includes('/p/s2/subagents/') },
        'prompt no longer says implementer dispatches': (_, c) => !prompt(c, 'prepass:s2').includes('implementer dispatches'),
        'layout example is a nested implementer and names the SendMessage re-verify': (_, c) => { const p = prompt(c, 'prepass:s2'); return p.includes('"description":"M2 parser"') && /SendMessage[^\n]*Re-verify/.test(p) },
        'synthesis prompt mentions confidence': (_, c) => prompt(c, 'synthesis').includes('confidence'),
        'pre-pass asks for the cost fields': (_, c) => { const p = prompt(c, 'prepass:s2'); return p.includes('verifyRounds') && p.includes('freshTokens') && p.includes('wallMs') },
      },
    },
    'planning pre-pass per planning session': {
      args: specRetroArgs,
      overrides: overridesAll,
      expect: {
        'exactly one planning prepass, on the prepass model': (_, c) => c.agents.filter(a => a.label.startsWith('prepass:planning:')).length === 1 && c.agents.find(a => a.label === 'prepass:planning:s1').model === 'haiku',
        'prompt names the plan skill and the subagents dir': (_, c) => { const p = prompt(c, 'prepass:planning:s1'); return p.includes('kentra-rpir:plan') && p.includes('/p/s1/subagents/') },
        'prompt names the workflow journals and their agents': (_, c) => { const p = prompt(c, 'prepass:planning:s1'); return p.includes('/p/s1/workflows/') && p.includes('/p/s1/subagents/workflows/') },
        'workflow rows in both parts with harness tokens': (r) => { const rows = r.planning[0].rows; const b = rows.find(x => x.part === 'before plan' && x.role === 'workflow'); const p = rows.find(x => x.part === 'plan stage' && x.role === 'workflow'); return b && b.count === 1 && b.freshTokens === 7000 && b.harnessTokens === 7500 && p && p.count === 1 },
        'planning schema allows the workflow role': (_, c) => c.agents.find(a => a.label === 'prepass:planning:s1').schema.properties.agents.items.properties.role.enum.includes('workflow'),
        'workflow agents are not research jobs or reviews': r => JSON.stringify(r.planning[0].researchJobs) === JSON.stringify({ fact: 0, premise: 1, survey: 0 }) && r.planning[0].reviews.full === 1 && r.planning[0].reviews.diff === 0,
      },
    },
    'planning reader runs in full': {
      args: specRetroArgs,
      overrides: overridesAll,
      expect: {
        'read:planning exists': (_, c) => c.agents.some(a => a.label === 'read:planning'),
        'prompt includes MODE: full': (_, c) => prompt(c, 'read:planning').includes('MODE: full'),
        'prompt includes the planning log path': (_, c) => prompt(c, 'read:planning').includes('/p/c/planning-log.jsonl'),
        'prompt includes the research dir and index': (_, c) => { const p = prompt(c, 'read:planning'); return p.includes('/p/c/research') && p.includes('/p/docs/research/index.jsonl') },
        'prompt never mentions impl-report.md': (_, c) => !prompt(c, 'read:planning').includes('impl-report.md'),
        'look-for list says experiments or an advisor': (_, c) => { const p = prompt(c, 'read:planning'); return p.includes('experiments or an advisor on a normal premise') && !p.includes('a spike on a normal premise') },
      },
    },
    'PLAN class offered': {
      args: specRetroArgs,
      overrides: specRetroPrepassOverride,
      expect: {
        'synthesis prompt includes PLAN:': (_, c) => prompt(c, 'synthesis').includes('PLAN:'),
        'synthesis gets the implementation cost': (_, c) => prompt(c, 'synthesis').includes('Implementation cost'),
      },
    },
    'research verdicts flow from reader through synthesis to the result': {
      args: specRetroArgs,
      overrides: {
        ...overridesAll,
        'read:planning': { milestone: 'planning', mode: 'full', timeline: [], findings: [], went_well: [], research: [{ report: '/p/c/research/x.md', kind: 'premise', verdict: 'verified' }] },
        synthesis: { outcome: 'ok', findings: [], went_well: [], research: [{ report: '/p/c/research/x.md', kind: 'premise', verdict: 'verified', restsOn: 'docs', heldUp: 'held', evidence: 'e' }] },
      },
      expect: {
        'synthesis prompt lists the planning reader\'s research': (_, c) => prompt(c, 'synthesis').includes('/p/c/research/x.md'),
        'result and writer carry the research list': (r, c) => r.research.length === 1 && prompt(c, 'write').includes('"heldUp":"held"'),
      },
    },
    'small tier: no plan file': {
      args: smallTierArgs,
      overrides: overridesAll,
      expect: {
        'runs and the milestone reader says there is no plan file': (_, c) => prompt(c, 'read:core').includes('no plan file'),
        'writer gets tier small': (_, c) => prompt(c, 'write').includes('tier small'),
      },
    },
    'reconciliation lists only non-confirmed claims': {
      args: specRetroArgs,
      overrides: {
        ...overridesAll,
        reconcile: { claims: [
          { claim: 'Claim A confirmed', verdict: 'confirmed', evidence: 'e1' },
          { claim: 'Claim B confirmed', verdict: 'confirmed', evidence: 'e2' },
          { claim: 'Claim C contradicted', verdict: 'contradicted', evidence: 'e3' },
        ] },
      },
      expect: {
        'write prompt includes the contradicted claim text': (_, c) => prompt(c, 'write').includes('Claim C contradicted'),
        'write prompt includes the confirmed count': (_, c) => prompt(c, 'write').includes('2 other claims were confirmed'),
        'write prompt excludes confirmed claims\' text': (_, c) => {
          const p = prompt(c, 'write')
          return !p.includes('Claim A confirmed') && !p.includes('Claim B confirmed')
        },
      },
    },
    'missing transcript is tolerated': {
      args: { ...specRetroArgs, sessions: [...specRetroArgs.sessions, { id: 's3', stage: 'implement', path: null, missing: true }] },
      overrides: overridesAll,
      expect: {
        'write prompt lists the missing session': (_, c) => prompt(c, 'write').includes('s3: implement (transcript missing)'),
      },
    },
    'every implement session missing: readers get "no transcript"': {
      args: { ...specRetroArgs, sessions: [specRetroArgs.sessions[0], { id: 's2', stage: 'implement', path: null, missing: true }] },
      overrides: overridesAll,
      expect: {
        'milestone reader prompt says no transcript': (_, c) => prompt(c, 'read:core').includes('no transcript'),
      },
    },
    'throws when every blind reader returns null': {
      args: specRetroArgs,
      overrides: { ...overridesAll, 'read:': null },
      throws: /every blind reader returned no result/,
    },
    'throws when synthesis returns null': {
      args: specRetroArgs,
      overrides: { ...overridesAll, synthesis: null },
      throws: /synthesis returned no result/,
    },
    'throws when reconciliation returns null': {
      args: specRetroArgs,
      overrides: { ...overridesAll, reconcile: null },
      throws: /reconciliation returned no result/,
    },
    'throws when remediation returns null': {
      args: specRetroArgs,
      overrides: { ...overridesAll, remediate: null },
      throws: /remediation returned no result/,
    },
    'throws when the writer returns null': {
      args: specRetroArgs,
      overrides: { ...overridesAll, write: null },
      throws: /writer returned no result/,
    },
    'throws when a role is missing': {
      args: { ...specRetroArgs, roles: { prepass: roles.prepass, reader: roles.reader } },
      throws: /args\.roles\.retro/,
    },
    'throws when a session has no path': {
      args: { ...specRetroArgs, sessions: [{ id: 's1', stage: 'plan' }, { id: 's2', stage: 'implement', path: '/p/c/sessions/s2.jsonl' }] },
      throws: /session "s1" has no path/,
    },
    'implementation cost reaches the writer': {
      args: specRetroArgs,
      overrides: overridesAll,
      expect: {
        'writer gets the implementation cost': (_, c) => { const p = prompt(c, 'write'); return p.includes('Implementation cost') && p.includes('340000') && p.includes('1500000') },
        'returns the implementation cost': r => r.implementation && r.implementation.milestones.length === 2 && r.implementation.orchestrator.freshTokens === 80000,
      },
    },
    'two implement sessions sum a shared milestone\'s cost': {
      args: { ...specRetroArgs, sessions: [...specRetroArgs.sessions, { id: 's3', stage: 'implement', path: '/p/s3.jsonl' }] },
      overrides: {
        ...overridesAll,
        'prepass:s3': { milestones: [
          { slug: 'cli', leadRounds: 1, implementers: 1, verifierFails: 0, writesOutsidePaths: [], testRuns: 1, errors: 0, blocked: false,
            verifyRounds: 1, verifyResumes: 0, waits: 0, wallMs: 400000,
            agents: [{ role: 'lead', id: 'l9', transcript: '/p/s3/subagents/agent-l9.jsonl', freshTokens: 60000 }] },
        ], skeletons: [] },
      },
      expect: {
        'cli cost sums across both sessions': r => {
          const cli = r.implementation.milestones.find(m => m.slug === 'cli')
          return cli.leadRounds === 3 && cli.implementers === 2 && cli.verifyRounds === 3 && cli.verifyResumes === 1 && cli.waits === 1
            && cli.tokens.lead === 160000 && cli.tokens.implementers === 150000 && cli.tokens.verifiers === 90000 && cli.freshTokens === 400000 && cli.wallMs === 1300000
        },
      },
    },
    'a pre-pass with no cost fields leaves the milestone unmeasured, not zero': {
      args: specRetroArgs,
      overrides: {
        'prepass:s2': { claudeCodeVersion: '2.1.296', milestones: [
          { slug: 'core', leadRounds: 1, implementers: 1, verifierFails: 0, writesOutsidePaths: [], testRuns: 2, errors: 0, blocked: false },
          { slug: 'cli', leadRounds: 2, implementers: 1, verifierFails: 1, writesOutsidePaths: [], testRuns: 3, errors: 2, blocked: false },
        ], skeletons: [] },
        'prepass:planning:s1': { id: 's1', planStartRef: '', agents: [], questionRounds: 0, statusResets: [] },
      },
      expect: {
        'milestone cost is null, not zero': r => r.implementation.milestones.every(m => m.freshTokens === null && m.wallMs === null && m.tokens.lead === null && m.tokens.implementers === null && m.tokens.verifiers === null),
        'orchestrator cost is null, not zero': r => r.implementation.orchestrator.freshTokens === null && r.implementation.orchestrator.wallMs === null,
        'planning main-session rows are null, not zero': r => r.planning[0].rows.filter(x => x.role === 'main session').length === 2 && r.planning[0].rows.every(x => x.freshTokens === null && x.time === null),
      },
    },
  },
}
