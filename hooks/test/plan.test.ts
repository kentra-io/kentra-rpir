import { test, expect } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import { candidateRoots, findChangeFolder, newestImplementFolder, parseSpecTitle, parsePlanYaml, loadPlan } from '../plan'

const SELF = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

const local = (root: string, name: string, file: string) => `${root}/rpir/changes/${name}/.local/${file}`
const PANE_NAME = '2026-10-16-milestone-graph-pane'
const PANE_FOLDER = `rpir/changes/${PANE_NAME}`
const LATER_FOLDER = 'rpir/changes/2026-10-09-later'
const SESSIONS = {
  [local('/proj', '2026-10-01-old', 'sessions')]: `${SELF} spec\n${SELF} plan\n${SELF} implement\n`,
  [local('/proj', '2026-10-05-other', 'sessions')]: `${OTHER} implement\n`,
  [local('/proj', '2026-10-09-later', 'sessions')]: `${OTHER} implement\n`,
  [local('/proj', PANE_NAME, 'sessions')]: `${SELF}   implement\r\n\nstray-line-with-one-field\n`,
}
const changes = (...rows: [string, string, boolean?, number?][]) =>
  rows.map(([folder, sessions, hasImplementState = false, sessionsMtimeMs = 0]) => ({ folder, sessions, hasImplementState, sessionsMtimeMs }))

const PLAN = `# yaml-language-server: $schema=https://raw.githubusercontent.com/kentra-io/milestoned-plan-dag/v0.3.0/schema/plan.schema.json
schemaVersion: 0.3.0
description: |
  A plan with a multi-line description.

  It has two paragraphs.
milestones:
  - number: 3
    slug: graph-layout
    goal: Lays out the graph
    depends-on: [mod-scaffold, plan-source]
    contract:
      check: sh tests/run.sh
      criteria: []
      paths: [hooks/layout.ts]
    steps:
      - "[ ] write it"
  - number: 1
    slug: mod-scaffold
    goal: The plugin ships a loadable mod
    description: |
      Line one of a description.
      Line two: with a colon.
    contract:
      check: sh tests/run.sh
      criteria: []
      paths: []
    steps:
      - text: |
          [ ] a multi-line step
          with a second line
        files: [hooks/hooks.json]
  - number: 4
    goal: Add the Thing!  (wiring)
    depends-on:
      - graph-layout
      - mod-scaffold
    contract:
      check: none
      criteria: []
      paths: []
    steps:
      - "[ ] wire it"
  - number: 2
    slug: plan-source
    goal: "Reads the plan: quoted goal"
    depends-on:
      - mod-scaffold
    contract:
      check: none
      criteria: []
      paths: []
    steps:
      - "[x] done"
`

const SPEC = `---
title: Milestone graph pane for implement runs
type: feature            # feature | bug | chore
status: agreed
---

## Problem
`

const isOneLine = (s: string) => s.length > 0 && !/[\r\n]/.test(s)

test("findChangeFolder picks the change whose sessions file has this session's implement line", async () => {
  const all = changes(
    ['rpir/changes/2026-10-01-old', `${SELF} spec\n${SELF} implement\n`],
    [LATER_FOLDER, `${OTHER} implement\n`],
    [PANE_FOLDER, `${SELF}   implement\r\n\nstray-line-with-one-field\n`],
    ['rpir/changes/2026-10-20-no-implement', `${SELF} spec\n`],
  )
  expect(findChangeFolder(all, SELF)).toBe(PANE_FOLDER)
  expect(findChangeFolder(all, OTHER)).toBe(LATER_FOLDER)
  expect(findChangeFolder(all, 'nobody')).toBe(null)
  expect(findChangeFolder([], SELF)).toBe(null)
})

