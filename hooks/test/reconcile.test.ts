import { expect, test } from 'claude-code/testing'
import type { PlanGraph, RunState, TranscriptRow } from '../../types'
import { applyReports, dispatchedAgentIds, emptyRun, hasDispatch, outcomeOfAgent, parseDispatchCall, reconcile, reduce, viewOf } from '../tracker'

// The shapes a real implement run leaves in the main transcript (Claude Code
// 2.1.301): background Agent calls answer with a launch notice naming the
// agent; reports come back as hand-back messages; merges are Bash calls.
const prompt = (role: 'implementing' | 'verifying', n: number, slug: string): string =>
  `You are ${role} milestone M${n} \`${slug}\` of the change "Demo diamond".\n\nWork only in /x.`
const launch = (id: string): string =>
  `Async agent launched successfully.\nagentId: ${id} (internal ID - do not mention to user.)\nThe agent is working in the background.`
const dispatch = (role: 'implementing' | 'verifying', n: number, slug: string, id: string, withId = true): TranscriptRow => ({
  role: 'assistant', text: '',
  toolUses: [{
    tool: 'Agent',
    input: { prompt: prompt(role, n, slug), run_in_background: true },
    ...(withId ? { agentId: id } : {}),
    text: launch(id),
  }],
})
const handBack = (id: string, report: string): TranscriptRow => ({
  role: 'user',
  text: `Another Claude session sent a message:\n<agent-message from="${id}">\n[Subagent hand-back] The report follows:\n  ${report}\n  COMMITS: abc\n</agent-message>`,
  toolUses: [],
})
const merge = (n: number, slug: string, isError = false): TranscriptRow => ({
  role: 'assistant', text: '',
  toolUses: [{
    tool: 'Bash',
    input: { command: `git -C /p/.worktrees/demo merge --no-ff rpir/demo--m${n} -m "Merge M${n} ${slug}"` },
    text: isError ? 'CONFLICT' : 'Merge made by the ort strategy.',
    ...(isError ? { isError: true as const } : {}),
  }],
})

const PLAN: PlanGraph = {
  title: 'Demo diamond', changeFolder: 'docs/changes/demo',
  milestones: [
    { number: 1, slug: 'alpha', goal: 'a', dependsOn: [] },
    { number: 2, slug: 'beta', goal: 'b', dependsOn: ['alpha'] },
    { number: 3, slug: 'gamma', goal: 'c', dependsOn: ['alpha'] },
    { number: 4, slug: 'delta', goal: 'd', dependsOn: ['beta', 'gamma'] },
  ],
}
const withPlan = (s: RunState): RunState => reduce(s, { kind: 'plan', plan: PLAN, error: null })
const statuses = (s: RunState, now: number): string[] =>
  PLAN.milestones.map((m) => viewOf(s, m.slug, now).status)

/** The transcript at the moment the user's session was handed off: M1 merged,
 *  M2 and M3 implemented, M3 verified and merged, M2's verifier running. */
const HANDOFF: TranscriptRow[] = [
  { role: 'user', text: '/kentra-rpir:implement docs/changes/demo', toolUses: [] },
  dispatch('implementing', 1, 'alpha', 'a1'),
  handBack('a1', 'STATUS: DONE'),
  dispatch('verifying', 1, 'alpha', 'v1'),
  handBack('v1', 'VERDICT: PASS'),
  merge(1, 'alpha'),
  dispatch('implementing', 2, 'beta', 'a2'),
  dispatch('implementing', 3, 'gamma', 'a3', false),
  handBack('a3', 'STATUS: DONE_WITH_CONCERNS'),
  dispatch('verifying', 3, 'gamma', 'v3'),
  handBack('a2', 'STATUS: DONE'),
  {
    role: 'user',
    text: '<task-notification>\n<task-id>v3</task-id>\n<status>completed</status>\n<result>VERDICT: PASS</result>\n</task-notification>',
    toolUses: [],
  },
  merge(3, 'gamma'),
  dispatch('verifying', 2, 'beta', 'v2'),
]

