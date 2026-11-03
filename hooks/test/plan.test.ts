import { test, expect } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import { candidateRoots, findChangeFolder, newestImplementFolder, parseSpecTitle, parsePlanYaml, loadPlan } from '../plan'

const SELF = '1c0e2a0d-047c-4210-8977-644f3526facf'
const OTHER = '9f8e7d6c-0000-4000-8000-000000000001'

const SESSIONS_MAP = [
  `${SELF} docs/changes/2026-10-01-old spec`,
  `${SELF} docs/changes/2026-10-01-old plan`,
  `${OTHER} docs/changes/2026-10-05-other implement`,
  `${SELF} docs/changes/2026-10-01-old implement`,
  `${SELF}   docs/changes/2026-10-16-milestone-graph-pane   implement\r`,
  `${OTHER} docs/changes/2026-10-09-later implement`,
  '',
  'stray-line-with-one-field',
].join('\n')

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

test("findChangeFolder picks this session's newest implement line", async () => {
  expect(findChangeFolder(SESSIONS_MAP, SELF)).toBe('docs/changes/2026-10-16-milestone-graph-pane')
  expect(findChangeFolder(SESSIONS_MAP, OTHER)).toBe('docs/changes/2026-10-09-later')
  expect(findChangeFolder(SESSIONS_MAP, 'no-such-session')).toBe(null)
  expect(findChangeFolder('', SELF)).toBe(null)
})

test('parsePlanYaml reads milestones and edges', async () => {
  const g = parsePlanYaml(PLAN, 'The title', 'docs/changes/x')
  expect(g.title).toBe('The title')
  expect(g.changeFolder).toBe('docs/changes/x')
  expect(g.milestones).toEqual([
    { number: 1, slug: 'mod-scaffold', goal: 'The plugin ships a loadable mod', dependsOn: [] },
    { number: 2, slug: 'plan-source', goal: 'Reads the plan: quoted goal', dependsOn: ['mod-scaffold'] },
    { number: 3, slug: 'graph-layout', goal: 'Lays out the graph', dependsOn: ['mod-scaffold', 'plan-source'] },
    { number: 4, slug: 'add-the-thing-wiring', goal: 'Add the Thing!  (wiring)', dependsOn: ['graph-layout', 'mod-scaffold'] },
  ])
})

test('parsePlanYaml rejects bad input', async () => {
  for (const bad of ['milestones: [unclosed', 'a: b: c', 'just a sentence', 'schemaVersion: 0.3.0\nmilestones: []\n', '']) {
    let message: string | null = null
    try {
      parsePlanYaml(bad, 't', 'docs/changes/x')
    } catch (err) {
      expect(err instanceof Error).toBe(true)
      message = (err as Error).message
    }
    expect(message === null ? `no throw for ${JSON.stringify(bad)}` : isOneLine(message)).toBe(true)
  }
})

test('parseSpecTitle', async () => {
  expect(parseSpecTitle(SPEC, 'docs/changes/2026-10-16-milestone-graph-pane')).toBe('Milestone graph pane for implement runs')
  expect(parseSpecTitle('---\ntitle: "Quoted: title"\n---\n', 'x')).toBe('Quoted: title')
  expect(parseSpecTitle('## Problem\n\ntitle: not frontmatter\n', 'docs/changes/2026-10-16-milestone-graph-pane/'))
    .toBe('2026-10-16-milestone-graph-pane')
})

/** A `$` holding only what loadPlan touches; files by absolute path. */
function stub(files: Record<string, string>, root = '/proj', dirs?: string[]): EngineInterface {
  return {
    fs: {
      read: async (path: string) => {
        const text = files[path]
        if (text === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'\n    at read`)
        return text
      },
      ...(dirs === undefined ? {} : {
        list: async () => dirs.map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })),
      }),
    },
    session: { root: async () => root },
  } as unknown as EngineInterface
}

test('loadPlan reports a missing entry', async () => {
  const noMap = await loadPlan(stub({}), SELF)
  expect(noMap.plan).toBe(null)
  expect(noMap.error).toBe("no implement run in .kentra-rpir/sessions.map under /proj or the dispatches' paths")

  const noEntry = await loadPlan(stub({ '/proj/.kentra-rpir/sessions.map': `${SELF} docs/changes/x spec\n` }), 'no-such-session')
  expect(noEntry.plan).toBe(null)
  expect(noEntry.error).toBe("no implement run in .kentra-rpir/sessions.map under /proj or the dispatches' paths")

  // A session not in the map (continued under a new id) reads the newest implement run.
  const continued = await loadPlan(stub({ '/proj/.kentra-rpir/sessions.map': SESSIONS_MAP }), 'no-such-session')
  expect(continued.error).toBe('cannot read docs/changes/2026-10-09-later/plan.yaml')

  const noPlan = await loadPlan(stub({ '/proj/.kentra-rpir/sessions.map': SESSIONS_MAP }), SELF)
  expect(noPlan.plan).toBe(null)
  expect(noPlan.error).toBe('cannot read docs/changes/2026-10-16-milestone-graph-pane/plan.yaml')
})