test('parsePlanYaml reads milestones and edges', async () => {
  const g = parsePlanYaml(PLAN, 'The title', 'rpir/changes/x')
  expect(g.title).toBe('The title')
  expect(g.changeFolder).toBe('rpir/changes/x')
  expect(g.milestones).toEqual([
    { number: 1, slug: 'mod-scaffold', goal: 'The plugin ships a loadable mod', dependsOn: [] },
    { number: 2, slug: 'plan-source', goal: 'Reads the plan: quoted goal', dependsOn: ['mod-scaffold'] },
    { number: 3, slug: 'graph-layout', goal: 'Lays out the graph', dependsOn: ['mod-scaffold', 'plan-source'] },
    { number: 4, slug: 'add-the-thing-wiring', goal: 'Add the Thing!  (wiring)', dependsOn: ['graph-layout', 'mod-scaffold'] },
  ])
})

test('parsePlanYaml reads repo when set and leaves it off otherwise', async () => {
  const multi = 'schemaVersion: 0.5.0\nmilestones:\n  - number: 1\n    slug: a\n    goal: A\n    repo: ../shared\n  - number: 2\n    slug: b\n    goal: B\n    repo: app\n    depends-on: [a]\n'
  expect(parsePlanYaml(multi, 't', 'x').milestones.map((m) => (m as { repo?: string }).repo)).toEqual(['../shared', 'app'])
  for (const m of parsePlanYaml(PLAN, 't', 'x').milestones) expect('repo' in m).toBe(false)
})

test('parsePlanYaml rejects bad input', async () => {
  for (const bad of ['milestones: [unclosed', 'a: b: c', 'just a sentence', 'schemaVersion: 0.3.0\nmilestones: []\n', '']) {
    let message: string | null = null
    try {
      parsePlanYaml(bad, 't', 'rpir/changes/x')
    } catch (err) {
      expect(err instanceof Error).toBe(true)
      message = (err as Error).message
    }
    expect(message === null ? `no throw for ${JSON.stringify(bad)}` : isOneLine(message)).toBe(true)
  }
})

test('parseSpecTitle', async () => {
  expect(parseSpecTitle(SPEC, 'rpir/changes/2026-10-16-milestone-graph-pane')).toBe('Milestone graph pane for implement runs')
  expect(parseSpecTitle('---\ntitle: "Quoted: title"\n---\n', 'x')).toBe('Quoted: title')
  expect(parseSpecTitle('## Problem\n\ntitle: not frontmatter\n', 'rpir/changes/2026-10-16-milestone-graph-pane/'))
    .toBe('2026-10-16-milestone-graph-pane')
})

/** A `$` holding only what loadPlan touches; files by absolute path. */
function stub(files: Record<string, string>, root = '/proj', dirs?: string[], mtimes: Record<string, number> = {}): EngineInterface {
  return {
    fs: {
      read: async (path: string) => {
        const text = files[path]
        if (text === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'\n    at read`)
        return text
      },
      list: async (path: string) => {
        if (path.endsWith('/.local')) {
          const mtimeMs = mtimes[path]
          if (mtimeMs === undefined) throw new Error(`ENOENT: ${path}`)
          return [{ name: 'sessions', kind: 'file', size: 0, mtimeMs, isLink: false }]
        }
        const prefix = `${path}/`
        const names = path.endsWith('/rpir/changes')
          ? Object.keys(files).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length).split('/')[0]!)
          : dirs
        if (names === undefined) throw new Error(`ENOENT: ${path}`)
        return [...new Set(names)].map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false }))
      },
    },
    session: { root: async () => root },
  } as unknown as EngineInterface
}

