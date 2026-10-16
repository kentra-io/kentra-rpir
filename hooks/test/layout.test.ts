import { expect, test } from 'claude-code/testing'
import type { MilestoneView, PlanMilestone, Status } from '../../types'
import {
  bandLine,
  cut,
  formatDuration,
  headerLine,
  layoutGraph,
  layoutWithLanes,
  orderForDrawing,
  STATUS_MARK,
} from '../layout'

const m = (number: number, slug: string, dependsOn: string[] = []): PlanMilestone => ({
  number,
  slug,
  goal: `Goal of ${slug}, long enough to be cut in a pane of forty columns`,
  dependsOn,
})

const view = (over: Partial<MilestoneView>): MilestoneView => ({
  status: 'waiting',
  implMs: 0,
  verifyMs: 0,
  attempts: 0,
  verifyRounds: 0,
  wallMs: null,
  currentTool: null,
  runningAgentId: null,
  lastAgentId: null,
  ...over,
})

const len = (s: string): number => Array.from(s).length
const at = (s: string, i: number): string => Array.from(s)[i]

const CHAIN = [m(1, 'a'), m(2, 'b', ['a']), m(3, 'c', ['b'])]
const DIAMOND = [m(1, 'a'), m(2, 'b', ['a']), m(3, 'c', ['a']), m(4, 'd', ['b', 'c'])]
const CROSSING = [m(1, 'a'), m(2, 'b'), m(3, 'c', ['a']), m(4, 'd', ['a', 'b']), m(5, 'e', ['b'])]

/** Checks widths, header slugs, and that every edge is drawn into its dependent or counted as dropped. */
function checkGraph(ms: PlanMilestone[], views: Record<string, MilestoneView>, width: number) {
  const { rows, lanes } = layoutWithLanes(ms, views, width)
  const gutterWidth = len(rows[0].gutter)
  for (const row of rows) {
    expect(len(row.gutter + row.body)).toBe(width)
    expect(len(row.gutter)).toBe(gutterWidth)
  }
  for (const d of ms) {
    const hr = rows.findIndex((r) => r.isHeader && r.slug === d.slug)
    expect(hr).toBeGreaterThanOrEqual(0)
    expect(rows[hr].body.startsWith(`┌ M${d.number} ${d.slug} `)).toBe(true)
    for (const p of d.dependsOn) {
      const lane = lanes.find((l) => l.slug === p)!
      expect(lane.dependents).toContain(d.slug)
      if (lane.column === null) {
        const n = lanes.filter((l) => l.column === null && l.dependents.includes(d.slug)).length
        expect(rows[hr].body).toContain(`+${n} edges`)
        continue
      }
      const col = 2 * lane.column
      // the lane leaves its milestone's bottom row
      expect(rows[lane.startRow].key).toBe(`${p}:bottom`)
      expect(at(rows[lane.startRow].gutter, col)).toBe('┌')
      // it runs down without a gap
      for (let r = lane.startRow + 1; r < hr; r++) expect(['│', '├', '┼']).toContain(at(rows[r].gutter, col))
      // and branches into the dependent's header with an arrow
      const g = Array.from(rows[hr].gutter)
      expect(['├', '└', '┼', '┴']).toContain(g[col])
      for (let i = col + 1; i < g.length - 1; i++) expect(['─', '┼', '┴']).toContain(g[i])
      expect(g[g.length - 1]).toBe('▶')
    }
  }
  return { rows, lanes }
}

test('chain diamond and crossing DAG at three widths', () => {
  for (const width of [40, 60, 100]) {
    checkGraph(CHAIN, {}, width)
    checkGraph(DIAMOND, {}, width)
    const { rows } = checkGraph(CROSSING, {}, width)
    // lane a crosses lane b on c's header row: the crossing is drawn
    expect(rows.some((r) => r.gutter.includes('┼'))).toBe(true)
  }
})

test('narrow pane drops lanes and counts them', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7].map((i) => m(2 + i, `x${i}`, ['r1']))
  const ys = [1, 2, 3, 4, 5].map((i) => m(9 + i, `y${i}`, ['r2']))
  const sink = m(15, 'z', [...xs, ...ys].map((d) => d.slug))
  const ms = [m(1, 'r1'), m(2, 'r2'), ...xs, ...ys, sink]
  const { rows, lanes } = checkGraph(ms, {}, 40)
  expect(len(rows[0].gutter)).toBeLessThanOrEqual(10)
  for (const row of rows) expect(len(row.body)).toBeGreaterThanOrEqual(30)
  const dropped = lanes.filter((l) => l.column === null)
  expect(dropped.length).toBeGreaterThan(0)
  const droppedEdges = dropped.reduce((n, l) => n + l.dependents.length, 0)
  let shown = 0
  for (const row of rows.filter((r) => r.isHeader)) {
    const hit = /\+(\d+) edges/.exec(row.body)
    const expected = dropped.filter((l) => l.dependents.includes(row.slug!)).length
    expect(hit ? Number(hit[1]) : 0).toBe(expected)
    shown += hit ? Number(hit[1]) : 0
  }
  expect(shown).toBe(droppedEdges)
})

