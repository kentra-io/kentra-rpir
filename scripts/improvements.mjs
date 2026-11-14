#!/usr/bin/env node
// Writer of the finding-class registries: record, list, decide, ship, import, nudge.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEVERITY_WEIGHT = { low: 0, medium: 2, high: 6 };
const COMPLEXITY_WEIGHT = { S: 1, M: 3, L: 8 };
const HALF_LIFE_DAYS = 60;
const WALL_MINUTES_DIVISOR = 30;
const REGRESSED_MULTIPLIER = 2;
const REPROPOSAL_FRACTION = 0.5;
const NUDGE_DEFAULTS = { days: 3, minFindings: 5 };
const DAY_MS = 86400000;

class UsageError extends Error {}
const fail = (msg) => { throw new UsageError(msg); };

export function readUserConfig() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  let text;
  try { text = fs.readFileSync(path.join(base, 'kentra-rpir', 'config.yaml'), 'utf8'); } catch { return {}; }
  const out = {};
  let section = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/(^|\s)#.*$/, '').trimEnd();
    const m = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!m) continue;
    const [, indent, key, rawVal] = m;
    let val = rawVal.trim().replace(/^(["'])(.*)\1$/, '$2');
    if (!indent && rawVal.trim() === '') { section = key; continue; }
    if (!indent) section = null;
    const name = indent && section ? `${section}.${key}` : key;
    out[name] = val === 'true' ? true : val === 'false' ? false : val !== '' && !isNaN(Number(val)) && !/^["']/.test(rawVal.trim()) ? Number(val) : val;
  }
  return out;
}

// shortcut: prerelease suffixes are ignored, upgrade if prerelease ordering matters.
const semver = (v) => v.split('-')[0].split('.').map(Number);
function semverCmp(a, b) {
  const x = semver(a), y = semver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) fail(`unexpected argument ${argv[i]}`);
    if (argv[i + 1] === undefined) fail(`${argv[i]} needs a value`);
    opts[argv[i].slice(2)] = argv[++i];
  }
  return opts;
}

function registryDir(scope, project) {
  if (scope === 'plugin') {
    return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'kentra-rpir', 'improvements');
  }
  if (scope === 'project') return path.join(path.resolve(project), 'rpir', 'improvements');
  return fail('--scope must be plugin or project');
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

function loadClasses(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'state.json').sort()
    .map((f) => readJson(path.join(dir, f)));
}

const loadState = (dir) => readJson(path.join(dir, 'state.json'), {});
const saveState = (dir, patch) => writeAtomic(path.join(dir, 'state.json'), { ...loadState(dir), ...patch });

function weight(o, now) {
  const ageDays = Math.max(0, (now - Date.parse(o.date)) / DAY_MS);
  return o.count * (1 + o.wallMinutes / WALL_MINUTES_DIVISOR + 2 * o.userInterventions + SEVERITY_WEIGHT[o.severity])
    * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}
const impactOf = (occs, now) => occs.reduce((s, o) => s + weight(o, now), 0);

function isRegressed(c) {
  if (!c.shipped.length) return false;
  const newest = c.shipped.map((s) => s.version).reduce((a, b) => (semverCmp(a, b) >= 0 ? a : b));
  return c.occurrences.some((o) => semverCmp(o.pluginVersion, newest) > 0);
}

function refreshStatus(c) {
  if (c.shipped.length) c.status = isRegressed(c) ? 'regressed' : 'shipped';
}

function parseNow(opts) {
  if (opts.now === undefined) return new Date();
  const d = new Date(opts.now);
  if (isNaN(d)) fail('--now must be an ISO date');
  return d;
}

function slug(title) {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || fail('title yields an empty id');
}

const OCC_FIELDS = ['project', 'change', 'findingId', 'findingRef', 'date', 'pluginVersion', 'count', 'wallMinutes', 'tokens', 'userInterventions', 'severity'];
const NUM_FIELDS = ['count', 'wallMinutes', 'tokens', 'userInterventions'];

