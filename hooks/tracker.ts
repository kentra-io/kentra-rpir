// The model of an implement run: pure functions over the shared types.
// No `$`, no clock — every event carries `at`, every view takes `now`.
import type {
  AgentRun, MilestoneRun, MilestoneView, Outcome, Role, RunState, Status, TrackerEvent,
} from '../types'

const STATUSES: readonly Status[] = [
  'waiting', 'ready', 'implementing', 'verifying', 'fixing', 'passed', 'merged', 'stuck',
]

// Pinned by tests/check-templates.sh against skills/implement/*-prompt.md line 1.
const DISPATCH = /^You are (implementing|verifying) milestone M(\d+) `([^`]+)`/
const OUTCOME_LINE =
  /^[\s>*_`-]*(VERDICT|STATUS)[*_`]*\s*:\s*[*_`]*\s*(PASS|FAIL|DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED)(?![A-Za-z0-9_])/
const VERDICTS: readonly Outcome[] = ['PASS', 'FAIL']
const MERGE_SHAPE = /\bgit\s[\s\S]*\bmerge\b[\s\S]*(?:^|\s)--no-ff(?=\s|$)/
const MERGE_MESSAGE = /-m\s*["']Merge M(\d+)(?=[\s"'])/

/** First line `You are implementing|verifying milestone M<n> \`<slug>\`` → its parts; anything else → null.
 *  Leading whitespace is ignored; only the first non-empty line counts. */
export function parseDispatch(prompt: string): { number: number; slug: string; role: Role } | null {
  const line = prompt.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '')
  if (line === undefined) return null
  const m = DISPATCH.exec(line)
  if (m === null) return null
  return { number: Number(m[2]), slug: m[3], role: m[1] === 'implementing' ? 'impl' : 'verify' }
}

/** The last `VERDICT: PASS|FAIL` or `STATUS: DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED`
 *  line in a subagent's final text (markdown bold/backticks around it tolerated), or null. */
export function parseOutcome(text: string): Outcome | null {
  let found: Outcome | null = null
  for (const line of text.split(/\r?\n/)) {
    const m = OUTCOME_LINE.exec(line)
    if (m === null) continue
    const value = m[2] as Outcome
    const isVerdict = VERDICTS.includes(value)
    if ((m[1] === 'VERDICT') === isVerdict) found = value
  }
  return found
}

/** A main-session Bash command containing `git ` … `merge` … `--no-ff` and `-m "Merge M<n> …"`
 *  (single or double quotes) → n; else null. */
export function parseMerge(command: string): number | null {
  if (!MERGE_SHAPE.test(command)) return null
  const m = MERGE_MESSAGE.exec(command)
  return m === null ? null : Number(m[1])
}

export function emptyRun(at: number): RunState {
  return { startedAt: at, plan: null, planError: null, milestones: {}, agents: {} }
}

function findAgent(state: RunState, agentId: string | null, toolUseId: string | null): AgentRun | null {
  if (agentId !== null && state.agents[agentId] !== undefined) return state.agents[agentId]
  if (toolUseId !== null) {
    for (const a of Object.values(state.agents)) if (a.toolUseId === toolUseId) return a
  }
  return null
}

function withAgent(state: RunState, agent: AgentRun): RunState {
  return { ...state, agents: { ...state.agents, [agent.agentId]: agent } }
}

