import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'improvements.mjs');
const NOW = '2026-06-01T00:00:00.000Z';

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'impr-'));
  const env = { ...process.env, XDG_DATA_HOME: path.join(root, 'data'), XDG_CONFIG_HOME: path.join(root, 'config') };
  const project = path.join(root, 'proj');
  fs.mkdirSync(project);
  const run = (args, input, now = NOW) => spawnSync('node', [script, ...args, '--project', project, '--now', now], { env, input, encoding: 'utf8' });
  const ok = (args, input, now) => {
    const r = run(args, input, now);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const record = (elements, now) => JSON.parse(ok(['record', '--scope', 'project'], JSON.stringify(elements), now));
  const list = (now) => JSON.parse(ok(['list', '--scope', 'project'], undefined, now));
  return { root, env, project, run, ok, record, list };
}

const occ = (o = {}) => ({
  project: 'p', change: 'c1', findingId: 'F1', findingRef: 'x/spec-retro.md', date: '2026-06-01',
  pluginVersion: '0.9.0', count: 1, wallMinutes: 0, tokens: 0, userInterventions: 0, severity: 'low', ...o,
});
const fresh = (o = {}) => occ({ title: 'Class A', problem: 'p', fix: 'f', complexity: 'M', ...o });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('score', () => {
  const s = sandbox();
  s.record([
    fresh({ findingId: 'F1', count: 2, wallMinutes: 60, userInterventions: 1, severity: 'medium' }),
    fresh({ findingId: 'F2', date: '2026-04-02', count: 3, wallMinutes: 30, severity: 'high' }),
  ]);
  // 2*(1+2+2+2)=14 at age 0; 3*(1+1+0+6)=24, halved once at 60 days
  const [c] = s.list();
  near(c.impact, 14 + 12);
  near(c.priority, 26 / 3);
});

test('regressed', () => {
  const s = sandbox();
  s.record([fresh({ count: 3 })]);
  s.ok(['ship', '--scope', 'project', '--id', 'class-a', '--version', '0.9.0']);
  let [c] = s.list();
  assert.equal(c.regressed, false);
  assert.equal(c.status, 'shipped');
  near(c.priority, 1);
  s.record([{ ...occ({ change: 'c2', pluginVersion: '0.10.0' }), id: 'class-a' }]);
  [c] = s.list();
  assert.equal(c.regressed, true);
  assert.equal(c.status, 'regressed');
  near(c.priority, 2 * 4 / 3);
});

test('re-proposal', () => {
  const s = sandbox();
  const D = '2026-01-01T00:00:00.000Z';
  s.record([fresh({ date: '2026-01-01', count: 12 })], D);
  const decide = (reason) => s.ok(['decide', '--scope', 'project', '--id', 'class-a', '--verdict', 'reject', '--reason', reason], undefined, D);
  decide('first reason');
  decide('second reason');
  const T = '2026-01-02T00:00:00.000Z';
  const add = (change, count, severity = 'low') =>
    s.record([{ ...occ({ change, date: '2026-01-02', count, severity }), id: 'class-a' }], T);
  const eligible = () => s.list(T)[0].eligible;
  assert.equal(eligible(), false);
  add('c2', 5);
  assert.equal(eligible(), false); // 5 < 6
  add('c3', 1);
  assert.equal(eligible(), true); // 6 == 6
  add('c4', 1);
  assert.equal(eligible(), true); // 7 > 6
  assert.deepEqual(s.list(T)[0].rejections.map((r) => r.reason), ['first reason', 'second reason']);

  const h = sandbox();
  h.record([fresh({ date: '2026-01-01', count: 100 })], D);
  h.ok(['decide', '--scope', 'project', '--id', 'class-a', '--verdict', 'reject', '--reason', 'r'], undefined, D);
  h.record([{ ...occ({ change: 'c2', date: '2026-01-02', count: 1 }), id: 'class-a' }], T);
  assert.equal(h.list(T)[0].eligible, false);
  h.record([{ ...occ({ change: 'c3', date: '2026-01-02', count: 1, severity: 'high' }), id: 'class-a' }], T);
  assert.equal(h.list(T)[0].eligible, true);
});

test('record key', () => {
  const s = sandbox();
  s.record([fresh()]);
  s.record([{ ...occ({ findingRef: 'other.md' }), id: 'class-a' }]);
  assert.equal(s.list()[0].occurrenceCount, 1);
  s.record([{ ...occ({ project: 'q', findingRef: 'other.md' }), id: 'class-a' }]);
  assert.equal(s.list()[0].occurrenceCount, 2);
});

