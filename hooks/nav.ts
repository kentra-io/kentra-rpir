import type { MilestoneView, PlanMilestone, RunState } from '../types'
import { orderForDrawing } from './layout'
import { viewOf } from './tracker'

/** An Up/Down arrow in an overflowing pane: the person's scroll key,
 *  one row, no pointer (the wheel always carries a pointer). */
export function isArrowScroll(e: { origin?: string; by: number; pointer?: unknown }): boolean {
  return e.origin === 'person' && Math.abs(e.by) === 1 && e.pointer == null
}

/** One step through `slugs`, clamped at both ends. A null or unknown
 *  current starts at the first (dir 1) or the last (dir -1). */
export function nextSelection(slugs: string[], current: string | null, dir: 1 | -1): string | null {
  if (slugs.length === 0) return null
  const i = current === null ? -1 : slugs.indexOf(current)
  if (i < 0) return dir === 1 ? slugs[0]! : slugs[slugs.length - 1]!
  return slugs[Math.max(0, Math.min(slugs.length - 1, i + dir))]!
}

/** The milestones to draw: the plan's, or with no plan the tracked ones
 *  (no goal, no dependencies), by number. */
export function milestonesOf(run: RunState): PlanMilestone[] {
  if (run.plan !== null) return run.plan.milestones
  return Object.values(run.milestones)
    .map(m => ({ number: m.number, slug: m.slug, goal: '', dependsOn: [] as string[] }))
    .sort((a, b) => a.number - b.number)
}

/** Slugs in the order their header Buttons are drawn. */
export function headerSlugs(run: RunState): string[] {
  return orderForDrawing(milestonesOf(run)).map(m => m.slug)
}

export function viewsOf(run: RunState, milestones: PlanMilestone[], now: number): Record<string, MilestoneView> {
  const views: Record<string, MilestoneView> = {}
  for (const m of milestones) views[m.slug] = viewOf(run, m.slug, now)
  return views
}

const MAIN_INPUT: Record<string, string> = {
  Bash: 'command', Read: 'file_path', Edit: 'file_path', Write: 'file_path', Grep: 'pattern',
}

/** `<tool>: <first non-empty line of its main input>`, or the tool name
 *  alone, cut to 80 characters. */
export function toolSummary(tool: string, input: Record<string, unknown>): string {
  const field = MAIN_INPUT[tool]
  const value = field === undefined ? undefined : input[field]
  const first = typeof value === 'string'
    ? (value.split('\n').find(line => line.trim() !== '') ?? '').trim()
    : ''
  const text = first === '' ? tool : `${tool}: ${first}`
  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}
