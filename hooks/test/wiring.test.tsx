import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { RunState, Status } from '../../types'
import { styleOf } from '../register'

const PLUGIN = 'kentra-rpir'
const PANE = 'rpir-graph'
const SURFACES = ['terminal', 'desktop'] as const
/** The full CommandRunInput, as M1's scaffold.test.tsx raises it. */
const RUN_GRAPH = {
  command: 'rpir-graph',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const
const PANE_PROPS = {
  title: 'kentra-rpir', isFocused: false, bodyColumns: 60, placement: 'dock',
  scroll: { offset: 0, bodyRows: 80 }, view: {},
} as const

const MILESTONES = [
  '  - number: 1\n    slug: a\n    goal: Goal a\n',
  '  - number: 2\n    slug: b\n    goal: Goal b\n    depends-on: [a]\n',
  '  - number: 3\n    slug: c\n    goal: Goal c\n    depends-on: [a, b]\n',
]
const planYaml = (count: number) =>
  `schemaVersion: 0.3.0\ndescription: Demo\nmilestones:\n${MILESTONES.slice(0, count).join('')}`
const filesWithPlan = (count: number): Record<string, string | undefined> => ({
  '.kentra-rpir/sessions.map': 'S0 docs/changes/old implement\nS1 docs/changes/demo implement\n',
  'docs/changes/demo/spec.md': '---\ntitle: Demo change\n---\n\n## Problem\n',
  'docs/changes/demo/plan.yaml': planYaml(count),
})
const implPrompt = (n: number, slug: string) =>
  `You are implementing milestone M${n} \`${slug}\` of the change "Demo change".\n\nWork only in /x.`
const verifyPrompt = (n: number, slug: string) =>
  `You are verifying milestone M${n} \`${slug}\` of the change "Demo change".\n\nWork only in /x.`

type Kit = {
  clock: ReturnType<typeof mock.clock>
  files: Record<string, string | undefined>
  opened: string[]
  /** Open pane ids → isPlaced, answering ui.panes. */
  panes: Map<string, boolean>
  /** What the next ui.open answers: false = waiting (terminal too narrow). */
  placesOnOpen: boolean
  invalidations: () => number
  /** Latest value written to each of the plugin's $.state keys (the kit's Engine has no $.state). */
  states: Map<string, unknown>
  /** Answers a main-session Agent call; returns the subagent's report. */
  onAgent: ((e: { prompt?: unknown; tool_use_id?: string }) => Promise<string | object>) | null
}

function setup(on: On, files: Record<string, string | undefined>): Kit {
  let invalidations = 0
  let agents = 0
  const kit: Kit = {
    clock: mock.clock(on, { now: 1_000_000 }),
    files, opened: [], panes: new Map(), placesOnOpen: true,
    invalidations: () => invalidations, states: new Map(), onAgent: null,
  }
  on('state.set', async (_$, e, next) => {
    const result = await next(e)
    if (e.plugin === PLUGIN) kit.states.set(e.key, e.value)
    return result
  })
  on('session.id', () => ({ value: 'S1' }))
  on('session.root', () => ({ value: '/repo' }))
  on('fs.read', (_$, e) => {
    const hit = Object.keys(kit.files).find(k => e.path === k || e.path.endsWith(`/${k}`))
    const text = hit === undefined ? undefined : kit.files[hit]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('ui.panes', () => ({
    value: [...kit.panes].map(([id, isPlaced]) => ({ id, title: 'kentra-rpir', isShown: isPlaced, isFocused: false, isPlaced })),
  }))
  on('ui.open', (_$, e) => {
    kit.opened.push(e.id)
    kit.panes.set(e.id, kit.placesOnOpen)
    return {
      value: kit.placesOnOpen
        ? { isPlaced: true }
        : { isPlaced: false, reason: 'unasked pane waits below 144 columns (now 100)' },
    }
  })
  on('ui.close', (_$, e) => { kit.panes.delete(e.id); return { value: undefined } })
  on('ui.invalidate', () => { invalidations += 1; return { value: undefined } })
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', () => ({ model: 'test-model', agentId: `agent-${++agents}` }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', async (_$, e) => {
    if (e.tool === 'Agent' && kit.onAgent !== null) {
      const answer = await kit.onAgent(e as never)
      if (typeof answer !== 'string') return answer as never
      return { result: {}, text: answer } as never
    }
    return { result: { stdout: '', stderr: '', interrupted: false }, text: '' } as never
  })
  return kit
}

async function spawn($: Engine, prompt: string, toolUseId: string): Promise<string> {
  const result = await $.agent.spawn({
    tool_use_id: toolUseId, prompt, description: 'milestone', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'test-model', background: false, fork: false,
  } as never)
  return (result as { agentId: string }).agentId
}

/** A tool call from inside subagent `agentId`. */
async function subagentTool($: Engine, agentId: string, command: string): Promise<void> {
  await $.tool.call({ tool: 'Bash', command, agentId } as never)
}

async function finish($: Engine, agentId: string, answer: string): Promise<void> {
  await $.turn.complete({ agentId, answer, durationMs: 1, isAborted: false, turnId: `turn-${agentId}`, reason: 'answer' } as never)
}

const runOf = (kit: Kit): RunState | null => (kit.states.get('run') as RunState | null | undefined) ?? null
const paneOpenOf = (kit: Kit): boolean => (kit.states.get('isPaneOpen') as boolean | undefined) ?? false

test('milestone dispatch starts tracking and opens the pane', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  let during: RunState | null = null
  kit.onAgent = async e => {
    const agentId = await spawn($, String(e.prompt), e.tool_use_id ?? 'tu-1')
    await subagentTool($, agentId, 'ls')
    during = runOf(kit)
    return 'Implemented.\n\nSTATUS: DONE'
  }
  await $.tool.call({ tool: 'Agent', prompt: implPrompt(1, 'a'), description: 'M1 a', subagent_type: 'general-purpose' } as never)

  const run = (runOf(kit))!
  const milestone = run.milestones['a']!
  expect(milestone.agents).toHaveLength(1)
  const agentId = milestone.agents[0]!
  expect(during!.agents[agentId]!.lastTool).toBe('Bash: ls')
  const agent = run.agents[agentId]!
  expect(agent.role).toBe('impl')
  expect(agent.lastTool).toBeNull()
  expect(agent.endedAt).not.toBeNull()
  expect(agent.outcome).toBe('DONE')
  expect(kit.opened).toContain(PANE)
})

test('non-milestone dispatch is ignored', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  await spawn($, 'Explore the repository and list the build files.', 'tu-1')
  expect(runOf(kit)).toBeNull()
  expect(kit.opened).toEqual([])
})