test('a lost run is rebuilt from the transcript', () => {
  const rebuilt = reconcile(withPlan(emptyRun(5000)), HANDOFF, 9000)
  expect(statuses(rebuilt, 9000)).toEqual(['merged', 'verifying', 'merged', 'waiting'])
  expect(rebuilt.agents['a3']!.outcome).toBe('DONE_WITH_CONCERNS')
  expect(rebuilt.agents['v3']!.outcome).toBe('PASS')
  expect(rebuilt.agents['v2']!.endedAt).toBeNull()
  expect(rebuilt.milestones['beta']!.agents).toEqual(['a2', 'v2'])
})

test('reconcile is idempotent', () => {
  const once = reconcile(withPlan(emptyRun(0)), HANDOFF, 9000)
  expect(reconcile(once, HANDOFF, 12_000)).toEqual(once)
})

test('reconcile keeps live timings and fills what live events missed', () => {
  // Live tracking saw M1 fully, then missed everything after the merge.
  let s = withPlan(emptyRun(1000))
  s = reduce(s, { kind: 'spawn', agentId: 'a1', toolUseId: null, prompt: prompt('implementing', 1, 'alpha'), at: 1000 })
  s = reduce(s, { kind: 'agentDone', agentId: 'a1', toolUseId: null, resultText: 'STATUS: DONE', at: 4000 })
  s = reduce(s, { kind: 'spawn', agentId: 'v1', toolUseId: null, prompt: prompt('verifying', 1, 'alpha'), at: 4500 })
  s = reduce(s, { kind: 'agentDone', agentId: 'v1', toolUseId: null, resultText: 'VERDICT: PASS', at: 6000 })
  const r = reconcile(s, HANDOFF, 20_000)
  expect(viewOf(r, 'alpha', 20_000).implMs).toBe(3000)
  expect(viewOf(r, 'alpha', 20_000).verifyMs).toBe(1500)
  expect(statuses(r, 20_000)).toEqual(['merged', 'verifying', 'merged', 'waiting'])
})

test('the engine decides running over the transcript', () => {
  const r = reconcile(withPlan(emptyRun(0)), HANDOFF, 9000, { v2: 'ended', a2: 'running' })
  // v2 ended with no verdict read; a2 is running again (a SendMessage follow-up), so it is newest-running.
  expect(r.agents['v2']!.endedAt).toBe(9000)
  expect(r.agents['a2']!.endedAt).toBeNull()
  expect(viewOf(r, 'beta', 9000).status).toBe('implementing')
})

test('a failed merge does not merge', () => {
  const r = reconcile(withPlan(emptyRun(0)), [...HANDOFF.slice(0, 5), merge(1, 'alpha', true)], 9000)
  expect(viewOf(r, 'alpha', 9000).status).toBe('passed')
})

test('a foreground dispatch ends with its answer', () => {
  const fg: TranscriptRow = {
    role: 'assistant', text: '',
    toolUses: [{ tool: 'Agent', input: { prompt: prompt('implementing', 1, 'alpha') }, agentId: 'f1', text: 'Done.\n\nSTATUS: BLOCKED' }],
  }
  const r = reconcile(withPlan(emptyRun(0)), [fg], 100)
  expect(viewOf(r, 'alpha', 100).status).toBe('stuck')
})

test('hasDispatch and dispatchedAgentIds read milestone dispatches only', () => {
  const other: TranscriptRow = {
    role: 'assistant', text: '',
    toolUses: [{ tool: 'Agent', input: { prompt: 'Explore the repo.' }, agentId: 'x', text: launch('x') }],
  }
  expect(hasDispatch([other])).toBe(false)
  expect(hasDispatch(HANDOFF)).toBe(true)
  expect(dispatchedAgentIds([other, ...HANDOFF])).toEqual(['a1', 'v1', 'a2', 'a3', 'v3', 'v2'])
})

