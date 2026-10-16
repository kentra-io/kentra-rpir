import { expect, test } from 'claude-code/testing'
import type { PlanGraph, RunState, Status, TrackerEvent } from '../../types'
import {
  countByStatus, emptyRun, parseDispatch, parseMerge, parseOutcome, reduce, viewOf,
} from '../tracker'

// First lines of skills/implement/implementer-prompt.md and verifier-prompt.md,
// byte for byte. tests/check-templates.sh greps this file for both lines:
// change them only together with the templates and that script.
const IMPL_TEMPLATE_LINE = 'You are implementing milestone M{{number}} `{{slug}}` of the change "{{title}}".'
const VERIFY_TEMPLATE_LINE = 'You are verifying milestone M{{number}} `{{slug}}` of the change "{{title}}".'

const fill = (line: string, n: number, slug: string, title: string): string =>
  line.replace('{{number}}', String(n)).replace('{{slug}}', slug).replace('{{title}}', title)
const implPrompt = (n: number, slug: string): string =>
  `${fill(IMPL_TEMPLATE_LINE, n, slug, 'T')}\n\n**Work only in \`.worktrees/${slug}\`**, on branch ...\n`
const verifyPrompt = (n: number, slug: string): string =>
  `${fill(VERIFY_TEMPLATE_LINE, n, slug, 'T')}\n\nWork only in \`.worktrees/${slug}\` ...\n`
const mergeCmd = (n: number, slug: string): string =>
  `git -C .worktrees/integration merge --no-ff rpir/${slug} -m "Merge M${n} ${slug}"`

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k])
  }
  return v
}
const apply = (s: RunState, evs: TrackerEvent[]): RunState =>
  evs.reduce((acc, ev) => reduce(deepFreeze(acc), ev), s)

const spawn = (agentId: string, prompt: string, at: number): TrackerEvent =>
  ({ kind: 'spawn', agentId, toolUseId: `tu-${agentId}`, prompt, at })
const done = (agentId: string, text: string, at: number): TrackerEvent =>
  ({ kind: 'agentDone', agentId: null, toolUseId: `tu-${agentId}`, resultText: text, at })
const turnDone = (agentId: string, at: number): TrackerEvent =>
  ({ kind: 'agentDone', agentId, toolUseId: null, resultText: null, at })
const bash = (command: string, at: number, isError = false): TrackerEvent =>
  ({ kind: 'bash', command, isError, at })

function planOf(ms: Array<[number, string, string[]]>): PlanGraph {
  return {
    title: 'T',
    changeFolder: 'docs/changes/x',
    milestones: ms.map(([number, slug, dependsOn]) => ({ number, slug, goal: `goal ${slug}`, dependsOn })),
  }
}
const withPlan = (plan: PlanGraph | null, error: string | null = null): RunState =>
  reduce(emptyRun(0), { kind: 'plan', plan, error })

test('parseDispatch reads both prompt templates', () => {
  expect(parseDispatch(implPrompt(2, 'plan-source'))).toEqual({ number: 2, slug: 'plan-source', role: 'impl' })
  expect(parseDispatch(`\n  ${verifyPrompt(12, 'a-b')}`)).toEqual({ number: 12, slug: 'a-b', role: 'verify' })
  expect(parseDispatch('Explore the repo and list every test file.')).toBeNull()
  expect(parseDispatch('Note: You are implementing milestone M2 `x` of the change "T".')).toBeNull()
  expect(parseDispatch('')).toBeNull()
})

test('parseDispatch reads the real template first lines', () => {
  expect(parseDispatch(fill(IMPL_TEMPLATE_LINE, 3, 'store', 'T'))).toEqual({ number: 3, slug: 'store', role: 'impl' })
  expect(parseDispatch(fill(VERIFY_TEMPLATE_LINE, 3, 'store', 'T'))).toEqual({ number: 3, slug: 'store', role: 'verify' })
})