test('merge bash marks the milestone merged', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  const impl = await spawn($, implPrompt(2, 'b'), 'tu-1')
  await finish($, impl, 'STATUS: DONE')
  const verifier = await spawn($, verifyPrompt(2, 'b'), 'tu-2')
  await finish($, verifier, 'VERDICT: PASS')
  await $.tool.call({ tool: 'Bash', command: 'git -C /x merge --no-ff rpir/a--m2 -m "Merge M2 b"' } as never)

  expect((runOf(kit))!.milestones['b']!.mergedAt).not.toBeNull()
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: PANE_PROPS, requestId: PANE } as never)
    expect(await ui.find({ type: 'Text', text: /✓ merged/ })).toBeDefined()
    await ui.unmount()
  }
})

test('pane draws header rows as Buttons', async ($, on) => {
  setup(on, filesWithPlan(3))
  await spawn($, implPrompt(1, 'a'), 'tu-1')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: PANE_PROPS, requestId: PANE } as never)
    for (const slug of ['a', 'b', 'c']) {
      expect((await ui.find({ key: `m-${slug}` }))?.type).toBe('Button')
    }
    expect(await ui.find({ type: 'Text', text: /1 implementing/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 waiting/ })).toBeDefined()
    await ui.unmount()
  }
})

test('later dispatch reloads the plan', async ($, on) => {
  const kit = setup(on, filesWithPlan(2))
  await spawn($, implPrompt(1, 'a'), 'tu-1')
  expect((runOf(kit))!.plan!.milestones).toHaveLength(2)
  kit.files['docs/changes/demo/plan.yaml'] = planYaml(3)
  await spawn($, implPrompt(2, 'b'), 'tu-2')
  expect((runOf(kit))!.plan!.milestones).toHaveLength(3)
})

test('no plan draws the error and the seen milestones', async ($, on) => {
  const kit = setup(on, {})
  await spawn($, implPrompt(2, 'b'), 'tu-1')
  const run = (runOf(kit))!
  expect(run.plan).toBeNull()
  expect(run.planError).not.toBeNull()
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: PANE_PROPS, requestId: PANE } as never)
    expect(await ui.find({ type: 'Text', text: /plan could not be found/ })).toBeDefined()
    expect((await ui.find({ key: 'm-b' }))?.text).toMatch(/M2 b/)
    await ui.unmount()
  }
})