test('re-run replaces', () => {
  const s = sandbox();
  s.record([fresh({ findingId: 'F1' }), fresh({ findingId: 'F2', title: 'Class B' })]);
  assert.deepEqual(s.list().map((c) => c.occurrenceCount), [1, 1]);
  s.record([{ ...occ({ findingId: 'F1' }), id: 'class-a' }]);
  const byId = Object.fromEntries(s.list().map((c) => [c.id, c.occurrenceCount]));
  assert.deepEqual(byId, { 'class-a': 1, 'class-b': 0 });
});

test('re-run with no findings clears the earlier record', () => {
  const s = sandbox();
  s.record([fresh({ findingId: 'F1' }), fresh({ findingId: 'F2', title: 'Class B' })]);
  assert.equal(s.run(['record', '--scope', 'project'], '[]').status, 2);
  const out = JSON.parse(s.ok(['record', '--scope', 'project', '--project-id', 'p', '--change', 'c1'], '[]'));
  assert.equal(out.recorded, 0);
  assert.deepEqual(s.list().map((c) => c.occurrenceCount), [0, 0]);
});

test('old change re-recorded', () => {
  const s = sandbox();
  const old = () => fresh({ date: '2026-01-01', pluginVersion: '0.5.0', count: 4 });
  s.record([old()], '2026-01-01T00:00:00.000Z');
  s.ok(['ship', '--scope', 'project', '--id', 'class-a', '--version', '0.6.0'], undefined, '2026-02-01T00:00:00.000Z');
  s.ok(['decide', '--scope', 'project', '--id', 'class-a', '--verdict', 'reject', '--reason', 'no'], undefined, '2026-03-01T00:00:00.000Z');
  s.record([{ ...old(), id: 'class-a' }], '2026-04-01T00:00:00.000Z');
  const [c] = s.list('2026-04-01T00:00:00.000Z');
  assert.equal(c.regressed, false);
  assert.equal(c.status, 'shipped');
  assert.deepEqual(c.sinceLastRejection, []);
});

test('record validation', () => {
  const s = sandbox();
  const bad = (elements) => {
    const r = s.run(['record', '--scope', 'project'], JSON.stringify(elements));
    assert.equal(r.status, 2);
  };
  bad([fresh({ severity: 'huge' })]);
  bad([fresh({ change: 'a' }), fresh({ change: 'b', findingId: 'F2' })]);
  bad([fresh({ pluginVersion: '0.9' })]);
  bad([fresh({ count: -1 })]);
  bad([{ ...occ(), id: 'nope' }]);
  assert.equal(fs.existsSync(path.join(s.project, 'rpir')), false);
});

test('user config reader', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  process.env.XDG_CONFIG_HOME = dir;
  const { readUserConfig } = await import(script);
  assert.deepEqual(readUserConfig(), {});
  fs.mkdirSync(path.join(dir, 'kentra-rpir'));
  fs.writeFileSync(path.join(dir, 'kentra-rpir', 'config.yaml'), [
    '# header', 'plugin:', '  record: true', '  nudge: false # off', '  source: "/src/my plugin"',
    'nudge:', '  days: 3', "  minFindings: '5'", 'audit: look at it', '',
  ].join('\n'));
  assert.deepEqual(readUserConfig(), {
    'plugin.record': true, 'plugin.nudge': false, 'plugin.source': '/src/my plugin',
    'nudge.days': 3, 'nudge.minFindings': '5', audit: 'look at it',
  });
});

test('nudge', () => {
  const s = sandbox();
  assert.equal(s.ok(['nudge']), '');
  s.record(Array.from({ length: 5 }, (_, i) => fresh({ findingId: `F${i}` })));
  assert.match(s.ok(['nudge']), /^kentra-rpir: 5 improvement findings recorded in this project/);
  assert.equal(s.ok(['nudge']), '');
});

test('decide --verdict none resets the nudge without touching classes', () => {
  const s = sandbox();
  s.record(Array.from({ length: 5 }, (_, i) => fresh({ findingId: `F${i}` })));
  const later = '2026-06-02T00:00:00.000Z';
  s.ok(['decide', '--scope', 'project', '--verdict', 'none'], undefined, later);
  const dir = path.join(s.project, 'rpir', 'improvements');
  const files = fs.readdirSync(dir).filter((f) => f !== 'state.json');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).lastImproveRun, later);
  for (const f of files) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).decisions, []);
  assert.equal(s.ok(['nudge'], undefined, '2026-06-10T00:00:00.000Z'), '');
  const e = sandbox();
  e.ok(['decide', '--scope', 'project', '--verdict', 'none']);
  assert.ok(fs.existsSync(path.join(e.project, 'rpir', 'improvements', 'state.json')));
});

