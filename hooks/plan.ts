import type { EngineInterface } from 'claude-code'
import type { PlanGraph, PlanMilestone } from '../types'
import { load } from './vendor/js-yaml.mjs'

/** `repo` is milestoned-plan-dag 0.5.0's optional milestone field; types/index.d.ts does not declare it. */
export type RepoMilestone = PlanMilestone & { repo?: string }

const CHANGES_DIR = 'rpir/changes'
const SESSIONS_GLOB = 'rpir/changes/*/.local/sessions'

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

/** One change folder's machine-local state: its `.local/sessions` text and mtime, and whether `.local/implement-state.json` exists. */
export type ChangeState = { folder: string; sessions: string; hasImplementState: boolean; sessionsMtimeMs: number }

function hasImplementLine(sessions: string, sessionId?: string): boolean {
  return sessions.split('\n').some((raw) => {
    const [id, stage] = raw.trim().split(/\s+/)
    return stage === 'implement' && (sessionId === undefined || id === sessionId)
  })
}

/** The newest sessions file wins; the folder name breaks ties. */
function newest(list: readonly ChangeState[]): string | null {
  const sorted = [...list].sort((a, b) => a.sessionsMtimeMs - b.sessionsMtimeMs || (a.folder < b.folder ? -1 : 1))
  return sorted.pop()?.folder ?? null
}

/** The change whose sessions file has `<sessionId> implement`; the one with the newest sessions file if several. */
export function findChangeFolder(changes: readonly ChangeState[], sessionId: string): string | null {
  return newest(changes.filter((c) => hasImplementLine(c.sessions, sessionId)))
}

/** The unfinished implementation (implement-state.json), else the change with any implement line; the newest sessions file wins within each. */
export function newestImplementFolder(changes: readonly ChangeState[]): string | null {
  const withImplement = changes.filter((c) => hasImplementLine(c.sessions))
  return newest(withImplement.filter((c) => c.hasImplementState)) ?? newest(withImplement)
}

// A backticked path is taken whole (the templates put the worktree in
// backticks, so a path with spaces survives); elsewhere a path ends at
// whitespace or punctuation.
const QUOTED_PATH = /`(\/[^`\n]+)`/g
const ABSOLUTE_PATH = /(?:^|[\s'"(=*[:>{])(\/[^\s`'"<>()|;&,\]]+)/g
const FILE_NAME = /\.[A-Za-z0-9]{1,6}$/
const MAX_CANDIDATES = 64

/** The directories a project root may be, most likely first: each absolute
 *  path in `hints` (the session's directory, the dispatch prompts' worktree
 *  paths, newest first) and every directory above it, then the session's
 *  root, then `children` (the root's subdirectories). A session started above
 *  the project (a folder of several repositories) reaches the project only
 *  through the hints or the children: a shell `cd` does not move its root.
 *  Top-level folders (`/Users`) and file names are never candidates. */
export function candidateRoots(root: string, hints: readonly string[], children: readonly string[] = []): string[] {
  const out: string[] = []
  // The cap bounds the hints only: the root and its children always count.
  const add = (dir: string, capped = true) => {
    const d = dir.replace(/\/+$/, '')
    if (d !== '' && !out.includes(d) && (!capped || out.length < MAX_CANDIDATES)) out.push(d)
  }
  const addPath = (path: string) => {
    const parts = path.replace(/[.:*!?]+$/, '').split('/').filter((x) => x !== '')
    const leaf = parts[parts.length - 1] ?? ''
    for (let i = FILE_NAME.test(leaf) ? parts.length - 1 : parts.length; i >= 2; i--) {
      add(`/${parts.slice(0, i).join('/')}`)
    }
  }
  for (const hint of hints) {
    for (const m of hint.matchAll(QUOTED_PATH)) addPath(m[1] ?? '')
    for (const m of hint.matchAll(ABSOLUTE_PATH)) addPath(m[1] ?? '')
  }
  add(root, false)
  for (const child of children) add(joinPath(root, child), false)
  return out
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

export function isSmallTier(specText: string): boolean {
  const lines = specText.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return false
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '---') break
    const m = /^tier:\s*["']?([A-Za-z-]+)/.exec(line)
    if (m) return m[1]?.toLowerCase() === 'small'
  }
  return false
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
  const milestones: RepoMilestone[] = raw.map((item: unknown, i: number) => {
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
    const repo = typeof m.repo === 'string' && m.repo !== '' ? { repo: m.repo } : {}
    return { number, slug, goal: oneLine(goal), dependsOn, ...repo }
  })
  milestones.sort((a, b) => a.number - b.number)
  return { title, changeFolder, milestones }
}

