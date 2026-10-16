import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, Register, Timer } from 'claude-code'

import type { RunState, Status, TrackerEvent } from '../types'
import { bandLine, cut, headerLine, layoutGraph } from './layout'
import { headerSlugs, isArrowScroll, milestonesOf, nextSelection, toolSummary, viewsOf } from './nav'
import { loadPlan } from './plan'
import { countByStatus, emptyRun, parseDispatch, reduce, viewOf } from './tracker'

const PANE = 'rpir-graph'
const TITLE = 'kentra-rpir'
/** Engine keybinding action the band's button borrows (spec P7). */
const TOGGLE_ACTION: string | undefined = 'app:toggleDiffPreSession'

const runAtom = atom({ plugin: 'kentra-rpir', key: 'run' } as const, null)
const selectionAtom = atom({ plugin: 'kentra-rpir', key: 'selection' } as const, null)
const paneAtom = atom({ plugin: 'kentra-rpir', key: 'isPaneOpen' } as const, false)

let ticker: Timer | null = null

function hasRunning(run: RunState | null): boolean {
  return run !== null && Object.values(run.agents).some(agent => agent.endedAt === null)
}

async function apply($: EngineInterface, ev: TrackerEvent): Promise<void> {
  await update($, runAtom, run => (run === null ? run : reduce(run, ev)))
}

function ensureTicker($: EngineInterface): void {
  if (ticker !== null) return
  ticker = $.clock.every(1000, () => { void tick($) })
}

async function tick($: EngineInterface): Promise<void> {
  if (!hasRunning(await read($, runAtom))) {
    ticker?.cancel()
    ticker = null
    return
  }
  $.ui.invalidate('ui.render')
}

/** M1's rule: decide from the engine's record of open panes, which
 *  survives a module reload; isPaneOpen is only a cache of the outcome.
 *  A pane waiting undrawn (isPlaced false) counts as not open, so the
 *  person's open places it instead of closing it (spec req 19). */
async function togglePane($: EngineInterface): Promise<'opened' | 'closed'> {
  const isUp = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)
  if (isUp) {
    await $.ui.close({ id: PANE })
    await update($, paneAtom, () => false)
    return 'closed'
  }
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  await update($, paneAtom, () => opened.isPlaced)
  return 'opened'
}

/** The unasked open on the first dispatch: placed from 144 columns,
 *  waits undrawn below that (no inline fallback drawn by the mod). */
async function autoOpen($: EngineInterface): Promise<void> {
  try {
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) return
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    await update($, paneAtom, () => opened.isPlaced)
  } catch {
    // no surface: the band and /rpir-graph still work
  }
}

async function openTranscript($: EngineInterface, slug: string): Promise<void> {
  const run = await read($, runAtom)
  if (run === null) return
  const view = viewOf(run, slug, await $.clock.now())
  const agentId = view.runningAgentId ?? view.lastAgentId
  if (agentId === null) {
    const n = milestonesOf(run).find(m => m.slug === slug)?.number
    $.ui.toast(`M${n ?? '?'} has not been dispatched yet`)
    return
  }
  await $.ui.view({ agentId })
}

function styleOf(status: Status | null): { color?: string; dimColor?: boolean } {
  switch (status) {
    case 'merged': return { color: 'success' }
    case 'stuck': return { color: 'error' }
    case 'implementing':
    case 'verifying':
    case 'fixing': return { color: 'claude' }
    case 'waiting': return { dimColor: true }
    default: return {}
  }
}

