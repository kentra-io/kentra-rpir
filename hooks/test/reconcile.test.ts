import { expect, test } from 'claude-code/testing'
import type { PlanGraph, RunState, TranscriptRow } from '../../types'
import { dispatchedAgentIds, emptyRun, hasDispatch, reconcile, reduce, viewOf } from '../tracker'

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