test('parseOutcome and parseMerge', () => {
  expect(parseOutcome('STATUS: DONE\nCOMMITS: abc123\nCHECK: sh tests/run.sh passed')).toBe('DONE')
  expect(parseOutcome('STATUS: DONE_WITH_CONCERNS\nCONCERNS: flaky')).toBe('DONE_WITH_CONCERNS')
  expect(parseOutcome('`STATUS: NEEDS_CONTEXT`\nQUESTION: which?')).toBe('NEEDS_CONTEXT')
  expect(parseOutcome('STATUS: BLOCKED\nBLOCKER: no docker')).toBe('BLOCKED')
  expect(parseOutcome('VERDICT: PASS\nCHECK: ok')).toBe('PASS')
  expect(parseOutcome('Summary\n\n**VERDICT: FAIL**\nFINDINGS: ...')).toBe('FAIL')
  expect(parseOutcome('**VERDICT:** FAIL')).toBe('FAIL')
  expect(parseOutcome('STATUS: BLOCKED\nretried\nSTATUS: DONE')).toBe('DONE')
  expect(parseOutcome('VERDICT: DONE')).toBeNull()
  expect(parseOutcome('the STATUS: DONE line is missing')).toBeNull()
  expect(parseOutcome('no report here')).toBeNull()

  expect(parseMerge(mergeCmd(2, 'plan-source'))).toBe(2)
  expect(parseMerge("git -C .worktrees/integration merge --no-ff rpir/x -m 'Merge M12 x'")).toBe(12)
  expect(parseMerge(`${mergeCmd(3, 'run-tracker')} && git worktree remove .worktrees/run-tracker`)).toBe(3)
  expect(parseMerge('git merge rpir/x -m "Merge M2 x"')).toBeNull()
  expect(parseMerge('git merge --no-ff rpir/x -m "Update docs"')).toBeNull()
  expect(parseMerge('echo "Merge M2 x" --no-ff')).toBeNull()
})

test('parallel milestones time independently', () => {
  const plan = planOf([[1, 'm1', []], [2, 'm2', ['m1']], [3, 'm3', ['m1']], [4, 'm4', ['m2', 'm3']]])
  let s = apply(withPlan(plan), [
    spawn('i1', implPrompt(1, 'm1'), 0),
    done('i1', 'STATUS: DONE', 1000),
    spawn('v1', verifyPrompt(1, 'm1'), 1000),
    done('v1', 'VERDICT: PASS', 2000),
    bash(mergeCmd(1, 'm1'), 3000),
  ])
  expect(viewOf(s, 'm1', 3000).status).toBe('merged')
  expect(viewOf(s, 'm2', 3000).status).toBe('ready')
  expect(viewOf(s, 'm4', 3000).status).toBe('waiting')
  s = apply(s, [spawn('i2', implPrompt(2, 'm2'), 10_000), spawn('i3', implPrompt(3, 'm3'), 15_000)])
  const m2 = viewOf(s, 'm2', 20_000)
  const m3 = viewOf(s, 'm3', 20_000)
  expect(m2.status).toBe('implementing')
  expect(m3.status).toBe('implementing')
  expect(m2.implMs).toBe(10_000)
  expect(m3.implMs).toBe(5_000)
  expect(m2.runningAgentId).toBe('i2')
  expect(m3.runningAgentId).toBe('i3')
  expect(viewOf(s, 'm4', 20_000).status).toBe('waiting')
  expect(countByStatus(s, 20_000)).toEqual({
    waiting: 1, ready: 0, implementing: 2, verifying: 0, fixing: 0, passed: 0, merged: 1, stuck: 0,
  })
})

test('fail then fix then pass then merge', () => {
  let s = withPlan(planOf([[1, 'store', []]]))
  const steps: Array<[TrackerEvent, Status]> = [
    [spawn('i1', implPrompt(1, 'store'), 1000), 'implementing'],
    [{ kind: 'tool', agentId: 'i1', summary: 'Bash: sh tests/run.sh', at: 2000 }, 'implementing'],
    [turnDone('i1', 4000), 'implementing'],
    [done('i1', 'STATUS: DONE', 4100), 'implementing'],
    [spawn('v1', verifyPrompt(1, 'store'), 5000), 'verifying'],
    [done('v1', 'VERDICT: FAIL\nFINDINGS: x', 7000), 'stuck'],
    [spawn('i2', implPrompt(1, 'store'), 8000), 'fixing'],
    [done('i2', 'STATUS: DONE', 10_000), 'implementing'],
    [spawn('v2', verifyPrompt(1, 'store'), 11_000), 'verifying'],
    [done('v2', 'VERDICT: PASS', 12_000), 'passed'],
    [bash(mergeCmd(1, 'store'), 13_000), 'merged'],
  ]
  for (const [ev, want] of steps) {
    s = reduce(deepFreeze(s), ev)
    const at = ev.kind === 'plan' ? 0 : ev.at
    expect(viewOf(s, 'store', at).status, `after ${ev.kind} at ${at}`).toBe(want)
  }
  const v = viewOf(s, 'store', 99_000)
  expect(v.attempts).toBe(2)
  expect(v.verifyRounds).toBe(2)
  expect(v.implMs).toBe((4000 - 1000) + (10_000 - 8000))
  expect(v.verifyMs).toBe((7000 - 5000) + (12_000 - 11_000))
  expect(v.wallMs).toBe(13_000 - 1000)
  expect(v.runningAgentId).toBeNull()
  expect(v.currentTool).toBeNull()
  expect(v.lastAgentId).toBe('v2')
  // A second merge line does not move mergedAt.
  expect(viewOf(reduce(s, bash(mergeCmd(1, 'store'), 50_000)), 'store', 99_000).wallMs).toBe(12_000)
})