function validateElement(e, i) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) fail(`element ${i} is not an object`);
  for (const f of OCC_FIELDS) if (e[f] === undefined || e[f] === null || e[f] === '') fail(`element ${i}: missing ${f}`);
  for (const f of ['project', 'change', 'findingId', 'findingRef', 'date', 'pluginVersion', 'severity']) {
    if (typeof e[f] !== 'string') fail(`element ${i}: ${f} must be a string`);
  }
  if (isNaN(Date.parse(e.date))) fail(`element ${i}: date is not a date`);
  if (!(e.severity in SEVERITY_WEIGHT)) fail(`element ${i}: severity must be low, medium or high`);
  if (!/^\d+\.\d+\.\d+$/.test(e.pluginVersion)) fail(`element ${i}: pluginVersion must be x.y.z`);
  for (const f of NUM_FIELDS) if (typeof e[f] !== 'number' || !(e[f] >= 0)) fail(`element ${i}: ${f} must be a non-negative number`);
  if (e.id === undefined) {
    for (const f of ['title', 'problem', 'fix', 'complexity']) if (typeof e[f] !== 'string' || !e[f]) fail(`element ${i}: new class needs ${f}`);
    if (!(e.complexity in COMPLEXITY_WEIGHT)) fail(`element ${i}: complexity must be S, M or L`);
  }
}

function recordChange(scope, dir, project, change, input, now) {
  const byFinding = new Map();
  for (const e of input) byFinding.set(e.findingId, e);
  const elements = [...byFinding.values()];

  const classes = new Map(loadClasses(dir).map((c) => [c.id, c]));
  const touched = new Set();
  const newByTitle = new Map();
  const placed = [];
  for (const e of elements) {
    let cls;
    if (e.id !== undefined) {
      cls = classes.get(e.id) ?? fail(`unknown class id ${e.id}`);
    } else if (newByTitle.has(e.title)) {
      cls = newByTitle.get(e.title);
    } else {
      const base = slug(e.title);
      let id = base;
      for (let n = 2; classes.has(id); n++) id = `${base}-${n}`;
      cls = { id, title: e.title, problem: e.problem, fix: e.fix, complexity: e.complexity, scope, status: 'open', shipped: [], occurrences: [], decisions: [] };
      classes.set(id, cls);
      newByTitle.set(e.title, cls);
    }
    placed.push([cls, e]);
  }

  for (const c of classes.values()) {
    const kept = c.occurrences.filter((o) => !(o.project === project && o.change === change));
    if (kept.length !== c.occurrences.length) { c.occurrences = kept; touched.add(c); }
  }
  const recordedAt = now.toISOString();
  for (const [cls, e] of placed) {
    const occ = {};
    for (const f of OCC_FIELDS) occ[f] = e[f];
    cls.occurrences.push({ ...occ, recordedAt });
    touched.add(cls);
  }
  touched.forEach(refreshStatus);
  touched.forEach((c) => writeAtomic(path.join(dir, `${c.id}.json`), c));
  const placedClasses = [...new Set(placed.map(([c]) => c))];
  return {
    scope,
    recorded: placed.length,
    classes: placedClasses.map((c) => c.id),
    regressed: placedClasses.filter((c) => c.status === 'regressed').map((c) => c.id),
  };
}

function record(opts) {
  const dir = registryDir(opts.scope, opts.project ?? process.cwd());
  let input;
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { fail('stdin is not valid JSON'); }
  if ((opts['project-id'] === undefined) !== (opts.change === undefined)) fail('--project-id and --change go together');
  const keyed = opts.change !== undefined;
  if (!Array.isArray(input) || !(input.length || keyed)) fail('stdin must be a non-empty JSON array');
  input.forEach(validateElement);
  const project = keyed ? opts['project-id'] : input[0].project;
  const change = keyed ? opts.change : input[0].change;
  if (input.some((e) => e.project !== project || e.change !== change)) fail('all elements need the same project and change');
  console.log(JSON.stringify(recordChange(opts.scope, dir, project, change, input, parseNow(opts))));
}

