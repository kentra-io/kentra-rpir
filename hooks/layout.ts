import type { MilestoneView, PlanMilestone, Row, RunClock, Status } from '../types'

/** One lane of the gutter: the dependency line of one milestone that has dependents.
 *  `column` is null when the pane was too narrow to draw it. Rows index into the returned rows. */
export type Lane = {
  slug: string
  column: number | null
  startRow: number
  endRow: number
  dependents: string[]
}

type RowKind = 'header' | 'goal' | 'status' | 'times' | 'tool' | 'needs' | 'bottom'

export const STATUS_MARK: Record<Status, string> = {
  waiting: '·',
  ready: '○',
  implementing: '●',
  implemented: '◌',
  verifying: '◐',
  verified: '◌',
  failed: '✗',
  fixing: '↻',
  passed: '◑',
  merged: '✓',
  stuck: '⊘',
}

/** Order the header counts are listed in: furthest along first. */
const STATUS_ORDER: Status[] = [
  'merged', 'passed', 'failed', 'verified', 'verifying', 'fixing',
  'implemented', 'implementing', 'stuck', 'ready', 'waiting',
]
/** Status-row text after the mark: hand-off statuses name what they wait for. */
export const STATUS_LABEL: Record<Status, string> = {
  waiting: 'waiting',
  ready: 'ready',
  implementing: 'implementing',
  implemented: 'implemented · awaiting verify',
  verifying: 'verifying',
  verified: 'verified · awaiting verdict',
  failed: 'failed · awaiting fix',
  fixing: 'fixing',
  passed: 'passed · awaiting merge',
  merged: 'merged',
  stuck: 'stuck',
}

const RUNNING: Status[] = ['implementing', 'verifying', 'fixing']

/** Statuses the band lists: a subagent runs, or the milestone waits on the orchestrator. */
const LISTED: Status[] = ['implementing', 'verifying', 'fixing', 'implemented', 'verified', 'passed', 'failed']

const MIN_WIDTH = 40
const MIN_BOX = 30

const DEFAULT_VIEW: MilestoneView = {
  status: 'waiting',
  implMs: 0,
  verifyMs: 0,
  attempts: 0,
  verifyRounds: 0,
  wallMs: null,
  currentTool: null,
  runningAgentId: null,
  lastAgentId: null,
}

/** Gutter cell for a lane column, by which sides it connects: up, down, left, right. */
const GLYPH: Record<string, string> = {
  '0000': ' ', '1100': '│', '1000': '│', '0100': '│',
  '0101': '┌', '1001': '└', '1101': '├', '1011': '┴',
  '1111': '┼', '0111': '┬', '1110': '┤', '0110': '┐',
  '1010': '┘', '0011': '─', '0001': '─', '0010': '─',
}

const cells = (text: string): string[] => Array.from(text)
const width = (text: string): number => cells(text).length

function pad(text: string, w: number): string {
  const n = width(text)
  return n >= w ? text : text + ' '.repeat(w - n)
}

/** 0–59s → "42s", then "6m12s", then "1h03m". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

/** Cuts to `width` cells, ending with "…" when cut. Every glyph the layout emits is one cell.
 *  Line breaks and tabs become one space first, so the result is always one line. */
export function cut(text: string, w: number): string {
  const flat = text.replace(/\s*[\r\n\t]+\s*/g, ' ')
  const cs = cells(flat)
  if (cs.length <= w) return flat
  if (w <= 0) return ''
  return cs.slice(0, w - 1).join('') + '…'
}

/** Milestones in drawing order: by depth (0 for a root, else 1 + max depth of its
 *  dependencies; unknown dependency slugs ignored), then by number. */
export function orderForDrawing(milestones: PlanMilestone[]): PlanMilestone[] {
  const bySlug = new Map(milestones.map((m) => [m.slug, m] as const))
  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (m: PlanMilestone): number => {
    const known = depth.get(m.slug)
    if (known !== undefined) return known
    if (visiting.has(m.slug)) return 0 // a cycle; validated plans have none
    visiting.add(m.slug)
    let d = 0
    for (const s of m.dependsOn) {
      const p = bySlug.get(s)
      if (p && p !== m) d = Math.max(d, 1 + depthOf(p))
    }
    visiting.delete(m.slug)
    depth.set(m.slug, d)
    return d
  }
  return [...milestones].sort((a, b) => depthOf(a) - depthOf(b) || a.number - b.number)
}

