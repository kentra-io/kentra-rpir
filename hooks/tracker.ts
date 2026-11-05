// The model of an implement run: pure functions over the shared types.
// No `$`, no clock — every event carries `at`, every view takes `now`.
import type {
  AgentRun, DispatchCall, LiveAgents, MilestoneRun, MilestoneView, Outcome, Role, RunClock, RunState, Status, TrackerEvent,
  TranscriptRow, TranscriptToolUse,
} from '../types'

const STATUSES: readonly Status[] = [
  'waiting', 'ready', 'implementing', 'implemented', 'verifying', 'verified',
  'failed', 'fixing', 'passed', 'merged', 'stuck',
]

// Pinned by tests/check-templates.sh against skills/implement/*-prompt.md line 1.
const DISPATCH = /^You are (implementing|verifying|leading) milestone M(\d+) `([^`]+)`/
const OUTCOME_LINE =
  /^[\s>*_`-]*(VERDICT|STATUS)[*_`]*\s*:\s*[*_`]*\s*(PASS|FAIL|DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED)(?![A-Za-z0-9_])/
const VERDICTS: readonly Outcome[] = ['PASS', 'FAIL']
const MERGE_SHAPE = /\bgit\s[\s\S]*\bmerge\b[\s\S]*(?:^|\s)--no-ff(?=\s|$)/
const MERGE_MESSAGE = /-m\s*["']Merge M(\d+)(?=[\s"'])/

/** First line `You are implementing|leading|verifying milestone M<n> \`<slug>\`` → its parts; anything else → null.
 *  Leading whitespace is ignored; only the first non-empty line counts. */
export function parseDispatch(prompt: string): { number: number; slug: string; role: Role } | null {
  const line = prompt.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '')
  if (line === undefined) return null
  const m = DISPATCH.exec(line)
  if (m === null) return null
  return { number: Number(m[2]), slug: m[3], role: m[1] === 'verifying' ? 'verify' : 'impl' }
}

