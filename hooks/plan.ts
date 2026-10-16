import type { EngineInterface } from 'claude-code'
import type { PlanGraph, PlanMilestone } from '../types'
import { load } from './vendor/js-yaml.mjs'

const SESSIONS_MAP = '.kentra-rpir/sessions.map'

/** The first line of a message, trimmed; every error this module makes is one line. */
function oneLine(text: string): string {
  return (text.split(/\r?\n/)[0] ?? '').trim()
}

/** milestoned-plan-dag's DeriveSlug: lowercase, runs outside [a-z0-9] → '-', trimmed. */
function deriveSlug(goal: string): string {
  return goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** root + '/' + path, or path itself when absolute. */
function joinPath(root: string, path: string): string {
  if (path.startsWith('/')) return path
  return `${root.replace(/\/+$/, '')}/${path.replace(/^\.\//, '')}`
}

function basename(folder: string): string {
  const parts = folder.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || folder
}

export function findChangeFolder(sessionsMap: string, sessionId: string): string | null {
  let found: string | null = null
  for (const raw of sessionsMap.split('\n')) {
    const fields = raw.replace(/\r$/, '').trim().split(/\s+/)
    if (fields.length < 2) continue
    const [id, folder, stage] = fields
    if (id === sessionId && stage === 'implement' && folder) found = folder
  }
  return found
}

/** The change folder of the last `implement` line in sessions.map, any session. */
export function newestImplementFolder(sessionsMap: string): string | null {
  let found: string | null = null
  for (const raw of sessionsMap.split('\n')) {
    const [, folder, stage] = raw.replace(/\r$/, '').trim().split(/\s+/)
    if (stage === 'implement' && folder) found = folder
  }
  return found
}

export function parseSpecTitle(specText: string, changeFolder: string): string {
  const lines = specText.split(/\r?\n/)
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line.trim() === '---') break
      const m = /^title:\s*(.*)$/.exec(line)
      if (!m) continue
      let value = (m[1] ?? '').trim()
      const quoted = /^"(.*)"$/.exec(value) ?? /^'(.*)'$/.exec(value)
      if (quoted) value = quoted[1] ?? ''
      else value = value.replace(/\s+#.*$/, '').trim()
      if (value) return value
      break
    }
  }
  return basename(changeFolder)
}

export function parsePlanYaml(text: string, title: string, changeFolder: string): PlanGraph {
  let doc: unknown
  try {
    doc = load(text)
  } catch (err) {
    throw new Error(`plan.yaml is not valid YAML: ${oneLine(err instanceof Error ? err.message : String(err))}`)
  }
  const raw = doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>).milestones : undefined
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('plan.yaml has no milestones')
  const milestones: PlanMilestone[] = raw.map((item: unknown, i: number) => {
    const m = (item !== null && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const number = m.number
    if (typeof number !== 'number' || !Number.isInteger(number)) {
      throw new Error(`plan.yaml milestone ${i + 1} has no number`)
    }
    const goal = m.goal
    if (typeof goal !== 'string' || goal.trim() === '') {
      throw new Error(`plan.yaml milestone ${i + 1} has no goal`)
    }
    const slug = typeof m.slug === 'string' && m.slug !== '' ? m.slug : deriveSlug(goal)
    const deps = m['depends-on']
    const dependsOn = Array.isArray(deps) ? deps.map(d => String(d)) : []
    return { number, slug, goal: oneLine(goal), dependsOn }
  })
  milestones.sort((a, b) => a.number - b.number)
  return { title, changeFolder, milestones }
}

export async function loadPlan(
  $: EngineInterface,
  sessionId: string,
): Promise<{ plan: PlanGraph | null; error: string | null }> {
  try {
    const root = await $.session.root()
    let map: string
    try {
      map = await $.fs.read(joinPath(root, SESSIONS_MAP))
    } catch {
      return { plan: null, error: `cannot read ${SESSIONS_MAP}` }
    }
    // A session continued under a new id is in the map only once the
    // orchestrator registers it again: fall back to the newest implement run.
    const folder = findChangeFolder(map, sessionId) ?? newestImplementFolder(map)
    if (folder === null) {
      return { plan: null, error: `no implement entry for this session in ${SESSIONS_MAP}` }
    }
    const planPath = `${folder.replace(/\/+$/, '')}/plan.yaml`
    let planText: string
    try {
      planText = await $.fs.read(joinPath(root, planPath))
    } catch {
      return { plan: null, error: `cannot read ${planPath}` }
    }
    let title = basename(folder)
    try {
      title = parseSpecTitle(await $.fs.read(joinPath(root, `${folder.replace(/\/+$/, '')}/spec.md`)), folder)
    } catch {
      // spec.md is optional: keep the folder's basename as the title.
    }
    return { plan: parsePlanYaml(planText, title, folder), error: null }
  } catch (err) {
    return { plan: null, error: oneLine(err instanceof Error ? err.message : String(err)) || 'cannot load the plan' }
  }
}
