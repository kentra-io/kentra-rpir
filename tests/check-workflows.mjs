// Parses and dry-runs every workflows/*.js against stubbed Workflow globals.
// Usage: node tests/check-workflows.mjs   (from the repo root)
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fixtures } from './workflow-fixtures.mjs'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
let failures = 0
const fail = (wf, msg) => { failures++; console.log(`FAIL - ${wf}: ${msg}`) }
const ok = (wf, msg) => console.log(`ok   - ${wf}: ${msg}`)

// A value that satisfies a JSON schema: required properties filled, enums take
// their first value, arrays empty.
export function fake(schema) {
  if (!schema) return 'stub result'
  if (schema.enum) return schema.enum[0]
  switch (schema.type) {
    case 'object': {
      const o = {}
      for (const k of schema.required || []) o[k] = fake(schema.properties?.[k])
      return o
    }
    case 'array': return []
    case 'string': return ''
    case 'boolean': return false
    case 'number': case 'integer': return 0
    default: return null
  }
}

// Mirrors the real tool: schema root must be {type: 'object', properties},
// required must be a subset of properties — an unsatisfiable schema throws
// at agent(), not later when the (missing) result is used.
function assertValidSchema(schema) {
  if (!schema) return
  if (schema.type !== 'object' || typeof schema.properties !== 'object' || schema.properties === null) {
    throw new Error('agent() schema must be {type: "object", properties: {...}} at its root')
  }
  for (const k of schema.required || []) {
    if (!(k in schema.properties)) throw new Error(`agent() schema: required key "${k}" is not in properties`)
  }
}

// Real Date()/Math.random() are non-deterministic and would break resume —
// the real tool throws on the no-arg forms; `new Date(x)` and Date statics
// (other than now) stay real, as does the rest of Math.
function makeFakeDate() {
  function FakeDate(...a) {
    if (a.length === 0) throw new Error('new Date() with no arguments is unavailable in workflow scripts (non-deterministic) — pass a timestamp via args')
    return new Date(...a)
  }
  FakeDate.prototype = Date.prototype
  for (const k of Object.getOwnPropertyNames(Date)) {
    if (['length', 'name', 'prototype', 'now'].includes(k)) continue
    FakeDate[k] = Date[k]
  }
  FakeDate.now = () => { throw new Error('Date.now() is unavailable in workflow scripts (non-deterministic) — pass a timestamp via args') }
  return FakeDate
}
function makeFakeMath() {
  const FakeMath = Object.create(Math)
  FakeMath.random = () => { throw new Error('Math.random() is unavailable in workflow scripts (non-deterministic)') }
  return FakeMath
}
const FAKE_DATE = makeFakeDate()
const FAKE_MATH = makeFakeMath()
const FAKE_BUDGET = { total: null, spent: () => 0, remaining: () => Infinity }