// The fallbacks for a dispatch whose prompt does not start with the template's
// first line (an orchestrator that sent a pointer to a file, say): the prompt
// file's name (".../m1-example-milestone.impl.1.md"), then the Agent call's
// description ("Implement M1 example-milestone", "Lead M1 example-milestone").
// The description counts only for the process's own agent types, so a helper
// agent described "Fix M3 merge conflict" is no milestone agent.
const DESCRIPTION = /^\s*(?:[Rr]e-?)?(?:[Ii]mplement|[Ff]ix|[Vv]erify|[Ll]ead)\w*\s+M(\d+)\b[\s:.·—–-]*`?([a-z0-9]+(?:-[a-z0-9]+)*)`?/
const PROMPT_FILE = /\bm(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.(impl|lead|verify)\.\d+\.md\b/

/** A milestone dispatch: the prompt's first line (parseDispatch), else the
 *  prompt file it points to, else, for a lead, implementer or verifier agent type,
 *  its description. The agent type decides the role when it names one. */
export function parseDispatchCall(call: DispatchCall): { number: number; slug: string; role: Role } | null {
  const direct = parseDispatch(call.prompt)
  if (direct !== null) return direct
  const type = call.subagentType ?? ''
  const typed: Role | null = /verifier/.test(type) ? 'verify' : /lead|implementer/.test(type) ? 'impl' : null
  const f = PROMPT_FILE.exec(call.prompt)
  if (f !== null) {
    const [, n, slug = '', tag] = f
    return { number: Number(n), slug, role: typed ?? (tag === 'verify' ? 'verify' : 'impl') }
  }
  if (typed === null) return null
  const d = DESCRIPTION.exec(call.description ?? '')
  if (d === null) return null
  const [, n, slug = ''] = d
  return { number: Number(n), slug, role: typed }
}

/** An Agent tool call's input as a DispatchCall. */
export function callOf(input: Record<string, unknown>): DispatchCall {
  return {
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(typeof input.subagent_type === 'string' ? { subagentType: input.subagent_type } : {}),
  }
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

/** Start of the agent's current round. */
function activeStart(a: AgentRun): number {
  return a.resumedAt ?? a.startedAt
}

/** An ended agent running again. When another agent of its milestone started
 *  a round since it ended, this is a new round; else it woke itself (after
 *  its own background shell) and only stops being ended. */
function reopen(state: RunState, a: AgentRun, at: number): AgentRun {
  if (a.endedAt === null) return a
  const endedAt = a.endedAt
  const ranSince = (state.milestones[a.slug]?.agents ?? []).some((id) => {
    const o = state.agents[id]
    return id !== a.agentId && o !== undefined && activeStart(o) >= endedAt
  })
  if (!ranSince) return { ...a, endedAt: null }
  return {
    ...a, pastMs: (a.pastMs ?? 0) + endedAt - activeStart(a), resumedAt: at, rounds: (a.rounds ?? 0) + 1,
    outcome: null, endedAt: null,
  }
}

function withAgent(state: RunState, agent: AgentRun): RunState {
  return { ...state, agents: { ...state.agents, [agent.agentId]: agent } }
}

/** Applies one event. Pure: returns a new state, never mutates. */
export function reduce(state: RunState, ev: TrackerEvent): RunState {
  switch (ev.kind) {
    case 'spawn': {
      const parsed = parseDispatchCall(ev)
      if (parsed === null || state.agents[ev.agentId] !== undefined) return state
      // A reworded description ("Fix M2 build failure") names the milestone by number only.
      const pm = state.plan?.milestones
      const d = pm !== undefined && !pm.some((m) => m.slug === parsed.slug)
        ? { ...parsed, slug: pm.find((m) => m.number === parsed.number)?.slug ?? parsed.slug }
        : parsed
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
      return withAgent(state, { ...reopen(state, a, ev.at), lastTool: ev.summary })
    }
    case 'resume': {
      // A subagent runs one turn per wake-up (say, after a background shell
      // finished): a new turn reopens an agent an earlier turn's end closed.
      const a = state.agents[ev.agentId]
      if (a === undefined || a.endedAt === null) return state
      return withAgent(state, reopen(state, a, ev.at))
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
    case 'plan': {
      // A milestone tracked under a slug the plan lacks (seen before the plan
      // loaded) moves to the plan's milestone of its number.
      let milestones = state.milestones
      let agents = state.agents
      for (const m of Object.values(state.milestones)) {
        const pm = ev.plan?.milestones.find((x) => x.number === m.number)
        if (pm === undefined || pm.slug === m.slug || ev.plan?.milestones.some((x) => x.slug === m.slug)) continue
        if (milestones[pm.slug] !== undefined) continue
        const { [m.slug]: _, ...rest } = milestones
        milestones = { ...rest, [pm.slug]: { ...m, slug: pm.slug } }
        for (const id of m.agents) {
          const a = agents[id]
          if (a !== undefined) agents = { ...agents, [id]: { ...a, slug: pm.slug } }
        }
      }
      return { ...state, plan: ev.plan, planError: ev.error, milestones, agents }
    }
  }
}

function span(a: AgentRun, now: number): number {
  return Math.max(0, (a.pastMs ?? 0) + (a.endedAt ?? now) - activeStart(a))
}

function statusOf(
  state: RunState, slug: string, ms: MilestoneRun | undefined, agents: AgentRun[],
  running: AgentRun | null, last: AgentRun | null,
): Status {
  if (ms !== undefined && ms.mergedAt !== null) return 'merged'
  if (running !== null) {
    if (running.role === 'verify') return 'verifying'
    const runningIdx = agents.indexOf(running)
    const failedBefore = agents.some((a, i) =>
      a.role === 'verify' && a.outcome === 'FAIL' && a.endedAt !== null &&
      (i < runningIdx || a.endedAt <= activeStart(running)))
    return failedBefore ? 'fixing' : 'implementing'
  }
  if (last !== null) {
    // Nothing of this milestone runs: it waits on the orchestrator.
    if (last.role === 'verify') {
      if (last.outcome === 'PASS') return 'passed'   // awaiting merge
      if (last.outcome === 'FAIL') return 'failed'   // awaiting a fix round
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
  let last: AgentRun | null = null
  for (const a of agents) {
    if (a.endedAt === null) {
      if (running === null || activeStart(a) >= activeStart(running)) running = a
    } else if (last === null || a.endedAt >= (last.endedAt ?? 0)) last = a
  }
  const shown = running ?? last
  return {
    status: statusOf(state, slug, ms, agents, running, last),
    implMs: impl.reduce((t, a) => t + span(a, now), 0),
    verifyMs: verify.reduce((t, a) => t + span(a, now), 0),
    attempts: impl.reduce((t, a) => t + 1 + (a.rounds ?? 0), 0),
    verifyRounds: verify.reduce((t, a) => t + 1 + (a.rounds ?? 0), 0),
    wallMs: ms !== undefined && ms.mergedAt !== null ? ms.mergedAt - ms.firstDispatchAt : null,
    currentTool: running?.lastTool ?? null,
    runningAgentId: running?.agentId ?? null,
    lastAgentId: shown?.agentId ?? null,
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
// A notification an agent sends while its own background work still runs: it is not done.
// Read from the engine's own <summary> and <note>, never the agent's <result>.
const TASK_INTERIM = /waiting on its own background work|may be interim/
const TASK_RESULT = /<result>[\s\S]*?<\/result>/g

function isDispatch(u: TranscriptToolUse): boolean {
  return u.tool === 'Agent' && parseDispatchCall(callOf(u.input)) !== null
}

/** True when the transcript holds at least one milestone dispatch. */
export function hasDispatch(rows: readonly TranscriptRow[]): boolean {
  return rows.some((r) => r.role === 'assistant' && r.toolUses.some(isDispatch))
}

/** The agent ids of every milestone dispatch in the transcript, in order. */
export function dispatchedAgentIds(rows: readonly TranscriptRow[]): string[] {
  const ids: string[] = []
  for (const r of rows) {
    if (r.role !== 'assistant') continue
    for (const u of r.toolUses) {
      if (!isDispatch(u)) continue
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
  // The engine says it runs: a hand-back the transcript holds is an earlier round's.
  const end = (id: string, outcome: Outcome | null) => {
    if (live[id] !== 'running') s = endAgent(s, id, outcome, now)
  }
  const order = new Map<string, number>()
  for (const r of rows) {
    if (r.role === 'assistant') {
      for (const u of r.toolUses) {
        if (u.tool === 'Agent') {
          const call = callOf(u.input)
          if (parseDispatchCall(call) === null) continue
          const id = u.agentId ?? LAUNCH_ID.exec(u.text ?? '')?.[1]
          if (id === undefined) continue
          if (!order.has(id)) order.set(id, order.size)
          if (s.agents[id] === undefined) {
            s = reduce(s, { kind: 'spawn', agentId: id, toolUseId: null, ...call, at: now })
          }
          // A foreground call's answer is the report; a background one's is the launch notice.
          if (u.text !== undefined && !LAUNCH_NOTICE.test(u.text) && u.input.run_in_background !== true) {
            end(id, parseOutcome(u.text))
          }
        } else if (u.tool === 'Bash' && typeof u.input.command === 'string' && u.text !== undefined && u.isError !== true) {
          s = reduce(s, { kind: 'bash', command: u.input.command, isError: false, at: now })
        }
      }
    } else {
      const marks = [...r.text.matchAll(HANDBACK)]
      marks.forEach((m, i) => {
        const stop = i + 1 < marks.length ? marks[i + 1].index : r.text.length
        end(m[1], parseOutcome(r.text.slice(m.index, stop)))
      })
      for (const n of r.text.matchAll(NOTIFICATION)) {
        const body = n[1] ?? ''
        const id = TASK_ID.exec(body)?.[1]
        if (id !== undefined && TASK_DONE.test(body) && !TASK_INTERIM.test(body.replace(TASK_RESULT, ''))) {
          end(id, parseOutcome(body.replace(/<[^>]*>/g, '\n')))
        }
      }
    }
  }
  for (const [id, phase] of Object.entries(live)) {
    const a = s.agents[id]
    if (a === undefined) continue
    if (phase === 'running' && a.endedAt !== null) s = withAgent(s, reopen(s, a, now))
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

/** The report an agent's own transcript ends on: the last STATUS/VERDICT line
 *  in its assistant text or in the input of its hand-back call, or null. */
export function outcomeOfAgent(rows: readonly TranscriptRow[]): Outcome | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r === undefined || r.role !== 'assistant') continue
    const parts = [r.text, ...r.toolUses.map((u) => Object.values(u.input).filter((v) => typeof v === 'string').join('\n'))]
    const found = parseOutcome(parts.join('\n'))
    if (found !== null) return found
  }
  return null
}

/** Ends each agent in `reports` with its outcome, unless `live` says it still
 *  runs. Reports come from the agents' own transcripts: the engine keeps a
 *  background agent's hand-back out of the main session's messages. */
export function applyReports(
  state: RunState,
  reports: Readonly<Record<string, Outcome>>,
  now: number,
  live: LiveAgents = {},
): RunState {
  let s = state
  for (const [id, outcome] of Object.entries(reports)) {
    if (live[id] !== 'running') s = endAgent(s, id, outcome, now)
  }
  return s
}