const unescapePipe = (s) => s.replace(/\\\|/g, '|');
const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => unescapePipe(c.trim()));
const plain = (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
const normId = (s) => s.replace(/^F/i, '').toLowerCase();

function summarize(text) {
  const tag = '(?:M\\d+|Planning)';
  const body = plain(text).replace(new RegExp(`^${tag}(?:\\s*,\\s*${tag})*\\.\\s+`, 'i'), '').replace(/^What( happened| \([^)]*\))?:\s*/, '');
  const first = body.split(/(?<=[!?]|(?<!\b(?:Reqs?|e\.g|i\.e|vs|cf|No|§))\.)\s/)[0];
  if (first.length <= 80) return first;
  const cut = first.slice(0, 80);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim();
}

function tableUnder(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return null;
  const rows = [];
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith('## ')) break;
    if (l.trim().startsWith('|')) rows.push(splitRow(l));
    else if (rows.length) break;
  }
  if (rows.length < 2) return null;
  const head = rows[0].map((h) => h.toLowerCase());
  return rows.slice(2).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function severityOf(text) {
  const s = text.toLowerCase().trim();
  return s in SEVERITY_WEIGHT ? s : 'medium';
}

function parseRetro(file, text) {
  const dir = path.dirname(file);
  const change = path.basename(dir);
  const date = change.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? fail(`${change}: no YYYY-MM-DD prefix in the change name`);
  const pluginVersion = text.match(/^- \*\*Versions:\*\*.*?kentra-rpir (\d+\.\d+\.\d+)/m)?.[1] ?? fail(`${file}: no kentra-rpir version in the Versions line`);
  const lines = text.split('\n');
  const findings = tableUnder(lines, '## Findings') ?? fail(`${file}: no findings table`);
  const actions = tableUnder(lines, '## Actions') ?? [];
  const findingRef = path.resolve(file);
  const items = findings.map((f) => {
    const mine = actions.filter((a) => a.finding.split(/[\s,;/&]+/).some((t) => t && normId(t) === normId(f.id)));
    const row = mine.find((a) => a.target.includes('kentra-rpir')) ?? mine[0];
    const cls = f.class.toUpperCase();
    const scope = mine.length ? (mine.some((a) => a.target.includes('kentra-rpir')) ? 'plugin' : 'project') : (/SKILL|PROCESS/.test(cls) ? 'plugin' : 'project');
    const made = f['how it made sense at the time'] ?? '';
    const problem = f.finding || made;
    return {
      scope, change, date, pluginVersion, findingId: f.id, findingRef,
      title: `${change} ${f.id}: ${f.finding ? summarize(f.finding) : summarize(made)}`,
      problem, fix: row ? `${row.action}: ${row.detail}` : 'none proposed', severity: severityOf(f.severity ?? ''),
    };
  });
  return { change, items };
}

function parseBacklog(file, text) {
  const change = 'retro-backlog';
  const findingRef = path.resolve(file);
  const lines = text.split('\n');
  const dateOf = (l) => l.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const versionOf = (l) => l.match(/kentra-rpir (\d+\.\d+\.\d+)/)?.[1];
  const pre = lines.slice(0, lines.findIndex((l) => l.startsWith('## ')));
  const defDate = dateOf(pre.find((l) => l.startsWith('Source:')) ?? '') ?? fail('backlog: no date in the Source line');
  const defVersion = versionOf(pre.join(' ')) ?? fail('backlog: no kentra-rpir version in the preamble');
  let date = defDate, pluginVersion = defVersion;
  const bullets = [];
  for (const l of lines) {
    if (l.startsWith('## ')) { date = defDate; pluginVersion = versionOf(l) ?? defVersion; } else if (l.startsWith('Source:')) date = dateOf(l) ?? date;
    if (l.startsWith('- ')) bullets.push({ text: l.slice(2), date, pluginVersion });
    else if (/^\s+\S/.test(l) && bullets.length) bullets[bullets.length - 1].text += ` ${l.trim()}`;
  }
  const items = bullets.map((b) => {
    const m = b.text.match(/^\*\*(.+?)\*\*\s*(.*)$/s) ?? fail(`backlog bullet has no bold label: ${b.text.slice(0, 40)}`);
    const label = m[1];
    const lm = label.match(/^([FR]\d+(?:[–/-][FR]?\d+)?)(?:\s*—\s*|\s*:\s*|,\s*)(.*)$/);
    const title = plain(lm ? lm[2] : label).replace(/[.:]+$/, '');
    const findingId = lm ? lm[1] : slug(title);
    const paren = label.match(/\(([^)]*)\)/)?.[1] ?? '';
    const [problem, fix] = m[2].split(/\s*Proposed:\s*/);
    return {
      scope: 'plugin', change, date: b.date, pluginVersion: b.pluginVersion, findingId, findingRef,
      title: `${change} ${findingId}: ${title}`,
      problem: problem ? plain(problem) : title, fix: fix ? plain(fix) : 'none proposed',
      severity: severityOf(paren.match(/\b(high|medium|low)\b/i)?.[1] ?? ''),
    };
  });
  return { change, items };
}