test('timer runs only while an agent runs', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  const agentId = await spawn($, implPrompt(1, 'a'), 'tu-1')
  const start = kit.invalidations()
  for (let i = 0; i < 3; i += 1) await kit.clock.advance(1000)
  const whileRunning = kit.invalidations() - start
  expect(whileRunning).toBeGreaterThanOrEqual(2)
  expect(whileRunning).toBeLessThanOrEqual(4)
  await finish($, agentId, 'STATUS: DONE')
  const afterFinish = kit.invalidations()
  for (let i = 0; i < 3; i += 1) await kit.clock.advance(1000)
  expect(kit.invalidations()).toBe(afterFinish)
})

test('closing the pane keeps tracking', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  const agentId = await spawn($, implPrompt(1, 'a'), 'tu-1')
  expect(kit.opened).toEqual([PANE])
  kit.panes.delete(PANE) // the engine closes the pane (the kit's Engine cannot raise ui.close)
  await subagentTool($, agentId, './gradlew test')
  await $.command.run(RUN_GRAPH)
  expect(kit.opened).toEqual([PANE, PANE])
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: PANE_PROPS, requestId: PANE } as never)
    expect(await ui.find({ type: 'Text', text: /▸ Bash: \.\/gradlew test/ })).toBeDefined()
    await ui.unmount()
  }
})

test('narrow terminal: unasked open waits', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  kit.placesOnOpen = false // terminal too narrow to dock an unasked pane
  await spawn($, implPrompt(1, 'a'), 'tu-1')
  expect(kit.opened).toEqual([PANE])
  expect(kit.panes.get(PANE)).toBe(false)
  expect(paneOpenOf(kit)).toBe(false)
  expect(runOf(kit)).not.toBeNull() // tracking goes on while the pane waits

  kit.placesOnOpen = true // the person's own open is placed at any width
  const reply = await $.command.run(RUN_GRAPH)
  expect(kit.opened).toEqual([PANE, PANE]) // opened again, never closed
  expect(kit.panes.get(PANE)).toBe(true)
  expect(paneOpenOf(kit)).toBe(true)
  expect(String((reply as { text?: unknown }).text)).toMatch(/opened/)
})

test('background dispatch ends on the subagent turn, not the launch notice', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  let agentId = ''
  kit.onAgent = async e => {
    agentId = await spawn($, String(e.prompt), e.tool_use_id ?? 'tu-1')
    return { result: { status: 'async_launched', isAsync: true, agentId, description: 'M1 a' }, text: 'Async agent launched' } as never
  }
  await $.tool.call({ tool: 'Agent', prompt: implPrompt(1, 'a'), description: 'M1 a', subagent_type: 'general-purpose' } as never)
  expect(runOf(kit)!.agents[agentId]!.endedAt).toBeNull()

  await subagentTool($, agentId, './gradlew test')
  expect(runOf(kit)!.agents[agentId]!.lastTool).toBe('Bash: ./gradlew test')

  await finish($, agentId, 'Implemented.\n\nSTATUS: DONE')
  const agent = runOf(kit)!.agents[agentId]!
  expect(agent.endedAt).not.toBeNull()
  expect(agent.outcome).toBe('DONE')
})

test('styleOf colours', () => {
  const BLUE = { color: '#5FAFFF' }
  const expected: Record<Status, { color?: string; dimColor?: boolean }> = {
    implementing: BLUE, verifying: BLUE, fixing: BLUE, implemented: BLUE, verified: BLUE,
    passed: { color: 'success' }, merged: { color: 'success' },
    waiting: { dimColor: true }, ready: {},
    failed: { color: 'warning' }, stuck: { color: 'error' },
  }
  expect(Object.keys(expected)).toHaveLength(11)
  for (const [status, style] of Object.entries(expected)) {
    expect(styleOf(status as Status)).toEqual(style)
  }
  expect(styleOf(null)).toEqual({})
})

test('pane header says idle', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  const agentId = await spawn($, implPrompt(1, 'a'), 'tu-1')
  await kit.clock.advance(5000)
  await finish($, agentId, 'Implemented.\n\nSTATUS: DONE')
  await kit.clock.advance(10_000) // later redraws must not count on
  expect(runOf(kit)!.agents[agentId]!.endedAt).not.toBeNull()
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: PANE_PROPS, requestId: PANE } as never)
    expect(await ui.find({ type: 'Text', text: /— 5s · idle$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /◌ implemented · awaiting verify/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 implemented/ })).toBeDefined()
    await ui.unmount()
  }
})

