import { test, expect } from 'claude-code/testing'

const PLUGIN = 'kentra-rpir'
const PANE_PROPS = {
  title: 'kentra-rpir',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const
const RUN_GRAPH = {
  command: 'rpir-graph',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

test('registers the rpir-graph command', async ($, on) => {
  const registered: string[] = []
  // Ops on $ are answered beneath the plugin with { value }.
  on('command.register', async (_$, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(registered).toContain('rpir-graph')
})

test('rpir-graph toggles the pane', async ($, on) => {
  const open = new Set<string>()
  const writes: unknown[] = []
  on('ui.panes', async () => ({
    value: [...open].map(id => ({ id, title: 'kentra-rpir', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.open', async (_$, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', async (_$, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('state.set', async (_$, e, next) => {
    if (e.plugin === PLUGIN && e.key === 'isPaneOpen') writes.push(e.value)
    return next(e)
  })

  await $.command.run(RUN_GRAPH)
  expect([...open]).toEqual(['rpir-graph'])
  expect(writes.at(-1)).toBe(true)

  await $.command.run(RUN_GRAPH)
  expect([...open]).toEqual([])
  expect(writes.at(-1)).toBe(false)
})

test('placeholder pane text', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: PANE_PROPS, requestId: 'rpir-graph' })
    expect(await ui.find({ type: 'Text', text: 'No implement run in this session yet.' })).toBeDefined()
    await ui.unmount()
  }
})