test('box rows follow the view', () => {
  const ms = [m(1, 'f'), m(2, 'g', ['f'])]
  const views = {
    f: view({
      status: 'fixing', attempts: 2, verifyRounds: 1, implMs: 372_000, verifyMs: 42_000,
      currentTool: 'Bash: npm test', runningAgentId: 'a3', lastAgentId: 'a3',
    }),
    g: view({
      status: 'merged', attempts: 1, verifyRounds: 1, implMs: 60_000, verifyMs: 30_000,
      wallMs: 3_780_000, lastAgentId: 'a5',
    }),
  }
  const rows = layoutGraph(ms, views, 60)
  const box = (slug: string) => rows.filter((r) => r.slug === slug)
  const text = (slug: string) => box(slug).map((r) => r.body).join('\n')

  expect(box('f')[0].isHeader).toBe(true)
  expect(box('f')[box('f').length - 1].key).toBe('f:bottom')
  expect(text('f')).toContain(`${STATUS_MARK.fixing} fixing (attempt 2)`)
  expect(text('f')).toContain('impl 6m12s · verify 42s')
  expect(text('f')).not.toContain('rounds')
  expect(text('f')).not.toContain('wall')
  expect(text('f')).toContain('▸ Bash: npm test')
  expect(box('f').some((r) => r.key === 'f:needs')).toBe(false)

  expect(text('g')).toContain('wall 1h03m')
  expect(text('g')).not.toContain('(attempt')
  expect(text('g')).toContain('needs M1')
  expect(box('g').some((r) => r.key === 'g:tool')).toBe(false)
  expect(box('g').every((r) => r.status === 'merged')).toBe(true)

  expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  for (const row of rows) expect(len(row.gutter + row.body)).toBe(60)
})

test('orderForDrawing sorts by depth then number', () => {
  const ordered = orderForDrawing([m(3, 'c', ['a']), m(2, 'b'), m(1, 'a')])
  expect(ordered.map((x) => x.number)).toEqual([1, 2, 3])
})

test('formatDuration cut headerLine bandLine', () => {
  expect(formatDuration(0)).toBe('0s')
  expect(formatDuration(42_000)).toBe('42s')
  expect(formatDuration(372_000)).toBe('6m12s')
  expect(formatDuration(3_780_000)).toBe('1h03m')

  expect(cut('abcdefgh', 5)).toBe('abcd…')
  expect(len(cut('abcdefgh', 5))).toBe(5)
  expect(cut('abc', 5)).toBe('abc')
  expect(cut('two\nlines', 20)).toBe('two lines')

  const counts: Record<Status, number> = {
    waiting: 3, ready: 0, implementing: 1, verifying: 1, fixing: 0, passed: 0, merged: 2, stuck: 0,
  }
  const title = 'A very long change title that would never fit beside the counts in a narrow pane'
  const header = headerLine(title, counts, 125_000, 80)
  expect(header).not.toContain('\n')
  expect(len(header)).toBeLessThanOrEqual(80)
  expect(header).toContain('…')
  expect(header).toContain('2 merged · 1 verifying · 1 implementing · 3 waiting')
  expect(header).toBe('A very long chang… — 2 merged · 1 verifying · 1 implementing · 3 waiting — 2m05s')
  expect(header.endsWith('2m05s')).toBe(true)
  expect(len(headerLine(title, counts, 125_000, 40))).toBeLessThanOrEqual(40)

  const ms = [m(1, 'a'), m(2, 'b'), m(3, 'c', ['a']), m(4, 'd', ['b']), m(5, 'e', ['c', 'd'])]
  const views = {
    a: view({ status: 'merged' }),
    b: view({ status: 'merged' }),
    c: view({ status: 'verifying' }),
    d: view({ status: 'implementing' }),
    e: view({ status: 'waiting' }),
  }
  expect(bandLine(ms, views, 100)).toBe('rpir: 2 merged · M3 verifying · M4 implementing')
  const narrow = bandLine(ms, views, 20)
  expect(len(narrow)).toBeLessThanOrEqual(20)
  expect(narrow).not.toContain('\n')
  expect(narrow.endsWith('…')).toBe(true)
})
