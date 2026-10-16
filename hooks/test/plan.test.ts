import { test, expect } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import { findChangeFolder, parseSpecTitle, parsePlanYaml, loadPlan } from '../plan'

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
function stub(files: Record<string, string>): EngineInterface {
  return {
    fs: {
      read: async (path: string) => {
        const text = files[path]
        if (text === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'\n    at read`)
        return text
      },
    },
    session: { root: async () => '/proj' },
  } as unknown as EngineInterface
}

test('loadPlan reports a missing entry', async () => {
  const noMap = await loadPlan(stub({}), SELF)
  expect(noMap.plan).toBe(null)
  expect(noMap.error).toBe('cannot read .kentra-rpir/sessions.map')

  const noEntry = await loadPlan(stub({ '/proj/.kentra-rpir/sessions.map': SESSIONS_MAP }), 'no-such-session')
  expect(noEntry.plan).toBe(null)
  expect(noEntry.error).toBe('no implement entry for this session in .kentra-rpir/sessions.map')

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
