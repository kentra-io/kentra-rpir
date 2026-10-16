// The model of an implement run: pure functions over the shared types.
// No `$`, no clock — every event carries `at`, every view takes `now`.
import type {
  AgentRun, LiveAgents, MilestoneRun, MilestoneView, Outcome, Role, RunClock, RunState, Status, TrackerEvent,
  TranscriptRow,
} from '../types'

const STATUSES: readonly Status[] = [
  'waiting', 'ready', 'implementing', 'implemented', 'verifying', 'verified',
  'failed', 'fixing', 'passed', 'merged', 'stuck',
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
    // Nothing of this milestone runs: it waits on the orchestrator.
    if (last.role === 'verify') {
      if (last.outcome === 'PASS') return 'passed'   // awaiting merge
      if (last.outcome === 'FAIL') return 'failed'   // awaiting a fix dispatch
      return 'verified'                              // awaiting the verdict read
    }
    if (last.outcome === 'BLOCKED' || last.outcome === 'NEEDS_CONTEXT') return 'stuck'
    return 'implemented'                             // DONE, DONE_WITH_CONCERNS or none: awaiting verify
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

/** The run's clock at `now`: `running` (elapsed to now) while any agent runs;
 *  otherwise `done` when the plan has milestones and every one is merged, else
 *  `idle` — both with elapsed from the run's start to the last agent's end. */
export function runClock(state: RunState, now: number): RunClock {
  const agents = Object.values(state.agents)
  if (agents.some((a) => a.endedAt === null)) {
    return { phase: 'running', elapsedMs: Math.max(0, now - state.startedAt) }
  }
  const lastEnd = agents.reduce((t, a) => Math.max(t, a.endedAt ?? 0), -Infinity)
  const elapsedMs = agents.length === 0 ? 0 : Math.max(0, lastEnd - state.startedAt)
  const pms = state.plan?.milestones ?? []
  const allMerged = pms.length > 0 &&
    pms.every((m) => (state.milestones[m.slug]?.mergedAt ?? null) !== null)
  return { phase: allMerged ? 'done' : 'idle', elapsedMs }
}

// What the transcript says of a background agent: the Agent tool's launch
// notice names its id; its report comes back as a hand-back message or a
// task notification in the main conversation.
const LAUNCH_ID = /\bagentId:\s*([A-Za-z0-9_-]+)/
const LAUNCH_NOTICE = /^\s*(?:Async agent launched|Remote agent launched)/
const HANDBACK = /<agent-message from="([^"]+)">/g
const NOTIFICATION = /<task-notification>([\s\S]*?)<\/task-notification>/g
const TASK_ID = /<task-id>\s*([^<\s]+)\s*<\/task-id>/
const TASK_DONE = /<status>\s*(completed|failed|killed)\s*<\/status>/

/** True when the transcript holds at least one milestone dispatch. */
export function hasDispatch(rows: readonly TranscriptRow[]): boolean {
  return rows.some((r) => r.role === 'assistant' && r.toolUses.some((u) =>
    u.tool === 'Agent' && typeof u.input.prompt === 'string' && parseDispatch(u.input.prompt) !== null))
}

/** The agent ids of every milestone dispatch in the transcript, in order. */
export function dispatchedAgentIds(rows: readonly TranscriptRow[]): string[] {
  const ids: string[] = []
  for (const r of rows) {
    if (r.role !== 'assistant') continue
    for (const u of r.toolUses) {
      if (u.tool !== 'Agent' || typeof u.input.prompt !== 'string' || parseDispatch(u.input.prompt) === null) continue
      const id = u.agentId ?? LAUNCH_ID.exec(u.text ?? '')?.[1]
      if (id !== undefined) ids.push(id)
    }
  }
  return ids
}

/** Ends an agent the transcript or the engine says has ended. The first end
 *  time seen stays; an outcome fills in when none was read yet. */
