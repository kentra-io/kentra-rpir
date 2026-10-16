import { expect, test } from 'claude-code/testing'
import type { PlanGraph, RunState, Status, TrackerEvent } from '../../types'
import {
  countByStatus, emptyRun, parseDispatch, parseMerge, parseOutcome, reduce, runClock, viewOf,
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
    waiting: 1, ready: 0, implementing: 2, implemented: 0, verifying: 0, verified: 0,
    failed: 0, fixing: 0, passed: 0, merged: 1, stuck: 0,
  })
})

test('fail then fix then pass then merge', () => {
  let s = withPlan(planOf([[1, 'store', []]]))
  const steps: Array<[TrackerEvent, Status]> = [
    [spawn('i1', implPrompt(1, 'store'), 1000), 'implementing'],
    [{ kind: 'tool', agentId: 'i1', summary: 'Bash: sh tests/run.sh', at: 2000 }, 'implementing'],
    [turnDone('i1', 4000), 'implemented'],
    [done('i1', 'STATUS: DONE', 4100), 'implemented'],
    [spawn('v1', verifyPrompt(1, 'store'), 5000), 'verifying'],
    [done('v1', 'VERDICT: FAIL\nFINDINGS: x', 7000), 'failed'],
    [spawn('i2', implPrompt(1, 'store'), 8000), 'fixing'],
    [done('i2', 'STATUS: DONE', 10_000), 'implemented'],
    [spawn('v2', verifyPrompt(1, 'store'), 11_000), 'verifying'],
    [done('v2', 'VERDICT: PASS', 12_000), 'passed'],
    [bash(mergeCmd(1, 'store'), 13_000), 'merged'],
  ]
  const seen: Status[] = []
  for (const [ev, want] of steps) {
    s = reduce(deepFreeze(s), ev)
    const at = ev.kind === 'plan' ? 0 : ev.at
    const got = viewOf(s, 'store', at).status
    expect(got, `after ${ev.kind} at ${at}`).toBe(want)
    if (seen[seen.length - 1] !== got) seen.push(got)
  }
  expect(seen).toEqual([
    'implementing', 'implemented', 'verifying', 'failed', 'fixing',
    'implemented', 'verifying', 'passed', 'merged',
  ])
  const v = viewOf(s, 'store', 99_000)
  expect(v.attempts).toBe(2)
  expect(v.verifyRounds).toBe(2)
  expect(v.implMs).toBe((4100 - 1000) + (10_000 - 8000)) // the last end wins
  expect(v.verifyMs).toBe((7000 - 5000) + (12_000 - 11_000))
  expect(v.wallMs).toBe(13_000 - 1000)
  expect(v.runningAgentId).toBeNull()
  expect(v.currentTool).toBeNull()
  expect(v.lastAgentId).toBe('v2')
  // A second merge line does not move mergedAt.
  expect(viewOf(reduce(s, bash(mergeCmd(1, 'store'), 50_000)), 'store', 99_000).wallMs).toBe(12_000)
})

test('blocked milestone is stuck', () => {
  let s = withPlan(planOf([[1, 'store', []], [2, 'other', []], [3, 'checked', []]]))
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

  s = apply(s, [
    spawn('i2', implPrompt(2, 'other'), 2000),
    done('i2', 'STATUS: NEEDS_CONTEXT\nQUESTION: which schema?', 3000),
  ])
  expect(viewOf(s, 'other', 5000).status).toBe('stuck')

  // A verifier FAIL is routine: failed, never stuck.
  s = apply(s, [
    spawn('i3', implPrompt(3, 'checked'), 2000),
    done('i3', 'STATUS: DONE', 3000),
    spawn('v3', verifyPrompt(3, 'checked'), 3000),
    done('v3', 'VERDICT: FAIL\nFINDINGS: x', 4000),
  ])
  expect(viewOf(s, 'checked', 5000).status).toBe('failed')
  expect(viewOf(s, 'checked', 5000).status).not.toBe('stuck')
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
    waiting: 0, ready: 0, implementing: 2, implemented: 0, verifying: 0, verified: 0,
    failed: 0, fixing: 0, passed: 0, merged: 0, stuck: 0,
  })
  expect(viewOf(s, 'a', 1000).status).toBe('implementing')
  expect(viewOf(s, 'b', 1000).implMs).toBe(900)
  expect(viewOf(s, 'never-seen', 1000).status).toBe('waiting')
})

test('a subagent that ends a turn and wakes again keeps running', () => {
  let s = withPlan(planOf([[1, 'store', []]]))
  s = apply(s, [
    spawn('i1', implPrompt(1, 'store'), 0),
    { kind: 'tool', agentId: 'i1', summary: 'Bash: sleep 40', at: 1000 },
    turnDone('i1', 2000),
  ])
  expect(viewOf(s, 'store', 3000).runningAgentId).toBeNull()
  s = apply(s, [{ kind: 'resume', agentId: 'i1', at: 41000 }])
  let v = viewOf(s, 'store', 42000)
  expect(v.runningAgentId).toBe('i1')
  expect(v.implMs).toBe(42000)
  s = apply(s, [turnDone('i1', 43000), done('i1', 'STATUS: DONE', 43100)])
  v = viewOf(s, 'store', 50000)
  expect(v.runningAgentId).toBeNull()
  expect(v.implMs).toBe(43100)
  expect(s.agents['i1']!.outcome).toBe('DONE')
  // a tool call after a turn's end reopens the agent too
  s = apply(s, [{ kind: 'tool', agentId: 'i1', summary: 'Read: a.ts', at: 44000 }])
  expect(viewOf(s, 'store', 45000).currentTool).toBe('Read: a.ts')
})

