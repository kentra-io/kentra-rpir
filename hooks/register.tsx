// kentra-rpir's mod: the milestone graph pane of an implement run.
// M1 scaffold: the /rpir-graph command toggles a placeholder pane.
import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'rpir-graph'
const TITLE = 'kentra-rpir'
const isPaneOpen = atom({ plugin: 'kentra-rpir', key: 'isPaneOpen' } as const, false)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rpir-graph',
      description: 'Toggle the kentra-rpir milestone graph pane',
    })
    return next(e)
  })

  on('command.run', { command: 'rpir-graph' }, async $ => {
    const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isUp) {
      await $.ui.close({ id: PANE })
      await update($, isPaneOpen, () => false)
      return { text: 'Milestone graph pane closed.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    await update($, isPaneOpen, () => true)
    return { text: 'Milestone graph pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) await update($, isPaneOpen, () => false)
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text dimColor>No implement run in this session yet.</Text>
      </Box>
    )
  })
}
