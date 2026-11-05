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
  sessions: [{ id: 's1', stage: 'spec+plan', path: '/p/s1.jsonl' }, { id: 's2', stage: 'implement', path: '/p/s2.jsonl' }],
  planningLog: '/p/c/planning-log.jsonl',
  milestones: [{ number: 1, slug: 'core', paths: ['src/core/**'], diffRange: 'a..b' }, { number: 2, slug: 'cli', paths: ['src/cli/**'], diffRange: 'b..c' }],
  priorRetros: [], roles, versions: { plugin: '0.3.0' },
}
const specRetroPrepassOverride = {
  'prepass:s2': { claudeCodeVersion: '2.1.296', milestones: [
    { slug: 'core', dispatches: 1, verifierFails: 0, writesOutsidePaths: [], testRuns: 2, errors: 0, blocked: false, verifyRounds: 1, freshTokens: 120000, wallMs: 300000 },
    { slug: 'cli', dispatches: 3, verifierFails: 1, writesOutsidePaths: [], testRuns: 3, errors: 2, blocked: false, verifyRounds: 2, freshTokens: 340000, wallMs: 900000 },
  ], skeletons: [], orchestrator: { freshTokens: 80000, wallMs: 1500000 } },
}

export const fixtures = {
  'spec-retro': {
    'two milestones, one troubled': {
      args: specRetroArgs,
      overrides: specRetroPrepassOverride,
      expect: {
        'implement pre-pass labels are `prepass:s2` only': (_, c) => c.agents.filter(a => a.label.startsWith('prepass:') && !a.label.startsWith('prepass:planning:')).map(a => a.label).join() === 'prepass:s2',
        'one reader per milestone': (_, c) => c.agents.filter(a => a.label.startsWith('read:') && a.label !== 'read:planning').length === 2,
        'troubled milestone read in full': (_, c) => c.agents.find(a => a.label === 'read:cli').prompt.includes('MODE: full'),
        'clean milestone skimmed': (_, c) => c.agents.find(a => a.label === 'read:core').prompt.includes('MODE: skim'),
        'readers never see impl-report': (_, c) => c.agents.filter(a => a.label.startsWith('read:')).every(a => !a.prompt.includes('impl-report.md')),
        'reconciliation reads impl-report': (_, c) => c.agents.find(a => a.label === 'reconcile').prompt.includes('/p/c/impl-report.md'),
        'writer targets the out path': (_, c) => c.agents.find(a => a.label === 'write').prompt.includes('/p/c/spec-retro.md'),
        'models follow roles': (_, c) => c.agents.find(a => a.label === 'read:cli').model === 'sonnet' && c.agents.find(a => a.label === 'synthesis').model === 'opus',
      },
    },
    'planning pre-pass per planning session': {
      args: specRetroArgs,
      overrides: specRetroPrepassOverride,
      expect: {
        'exactly one planning prepass, on the prepass model': (_, c) => c.agents.filter(a => a.label.startsWith('prepass:planning:')).length === 1 && c.agents.find(a => a.label === 'prepass:planning:s1').model === 'haiku',
        'prompt names the session workflows dir': (_, c) => c.agents.find(a => a.label === 'prepass:planning:s1').prompt.includes('/p/s1/workflows/'),
      },
    },
    'planning reader runs in full': {
      args: specRetroArgs,
      overrides: specRetroPrepassOverride,
      expect: {
        'read:planning exists': (_, c) => c.agents.some(a => a.label === 'read:planning'),
        'prompt includes MODE: full': (_, c) => c.agents.find(a => a.label === 'read:planning').prompt.includes('MODE: full'),
        'prompt includes the planning log path': (_, c) => c.agents.find(a => a.label === 'read:planning').prompt.includes('/p/c/planning-log.jsonl'),
        'prompt never mentions impl-report.md': (_, c) => !c.agents.find(a => a.label === 'read:planning').prompt.includes('impl-report.md'),
      },
    },
    'PLAN class offered': {
      args: specRetroArgs,
      overrides: specRetroPrepassOverride,
      expect: {
        'synthesis prompt includes PLAN:': (_, c) => c.agents.find(a => a.label === 'synthesis').prompt.includes('PLAN:'),
      },
    },
    'reconciliation lists only non-confirmed claims': {
      args: specRetroArgs,
      overrides: {
        ...specRetroPrepassOverride,
        reconcile: { claims: [
          { claim: 'Claim A confirmed', verdict: 'confirmed', evidence: 'e1' },
          { claim: 'Claim B confirmed', verdict: 'confirmed', evidence: 'e2' },
          { claim: 'Claim C contradicted', verdict: 'contradicted', evidence: 'e3' },
        ] },
      },
      expect: {
        'write prompt includes the contradicted claim text': (_, c) => c.agents.find(a => a.label === 'write').prompt.includes('Claim C contradicted'),
        'write prompt includes the confirmed count': (_, c) => c.agents.find(a => a.label === 'write').prompt.includes('2 other claims were confirmed'),
        'write prompt excludes confirmed claims\' text': (_, c) => {
          const p = c.agents.find(a => a.label === 'write').prompt
          return !p.includes('Claim A confirmed') && !p.includes('Claim B confirmed')
        },
      },
    },
    'missing transcript is tolerated': {
      args: { ...specRetroArgs, sessions: [...specRetroArgs.sessions, { id: 's3', stage: 'implement', path: null, missing: true }] },
      overrides: specRetroPrepassOverride,
      expect: {
        'write prompt lists the missing session': (_, c) => c.agents.find(a => a.label === 'write').prompt.includes('s3: implement (transcript missing)'),
      },
    },
    'returns planning metrics': {
      args: specRetroArgs,
      overrides: {
        ...specRetroPrepassOverride,
        'prepass:planning:s1': { workflows: [{ runId: 'r1', name: 'self-review', stage: 'spec', mode: 'full', status: 'completed', durationMs: 60000, agentCount: 2, totalTokens: 5000, startTime: '2026-10-10T00:00:00Z' }] },
      },
      expect: {
        'one planning workflow recorded': r => r.planning[0].workflows.length === 1,
      },
    },
    'every implement session missing: readers get "no transcript"': {
      args: { ...specRetroArgs, sessions: [specRetroArgs.sessions[0], { id: 's2', stage: 'implement', path: null, missing: true }] },
      overrides: specRetroPrepassOverride,
      expect: {
        'milestone reader prompt says no transcript': (_, c) => c.agents.find(a => a.label === 'read:core').prompt.includes('no transcript'),
      },
    },
    'throws when every blind reader returns null': {
      args: specRetroArgs,
      overrides: { ...specRetroPrepassOverride, 'read:': null },
      throws: /every blind reader returned no result/,
    },
    'throws when synthesis returns null': {
      args: specRetroArgs,
      overrides: { ...specRetroPrepassOverride, synthesis: null },
      throws: /synthesis returned no result/,
    },
    'throws when reconciliation returns null': {
      args: specRetroArgs,
      overrides: { ...specRetroPrepassOverride, reconcile: null },
      throws: /reconciliation returned no result/,
    },
    'throws when remediation returns null': {
      args: specRetroArgs,
      overrides: { ...specRetroPrepassOverride, remediate: null },
      throws: /remediation returned no result/,
    },
    'throws when the writer returns null': {
      args: specRetroArgs,
      overrides: { ...specRetroPrepassOverride, write: null },
      throws: /writer returned no result/,
    },
    'throws when a role is missing': {
      args: { ...specRetroArgs, roles: { prepass: roles.prepass, reader: roles.reader } },
      throws: /args\.roles\.retro/,
    },
    'throws when a session has no path': {
      args: { ...specRetroArgs, sessions: [{ id: 's1', stage: 'spec' }, { id: 's2', stage: 'implement', path: '/p/c/sessions/s2.jsonl' }] },
      throws: /session "s1" has no path/,
    },
    'implementation cost reaches the writer': {
      args: specRetroArgs,
      overrides: specRetroPrepassOverride,
      expect: {
        'pre-pass asks for the cost fields': (_, c) => { const p = c.agents.find(a => a.label === 'prepass:s2').prompt; return p.includes('verifyRounds') && p.includes('freshTokens') && p.includes('wallMs') },
        'writer gets the implementation cost': (_, c) => { const p = c.agents.find(a => a.label === 'write').prompt; return p.includes('Implementation cost') && p.includes('340000') && p.includes('1500000') },
        'returns the implementation cost': r => r.implementation && r.implementation.milestones.length === 2 && r.implementation.orchestrator.freshTokens === 80000,
      },
    },
    'two implement sessions sum a shared milestone\'s cost': {
      args: { ...specRetroArgs, sessions: [...specRetroArgs.sessions, { id: 's3', stage: 'implement', path: '/p/s3.jsonl' }] },
      overrides: {
        ...specRetroPrepassOverride,
        'prepass:s3': { milestones: [
          { slug: 'cli', dispatches: 1, verifierFails: 0, writesOutsidePaths: [], testRuns: 1, errors: 0, blocked: false, verifyRounds: 1, freshTokens: 60000, wallMs: 400000 },
        ], skeletons: [] },
      },
      expect: {
        'cli cost sums across both sessions': r => {
          const cli = r.implementation.milestones.find(m => m.slug === 'cli')
          return cli.verifyRounds === 3 && cli.freshTokens === 400000 && cli.wallMs === 1300000
        },
      },
    },
    'a pre-pass with no cost fields leaves the milestone unmeasured, not zero': {
      args: specRetroArgs,
      overrides: {
        'prepass:s2': { claudeCodeVersion: '2.1.296', milestones: [
          { slug: 'core', dispatches: 1, verifierFails: 0, writesOutsidePaths: [], testRuns: 2, errors: 0, blocked: false },
          { slug: 'cli', dispatches: 3, verifierFails: 1, writesOutsidePaths: [], testRuns: 3, errors: 2, blocked: false },
        ], skeletons: [] },
      },
      expect: {
        'milestone cost is null, not zero': r => r.implementation.milestones.every(m => m.freshTokens === null && m.wallMs === null),
        'orchestrator cost is null, not zero': r => r.implementation.orchestrator.freshTokens === null && r.implementation.orchestrator.wallMs === null,
      },
    },
  },
}