function endAgent(state: RunState, agentId: string, outcome: Outcome | null, at: number): RunState {
  const a = state.agents[agentId]
  if (a === undefined) return state
  const endedAt = a.endedAt ?? at
  const next = outcome ?? a.outcome
  if (endedAt === a.endedAt && next === a.outcome) return state
  return withAgent(state, { ...a, endedAt, outcome: next, lastTool: null })
}

/** Brings `state` in line with the session's transcript and the engine's live
 *  agents, so a run the live events missed (a session continued under a new
 *  id, a reload, a dropped event) still reads right:
 *  - every milestone dispatch in the transcript is an agent of its milestone,
 *    in transcript order (one first seen here starts at `now`);
 *  - a hand-back or finished task notification ends its agent and gives it
 *    the report's STATUS/VERDICT; so does a foreground Agent call's answer;
 *  - every successful `git merge --no-ff … -m "Merge M<n> …"` merges M<n>;
 *  - last, `live` wins: an agent the engine runs is running, one it says
 *    ended is ended (agents it does not list keep what the transcript says).
 *  Pure, and idempotent: reconciling twice changes nothing more. */
export function reconcile(
  state: RunState,
  rows: readonly TranscriptRow[],
  now: number,
  live: LiveAgents = {},
): RunState {
  let s = state
  const order = new Map<string, number>()
  for (const r of rows) {
    if (r.role === 'assistant') {
      for (const u of r.toolUses) {
        if (u.tool === 'Agent') {
          const prompt = typeof u.input.prompt === 'string' ? u.input.prompt : ''
          if (parseDispatch(prompt) === null) continue
          const id = u.agentId ?? LAUNCH_ID.exec(u.text ?? '')?.[1]
          if (id === undefined) continue
          if (!order.has(id)) order.set(id, order.size)
          if (s.agents[id] === undefined) {
            s = reduce(s, { kind: 'spawn', agentId: id, toolUseId: null, prompt, at: now })
          }
          // A foreground call's answer is the report; a background one's is the launch notice.
          if (u.text !== undefined && !LAUNCH_NOTICE.test(u.text) && u.input.run_in_background !== true) {
            s = endAgent(s, id, parseOutcome(u.text), now)
          }
        } else if (u.tool === 'Bash' && typeof u.input.command === 'string' && u.text !== undefined && u.isError !== true) {
          s = reduce(s, { kind: 'bash', command: u.input.command, isError: false, at: now })
        }
      }
    } else {
      const marks = [...r.text.matchAll(HANDBACK)]
      marks.forEach((m, i) => {
        const end = i + 1 < marks.length ? marks[i + 1].index : r.text.length
        s = endAgent(s, m[1], parseOutcome(r.text.slice(m.index, end)), now)
      })
      for (const n of r.text.matchAll(NOTIFICATION)) {
        const id = TASK_ID.exec(n[1])?.[1]
        if (id !== undefined && TASK_DONE.test(n[1])) {
          s = endAgent(s, id, parseOutcome(n[1].replace(/<[^>]*>/g, '\n')), now)
        }
      }
    }
  }
  for (const [id, phase] of Object.entries(live)) {
    const a = s.agents[id]
    if (a === undefined) continue
    if (phase === 'running' && a.endedAt !== null) s = withAgent(s, { ...a, endedAt: null })
    if (phase === 'ended') s = endAgent(s, id, null, now)
  }
  // Each milestone's agents in transcript order, so "the newest agent" is the newest dispatch.
  if (order.size > 0) {
    const rank = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER
    const milestones: Record<string, MilestoneRun> = {}
    let moved = false
    for (const [slug, m] of Object.entries(s.milestones)) {
      const sorted = [...m.agents].sort((x, y) => rank(x) - rank(y))
      moved ||= sorted.some((id, i) => id !== m.agents[i])
      milestones[slug] = { ...m, agents: sorted }
    }
    if (moved) s = { ...s, milestones }
  }
  return s
}