/** Exported so a test can call it directly if the kit drops agentId. */
export const handleToolCall: Hook<'tool.call'> = async ($, e, next) => {
  const input = e as unknown as Record<string, unknown>
  if (e.agentId !== undefined) {
    try {
      const run = await read($, runAtom)
      if (run !== null && run.agents[e.agentId] !== undefined) {
        await apply($, { kind: 'tool', agentId: e.agentId, summary: toolSummary(e.tool, input), at: await $.clock.now() })
      }
    } catch {
      // tracking never breaks a tool call
    }
    return next(e)
  }
  if (e.tool !== 'Agent' && e.tool !== 'Bash') return next(e)
  const result = await next(e)
  try {
    if ((await read($, runAtom)) === null) return result
    const at = await $.clock.now()
    if (e.tool === 'Agent') {
      // A background dispatch answers at once with a launch notice; the
      // subagent's own turn.complete ends it.
      const status = (result.result as { status?: unknown } | undefined)?.status
      if (input.run_in_background !== true && status !== 'async_launched' && status !== 'remote_launched') {
        const text = typeof result.text === 'string' ? result.text : null
        await apply($, { kind: 'agentDone', agentId: null, toolUseId: e.tool_use_id ?? null, resultText: text, at })
      }
    } else if (typeof input.command === 'string') {
      const isError = result.deny !== undefined || result.isError === true
      await apply($, { kind: 'bash', command: input.command, isError, at })
    }
  } catch {
    // tracking never breaks a tool call
  }
  return result
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: PANE, description: 'Toggle the kentra-rpir milestone graph pane' })
    if (hasRunning(await read($, runAtom))) ensureTicker($)
    return next(e)
  })

  on('command.run', { command: PANE }, async $ => {
    const done = await togglePane($)
    return { text: `Milestone graph pane ${done}.` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, paneAtom, () => false)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    if (e.parentAgentId !== undefined || parseDispatch(e.prompt) === null) return next(e)
    const at = await $.clock.now()
    const result = await next(e)
    if (result.deny !== undefined || result.agentId === undefined) return result
    try {
      const isFirst = (await read($, runAtom)) === null
      if (isFirst) await update($, runAtom, run => run ?? emptyRun(at))
      await apply($, { kind: 'spawn', agentId: result.agentId, toolUseId: e.tool_use_id || null, prompt: e.prompt, at })
      const loaded = await loadPlan($, await $.session.id())
      await apply($, { kind: 'plan', plan: loaded.plan, error: loaded.error })
      ensureTicker($)
      if (isFirst) await autoOpen($)
    } catch {
      // tracking never breaks a dispatch
    }
    return result
  })

  on('tool.call', handleToolCall)

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      try {
        const run = await read($, runAtom)
        if (run !== null && run.agents[e.agentId] !== undefined) {
          await apply($, { kind: 'agentDone', agentId: e.agentId, toolUseId: null, resultText: e.answer || null, at: await $.clock.now() })
        }
      } catch {
        // tracking never breaks a turn
      }
    }
    return next(e)
  })

  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!isArrowScroll({ origin: e.origin.kind, by: e.by, pointer: e.pointer })) return next(e)
    const run = await read($, runAtom)
    if (run === null) return next(e)
    const slug = nextSelection(headerSlugs(run), await read($, selectionAtom), e.by > 0 ? 1 : -1)
    if (slug === null) return next(e)
    await update($, selectionAtom, () => slug)
    const key = `m-${slug}`
    // Not awaited: the test kit has no ui.focus implementation, and an
    // awaited rejection would make the engine skip this hook (spike E1).
    void $.ui.focus({ requestId: PANE, key })
      .then(() => $.ui.scroll({ to: { key }, in: PANE }))
      .catch(() => undefined)
    return {}
  })

  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const result = await next(e)
    const element = e.element
    if (e.origin.kind === 'person' && result.deny === undefined && element?.startsWith('m-')) {
      await update($, selectionAtom, () => element.slice(2))
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const run = await read($, runAtom)
    if (run === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No implement run in this session yet.</Text>
        </Box>
      )
    }
    const now = await $.clock.now()
    const width = Math.max(40, e.props.bodyColumns)
    const milestones = milestonesOf(run)
    const rows = layoutGraph(milestones, viewsOf(run, milestones, now), width)
    const title = run.plan?.title ?? TITLE
    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          {headerLine(title, countByStatus(run, now), now - run.startedAt, width)}
        </Text>
        {run.planError !== null && (
          <Text color="warning" wrap="truncate-end">
            {cut(`plan could not be found: ${run.planError}`, width)}
          </Text>
        )}
        {rows.map(row => (
          <Box key={row.key} flexDirection="row">
            {row.gutter !== '' && <Text dimColor wrap="truncate-end">{row.gutter}</Text>}
            {row.isHeader && row.slug !== null ? (
              <Button key={`m-${row.slug}`} plain onPress={() => { void openTranscript($, row.slug!) }}>
                <Text {...styleOf(row.status)}>{row.body}</Text>
              </Button>
            ) : (
              <Text {...styleOf(row.status)} wrap="truncate-end">{row.body}</Text>
            )}
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const run = await read($, runAtom)
    if (run === null || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const milestones = milestonesOf(run)
    const width = Math.max(20, e.props.bodyColumns - 10)
    return (
      <Box flexDirection="row">
        <Text dimColor wrap="truncate-end">{bandLine(milestones, viewsOf(run, milestones, now), width)} </Text>
        <Button
          key="rpir-toggle"
          label="graph"
          {...(TOGGLE_ACTION === undefined ? {} : { action: TOGGLE_ACTION })}
          onPress={() => { void togglePane($) }}
        />
      </Box>
    )
  })
}
