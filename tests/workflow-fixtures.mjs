// Per-workflow dry-run cases for tests/check-workflows.mjs.
// overrides: agent label prefix → the value that agent returns.
const roles = {
  reviewer: { agent: 'kentra-rpir:reviewer', model: 'opus' },
  prepass: { agent: 'kentra-rpir:retro', model: 'haiku' },
  reader: { agent: 'kentra-rpir:retro', model: 'sonnet' },
  retro: { agent: 'kentra-rpir:retro', model: 'opus' },
}
const research = { workflow: 'kentra-rpir:research', checker: 'sonnet', designer: 'opus', runner: 'sonnet', reasoner: 'opus' }
const SPIKE_DIR = '/p/c/research/spikes'
const OUT_DIR = '/p/c/research'
// Mirrors workflows/research.js's READABLE_SPIKES constant verbatim (E2 + the
// E3 sentence), so the readable-spike test can assert the full rule — not
// just a substring — reaches every spiking prompt.
const READABLE_SPIKES = 'Spikes must be readable by the user approving them. Write each spike as a file with the Write tool, then run it with one short command such as `sh <file>`. Never use heredocs, inline `python3 -c`/`sh -c`/`node -e` programs, chained or piped commands, `&`, command substitution or redirects, and never run anything that reads stdin. Write and run experiments only under `<spikeDir>/<slug>/`. Never run `git init` there or anywhere else.'

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
    { slug: 'core', dispatches: 1, verifierFails: 0, writesOutsidePaths: [], testRuns: 2, errors: 0, blocked: false },
    { slug: 'cli', dispatches: 3, verifierFails: 1, writesOutsidePaths: [], testRuns: 3, errors: 2, blocked: false },
  ], skeletons: [] },
}