function rowKinds(m: PlanMilestone, v: MilestoneView): RowKind[] {
  const kinds: RowKind[] = ['header', 'goal', 'status']
  if (v.attempts + v.verifyRounds > 0) kinds.push('times')
  if (v.currentTool) kinds.push('tool')
  if (m.dependsOn.length > 0) kinds.push('needs')
  kinds.push('bottom')
  return kinds
}

function boxLine(
  kind: RowKind,
  m: PlanMilestone,
  v: MilestoneView,
  w: number,
  dropped: number,
  numberOf: Map<string, number>,
): string {
  const inner = w - 4
  const framed = (text: string) => `│ ${pad(cut(text, inner), inner)} │`
  switch (kind) {
    case 'header': {
      const suffix = dropped > 0 ? ` +${dropped} edges` : ''
      const label = cut(`M${m.number} ${m.slug}`, Math.max(1, inner - width(suffix))) + suffix
      return `┌ ${label} ${'─'.repeat(Math.max(0, inner - width(label)))}┐`
    }
    case 'goal':
      return framed(m.goal)
    case 'status':
      return framed(`${STATUS_MARK[v.status]} ${STATUS_LABEL[v.status]}${v.attempts > 1 ? ` (attempt ${v.attempts})` : ''}`)
    case 'times': {
      let t = `impl ${formatDuration(v.implMs)} · verify ${formatDuration(v.verifyMs)}`
      if (v.verifyRounds > 1) t += ` · rounds ${v.verifyRounds}`
      if (v.wallMs !== null) t += ` · wall ${formatDuration(v.wallMs)}`
      return framed(t)
    }
    case 'tool':
      return framed(`▸ ${v.currentTool}`)
    case 'needs':
      return framed(`needs ${m.dependsOn.map((s) => (numberOf.has(s) ? `M${numberOf.get(s)}` : s)).join(', ')}`)
    case 'bottom':
      return `└${'─'.repeat(w - 2)}┘`
  }
}