function importFile(opts) {
  if (!opts.file) fail('--file is required');
  let text;
  try { text = fs.readFileSync(opts.file, 'utf8'); } catch { fail(`cannot read ${opts.file}`); }
  const parsed = path.basename(opts.file) === 'retro-backlog.md' ? parseBacklog(opts.file, text) : parseRetro(opts.file, text);
  const project = opts.project ?? process.cwd();
  const now = parseNow(opts);
  const out = { file: path.resolve(opts.file), change: parsed.change };
  const seen = new Set();
  const all = parsed.items.map((it) => {
    let findingId = it.findingId;
    for (let n = 2; seen.has(findingId); n++) findingId = `${it.findingId}-${n}`;
    seen.add(findingId);
    return { ...it, findingId, project: opts['project-id'], count: 1, wallMinutes: 0, tokens: 0, userInterventions: 0, complexity: 'M' };
  });
  for (const scope of ['plugin', 'project']) {
    const dir = registryDir(scope, project);
    const known = new Set(loadClasses(dir).map((c) => c.id));
    const elements = all.filter((e) => e.scope === scope).map(({ scope: _s, ...e }) => {
      if (known.has(slug(e.title))) return { id: slug(e.title), ...Object.fromEntries(OCC_FIELDS.map((f) => [f, e[f]])) };
      return e;
    });
    elements.forEach(validateElement);
    const r = recordChange(scope, dir, opts['project-id'], parsed.change, elements, now);
    out[scope] = { recorded: r.recorded, classes: r.classes };
  }
  console.log(JSON.stringify(out));
}

const r1 = (n) => n.toFixed(1);

function describe(c, now) {
  const impact = impactOf(c.occurrences, now);
  const regressed = isRegressed(c);
  const rejections = c.decisions.filter((d) => d.verdict === 'reject');
  const last = rejections[rejections.length - 1];
  const since = last ? c.occurrences.filter((o) => o.date > last.date) : [];
  let eligible = true;
  let reason = 'never rejected';
  if (last) {
    const sinceImpact = impactOf(since, now);
    const needed = REPROPOSAL_FRACTION * last.impact;
    const n = rejections.length;
    if (since.some((o) => o.severity === 'high')) reason = 'high-severity occurrence since last rejection';
    else if (sinceImpact >= needed) reason = `rejected ${n} time${n > 1 ? 's' : ''}; impact since last rejection ${r1(sinceImpact)} >= ${r1(needed)} needed`;
    else { eligible = false; reason = `rejected ${n} time${n > 1 ? 's' : ''}; impact since last rejection ${r1(sinceImpact)} < ${r1(needed)} needed`; }
  }
  if (c.status === 'accepted' || c.status === 'shipped') { eligible = false; reason = `status is ${c.status}`; }
  const totals = { count: 0, wallMinutes: 0, tokens: 0, userInterventions: 0 };
  for (const o of c.occurrences) for (const k of Object.keys(totals)) totals[k] += o[k];
  return {
    id: c.id, title: c.title, problem: c.problem, fix: c.fix, complexity: c.complexity, status: c.status, regressed,
    impact, priority: (impact / COMPLEXITY_WEIGHT[c.complexity]) * (regressed ? REGRESSED_MULTIPLIER : 1),
    eligible, reason, occurrenceCount: c.occurrences.length, totals,
    rejections: rejections.map(({ date, reason: r, impact: i }) => ({ date, reason: r, impact: i })),
    sinceLastRejection: since, shipped: c.shipped,
  };
}