export const fixtures = {
  research: {
    'rejects missing args': { args: {}, throws: /needs args/ },
    'one topic': {
      args: { today: '2026-10-11', topics: [{ name: 'Kafka 4.1 headers', importance: 'normal' }], checker: 'sonnet' },
      nullsOk: true, // best-effort: reports `failed` per topic instead of throwing
      expect: {
        'exactly one check agent, on sonnet': (_, c) => c.agents.length === 1 && c.agents[0].label === 'check:kafka-4-1-headers' && c.agents[0].model === 'sonnet',
        'no collect, design, run or judge agents': (_, c) => !c.agents.some(a => /^(collect|design|run|judge):/.test(a.label)),
        'every prompt opens with the only-job preamble': (_, c) => c.agents.every(a => a.prompt.startsWith('Your only job is the task below.')),
      },
    },
    'caps a long topic slug at 60 chars': {
      args: { today: '2026-10-11', topics: [{ name: 'A very long topic name that keeps going and going and going well past sixty characters' }] },
      nullsOk: true,
      expect: {
        'check label carries a slug no longer than 60 chars': (_, c) => c.agents.find(a => a.label.startsWith('check:')).label.split(':')[1].length <= 60,
      },
    },
    'no cap: 12 topics get 12 checkers': {
      args: { today: '2026-10-11', topics: Array.from({ length: 12 }, (_, i) => ({ name: `Topic ${i}` })) },
      nullsOk: true,
      expect: {
        '12 check agents run': (_, c) => c.agents.filter(a => a.label.startsWith('check:')).length === 12,
      },
    },
    'critical, low confidence: spikes': {
      args: { today: '2026-10-11', topics: [{ name: 'tr uppercases ascii', importance: 'critical' }], spikeDir: SPIKE_DIR },
      overrides: {
        'check:tr-uppercases-ascii': { verdict: 'verified', confidence: 'low', evidence: [], summary: 's', gaps: [] },
        'design:tr-uppercases-ascii': {
          experiments: [
            { id: 'gnu', file: `${SPIKE_DIR}/tr-uppercases-ascii/gnu.sh`, command: `sh ${SPIKE_DIR}/tr-uppercases-ascii/gnu.sh`, what: 'gnu tr' },
            { id: 'bsd', file: `${SPIKE_DIR}/tr-uppercases-ascii/bsd.sh`, command: `sh ${SPIKE_DIR}/tr-uppercases-ascii/bsd.sh`, what: 'bsd tr' },
          ],
          not_spikeable: '',
        },
      },
      nullsOk: true,
      expect: {
        '1 design agent, on opus': (_, c) => c.agents.filter(a => a.label.startsWith('design:')).length === 1 && c.agents.find(a => a.label.startsWith('design:')).model === 'opus',
        'no run agents': (_, c) => !c.agents.some(a => a.label.startsWith('run:')),
        '1 judge agent, on opus': (_, c) => c.agents.filter(a => a.label.startsWith('judge:')).length === 1 && c.agents.find(a => a.label.startsWith('judge:')).model === 'opus',
        'report is spike-depth with spike evidence': r => r.reports[0].depth === 'spike' && r.reports[0].evidence.startsWith('spike: research/spikes/'),
      },
    },
    'critical, high confidence: no spike': {
      args: { today: '2026-10-11', topics: [{ name: 'set -e matters', importance: 'critical' }], spikeDir: SPIKE_DIR },
      overrides: { 'check:set-e-matters': { verdict: 'verified', confidence: 'high', evidence: [], summary: 's', gaps: [] } },
      nullsOk: true,
      expect: {
        'no design, run or judge agents': (_, c) => !c.agents.some(a => /^(design|run|judge):/.test(a.label)),
        'report is docs-depth': r => r.reports[0].depth === 'docs',
      },
    },
    'normal, low confidence: no spike, stays unverified': {
      args: { today: '2026-10-11', topics: [{ name: 'busybox tr behaves like gnu', importance: 'normal' }] },
      overrides: { 'check:busybox-tr-behaves-like-gnu': { verdict: 'verified', confidence: 'low', evidence: [], summary: 's', gaps: [] } },
      nullsOk: true,
      expect: {
        'no design, run or judge agents': (_, c) => !c.agents.some(a => /^(design|run|judge):/.test(a.label)),
        'report is docs-depth, unverified': r => r.reports[0].depth === 'docs' && r.reports[0].verdict === 'unverified',
      },
    },
    'normal with spike: true: spikes': {
      args: { today: '2026-10-11', topics: [{ name: 'od byte order', importance: 'normal', spike: true }], spikeDir: SPIKE_DIR },
      overrides: {
        'design:od-byte-order': {
          experiments: [{ id: 'mac', file: `${SPIKE_DIR}/od-byte-order/mac.sh`, command: `sh ${SPIKE_DIR}/od-byte-order/mac.sh`, what: 'od on macOS' }],
          not_spikeable: '',
        },
      },
      nullsOk: true,
      expect: {
        '1 design agent runs': (_, c) => c.agents.filter(a => a.label.startsWith('design:')).length === 1,
        'no run agents': (_, c) => !c.agents.some(a => a.label.startsWith('run:')),
        '1 judge agent runs': (_, c) => c.agents.filter(a => a.label.startsWith('judge:')).length === 1,
      },
    },
    'critical, null checker: spikes': {
      args: { today: '2026-10-11', topics: [{ name: 'jq 1.7 supports ltrimstr', importance: 'critical' }], spikeDir: SPIKE_DIR },
      overrides: {
        'check:jq-1-7-supports-ltrimstr': null,
        'design:jq-1-7-supports-ltrimstr': {
          experiments: [{ id: 'e1', file: `${SPIKE_DIR}/jq-1-7-supports-ltrimstr/e1.sh`, command: `sh ${SPIKE_DIR}/jq-1-7-supports-ltrimstr/e1.sh`, what: 'x' }],
          not_spikeable: '',
        },
      },
      nullsOk: true,
      expect: {
        'design agent runs despite a null checker': (_, c) => c.agents.some(a => a.label.startsWith('design:')),
        'report is spike-depth': r => r.reports[0].depth === 'spike',
      },
    },
    'normal, null checker: in failed': {
      args: { today: '2026-10-11', topics: [{ name: 'shellcheck flags SC2312', importance: 'normal' }] },
      overrides: { 'check:shellcheck-flags-sc2312': null },
      nullsOk: true,
      expect: {
        'no design agent runs': (_, c) => !c.agents.some(a => a.label.startsWith('design:')),
        'topic ends up in failed': r => r.failed.includes('shellcheck flags SC2312'),
      },
    },
    'two critical topics: both designers run': {
      args: { today: '2026-10-11', topics: [{ name: 'topic a', importance: 'critical' }, { name: 'topic b', importance: 'critical' }], spikeDir: SPIKE_DIR },
      nullsOk: true,
      expect: {
        'both topics escalate independently': (_, c) => c.agents.some(a => a.label === 'design:topic-a') && c.agents.some(a => a.label === 'design:topic-b'),
      },
    },
    'designer returns no experiments': {
      args: { today: '2026-10-11', topics: [{ name: 'is this a behaviour claim', importance: 'critical' }], spikeDir: SPIKE_DIR },
      overrides: { 'design:is-this-a-behaviour-claim': { experiments: [], not_spikeable: 'not a behaviour claim' } },
      nullsOk: true,
      expect: {
        'no run or judge agent': (_, c) => !c.agents.some(a => /^(run|judge):/.test(a.label)),
        'report is docs-depth, unverified': r => r.reports[0].depth === 'docs' && r.reports[0].verdict === 'unverified',
      },
    },
    'models are overridable': {
      args: {
        today: '2026-10-11', topics: [{ name: 'model override check', importance: 'critical' }], spikeDir: SPIKE_DIR,
        checker: 'opus', designer: 'sonnet', reasoner: 'sonnet',
      },
      overrides: {
        'check:model-override-check': { verdict: 'verified', confidence: 'low', evidence: [], summary: 's', gaps: [] },
        'design:model-override-check': {
          experiments: [{ id: 'e1', file: `${SPIKE_DIR}/model-override-check/e1.sh`, command: `sh ${SPIKE_DIR}/model-override-check/e1.sh`, what: 'x' }],
          not_spikeable: '',
        },
      },
      nullsOk: true,
      expect: {
        'checker model reaches check:': (_, c) => c.agents.find(a => a.label.startsWith('check:')).model === 'opus',
        'designer model reaches design:': (_, c) => c.agents.find(a => a.label.startsWith('design:')).model === 'sonnet',
        'reasoner model reaches judge:': (_, c) => c.agents.find(a => a.label.startsWith('judge:')).model === 'sonnet',
      },
    },
    'readable-spike rule in every spiking prompt': {
      args: { today: '2026-10-11', topics: [{ name: 'spike readability', importance: 'critical' }], spikeDir: SPIKE_DIR },
      overrides: {
        'check:spike-readability': { verdict: 'verified', confidence: 'low', evidence: [], summary: 's', gaps: [] },
        'design:spike-readability': {
          experiments: [{ id: 'e1', file: `${SPIKE_DIR}/spike-readability/e1.sh`, command: `sh ${SPIKE_DIR}/spike-readability/e1.sh`, what: 'x' }],
          not_spikeable: '',
        },
      },
      nullsOk: true,
      expect: {
        'design prompt includes the full readable-spikes rule, with the E3 sentence': (_, c) => c.agents.find(a => a.label.startsWith('design:')).prompt.includes(READABLE_SPIKES),
        'judge prompt includes the full readable-spikes rule, with the E3 sentence': (_, c) => c.agents.find(a => a.label.startsWith('judge:')).prompt.includes(READABLE_SPIKES),
        'check prompt says run no code': (_, c) => c.agents.find(a => a.label.startsWith('check:')).prompt.includes('Run no code'),
      },
    },
    'critical topic without spikeDir: throws': {
      args: { today: '2026-10-11', topics: [{ name: 'needs a spike', importance: 'critical' }] },
      throws: /spikes need args\.spikeDir/,
    },
    'spikes stay in spikeDir; result.md written there': {
      args: { today: '2026-10-11', topics: [{ name: 'keep the spike', importance: 'critical' }], spikeDir: SPIKE_DIR, outDir: OUT_DIR },
      overrides: {
        'check:keep-the-spike': { verdict: 'verified', confidence: 'low', evidence: [], summary: 's', gaps: [] },
        'design:keep-the-spike': {
          experiments: [{ id: 'e1', file: `${SPIKE_DIR}/keep-the-spike/e1.sh`, command: `sh ${SPIKE_DIR}/keep-the-spike/e1.sh`, what: 'x', exit_code: 0, stdout: 'ok', stderr: '', timed_out: false }],
          not_spikeable: '',
        },
      },
      nullsOk: true,
      expect: {
        'design prompt names the spikeDir path': (_, c) => c.agents.find(a => a.label.startsWith('design:')).prompt.includes(`${SPIKE_DIR}/keep-the-spike/`),
        'design prompt tells the designer to run each experiment': (_, c) => c.agents.find(a => a.label.startsWith('design:')).prompt.includes('Run each experiment'),
        'judge re-runs and writes result.md in the spike dir': (_, c) => {
          const p = c.agents.find(a => a.label.startsWith('judge:')).prompt
          return p.includes('Re-run every experiment') && p.includes(`${SPIKE_DIR}/keep-the-spike/result.md`)
        },
        'the reported file is the spike\'s result.md': r => r.reports[0].file === `${SPIKE_DIR}/keep-the-spike/result.md`,
        'judge appends the spike verdict to the committed report': (_, c) => c.agents.find(a => a.label.startsWith('judge:')).prompt.includes(`${OUT_DIR}/keep-the-spike.md`),
      },
    },
    'checker writes its own report: no write agents': {
      args: { today: '2026-10-11', topics: [{ name: 'Kafka 4.1 headers', importance: 'normal' }], outDir: OUT_DIR, prefix: 'spec' },
      overrides: { 'check:spec-kafka-4-1-headers': { verdict: 'verified', confidence: 'high', evidence: [{ kind: 'docs', url: 'u', excerpt: 'e' }], summary: 's', gaps: [] } },
      nullsOk: true,
      expect: {
        'no write agents': (_, c) => !c.agents.some(a => a.label.startsWith('write:')),
        'checker prompt names its report file': (_, c) => c.agents[0].prompt.includes(`${OUT_DIR}/spec-kafka-4-1-headers.md`),
        'report carries the file path': r => r.reports[0].file === `${OUT_DIR}/spec-kafka-4-1-headers.md`,
      },
    },
    'prefix and duplicate slugs': {
      args: { today: '2026-10-11', topics: [{ name: 'Same topic' }, { name: 'Same topic' }], prefix: 'plan-review' },
      nullsOk: true,
      expect: {
        'labels carry the prefix and stay unique': (_, c) => {
          const labels = c.agents.filter(a => a.label.startsWith('check:')).map(a => a.label).sort()
          return labels.join() === 'check:plan-review-same-topic,check:plan-review-same-topic-2'
        },
      },
    },
    'runner arg is ignored': {
      args: { today: '2026-10-11', topics: [{ name: 'x' }], runner: 'sonnet' },
      nullsOk: true,
      expect: { 'still one checker, no runner': (_, c) => c.agents.length === 1 },
    },
  },
  'self-review': {
    'rejects a bad stage': { args: { today: '2026-10-11', stage: 'x', document: '/d', projectRoot: '/p', reviewer: roles.reviewer, research }, throws: /stage/ },
    'clean spec: no research, no triage': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research },
      overrides: { review: { checks: [{ id: 'S1', answer: 'yes', evidence: '' }], unchecked_claims: [] } },
      expect: {
        'reviewer runs with the role agent and model': (_, c) => c.agents[0].agentType === 'kentra-rpir:reviewer' && c.agents[0].model === 'opus',
        'research not called': (_, c) => c.workflows.length === 0,
        'no triage agent': (_, c) => !c.agents.some(a => a.label === 'triage'),
        'returns no findings': r => Array.isArray(r.findings) && r.findings.length === 0,
        'mode defaults to full': r => r.mode === 'full',
      },
    },
    'spec sources describe the planning log': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research },
      overrides: { review: { checks: [{ id: 'S1', answer: 'yes', evidence: '' }], unchecked_claims: [] } },
      expect: {
        'spec review prompt describes the planning log': (_, c) => c.agents[0].prompt.includes('planning log'),
      },
    },
    'throws when the reviewer returns null': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research },
      overrides: { review: null },
      throws: /reviewer returned no result/,
    },
    'plan with a no and a claim: research then triage': {
      args: { today: '2026-10-11', stage: 'plan', document: '/p/plan.yaml', projectRoot: '/p', spec: '/p/spec.md', constitution: '/p/constitution/constitution.md', reviewer: roles.reviewer, research, spikeDir: SPIKE_DIR },
      overrides: {
        review: { checks: [{ id: 'P4', answer: 'no', evidence: 'jackson unpinned' }], unchecked_claims: [{ claim: 'Jackson 2.18 supports records', why: 'M2 relies on it', importance: 'normal' }] },
        // The research workflow() call now actually runs (tests/check-workflows.mjs
        // executes workflows/research.js for real); its one tier-1 checker call
        // falls through to this override returning null, so research.failed
        // carries the claim exactly like a real refutation would.
        'check:1-jackson-2-18-supports-records': null,
        triage: { findings: [{ check: 'P4', kind: 'technical', summary: 'pin jackson', evidence: 'plan.yaml:40', fix: 'pin 2.18.2' }], research_outcomes: [] },
      },
      expect: {
        'research workflow called with the claim': (_, c) => c.workflows.length === 1 && c.workflows[0].name === 'kentra-rpir:research' && c.workflows[0].args.topics[0].name === 'Jackson 2.18 supports records',
        'research gets checker, designer, runner, reasoner and spikeDir': (_, c) => c.workflows[0].args.checker === 'sonnet' && c.workflows[0].args.designer === 'opus' && c.workflows[0].args.runner === 'sonnet' && c.workflows[0].args.reasoner === 'opus' && c.workflows[0].args.spikeDir === SPIKE_DIR,
        'claim topic carries an index-prefixed, short slug': (_, c) => c.workflows[0].args.topics[0].slug === '1-jackson-2-18-supports-records' && c.workflows[0].args.topics[0].slug.length <= 60,
        'claim topic carries its importance': (_, c) => c.workflows[0].args.topics[0].importance === 'normal',
        'plan checklist used': (_, c) => c.agents[0].prompt.includes('P12'),
        'triage ran': (_, c) => c.agents.some(a => a.label === 'triage'),
        'triage prompt lists the claim research could not verify': (_, c) => c.agents.find(a => a.label === 'triage').prompt.includes('Unresearched claims') && c.agents.find(a => a.label === 'triage').prompt.includes('Jackson 2.18 supports records'),
        'finding returned': r => r.findings.length === 1 && r.findings[0].kind === 'technical',
      },
    },
    'plan with two duplicate-text claims: slugs stay unique': {
      args: { today: '2026-10-11', stage: 'plan', document: '/p/plan.yaml', projectRoot: '/p', spec: '/p/spec.md', constitution: '/p/constitution/constitution.md', reviewer: roles.reviewer, research },
      overrides: {
        review: {
          checks: [{ id: 'P4', answer: 'no', evidence: 'x' }],
          unchecked_claims: [{ claim: 'Same claim text', why: 'a', importance: 'normal' }, { claim: 'Same claim text', why: 'b', importance: 'normal' }],
        },
        'check:1-same-claim-text': null,
        'check:2-same-claim-text': null,
        triage: { findings: [], research_outcomes: [] },
      },
      expect: {
        'both claims sent to research': (_, c) => c.workflows[0].args.topics.length === 2,
        'duplicate claim text still gets unique, index-prefixed slugs': (_, c) => {
          const [s1, s2] = c.workflows[0].args.topics.map(t => t.slug)
          return s1 === '1-same-claim-text' && s2 === '2-same-claim-text' && s1 !== s2
        },
      },
    },
    'claims already in the ledger are skipped': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research },
      overrides: {
        review: {
          checks: [{ id: 'S1', answer: 'yes', evidence: '' }],
          unchecked_claims: [
            { claim: 'Ledgered claim A', why: 'a', importance: 'normal', premise: 'P1' },
            { claim: 'Ledgered claim B', why: 'b', importance: 'normal', premise: 'P1' },
            { claim: 'New claim C', why: 'c', importance: 'normal' },
          ],
        },
        triage: { findings: [], research_outcomes: [] },
      },
      expect: {
        'exactly one research topic (2 ledger claims skipped)': (_, c) => c.workflows.length === 1 && c.workflows[0].args.topics.length === 1,
        'the remaining topic is the one without a premise': (_, c) => c.workflows[0].args.topics[0].name === 'New claim C',
      },
    },
    'reopened ledger premise is researched': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research },
      overrides: {
        review: {
          checks: [{ id: 'S1', answer: 'yes', evidence: '' }],
          unchecked_claims: [{ claim: 'Reopened claim', why: 'd', importance: 'normal', premise: 'P2', reopen: true }],
        },
        triage: { findings: [], research_outcomes: [] },
      },
      expect: {
        'one research topic for the reopened premise': (_, c) => c.workflows.length === 1 && c.workflows[0].args.topics.length === 1,
      },
    },
    'every ledger claim skipped: no research': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research },
      overrides: {
        review: {
          checks: [{ id: 'S4', answer: 'no', evidence: 'relies on a refuted premise' }],
          unchecked_claims: [{ claim: 'Ledgered claim E', why: 'e', importance: 'normal', premise: 'P3' }],
        },
        triage: { findings: [{ check: 'S4', kind: 'technical', summary: 's', evidence: 'e', fix: 'f' }], research_outcomes: [] },
      },
      expect: {
        'no workflow() call': (_, c) => c.workflows.length === 0,
        'triage still runs when there is a "no"': (_, c) => c.agents.some(a => a.label === 'triage'),
        'finding returned': r => r.findings.length === 1,
      },
    },
    'no cap: 8 claims give 8 topics': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research },
      overrides: {
        review: {
          checks: [{ id: 'S1', answer: 'yes', evidence: '' }],
          unchecked_claims: Array.from({ length: 8 }, (_, i) => ({ claim: `claim ${i}`, why: 'w', importance: 'normal' })),
        },
        triage: { findings: [], research_outcomes: [] },
      },
      expect: {
        '8 research topics, no cap': (_, c) => c.workflows.length === 1 && c.workflows[0].args.topics.length === 8,
      },
    },
    'maxClaims is ignored': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research, maxClaims: 2 },
      overrides: {
        review: {
          checks: [{ id: 'S1', answer: 'yes', evidence: '' }],
          unchecked_claims: Array.from({ length: 4 }, (_, i) => ({ claim: `maxclaims ${i}`, why: 'w', importance: 'normal' })),
        },
        triage: { findings: [], research_outcomes: [] },
      },
      expect: {
        'maxClaims is ignored: 4 claims give 4 topics': (_, c) => c.workflows.length === 1 && c.workflows[0].args.topics.length === 4,
      },
    },
    'critical claim left unverified reaches triage': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', transcripts: ['/p/s.jsonl'], constitution: null, reviewer: roles.reviewer, research, spikeDir: SPIKE_DIR },
      overrides: {
        review: {
          checks: [{ id: 'S1', answer: 'yes', evidence: '' }],
          unchecked_claims: [{ claim: 'Widget API supports batch', why: 'needed for M3', importance: 'critical' }],
        },
      },
      expect: {
        'triage prompt includes the claim and its importance': (_, c) => {
          const p = c.agents.find(a => a.label === 'triage').prompt
          return p.includes('Widget API supports batch') && p.includes('critical')
        },
      },
    },
    'diff mode: no research': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', reviewer: roles.reviewer, research, mode: 'diff', base: 'abc123', decision: 'add --shout flag' },
      overrides: { 'review:diff': { checks: [{ id: 'D1', answer: 'yes', evidence: '' }, { id: 'D2', answer: 'yes', evidence: '' }], unchecked_claims: [] } },
      expect: {
        'one agent, labelled review:diff': (_, c) => c.agents.length === 1 && c.agents[0].label === 'review:diff',
        'prompt includes D1, D2 and the base, not S1 or D3': (_, c) => c.agents[0].prompt.includes('D1') && c.agents[0].prompt.includes('D2') && c.agents[0].prompt.includes('abc123') && !c.agents[0].prompt.includes('S1') && !c.agents[0].prompt.includes('D3'),
        'no workflow() call, no triage': (_, c) => c.workflows.length === 0 && !c.agents.some(a => a.label === 'triage'),
        'result mode is diff': r => r.mode === 'diff',
      },
    },
    'diff mode with a ledgered claim: no research': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', reviewer: roles.reviewer, research, mode: 'diff', base: 'abc123', decision: 'add --shout flag' },
      overrides: {
        'review:diff': { checks: [{ id: 'D1', answer: 'yes', evidence: '' }, { id: 'D2', answer: 'yes', evidence: '' }], unchecked_claims: [{ claim: 'Ledgered claim in a diff', why: 'f', importance: 'normal', premise: 'P1' }] },
      },
      expect: {
        'no workflow() call': (_, c) => c.workflows.length === 0,
        'no triage (no "no", no unskipped claims)': (_, c) => !c.agents.some(a => a.label === 'triage'),
      },
    },
    'diff mode, plan: D3 included': {
      args: { today: '2026-10-11', stage: 'plan', document: '/p/plan.yaml', projectRoot: '/p', spec: '/p/spec.md', reviewer: roles.reviewer, research, mode: 'diff', base: 'def456', decision: 'reorder milestones' },
      overrides: { 'review:diff': { checks: [{ id: 'D1', answer: 'yes', evidence: '' }, { id: 'D2', answer: 'yes', evidence: '' }, { id: 'D3', answer: 'yes', evidence: '' }], unchecked_claims: [] } },
      expect: {
        'prompt includes D3 for a plan diff review': (_, c) => c.agents[0].prompt.includes('D3'),
      },
    },
    'diff mode with a new outside claim: researched': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', reviewer: roles.reviewer, research, mode: 'diff', base: 'abc123', decision: 'add --shout flag' },
      overrides: {
        'review:diff': { checks: [{ id: 'D1', answer: 'yes', evidence: '' }, { id: 'D2', answer: 'yes', evidence: '' }], unchecked_claims: [{ claim: 'New API returns 429 on limit', why: 'rate limit', importance: 'normal' }] },
        triage: { findings: [], research_outcomes: [] },
      },
      expect: {
        'one research topic for the diff-introduced claim': (_, c) => c.workflows.length === 1 && c.workflows[0].args.topics.length === 1,
      },
    },
    'diff mode without base or decision: throws': {
      args: { today: '2026-10-11', stage: 'spec', document: '/p/spec.md', projectRoot: '/p', reviewer: roles.reviewer, research, mode: 'diff' },
      throws: /needs base and decision/,
    },
    'throws when triage returns null': {
      args: { today: '2026-10-11', stage: 'plan', document: '/p/plan.yaml', projectRoot: '/p', spec: '/p/spec.md', constitution: '/p/constitution/constitution.md', reviewer: roles.reviewer, research },
      overrides: {
        review: { checks: [{ id: 'P4', answer: 'no', evidence: 'jackson unpinned' }], unchecked_claims: [] },
        triage: null,
      },
      throws: /triage returned no result/,
    },
  },
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
  },
}