test('loadPlan reads the plan and the title through $.fs', async () => {
  const folder = 'docs/changes/2026-10-16-milestone-graph-pane'
  const ok = await loadPlan(stub({
    '/proj/.kentra-rpir/sessions.map': SESSIONS_MAP,
    [`/proj/${folder}/plan.yaml`]: PLAN,
    [`/proj/${folder}/spec.md`]: SPEC,
  }), SELF)
  expect(ok.error).toBe(null)
  expect(ok.plan?.title).toBe('Milestone graph pane for implement runs')
  expect(ok.plan?.changeFolder).toBe(folder)
  expect(ok.plan?.milestones.map(m => m.slug)).toEqual(['mod-scaffold', 'plan-source', 'graph-layout', 'add-the-thing-wiring'])

  const noSpec = await loadPlan(stub({
    '/proj/.kentra-rpir/sessions.map': SESSIONS_MAP,
    [`/proj/${folder}/plan.yaml`]: PLAN,
  }), SELF)
  expect(noSpec.plan?.title).toBe('2026-10-16-milestone-graph-pane')

  const badPlan = await loadPlan(stub({
    '/proj/.kentra-rpir/sessions.map': SESSIONS_MAP,
    [`/proj/${folder}/plan.yaml`]: 'a: b: c',
  }), SELF)
  expect(badPlan.plan).toBe(null)
  expect(typeof badPlan.error === 'string' && isOneLine(badPlan.error)).toBe(true)
})

test('newestImplementFolder takes the last implement line of any session', () => {
  expect(newestImplementFolder(SESSIONS_MAP)).toBe('docs/changes/2026-10-09-later')
  expect(newestImplementFolder('a docs/x spec\n')).toBe(null)
})

// The banank shape: the session started in a folder of repositories (not a
// project), and the orchestrator reached the project with a shell cd.
const NESTED = '/code/banank/schema-management-design'
const NESTED_FOLDER = 'docs/changes/2026-11-02-proto3-schema-libraries'
const NESTED_FILES = {
  [`${NESTED}/.kentra-rpir/sessions.map`]: `${SELF} ${NESTED_FOLDER} implement\n`,
  [`${NESTED}/${NESTED_FOLDER}/plan.yaml`]: PLAN,
}
const POINTER =
  'Your dispatch prompt from the kentra-rpir orchestrator is in this file:\n\n' +
  '/private/tmp/claude-501/x/scratchpad/prompts/m1-freeze-avro-java.impl.1.md\n\n' +
  `It is long. Your worktree is ${NESTED}/.worktrees/proto3-schema-libraries--m1-freeze-avro-java.`

test('candidateRoots: each hint path and its parents, then the root, then the children', () => {
  expect(candidateRoots('/code/banank', [`work in \`${NESTED}/.worktrees/w\`.`], ['a'])).toEqual([
    `${NESTED}/.worktrees/w`, `${NESTED}/.worktrees`, NESTED, '/code/banank', '/code/banank/a',
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
  const r = await loadPlan(stub(NESTED_FILES, '/code/banank'), SELF, [POINTER])
  expect(r.error).toBe(null)
  expect(r.plan?.changeFolder).toBe(NESTED_FOLDER)
  expect(r.plan?.milestones.length).toBe(4)
})

test("loadPlan finds a nested project among the root's subdirectories", async () => {
  const r = await loadPlan(stub(NESTED_FILES, '/code/banank', ['customer360', 'schema-management-design']), SELF)
  expect(r.error).toBe(null)
  expect(r.plan?.changeFolder).toBe(NESTED_FOLDER)
})

test("loadPlan prefers the project that registers this session over another's newest run", async () => {
  const r = await loadPlan(stub({
    ...NESTED_FILES,
    '/code/banank/other/.kentra-rpir/sessions.map': 'someone-else docs/changes/zzz implement\n',
  }, '/code/banank', ['other', 'schema-management-design']), SELF)
  expect(r.plan?.changeFolder).toBe(NESTED_FOLDER)
})

test("a stale map at the session root loses to the project the dispatches name", async () => {
  const r = await loadPlan(stub({
    ...NESTED_FILES,
    [`${NESTED}/.kentra-rpir/sessions.map`]: `older ${NESTED_FOLDER} implement\n`,
    '/code/banank/.kentra-rpir/sessions.map': 'ancient docs/changes/zzz implement\n',
  }, '/code/banank'), 'continued-session', [POINTER])
  expect(r.plan?.changeFolder).toBe(NESTED_FOLDER)
})