test('blocked milestone is stuck', () => {
  let s = withPlan(planOf([[1, 'store', []]]))
  s = apply(s, [
    spawn('i1', implPrompt(1, 'store'), 0),
    { kind: 'tool', agentId: 'i1', summary: 'Bash: docker ps', at: 500 },
  ])
  expect(viewOf(s, 'store', 600).currentTool).toBe('Bash: docker ps')
  s = apply(s, [done('i1', 'STATUS: BLOCKED\nBLOCKER: no docker', 1000)])
  const v = viewOf(s, 'store', 5000)
  expect(v.status).toBe('stuck')
  expect(v.runningAgentId).toBeNull()
  expect(v.currentTool).toBeNull()
  expect(v.lastAgentId).toBe('i1')
  expect(v.implMs).toBe(1000)
})

test('ready and NEEDS_CONTEXT', () => {
  const plan = planOf([[1, 'm1', []], [2, 'm2', ['m1']], [3, 'm3', ['m1']]])
  const s = apply(withPlan(plan), [
    spawn('i1', implPrompt(1, 'm1'), 0),
    done('i1', 'STATUS: DONE', 1000),
    spawn('v1', verifyPrompt(1, 'm1'), 1000),
    done('v1', 'VERDICT: PASS', 2000),
    bash(mergeCmd(1, 'm1'), 3000),
    spawn('i3', implPrompt(3, 'm3'), 4000),
    done('i3', 'STATUS: NEEDS_CONTEXT\nQUESTION: which schema?', 5000),
  ])
  expect(viewOf(s, 'm2', 6000).status).toBe('ready') // deps merged, never dispatched
  const stuck = viewOf(s, 'm3', 6000)
  expect(stuck.status).toBe('stuck')
  expect(stuck.runningAgentId).toBeNull()
})

test('non-milestone dispatch is ignored', () => {
  const s = deepFreeze(withPlan(planOf([[1, 'store', []]])))
  expect(reduce(s, spawn('x1', 'Explore the repo and list every test file.', 10))).toBe(s)
  expect(reduce(s, { kind: 'tool', agentId: 'nobody', summary: 'Read: a.ts', at: 11 })).toBe(s)
  expect(reduce(s, { kind: 'agentDone', agentId: 'nobody', toolUseId: null, resultText: 'STATUS: DONE', at: 12 })).toBe(s)
  expect(reduce(s, bash('git status', 13))).toBe(s)
  expect(reduce(s, bash(mergeCmd(1, 'store'), 14))).toBe(s) // milestone never dispatched
})

test('no plan still tracks dispatches', () => {
  let s = withPlan(null, 'no implement entry for this session in .kentra-rpir/sessions.map')
  s = apply(s, [spawn('i1', implPrompt(1, 'a'), 0), spawn('i2', implPrompt(2, 'b'), 100)])
  expect(s.planError).toBe('no implement entry for this session in .kentra-rpir/sessions.map')
  expect(countByStatus(s, 1000)).toEqual({
    waiting: 0, ready: 0, implementing: 2, verifying: 0, fixing: 0, passed: 0, merged: 0, stuck: 0,
  })
  expect(viewOf(s, 'a', 1000).status).toBe('implementing')
  expect(viewOf(s, 'b', 1000).implMs).toBe(900)
  expect(viewOf(s, 'never-seen', 1000).status).toBe('waiting')
})