test('entry guard', () => {
  const s = sandbox();
  const link = path.join(s.root, 'link');
  fs.mkdirSync(link);
  fs.symlinkSync(path.dirname(script), path.join(link, 'scripts'));
  const viaLink = spawnSync('node', [path.join(link, 'scripts', 'improvements.mjs'), 'list', '--scope', 'project', '--project', s.project], { env: s.env, encoding: 'utf8' });
  assert.equal(viaLink.status, 0, viaLink.stderr);
  assert.deepEqual(JSON.parse(viaLink.stdout), []);
  const imported = spawnSync('node', ['--input-type=module', '-e', `import { readUserConfig } from ${JSON.stringify(script)}; console.log(typeof readUserConfig)`], { env: s.env, encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, 'function\n');
});

test('import', () => {
  const s = sandbox();
  const fx = path.join(path.dirname(script), '..', 'tests', 'fixtures', 'retros');
  const files = [
    ['2026-10-12-change-a', path.join(fx, '2026-10-12-change-a', 'spec-retro.md')],
    ['2026-10-16-change-b', path.join(fx, '2026-10-16-change-b', 'spec-retro.md')],
    ['2026-11-09-change-c', path.join(fx, '2026-11-09-change-c', 'spec-retro.md')],
    ['retro-backlog', path.join(fx, 'retro-backlog.md')],
  ];
  const dirs = { plugin: path.join(s.env.XDG_DATA_HOME, 'kentra-rpir', 'improvements'), project: path.join(s.project, 'rpir', 'improvements') };
  const snapshot = () => Object.fromEntries(Object.entries(dirs).map(([k, d]) => [k, fs.existsSync(d) ? fs.readdirSync(d).sort().map((f) => [f, fs.readFileSync(path.join(d, f), 'utf8')]) : []]));
  const occurrences = (scope, change) => (fs.existsSync(dirs[scope]) ? fs.readdirSync(dirs[scope]) : []).filter((f) => f !== 'state.json')
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dirs[scope], f), 'utf8')).occurrences).filter((o) => o.change === change);
  const imp = (file) => JSON.parse(s.ok(['import', '--file', file, '--project-id', 'p']));

  const scopes = {};
  for (const [change, file] of files) {
    const text = fs.readFileSync(file, 'utf8');
    const expected = change === 'retro-backlog'
      ? text.split('\n').filter((l) => l.startsWith('- **')).length
      : text.split('## Findings')[1].split('## Actions')[0].split('\n').filter((l) => l.startsWith('|')).length - 2;
    const out = imp(file);
    assert.equal(out.change, change);
    assert.equal(out.plugin.recorded + out.project.recorded, expected);
    assert.equal(occurrences('plugin', change).length, out.plugin.recorded);
    assert.equal(occurrences('project', change).length, out.project.recorded);
    scopes[change] = { plugin: out.plugin.recorded, project: out.project.recorded };
  }
  assert.ok(scopes['2026-10-12-change-a'].plugin > 0 && scopes['2026-10-12-change-a'].project > 0);
  assert.ok(scopes['2026-10-16-change-b'].plugin > 0 && scopes['2026-10-16-change-b'].project > 0);
  assert.equal(scopes['retro-backlog'].project, 0);
  const idOf = (scope, change, findingId) => occurrences(scope, change).find((o) => o.findingId === findingId);
  assert.equal(idOf('plugin', '2026-10-12-change-a', 'F1').pluginVersion, '0.3.1');
  assert.ok(idOf('project', '2026-10-12-change-a', 'F3'));
  assert.equal(idOf('plugin', 'retro-backlog', 'F12/F13').severity, 'high');

  const titles = Object.values(dirs).flatMap((d) => fs.readdirSync(d).filter((n) => n !== 'state.json').map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).title));
  assert.ok(titles.some((t) => t.includes('F6: Reqs. 13 and 14 of the spec')));

  const tagOnly = /:\s*((M\d+|Planning)(\s*,\s*(M\d+|Planning))*|What( happened| \([^)]*\))?:?)\.?\s*$/i;
  for (const d of Object.values(dirs)) {
    for (const f of fs.readdirSync(d).filter((n) => n !== 'state.json')) {
      const { title } = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      assert.doesNotMatch(title, tagOnly);
    }
  }


  const before = snapshot();
  for (const [, file] of files) imp(file);
  assert.deepEqual(snapshot(), before);

  const r = s.run(['import', '--file', files[0][1]], undefined);
  assert.equal(r.status, 2);
});