test('implementer done waits for verify', () => {
  const plan = planOf([[1, 'a', []], [2, 'b', []], [3, 'c', []], [4, 'd', []]])
  const s = apply(withPlan(plan), [
    spawn('ia', implPrompt(1, 'a'), 1000),
    done('ia', 'Implemented.\n\nSTATUS: DONE', 6000),
    spawn('ib', implPrompt(2, 'b'), 1000),
    done('ib', 'I wrote the file and stopped.', 4000), // no outcome line
    spawn('ic', implPrompt(3, 'c'), 1000),
    turnDone('ic', 3000),                              // a turn's end, no result text
    spawn('id', implPrompt(4, 'd'), 1000),
    done('id', 'STATUS: DONE_WITH_CONCERNS\nCONCERNS: slow test', 2000),
  ])
  for (const now of [10_000, 60_000, 600_000]) {
    const a = viewOf(s, 'a', now)
    expect(a.status).toBe('implemented')
    expect(a.implMs).toBe(6000 - 1000)
    expect(a.runningAgentId).toBeNull()
    const b = viewOf(s, 'b', now)
    expect(b.status).toBe('implemented')
    expect(b.implMs).toBe(4000 - 1000)
    expect(viewOf(s, 'c', now).status).toBe('implemented')
    expect(viewOf(s, 'c', now).implMs).toBe(3000 - 1000)
    expect(viewOf(s, 'd', now).status).toBe('implemented')
  }
})

test('verifier without verdict is verified', () => {
  const s = apply(withPlan(planOf([[1, 'a', []]])), [
    spawn('i1', implPrompt(1, 'a'), 1000),
    done('i1', 'STATUS: DONE', 4000),
    spawn('v1', verifyPrompt(1, 'a'), 5000),
    done('v1', 'I ran the check; it looked fine.', 8000), // no VERDICT line
  ])
  for (const now of [9000, 90_000]) {
    const v = viewOf(s, 'a', now)
    expect(v.status).toBe('verified')
    expect(v.verifyMs).toBe(8000 - 5000)
    expect(v.implMs).toBe(4000 - 1000)
    expect(v.runningAgentId).toBeNull()
  }
})

test('runClock phases', () => {
  const plan = planOf([[1, 'm1', []], [2, 'm2', ['m1']]])
  const base = reduce(emptyRun(1000), { kind: 'plan', plan, error: null })
  expect(runClock(base, 5000)).toEqual({ phase: 'idle', elapsedMs: 0 }) // no agents yet

  let s = apply(base, [spawn('i1', implPrompt(1, 'm1'), 1000)])
  expect(runClock(s, 5000)).toEqual({ phase: 'running', elapsedMs: 4000 })
  expect(runClock(s, 9000)).toEqual({ phase: 'running', elapsedMs: 8000 })

  s = apply(s, [
    done('i1', 'STATUS: DONE', 3000),
    spawn('v1', verifyPrompt(1, 'm1'), 3500),
    done('v1', 'VERDICT: PASS', 4000),
    bash(mergeCmd(1, 'm1'), 4500),
  ])
  // every agent ended, m2 not merged
  expect(runClock(s, 10_000)).toEqual({ phase: 'idle', elapsedMs: 3000 })
  expect(runClock(s, 99_000)).toEqual({ phase: 'idle', elapsedMs: 3000 })

  s = apply(s, [
    spawn('i2', implPrompt(2, 'm2'), 5000),
    done('i2', 'STATUS: DONE', 7000),
    spawn('v2', verifyPrompt(2, 'm2'), 7000),
    done('v2', 'VERDICT: PASS', 9000),
    bash(mergeCmd(2, 'm2'), 9500),
  ])
  expect(runClock(s, 20_000)).toEqual({ phase: 'done', elapsedMs: 8000 })
  expect(runClock(s, 200_000)).toEqual({ phase: 'done', elapsedMs: 8000 })

  // no plan: never done
  const noPlan = apply(reduce(emptyRun(0), { kind: 'plan', plan: null, error: 'x' }), [
    spawn('j1', implPrompt(1, 'a'), 0),
    done('j1', 'STATUS: DONE', 500),
  ])
  expect(runClock(noPlan, 1000)).toEqual({ phase: 'idle', elapsedMs: 500 })
})

test('countByStatus counts the new statuses', () => {
  const plan = planOf([[1, 'a', []], [2, 'b', []], [3, 'c', []], [4, 'd', []], [5, 'e', ['a']]])
  const s = apply(withPlan(plan), [
    spawn('ia', implPrompt(1, 'a'), 0),
    done('ia', 'STATUS: DONE', 100),                      // a: implemented
    spawn('ib', implPrompt(2, 'b'), 0),
    done('ib', 'STATUS: DONE', 100),
    spawn('vb', verifyPrompt(2, 'b'), 200),
    done('vb', 'no verdict here', 300),                   // b: verified
    spawn('ic', implPrompt(3, 'c'), 0),
    done('ic', 'STATUS: DONE', 100),
    spawn('vc', verifyPrompt(3, 'c'), 200),
    done('vc', 'VERDICT: FAIL\nFINDINGS: x', 300),        // c: failed
    spawn('id', implPrompt(4, 'd'), 0),
    done('id', 'STATUS: DONE', 100),
    spawn('vd', verifyPrompt(4, 'd'), 200),
    done('vd', 'VERDICT: PASS', 300),                     // d: passed
  ])                                                      // e: waiting on a
  expect(countByStatus(s, 1000)).toEqual({
    waiting: 1, ready: 0, implementing: 0, implemented: 1, verifying: 0, verified: 1,
    failed: 1, fixing: 0, passed: 1, merged: 0, stuck: 0,
  })
})