test('loadPlan reports a missing entry', async () => {
  const msg = "no implement run in rpir/changes/*/.local/sessions under /proj or the dispatches' paths"
  const noMap = await loadPlan(stub({}), SELF)
  expect(noMap.plan).toBe(null)
  expect(noMap.error).toBe(msg)

  const noEntry = await loadPlan(stub({ [local('/proj', 'x', 'sessions')]: `${SELF} spec\n` }), 'no-such-session')
  expect(noEntry.plan).toBe(null)
  expect(noEntry.error).toBe(msg)

  // A session not registered (continued under a new id) reads the unfinished implement run.
  const continued = await loadPlan(stub({ ...SESSIONS, [local('/proj', '2026-10-09-later', 'implement-state.json')]: '{}' }), 'no-such-session')
  expect(continued.error).toBe(`cannot read ${LATER_FOLDER}/plan.yaml`)

  // With no implement state, the change with an implement line and the newest sessions file.
  const noState = await loadPlan(stub(SESSIONS), 'no-such-session')
  expect(noState.error).toBe(`cannot read ${PANE_FOLDER}/plan.yaml`)

  // readChanges reads the sessions file's mtime: the older-named change with the newer file wins.
  const byMtime = await loadPlan(stub(SESSIONS, '/proj', undefined, { '/proj/rpir/changes/2026-10-05-other/.local': 9 }), 'no-such-session')
  expect(byMtime.error).toBe('cannot read rpir/changes/2026-10-05-other/plan.yaml')

  const noPlan = await loadPlan(stub(SESSIONS), SELF)
  expect(noPlan.plan).toBe(null)
  expect(noPlan.error).toBe(`cannot read ${PANE_FOLDER}/plan.yaml`)
})

test('loadPlan reads the plan and the title through $.fs', async () => {
  const folder = PANE_FOLDER
  const ok = await loadPlan(stub({
    ...SESSIONS,
    [`/proj/${folder}/plan.yaml`]: PLAN,
    [`/proj/${folder}/spec.md`]: SPEC,
  }), SELF)
  expect(ok.error).toBe(null)
  expect(ok.plan?.title).toBe('Milestone graph pane for implement runs')
  expect(ok.plan?.changeFolder).toBe(folder)
  expect(ok.plan?.milestones.map(m => m.slug)).toEqual(['mod-scaffold', 'plan-source', 'graph-layout', 'add-the-thing-wiring'])

  const noSpec = await loadPlan(stub({
    ...SESSIONS,
    [`/proj/${folder}/plan.yaml`]: PLAN,
  }), SELF)
  expect(noSpec.plan?.title).toBe('2026-10-16-milestone-graph-pane')

  const badPlan = await loadPlan(stub({
    ...SESSIONS,
    [`/proj/${folder}/plan.yaml`]: 'a: b: c',
  }), SELF)
  expect(badPlan.plan).toBe(null)
  expect(typeof badPlan.error === 'string' && isOneLine(badPlan.error)).toBe(true)
})

test('newestImplementFolder prefers implement state, then the last change with an implement line', () => {
  const a = ['rpir/changes/2026-10-01-a', `${SELF} implement\n`, true] as [string, string, boolean]
  const b = ['rpir/changes/2026-10-02-b', `${SELF} implement\n`] as [string, string]
  const c = ['rpir/changes/2026-10-03-c', `${SELF} spec\n`, true] as [string, string, boolean]
  expect(newestImplementFolder(changes(a, b, c))).toBe('rpir/changes/2026-10-01-a')
  expect(newestImplementFolder(changes(a, b))).toBe('rpir/changes/2026-10-01-a')
  expect(newestImplementFolder(changes(b, ['rpir/changes/2026-10-00-z', `${SELF} implement\n`]))).toBe('rpir/changes/2026-10-02-b')
  expect(newestImplementFolder(changes(c))).toBe(null)
  // The newest sessions file wins over name order; implement state still beats a newer sessions file.
  const older = ['rpir/changes/2026-10-01-a', `${SELF} implement\n`] as [string, string]
  const newer = ['rpir/changes/2026-10-00-z', `${SELF} implement\n`] as [string, string]
  expect(newestImplementFolder(changes([...older, false, 1], [...newer, false, 2]))).toBe('rpir/changes/2026-10-00-z')
  expect(newestImplementFolder(changes([...older, true, 1], [...newer, false, 2]))).toBe('rpir/changes/2026-10-01-a')
  expect(findChangeFolder(changes([...older, false, 1], [...newer, false, 2]), SELF)).toBe('rpir/changes/2026-10-00-z')
})

