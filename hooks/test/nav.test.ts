import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { isArrowScroll, nextSelection } from '../nav'

const PANE = 'rpir-graph'
const FILES: Record<string, string> = {
  '.kentra-rpir/sessions.map': 'S1 docs/changes/demo implement\n',
  'docs/changes/demo/spec.md': '---\ntitle: Demo change\n---\n',
  'docs/changes/demo/plan.yaml': [
    'schemaVersion: 0.3.0',
    'description: Demo',
    'milestones:',
    '  - number: 1',
    '    slug: a',
    '    goal: Goal a',
    '  - number: 2',
    '    slug: b',
    '    goal: Goal b',
    '    depends-on: [a]',
    '  - number: 3',
    '    slug: c',
    '    goal: Goal c',
    '    depends-on: [b]',
    '',
  ].join('\n'),
}

function setup(on: On): Map<string, unknown> {
  const states = new Map<string, unknown>()
  on('state.set', async (_$, e, next) => {
    const result = await next(e)
    if (e.plugin === 'kentra-rpir') states.set(e.key, e.value)
    return result
  })
  let agents = 0
  const panes = new Map<string, boolean>()
  mock.clock(on, { now: 1_000_000 })
  on('session.id', () => ({ value: 'S1' }))
  on('session.root', () => ({ value: '/repo' }))
  on('fs.read', (_$, e) => {
    const hit = Object.keys(FILES).find(k => e.path === k || e.path.endsWith(`/${k}`))
    if (hit === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: FILES[hit]! }
  })
  on('ui.panes', () => ({
    value: [...panes].map(([id, isPlaced]) => ({ id, title: 'kentra-rpir', isShown: isPlaced, isFocused: false, isPlaced })),
  }))
  on('ui.open', (_$, e) => { panes.set(e.id, true); return { value: { isPlaced: true } } })
  on('ui.invalidate', () => ({ value: undefined }))
  on('agent.spawn', () => ({ model: 'test-model', agentId: `agent-${++agents}` }))
  return states
}

async function trackRun($: Engine): Promise<void> {
  await $.agent.spawn({
    tool_use_id: 'tu-1',
    prompt: 'You are implementing milestone M1 `a` of the change "Demo change".\n\nWork only in /x.',
    description: 'M1 a',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'test-model',
    background: false,
    fork: false,
  } as never)
}

function personFocus(element: string) {
  return { component: 'Pane', requestId: PANE, plugin: 'kentra-rpir', element, origin: { kind: 'person' } } as never
}

const selectionOf = (states: Map<string, unknown>): unknown => states.get('selection') ?? null

test('nextSelection and isArrowScroll', () => {
  const slugs = ['a', 'b', 'c']
  expect(nextSelection(slugs, 'a', 1)).toBe('b')
  expect(nextSelection(slugs, 'b', 1)).toBe('c')
  expect(nextSelection(slugs, 'c', 1)).toBe('c')
  expect(nextSelection(slugs, 'b', -1)).toBe('a')
  expect(nextSelection(slugs, 'a', -1)).toBe('a')
  expect(nextSelection(slugs, null, 1)).toBe('a')
  expect(nextSelection(slugs, null, -1)).toBe('c')
  expect(nextSelection([], null, 1)).toBeNull()
  expect(isArrowScroll({ origin: 'person', by: 1 })).toBe(true)
  expect(isArrowScroll({ origin: 'person', by: -1 })).toBe(true)
  expect(isArrowScroll({ origin: 'person', by: 1, pointer: { column: 5, row: 3 } })).toBe(false)
  expect(isArrowScroll({ origin: 'person', by: 20 })).toBe(false)
  expect(isArrowScroll({ origin: 'plugin', by: 1 })).toBe(false)
})

test('ui.scroll routing', async ($, on) => {
  const states = setup(on)
  const passed: number[] = []
  on('ui.scroll', (_$, e) => {
    if (e.origin.kind === 'person') passed.push(e.by)
    return {}
  })
  on('ui.focus', () => ({}))
  await trackRun($)
  await $.ui.focus(personFocus('m-b'))
  expect(selectionOf(states)).toBe('b')

  const base = { component: 'Pane', requestId: PANE, bodyRows: 20, contentRows: 71, origin: { kind: 'person' } } as const
  const arrow = await $.ui.scroll({ ...base, offset: 1, by: 1 } as never)
  expect(arrow).toEqual({})
  expect(passed).toEqual([])
  expect(selectionOf(states)).toBe('c')

  await $.ui.scroll({ ...base, offset: 1, by: 1, pointer: { column: 5, row: 3 } } as never) // wheel tick
  await $.ui.scroll({ ...base, offset: 20, by: 20 } as never) // PageDown
  await $.ui.scroll({ ...base, offset: 0, by: -71 } as never) // Home
  await $.ui.scroll({ ...base, offset: 51, by: 71 } as never) // End
  expect(passed).toEqual([1, 20, -71, 71])
  expect(selectionOf(states)).toBe('c')
})

test('ui.focus routing', async ($, on) => {
  const states = setup(on)
  const landed: (string | undefined)[] = []
  on('ui.focus', (_$, e) => {
    landed.push(e.element)
    return {}
  })
  await trackRun($)
  await $.ui.focus(personFocus('m-a'))
  expect(selectionOf(states)).toBe('a')
  const result = await $.ui.focus(personFocus('m-c'))
  expect(result).toEqual({})
  expect(landed).toEqual(['m-a', 'm-c'])
  expect(selectionOf(states)).toBe('c')
})