/** Applies one event. Pure: returns a new state, never mutates. */
export function reduce(state: RunState, ev: TrackerEvent): RunState {
  switch (ev.kind) {
    case 'spawn': {
      const d = parseDispatch(ev.prompt)
      if (d === null || state.agents[ev.agentId] !== undefined) return state
      const agent: AgentRun = {
        agentId: ev.agentId, toolUseId: ev.toolUseId, number: d.number, slug: d.slug, role: d.role,
        startedAt: ev.at, endedAt: null, lastTool: null, outcome: null,
      }
      const prev = state.milestones[d.slug]
      const milestone: MilestoneRun = prev !== undefined
        ? { ...prev, agents: [...prev.agents, ev.agentId] }
        : { number: d.number, slug: d.slug, agents: [ev.agentId], firstDispatchAt: ev.at, mergedAt: null }
      return {
        ...state,
        agents: { ...state.agents, [ev.agentId]: agent },
        milestones: { ...state.milestones, [d.slug]: milestone },
      }
    }
    case 'tool': {
      // A tool call means the agent is running, even after one of its turns ended.
      const a = state.agents[ev.agentId]
      if (a === undefined || (a.lastTool === ev.summary && a.endedAt === null)) return state
      return withAgent(state, { ...a, lastTool: ev.summary, endedAt: null })
    }
    case 'resume': {
      // A subagent runs one turn per wake-up (say, after a background shell
      // finished): a new turn reopens an agent an earlier turn's end closed.
      const a = state.agents[ev.agentId]
      if (a === undefined || a.endedAt === null) return state
      return withAgent(state, { ...a, endedAt: null })
    }
    case 'agentDone': {
      const a = findAgent(state, ev.agentId, ev.toolUseId)
      if (a === null) return state
      const outcome = ev.resultText !== null ? (parseOutcome(ev.resultText) ?? a.outcome) : a.outcome
      // The last end wins: a subagent may end several turns before it is done.
      const endedAt = a.endedAt === null ? ev.at : Math.max(a.endedAt, ev.at)
      if (endedAt === a.endedAt && a.lastTool === null && outcome === a.outcome) return state
      return withAgent(state, { ...a, endedAt, lastTool: null, outcome })
    }
    case 'bash': {
      if (ev.isError) return state
      const n = parseMerge(ev.command)
      if (n === null) return state
      const m = Object.values(state.milestones).find((x) => x.number === n && x.mergedAt === null)
      if (m === undefined) return state
      return { ...state, milestones: { ...state.milestones, [m.slug]: { ...m, mergedAt: ev.at } } }
    }
    case 'plan':
      return { ...state, plan: ev.plan, planError: ev.error }
  }
}

function span(a: AgentRun, now: number): number {
  return Math.max(0, (a.endedAt ?? now) - a.startedAt)
}

function statusOf(state: RunState, slug: string, ms: MilestoneRun | undefined, agents: AgentRun[]): Status {
  if (ms !== undefined && ms.mergedAt !== null) return 'merged'
  let runningIdx = -1
  for (let i = agents.length - 1; i >= 0; i--) if (agents[i].endedAt === null) { runningIdx = i; break }
  if (runningIdx >= 0) {
    const running = agents[runningIdx]
    if (running.role === 'verify') return 'verifying'
    const failedBefore = agents.slice(0, runningIdx).some((a) => a.role === 'verify' && a.outcome === 'FAIL')
    return failedBefore ? 'fixing' : 'implementing'
  }
  const last = agents[agents.length - 1]
  if (last !== undefined) {
    if (last.role === 'verify') {
      if (last.outcome === 'PASS') return 'passed'
      if (last.outcome === 'FAIL') return 'stuck'
      return 'verifying' // finished with no verdict read yet: the Agent result is still to come
    }
    if (last.outcome === 'BLOCKED' || last.outcome === 'NEEDS_CONTEXT') return 'stuck'
    return 'implementing'
  }
  const pm = state.plan?.milestones.find((m) => m.slug === slug)
  const deps = pm?.dependsOn ?? []
  const allMerged = pm !== undefined && deps.every((d) => (state.milestones[d]?.mergedAt ?? null) !== null)
  return allMerged ? 'ready' : 'waiting'
}

/** Status and numbers of one milestone (by slug) at `now`. */
export function viewOf(state: RunState, slug: string, now: number): MilestoneView {
  const ms = state.milestones[slug]
  const agents = (ms?.agents ?? [])
    .map((id) => state.agents[id])
    .filter((a): a is AgentRun => a !== undefined)
  const impl = agents.filter((a) => a.role === 'impl')
  const verify = agents.filter((a) => a.role === 'verify')
  let running: AgentRun | null = null
  for (let i = agents.length - 1; i >= 0; i--) if (agents[i].endedAt === null) { running = agents[i]; break }
  const last = agents.length > 0 ? agents[agents.length - 1] : null
  return {
    status: statusOf(state, slug, ms, agents),
    implMs: impl.reduce((t, a) => t + span(a, now), 0),
    verifyMs: verify.reduce((t, a) => t + span(a, now), 0),
    attempts: impl.length,
    verifyRounds: verify.length,
    wallMs: ms !== undefined && ms.mergedAt !== null ? ms.mergedAt - ms.firstDispatchAt : null,
    currentTool: running?.lastTool ?? null,
    runningAgentId: running?.agentId ?? null,
    lastAgentId: last?.agentId ?? null,
  }
}

/** Count of plan milestones (or tracked ones when plan is null) per status. */
export function countByStatus(state: RunState, now: number): Record<Status, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>
  const slugs = state.plan !== null ? state.plan.milestones.map((m) => m.slug) : Object.keys(state.milestones)
  for (const slug of slugs) counts[viewOf(state, slug, now).status] += 1
  return counts
}