// A session that continues under a new id (a background hand-off) starts with
// no $.state: the run comes back from the transcript and $.store.
const launchText = (id: string) => `Async agent launched successfully.\nagentId: ${id} (internal ID)`
const dispatchRow = (prompt: string, id: string) => ({
  role: 'assistant', text: '',
  toolUses: [{ tool_use_id: `tu-${id}`, tool: 'Agent', input: { prompt, run_in_background: true }, agentId: id, text: launchText(id) }],
})
const handBackRow = (id: string, report: string) => ({
  role: 'user', text: `Another Claude session sent a message:\n<agent-message from="${id}">\n  ${report}\n</agent-message>`, toolUses: [],
})
const mergeRow = (n: number, slug: string) => ({
  role: 'assistant', text: '',
  toolUses: [{ tool_use_id: `tu-m${n}`, tool: 'Bash', input: { command: `git -C /w merge --no-ff rpir/x--m${n} -m "Merge M${n} ${slug}"` }, text: 'Merge made.' }],
})
const HISTORY = [
  { role: 'user', text: '/kentra-rpir:implement docs/changes/demo', toolUses: [] },
  dispatchRow(implPrompt(1, 'a'), 'x1'),
  handBackRow('x1', 'STATUS: DONE'),
  dispatchRow(verifyPrompt(1, 'a'), 'x2'),
  handBackRow('x2', 'VERDICT: PASS'),
  mergeRow(1, 'a'),
  dispatchRow(implPrompt(2, 'b'), 'x3'),
]
function transcript(on: On, rows: unknown[], running: string[] = []): void {
  on('session.messages', () => ({ value: rows as never }))
  on('agent.list', () => ({
    value: running.map(id => ({ id, status: 'running', description: 'm', type: 'general-purpose' })) as never,
  }))
  on('command.register', () => ({ value: undefined }) as never)
}
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

test('a continued session rebuilds the run and reopens the pane', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  transcript(on, HISTORY, ['x3'])
  // What the previous session stored: M1's agents with their real timings.
  const stored: RunState = {
    startedAt: 1000, plan: null, planError: null,
    milestones: { a: { number: 1, slug: 'a', agents: ['x1', 'x2'], firstDispatchAt: 1000, mergedAt: null } },
    agents: {
      x1: { agentId: 'x1', toolUseId: null, number: 1, slug: 'a', role: 'impl', startedAt: 1000, endedAt: 4000, lastTool: null, outcome: 'DONE' },
      x2: { agentId: 'x2', toolUseId: null, number: 1, slug: 'a', role: 'verify', startedAt: 5000, endedAt: 7000, lastTool: null, outcome: null },
    },
  }
  mock.store(on, { 'run:/repo': stored })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start(START as never)

  const run = runOf(kit)!
  expect(run.startedAt).toBe(1000)
  expect(run.agents['x1']!.endedAt).toBe(4000)
  expect(run.agents['x2']!.outcome).toBe('PASS')
  expect(run.milestones['a']!.mergedAt).not.toBeNull()
  expect(run.agents['x3']!.endedAt).toBeNull()
  expect(run.plan!.milestones).toHaveLength(3)
  expect(kit.opened).toContain(PANE)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', props: PANE_PROPS, requestId: PANE } as never)
  expect(await ui.find({ type: 'Text', text: /✓ merged/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /● implementing/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 merged · 1 implementing · 1 waiting/ })).toBeDefined()
  await ui.unmount()
})

test('rpir-graph rebuilds a run the session never saw', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  transcript(on, HISTORY)
  await $.command.run({ ...RUN_GRAPH } as never)
  const run = runOf(kit)!
  expect(run.milestones['a']!.mergedAt).not.toBeNull()
  expect(Object.keys(run.agents).sort()).toEqual(['x1', 'x2', 'x3'])
  expect(kit.opened).toContain(PANE)
})

test('the orchestrator turn end catches what live events missed', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  const rows: unknown[] = []
  transcript(on, rows)
  const impl = await spawn($, implPrompt(1, 'a'), 'tu-1')
  // The report and the merge reach only the transcript.
  rows.push(dispatchRow(implPrompt(1, 'a'), impl), handBackRow(impl, 'STATUS: DONE'), mergeRow(1, 'a'))
  await $.turn.complete({ answer: 'Merged M1.', durationMs: 1, isAborted: false, turnId: 'main-1', reason: 'answer' } as never)
  const run = runOf(kit)!
  expect(run.agents[impl]!.outcome).toBe('DONE')
  expect(run.milestones['a']!.mergedAt).not.toBeNull()
})

test('a session with no dispatches starts no run', async ($, on) => {
  const kit = setup(on, filesWithPlan(3))
  transcript(on, [{ role: 'user', text: 'hello', toolUses: [] }])
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start(START as never)
  expect(runOf(kit)).toBeNull()
  expect(kit.opened).toEqual([])
})