// The workspace shape: the session started in a folder of repositories (not a
// project), and the orchestrator reached the project with a shell cd.
const NESTED = '/code/workspace/repo-a'
const NESTED_NAME = '2026-11-02-example-change'
const NESTED_FOLDER = `rpir/changes/${NESTED_NAME}`
const NESTED_FILES = {
  [local(NESTED, NESTED_NAME, 'sessions')]: `${SELF} implement\n`,
  [`${NESTED}/${NESTED_FOLDER}/plan.yaml`]: PLAN,
}
const POINTER =
  'Your dispatch prompt from the kentra-rpir orchestrator is in this file:\n\n' +
  '/tmp/x/scratchpad/prompts/m1-first-step.impl.1.md\n\n' +
  `It is long. Your worktree is ${NESTED}/.worktrees/example-change--m1-first-step.`

test('candidateRoots: each hint path and its parents, then the root, then the children', () => {
  expect(candidateRoots('/code/workspace', [`work in \`${NESTED}/.worktrees/w\`.`], ['a'])).toEqual([
    `${NESTED}/.worktrees/w`, `${NESTED}/.worktrees`, NESTED, '/code/workspace', '/code/workspace/a',
  ])
  // A path with spaces in backticks stays whole; a file name and top-level folders are no candidates.
  expect(candidateRoots('/r', ['in `/a b/proj/x`', 'read /p/q/prompts/m1-x.impl.1.md.'])).toEqual([
    '/a b/proj/x', '/a b/proj', '/p/q/prompts', '/p/q', '/r',
  ])
  // The cap never drops the root or its children.
  const many = Array.from({ length: 40 }, (_, i) => `/h${i}/a/b`).join(' ')
  const roots = candidateRoots('/r', [many], ['c'])
  expect(roots.slice(-2)).toEqual(['/r', '/r/c'])
})

test('loadPlan finds a nested project through the dispatch prompt paths', async () => {
  const r = await loadPlan(stub(NESTED_FILES, '/code/workspace'), SELF, [POINTER])
  expect(r.error).toBe(null)
  expect(r.plan?.changeFolder).toBe(NESTED_FOLDER)
  expect(r.plan?.milestones.length).toBe(4)
})

test("loadPlan finds a nested project among the root's subdirectories", async () => {
  const r = await loadPlan(stub(NESTED_FILES, '/code/workspace', ['repo-x', 'repo-a']), SELF)
  expect(r.error).toBe(null)
  expect(r.plan?.changeFolder).toBe(NESTED_FOLDER)
})

test("loadPlan prefers the project that registers this session over another's newest run", async () => {
  const r = await loadPlan(stub({
    ...NESTED_FILES,
    [local('/code/workspace/other', 'zzz', 'sessions')]: 'someone-else implement\n',
  }, '/code/workspace', ['other', 'repo-a']), SELF)
  expect(r.plan?.changeFolder).toBe(NESTED_FOLDER)
})

test("a stale map at the session root loses to the project the dispatches name", async () => {
  const r = await loadPlan(stub({
    ...NESTED_FILES,
    [local(NESTED, NESTED_NAME, 'sessions')]: 'older implement\n',
    [local('/code/workspace', 'zzz', 'sessions')]: 'ancient implement\n',
  }, '/code/workspace'), 'continued-session', [POINTER])
  expect(r.plan?.changeFolder).toBe(NESTED_FOLDER)
})

test('loadPlan reads a small-tier change as one milestone', async () => {
  const map = SESSIONS
  const folder = PANE_FOLDER
  const small = await loadPlan(stub({
    ...map, [`/proj/${folder}/spec.md`]: '---\ntitle: Fix the pane\ntier: small\n---\n\n## Problem\n',
  }), SELF)
  expect(small.error).toBe(null)
  expect(small.plan).toEqual({
    title: 'Fix the pane', changeFolder: folder,
    milestones: [{ number: 1, slug: 'milestone-graph-pane', goal: 'Fix the pane', dependsOn: [] }],
  })

  const standard = await loadPlan(stub({
    ...map, [`/proj/${folder}/spec.md`]: '---\ntitle: Fix the pane\ntier: standard\n---\n',
  }), SELF)
  expect(standard.plan).toBe(null)
  expect(standard.error).toBe(`cannot read ${folder}/plan.yaml`)
})