// meta must be a pure object literal: no identifiers, member access, calls,
// spreads or template interpolation reaching into outer scope.
function assertPureLiteral(metaSrc) {
  if (/`/.test(metaSrc)) throw new Error('meta must be a pure literal (no template literals)')
  const stripped = metaSrc.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""')
  if (/\.\.\./.test(stripped)) throw new Error('meta must be a pure literal (no spreads)')
  const call = stripped.match(/[A-Za-z_$][\w$]*\s*\(/)
  if (call) throw new Error(`meta must be a pure literal (found a call: ${call[0].trim()})`)
  for (const m of stripped.matchAll(/:\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*[,}\n]/g)) {
    const ref = m[1]
    if (['true', 'false', 'null', 'undefined'].includes(ref)) continue
    if (ref.includes('.')) throw new Error(`meta must be a pure literal (found member access: ${ref})`)
    throw new Error(`meta must be a pure literal (found an identifier reference: ${ref})`)
  }
}

function load(file) {
  const src = readFileSync(file, 'utf8')
  const m = src.match(/^export const meta = (\{[\s\S]*?\n\})\n/m)
  if (!m) throw new Error('no pure-literal `export const meta = {...}` block at column 0')
  assertPureLiteral(m[1])
  const meta = Function(`"use strict"; return (${m[1]})`)()
  if (!meta.description) throw new Error('meta.description is required')
  const body = src.replace(m[0], '')
  const run = new AsyncFunction(
    'args', 'agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow', 'budget',
    'Date', 'Math', 'process', 'require',
    body,
  )
  return { src, meta, run }
}

// Catches both `phase('X')` calls and the `phase: 'X'|"X"|`X`` agent() option,
// in any of the three quote styles.
function phaseTitlesUsed(src) {
  const titles = new Set()
  for (const m of src.matchAll(/\bphase\(\s*(['"`])((?:(?!\1)[\s\S])*?)\1\s*\)/g)) titles.add(m[2])
  for (const m of src.matchAll(/\bphase:\s*(['"`])((?:(?!\1)[\s\S])*?)\1/g)) titles.add(m[2])
  return titles
}

// parallel(): a thunk that throws — synchronously or by rejecting — resolves
// to null; the call itself never rejects (mirrors the real tool). Wrapping in
// Promise.resolve().then(t) turns a synchronous throw inside t() into a
// rejection too, so .catch() sees it instead of it escaping .map() raw.
const makeParallel = () => thunks => Promise.all(thunks.map(t => Promise.resolve().then(t).catch(() => null)))

// pipeline(): stage 1 gets (item, index); later stages get (prev, item, index).
// A stage that throws drops that item to null and skips its remaining stages.
const makePipeline = () => (items, ...stages) => Promise.all(items.map(async (item, index) => {
  let v
  try { v = await stages[0](item, index) } catch { return null }
  for (const s of stages.slice(1)) {
    try { v = await s(v, item, index) } catch { return null }
  }
  return v
}))

// Resolves the real tool's two workflow() reference forms: a registry name
// ("kentra-rpir:<name>" -> workflows/<name>.js) or {scriptPath}.
function resolveWorkflowFile(nameOrRef) {
  if (nameOrRef && typeof nameOrRef === 'object' && nameOrRef.scriptPath) return nameOrRef.scriptPath
  if (typeof nameOrRef === 'string') {
    const m = nameOrRef.match(/^kentra-rpir:(.+)$/)
    if (m) return join('workflows', `${m[1]}.js`)
  }
  throw new Error(`workflow(): cannot resolve workflow reference ${JSON.stringify(nameOrRef)}`)
}

// workflow(): actually runs the named child workflow script under the same
// stubbed globals (agent calls land in the same `calls.agents`, so overrides
// reach into the child too) and returns its real return value. Throws if
// invoked while another workflow() call from the same run is still in flight
// — nesting is one level only — by passing itself back down as the child's
// own `workflow` parameter.
function makeWorkflowStub(ctx) {
  const loadFn = ctx.loadFn || load
  let depth = 0
  const run = async (nameOrRef, a) => {
    if (depth > 0) throw new Error('workflow() cannot be called from inside another workflow() call (nesting is one level only)')
    const file = resolveWorkflowFile(nameOrRef)
    const child = loadFn(file)
    ctx.calls.workflows.push({ name: typeof nameOrRef === 'string' ? nameOrRef : nameOrRef.scriptPath, args: a })
    depth++
    try {
      return await child.run(
        structuredClone(a), ctx.agent, ctx.parallel, ctx.pipeline, ctx.log, ctx.phase, run,
        ctx.budget, FAKE_DATE, FAKE_MATH, undefined, undefined,
      )
    } finally {
      depth--
    }
  }
  return run
}

const UNGUARDED = /Cannot read propert|is not a function|is not iterable|Cannot convert undefined or null/

async function runCase(run, args, { overrides, allNull } = {}) {
  const calls = { agents: [], workflows: [] }
  const agent = async (prompt, opts = {}) => {
    calls.agents.push({ prompt, ...opts })
    assertValidSchema(opts.schema)
    if (allNull) return null
    const override = Object.entries(overrides || {}).find(([prefix]) => (opts.label || '').startsWith(prefix))
    return override ? structuredClone(override[1]) : fake(opts.schema)
  }
  const parallel = makeParallel()
  const pipeline = makePipeline()
  const log = () => {}
  const phase = () => {}
  const workflow = makeWorkflowStub({ calls, agent, parallel, pipeline, log, phase, budget: FAKE_BUDGET })
  const result = await run(
    structuredClone(args), agent, parallel, pipeline, log, phase, workflow,
    FAKE_BUDGET, FAKE_DATE, FAKE_MATH, undefined, undefined,
  )
  return { result, calls }
}

const dir = 'workflows'
for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const wf = basename(f, '.js')
  let loaded
  try { loaded = load(join(dir, f)) } catch (e) { fail(wf, `does not parse: ${e.message}`); continue }
  const { src, meta, run } = loaded
  if (meta.name !== wf) fail(wf, `meta.name is "${meta.name}", expected "${wf}"`)
  const titles = new Set((meta.phases || []).map(p => p.title))
  for (const t of phaseTitlesUsed(src)) {
    if (!titles.has(t)) fail(wf, `phase '${t}' is used but not declared in meta.phases`)
  }

  const fx = fixtures[wf]
  if (!fx) { fail(wf, 'no fixture in tests/workflow-fixtures.mjs'); continue }
  for (const [caseName, c] of Object.entries(fx)) {
    try {
      const { result, calls } = await runCase(run, c.args, { overrides: c.overrides })
      for (const [desc, assert] of Object.entries(c.expect || {})) {
        if (assert(result, calls)) ok(wf, `${caseName}: ${desc}`)
        else fail(wf, `${caseName}: ${desc}`)
      }
      if (!c.expect) ok(wf, `${caseName}: runs`)
    } catch (e) {
      if (c.throws && c.throws.test(e.message)) ok(wf, `${caseName}: throws as expected`)
      else fail(wf, `${caseName}: threw ${e.stack}`)
    }

    // Nulls mode: every agent() call resolves to null (the user skipped it, or
    // the subagent died). A null result must never read as a clean success,
    // and the script must not crash with a raw, unguarded null-access error
    // either. A case whose own `.args` already triggers a top-level throw
    // (c.throws) is skipped — it never reaches a real agent() call. Workflows
    // whose null handling is deliberately best-effort (not "clean success")
    // opt out per case with `nullsOk: true`.
    if (c.throws) continue
    try {
      await runCase(run, c.args, { allNull: true })
      if (c.nullsOk) ok(wf, `${caseName} [nulls]: completes (best-effort null handling)`)
      else fail(wf, `${caseName} [nulls]: a null agent() result must not read as a clean result, but the workflow completed without error`)
    } catch (e) {
      if (UNGUARDED.test(e.message)) fail(wf, `${caseName} [nulls]: unguarded null access: ${e.message}`)
      else ok(wf, `${caseName} [nulls]: throws a guarded error (${e.message})`)
    }
  }
}
// Unit tests for check-workflows.mjs's own stubs — no real workflows/*.js
// file is meant to exercise these (nesting is designed to be impossible, and
// no meta in this repo uses member access), so they run directly.

// parallel() mirrors the real tool: a thunk that throws SYNCHRONOUSLY (not
// just one that returns a rejected promise) must still yield null in that
// slot, not escape as an uncaught/unhandled throw out of parallel() itself.
try {
  const result = await makeParallel()([() => { throw new Error('boom') }, async () => 'ok'])
  if (result[0] === null && result[1] === 'ok') ok('parallel-sync-throw-guard', 'a synchronously-throwing thunk yields null, not an escaped exception')
  else fail('parallel-sync-throw-guard', `unexpected result: ${JSON.stringify(result)}`)
} catch (e) {
  fail('parallel-sync-throw-guard', `parallel() itself threw: ${e.message}`)
}

// meta pure-literal check also rejects member access, not just bare identifiers.
try {
  assertPureLiteral("{\n  name: 'x',\n  description: process.title,\n}")
  fail('meta-pure-literal-guard', 'expected member access (process.title) to be rejected')
} catch (e) {
  if (/member access/.test(e.message)) ok('meta-pure-literal-guard', 'rejects member access (process.title)')
  else fail('meta-pure-literal-guard', `threw the wrong error: ${e.message}`)
}

// workflow() throws if the child it runs itself calls workflow() — nesting
// is one level only. Stub loadFn in place of a real on-disk child.
try {
  const calls = { agents: [], workflows: [] }
  const fakeChild = {
    run: new AsyncFunction(
      'args', 'agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow', 'budget',
      'Date', 'Math', 'process', 'require',
      'return await workflow("kentra-rpir:research", {})',
    ),
  }
  const workflow = makeWorkflowStub({
    calls, agent: async () => null, parallel: makeParallel(), pipeline: makePipeline(),
    log: () => {}, phase: () => {}, budget: FAKE_BUDGET, loadFn: () => fakeChild,
  })
  await workflow('kentra-rpir:fake-child', {})
  fail('workflow-nesting-guard', 'expected a child calling workflow() to throw')
} catch (e) {
  if (/nesting is one level only/.test(e.message)) ok('workflow-nesting-guard', 'throws when a child calls workflow()')
  else fail('workflow-nesting-guard', `threw the wrong error: ${e.message}`)
}

if (failures) { console.log(`${failures} workflow check(s) failed`); process.exit(1) }
console.log('all workflow checks passed')