// An orchestrator that rendered each prompt into a file and dispatched a
// pointer to it (kentra-rpir 0.5.2, a 19-milestone plan): the prompt's first
// line is not the template's, so the description and agent type identify it.
const pointer = (n: number, slug: string, tag: 'impl' | 'verify'): string =>
  'Your dispatch prompt from the kentra-rpir orchestrator is in this file:\n\n' +
  `/private/tmp/claude-501/x/scratchpad/prompts/m${n}-${slug}.${tag}.1.md\n\n` +
  'It is long. Read all of it before you start, in parts if you must, and follow it exactly as if it were this message.'
const pointerDispatch = (verb: 'Implement' | 'Verify', n: number, slug: string, id: string): TranscriptRow => ({
  role: 'assistant', text: '',
  toolUses: [{
    tool: 'Agent',
    input: {
      description: `${verb} M${n} ${slug}`,
      subagent_type: verb === 'Verify' ? 'kentra-rpir:verifier' : 'kentra-rpir:implementer',
      prompt: pointer(n, slug, verb === 'Verify' ? 'verify' : 'impl'),
      run_in_background: true,
    },
    text: launch(id),
  }],
})

test('parseDispatchCall falls back to the description, then the prompt file', () => {
  expect(parseDispatchCall({ prompt: prompt('verifying', 2, 'beta') })).toEqual({ number: 2, slug: 'beta', role: 'verify' })
  expect(parseDispatchCall({
    prompt: pointer(1, 'freeze-avro-java', 'impl'), description: 'Implement M1 freeze-avro-java', subagentType: 'kentra-rpir:implementer',
  })).toEqual({ number: 1, slug: 'freeze-avro-java', role: 'impl' })
  expect(parseDispatchCall({
    prompt: pointer(10, 'java-scaffold', 'verify'), description: 'Verify M10 java-scaffold', subagentType: 'kentra-rpir:verifier',
  })).toEqual({ number: 10, slug: 'java-scaffold', role: 'verify' })
  // The agent type decides the role over the description's verb.
  expect(parseDispatchCall({ prompt: 'x', description: 'Fix M3 proto-parser', subagentType: 'kentra-rpir:implementer' }))
    .toEqual({ number: 3, slug: 'proto-parser', role: 'impl' })
  // No usable description: the prompt file's name.
  expect(parseDispatchCall({ prompt: pointer(4, 'unit-conformance', 'impl'), description: 'M4 again' }))
    .toEqual({ number: 4, slug: 'unit-conformance', role: 'impl' })
  // Not the process's own call: an Explore agent with a lookalike description.
  expect(parseDispatchCall({ prompt: 'Look around the repo.', description: 'Implement M1 thing', subagentType: 'Explore' })).toBe(null)
  expect(parseDispatchCall({ prompt: 'Look around.', description: 'Find files', subagentType: 'kentra-rpir:implementer' })).toBe(null)
})

test('a run dispatched through prompt files is tracked', () => {
  const rows: TranscriptRow[] = [
    pointerDispatch('Implement', 1, 'alpha', 'p1'),
    pointerDispatch('Implement', 2, 'beta', 'p2'),
    handBack('p1', 'STATUS: DONE'),
    pointerDispatch('Verify', 1, 'alpha', 'q1'),
  ]
  expect(hasDispatch(rows)).toBe(true)
  expect(dispatchedAgentIds(rows)).toEqual(['p1', 'p2', 'q1'])
  const r = reconcile(withPlan(emptyRun(0)), rows, 100)
  expect(statuses(r, 100)).toEqual(['verifying', 'implementing', 'waiting', 'waiting'])
})