async function readChanges($: EngineInterface, root: string): Promise<ChangeState[]> {
  let names: string[]
  try {
    names = (await $.fs.list(joinPath(root, CHANGES_DIR))).filter((e) => e.kind === 'dir').map((e) => e.name)
  } catch {
    return []
  }
  const changes: ChangeState[] = []
  for (const name of names) {
    const folder = `${CHANGES_DIR}/${name}`
    let sessions: string
    try {
      sessions = await $.fs.read(joinPath(root, `${folder}/.local/sessions`))
    } catch {
      continue
    }
    const hasImplementState = await $.fs.read(joinPath(root, `${folder}/.local/implement-state.json`)).then(() => true, () => false)
    const listing = await $.fs.list(joinPath(root, `${folder}/.local`)).catch(() => [])
    const sessionsMtimeMs = listing.find((e) => e.name === 'sessions')?.mtimeMs ?? 0
    changes.push({ folder, sessions, hasImplementState, sessionsMtimeMs })
  }
  return changes
}

/** The project whose change folders register this session's implement run,
 *  else the first candidate with any implement run, else null. */
export async function findProject(
  $: EngineInterface,
  sessionId: string,
  candidates: readonly string[],
): Promise<{ root: string; folder: string } | null> {
  let fallback: { root: string; folder: string } | null = null
  for (const root of candidates) {
    const changes = await readChanges($, root)
    const own = findChangeFolder(changes, sessionId)
    if (own !== null) return { root, folder: own }
    // A session continued under a new id is registered only once the
    // orchestrator registers it again: fall back to the unfinished implement run.
    const newest = newestImplementFolder(changes)
    if (fallback === null && newest !== null) fallback = { root, folder: newest }
  }
  return fallback
}

export async function loadPlan(
  $: EngineInterface,
  sessionId: string,
  hints: readonly string[] = [],
): Promise<{ plan: PlanGraph | null; error: string | null }> {
  try {
    const root = await $.session.root()
    let children: string[] = []
    try {
      children = (await $.fs.list(root)).filter((e) => e.kind === 'dir' && !e.name.startsWith('.')).map((e) => e.name)
    } catch {
      // no listing: the root and the hints only
    }
    const candidates = candidateRoots(root, hints, children)
    const found = await findProject($, sessionId, candidates)
    if (found === null) {
      return { plan: null, error: `no implement run in ${SESSIONS_GLOB} under ${candidates[0]} or the dispatches' paths` }
    }
    const { root: project, folder } = found
    const dir = folder.replace(/\/+$/, '')
    const planPath = `${dir}/plan.yaml`
    let specText: string | null = null
    try {
      specText = await $.fs.read(joinPath(project, `${dir}/spec.md`))
    } catch {
      // spec.md is optional: keep the folder's basename as the title.
    }
    let planText: string
    try {
      planText = await $.fs.read(joinPath(project, planPath))
    } catch {
      if (specText !== null && isSmallTier(specText)) {
        const slug = basename(folder).replace(/^\d{4}-\d{2}-\d{2}-/, '')
        const milestone = { number: 1, slug, goal: parseSpecTitle(specText, folder), dependsOn: [] }
        return { plan: { title: milestone.goal, changeFolder: folder, milestones: [milestone] }, error: null }
      }
      return { plan: null, error: `cannot read ${planPath}` }
    }
    const title = specText !== null ? parseSpecTitle(specText, folder) : basename(folder)
    return { plan: parsePlanYaml(planText, title, folder), error: null }
  } catch (err) {
    return { plan: null, error: oneLine(err instanceof Error ? err.message : String(err)) || 'cannot load the plan' }
  }
}