/** layoutGraph plus the lanes it drew or dropped; tests check edges against `lanes`. */
export function layoutWithLanes(
  milestones: PlanMilestone[],
  views: Record<string, MilestoneView>,
  paneWidth: number,
): { rows: Row[]; lanes: Lane[] } {
  const W = Math.max(paneWidth, MIN_WIDTH)
  const ordered = orderForDrawing(milestones)
  const viewOf = (slug: string): MilestoneView => views[slug] ?? DEFAULT_VIEW
  const numberOf = new Map(ordered.map((m) => [m.slug, m.number] as const))

  // 1. Row index of every box's header and bottom (row count per box does not depend on width).
  const kinds = ordered.map((m) => rowKinds(m, viewOf(m.slug)))
  const headerRow = new Map<string, number>()
  const bottomRow = new Map<string, number>()
  let total = 0
  ordered.forEach((m, i) => {
    headerRow.set(m.slug, total)
    total += kinds[i].length
    bottomRow.set(m.slug, total - 1)
  })

  // 2. Lanes, in drawing order: each takes the leftmost column free over its whole span.
  const maxCols = Math.max(0, Math.floor((W - MIN_BOX) / 2))
  const taken: Array<Array<[number, number]>> = Array.from({ length: maxCols }, () => [])
  const lanes: Lane[] = []
  for (const m of ordered) {
    const startRow = bottomRow.get(m.slug)!
    const dependents = ordered
      .filter((d) => d !== m && d.dependsOn.includes(m.slug) && headerRow.get(d.slug)! > startRow)
      .map((d) => d.slug)
    if (dependents.length === 0) continue
    const endRow = Math.max(...dependents.map((s) => headerRow.get(s)!))
    let column: number | null = null
    for (let c = 0; c < maxCols; c++) {
      if (taken[c].every(([s, e]) => e < startRow || s > endRow)) {
        column = c
        break
      }
    }
    if (column !== null) taken[column].push([startRow, endRow])
    lanes.push({ slug: m.slug, column, startRow, endRow, dependents })
  }
  const drawn = lanes.filter((l) => l.column !== null)
  const cols = drawn.reduce((n, l) => Math.max(n, l.column! + 1), 0)

  const droppedInto = new Map<string, number>()
  for (const l of lanes) {
    if (l.column !== null) continue
    for (const d of l.dependents) droppedInto.set(d, (droppedInto.get(d) ?? 0) + 1)
  }

  // 3. The gutter of one row: verticals, the start corner, branches with an arrow, crossings.
  const gutterAt = (row: number): string => {
    const active = new Map<number, Lane>()
    for (const l of drawn) if (l.startRow <= row && row <= l.endRow) active.set(l.column!, l)
    let minH = Infinity // leftmost column with a horizontal line on this row
    let branches = false
    for (const l of active.values()) {
      const starts = l.startRow === row
      const branchesHere = l.dependents.some((s) => headerRow.get(s) === row)
      if (starts || branchesHere) minH = Math.min(minH, l.column!)
      if (branchesHere) branches = true
    }
    let out = ''
    for (let c = 0; c < cols; c++) {
      const l = active.get(c)
      const up = l !== undefined && row > l.startRow
      const down = l !== undefined && row < l.endRow
      const key = `${+up}${+down}${+(minH < c)}${+(minH <= c)}`
      out += GLYPH[key]
      const isLast = c === cols - 1
      out += minH <= c ? (isLast && branches ? '▶' : '─') : ' '
    }
    return out
  }

  // 4. The rows.
  const w = W - 2 * cols
  const rows: Row[] = []
  ordered.forEach((m, i) => {
    const v = viewOf(m.slug)
    for (const kind of kinds[i]) {
      rows.push({
        key: `${m.slug}:${kind}`,
        gutter: gutterAt(rows.length),
        body: boxLine(kind, m, v, w, droppedInto.get(m.slug) ?? 0, numberOf),
        slug: m.slug,
        isHeader: kind === 'header',
        status: v.status,
      })
    }
  })
  return { rows, lanes }
}

/** The graph, one Row per terminal line, every row's gutter+body exactly `width` cells
 *  (pad with spaces), width ≥ 40 (a smaller width is drawn at 40). */
export function layoutGraph(
  milestones: PlanMilestone[],
  views: Record<string, MilestoneView>,
  paneWidth: number,
): Row[] {
  return layoutWithLanes(milestones, views, paneWidth).rows
}

/** Pane header: title, then e.g. "2 merged · 1 verifying · 1 implementing · 3 waiting", then elapsed,
 *  with `· idle` or `· done` once nothing runs. One line, cut to width; the title is cut first. */
export function headerLine(
  title: string,
  counts: Record<Status, number>,
  clock: RunClock,
  w: number,
): string {
  const tally = STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(' · ')
  const time = clock.phase === 'running'
    ? formatDuration(clock.elapsedMs)
    : `${formatDuration(clock.elapsedMs)} · ${clock.phase}`
  const rest = [tally, time].filter((p) => p !== '').join(' — ')
  const titleRoom = Math.max(8, w - width(rest) - 3)
  return cut(`${cut(title, titleRoom)} — ${rest}`, w)
}

/** Band text, e.g. "rpir: 1 merged · M2 verifying · M3 implemented" — merged count, then each
 *  running or hand-off milestone as "M<n> <status>", then "idle" when none runs; cut to width. */
export function bandLine(
  milestones: PlanMilestone[],
  views: Record<string, MilestoneView>,
  w: number,
): string {
  const ordered = orderForDrawing(milestones)
  const statusOf = (m: PlanMilestone): Status | null => views[m.slug]?.status ?? null
  const merged = ordered.filter((m) => statusOf(m) === 'merged').length
  const listed = ordered
    .filter((m) => { const s = statusOf(m); return s !== null && LISTED.includes(s) })
    .map((m) => `M${m.number} ${statusOf(m)}`)
  const isIdle = !ordered.some((m) => { const s = statusOf(m); return s !== null && RUNNING.includes(s) })
  return cut([`rpir: ${merged} merged`, ...listed, ...(isIdle ? ['idle'] : [])].join(' · '), w)
}