function list(opts) {
  const dir = registryDir(opts.scope, opts.project ?? process.cwd());
  const now = parseNow(opts);
  const rows = loadClasses(dir).map((c) => describe(c, now)).sort((a, b) => b.priority - a.priority);
  console.log(JSON.stringify(rows, null, 2));
}

function loadClass(opts) {
  const dir = registryDir(opts.scope, opts.project ?? process.cwd());
  if (!opts.id || !/^[a-z0-9-]+$/.test(opts.id)) fail('--id is required');
  const file = path.join(dir, `${opts.id}.json`);
  if (!fs.existsSync(file)) fail(`unknown class id ${opts.id}`);
  return { dir, file, cls: readJson(file) };
}

function decide(opts) {
  const now = parseNow(opts);
  if (opts.verdict === 'none') return saveState(registryDir(opts.scope, opts.project ?? process.cwd()), { lastImproveRun: now.toISOString() });
  if (!['accept', 'reject', 'defer'].includes(opts.verdict)) fail('--verdict must be accept, reject, defer or none');
  if (opts.verdict === 'reject' && !opts.reason) fail('--reason is required for reject');
  const { dir, file, cls } = loadClass(opts);
  cls.decisions.push({ date: now.toISOString(), verdict: opts.verdict, reason: opts.reason ?? '', impact: impactOf(cls.occurrences, now) });
  if (opts.verdict === 'accept') cls.status = 'accepted';
  writeAtomic(file, cls);
  saveState(dir, { lastImproveRun: now.toISOString() });
}

function ship(opts) {
  const now = parseNow(opts);
  if (!/^\d+\.\d+\.\d+$/.test(opts.version ?? '')) fail('--version must be x.y.z');
  const { file, cls } = loadClass(opts);
  cls.shipped.push({ version: opts.version, date: now.toISOString() });
  refreshStatus(cls);
  writeAtomic(file, cls);
}

function nudge(opts) {
  const now = parseNow(opts);
  const cfg = readUserConfig();
  const days = cfg['nudge.days'] ?? NUDGE_DEFAULTS.days;
  const minFindings = cfg['nudge.minFindings'] ?? NUDGE_DEFAULTS.minFindings;
  const scopes = cfg['plugin.nudge'] === true ? ['project', 'plugin'] : ['project'];
  for (const scope of scopes) {
    const dir = registryDir(scope, opts.project ?? process.cwd());
    if (!fs.existsSync(dir)) continue;
    const state = loadState(dir);
    const since = state.lastImproveRun ? Date.parse(state.lastImproveRun) : -Infinity;
    const n = loadClasses(dir).flatMap((c) => c.occurrences).filter((o) => Date.parse(o.recordedAt) > since).length;
    if (n < minFindings) continue;
    if (state.lastNudge && now - Date.parse(state.lastNudge) < days * DAY_MS) continue;
    const skill = scope === 'project' ? 'improve' : 'improve-plugin';
    const head = scope === 'project'
      ? `${n} improvement findings recorded in this project since the last improve run.`
      : `${n} plugin improvement findings recorded since the last improve-plugin run.`;
    console.log(`kentra-rpir: ${head} Tell the user this line and suggest running /kentra-rpir:${skill}.`);
    saveState(dir, { lastNudge: now.toISOString() });
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const opts = parseArgs(rest);
  switch (cmd) {
    case 'record': return record(opts);
    case 'list': return list(opts);
    case 'decide': return decide(opts);
    case 'ship': return ship(opts);
    case 'nudge': return nudge(opts);
    case 'import':
      if (!opts['project-id']) fail('--project-id is required');
      return importFile(opts);
    default: return fail('usage: improvements.mjs <record|list|decide|ship|import|nudge> [options]');
  }
}

function isEntry() {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isEntry()) {
  try { main(process.argv.slice(2)); } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(e.message);
    process.exit(2);
  }
}