test('an interim notification does not end its agent', () => {
  const interim: TranscriptRow = {
    role: 'user', toolUses: [],
    text: '<task-notification>\n<task-id>v2</task-id>\n<status>completed</status>\n' +
      '<summary>Agent "Verify M2 beta" is waiting on its own background work</summary>\n' +
      '<note>This agent stopped with background work of its own still running. It may resume on its own when that work completes or reports, and the same task-id notifies again if it does; the result below may be interim.</note>\n' +
      '<result>This agent has not reported yet: it is waiting on its own background work and will deliver its report through SubagentHandback when that finishes.\n</result>\n</task-notification>',
  }
  const r = reconcile(withPlan(emptyRun(0)), [...HANDOFF, interim], 9000)
  expect(r.agents['v2']!.endedAt).toBe(null)
  expect(viewOf(r, 'beta', 9000).status).toBe('verifying')
})

test('a helper agent described like a milestone is no milestone agent', () => {
  // The orchestrator's own helper: general-purpose, its prompt naming the verifier.
  expect(parseDispatchCall({
    prompt: 'The verifier passed M3 but merging into /p/.worktrees/x conflicted; resolve it.',
    description: 'Fix M3 merge conflict', subagentType: 'general-purpose',
  })).toBe(null)
  expect(parseDispatchCall({ prompt: 'work in /x/kentra-rpir/.worktrees/foo', description: 'Implement M1 tracker-fallback' })).toBe(null)
})

test('a finished notification whose report says "has not reported yet" ends its agent', () => {
  const done: TranscriptRow = {
    role: 'user', toolUses: [],
    text: '<task-notification>\n<task-id>v2</task-id>\n<status>completed</status>\n<summary>Agent "Verify M2 beta" finished</summary>\n' +
      '<result>The CI job has not reported yet, so C4 is PENDING; it may be interim.\nVERDICT: PASS</result>\n</task-notification>',
  }
  const r = reconcile(withPlan(emptyRun(0)), [...HANDOFF, done], 9000)
  expect(r.agents['v2']!.outcome).toBe('PASS')
  expect(viewOf(r, 'beta', 9000).status).toBe('passed')
})

test('a reworded description lands on the milestone of its number', () => {
  const fix = { kind: 'spawn', agentId: 'f2', toolUseId: null, prompt: 'see /p/x.md', description: 'Fix M2 build failure',
    subagentType: 'kentra-rpir:implementer', at: 5 } as const
  expect(reduce(withPlan(emptyRun(0)), fix).milestones['beta']!.agents).toEqual(['f2'])
  // Seen before the plan loaded: the plan moves it.
  const early = reduce(emptyRun(0), fix)
  expect(Object.keys(early.milestones)).toEqual(['build'])
  const moved = withPlan(early)
  expect(Object.keys(moved.milestones)).toEqual(['beta'])
  expect(moved.agents['f2']!.slug).toBe('beta')
})

test("an agent's own transcript gives its outcome when the main transcript lacks its hand-back", () => {
  const rows: TranscriptRow[] = [
    { role: 'user', text: prompt('implementing', 1, 'alpha'), toolUses: [] },
    { role: 'assistant', text: 'Committed.', toolUses: [{ tool: 'SubagentHandback', input: { report: 'All green.\nSTATUS: DONE_WITH_CONCERNS' } }] },
    { role: 'assistant', text: 'Handed back.', toolUses: [] },
  ]
  expect(outcomeOfAgent(rows)).toBe('DONE_WITH_CONCERNS')
  expect(outcomeOfAgent([{ role: 'assistant', text: 'still working', toolUses: [] }])).toBe(null)
  // The engine drops hand-backs from the main session's messages: only the dispatch is there.
  const s = reconcile(withPlan(emptyRun(0)), [dispatch('implementing', 1, 'alpha', 'a1')], 100)
  expect(viewOf(s, 'alpha', 100).status).toBe('implementing')
  const r = applyReports(s, { a1: 'DONE' }, 200, {})
  expect(r.agents['a1']!.endedAt).toBe(200)
  expect(viewOf(r, 'alpha', 200).status).toBe('implemented')
  // An agent the engine still runs keeps running.
  expect(applyReports(s, { a1: 'DONE' }, 200, { a1: 'running' }).agents['a1']!.endedAt).toBe(null)
})
