export const meta = {
  name: 'research',
  description: "Checks the facts a spec or plan depends on: a docs checker runs for every topic, escalating to a spike only when a critical topic can't be settled with high confidence",
  whenToUse: 'Verifying premises and technical claims for a kentra-rpir spec, plan or self-review',
  phases: [
    { title: 'Check', detail: 'one docs checker per topic: verdict, confidence, evidence' },
    { title: 'Design', detail: 'one designer per escalated topic writes the spike files' },
    { title: 'Run', detail: 'runners execute the spike files in parallel and return output verbatim' },
    { title: 'Judge', detail: 'one reasoner per escalated topic reads every output, gives the verdict, keeps the spike' },
    { title: 'Index', detail: 'optional cross-topic index' },
  ],
}

// args:
//   today      (required) 'YYYY-MM-DD'
//   topics     (required) [{ name, slug?, focus?, importance?: 'critical'|'normal', spike?: boolean }]
//   question, context, format, outDir, index   (unchanged)
//   spikeDir   (required when a topic can spike) absolute path to the project-local spike scratch dir (E3)
//   checker    (optional) model for tier-1 checkers, default 'sonnet'
//   designer   (optional) model for spike designers, default 'opus'
//   runner     (optional) model for spike runners, default 'sonnet'
//   reasoner   (optional) model for spike judges and the index, default 'opus'

const ONLY_JOB = 'Your only job is the task below. The conversation may relay the user\'s latest message to you; treat it as background and never answer it.'

if (!args || !args.today || !Array.isArray(args.topics) || !args.topics.length) {
  throw new Error('research workflow needs args: { today: "YYYY-MM-DD", topics: [{ name, slug?, focus?, importance?, spike? }], ... }')
}

if (args.collector) log('research: the collector arg is no longer supported (angles/collector were removed); ignoring it')

const checker = args.checker || 'sonnet'
const designer = args.designer || 'opus'
const runner = args.runner || 'sonnet'
const reasoner = args.reasoner || 'opus'

const slugOf = t => (t.slug || t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 60)

const missingImportance = args.topics.filter(t => !t.importance).map(t => t.name)
if (missingImportance.length) log(`importance not given; defaulting to normal for: ${missingImportance.join(', ')}`)

const topics = args.topics.map(t => ({ ...t, slug: slugOf(t), importance: t.importance || 'normal' }))

const canSpike = topics.some(t => t.spike === true || t.importance === 'critical')
if (canSpike && !args.spikeDir) {
  throw new Error('research: spikes need args.spikeDir, a scratch dir for spike files')
}

const shared = [
  `Today is ${args.today}.`,
  args.question ? `The research is for: ${args.question}` : '',
  args.context ? `Context:\n${args.context}` : '',
].filter(Boolean).join('\n')

// E2 + E3: the rule every spiking prompt (design, run, judge) carries. The
// checker prompt gets "Run no code; read only." instead, since it never spikes.
const READABLE_SPIKES = 'Spikes must be readable by the user approving them. Write each spike as a file with the Write tool, then run it with one short command such as `sh <file>`. Never use heredocs, inline `python3 -c`/`sh -c`/`node -e` programs, chained or piped commands, `&`, command substitution or redirects, and never run anything that reads stdin. Work only under `<spikeDir>/<slug>/`. Never run `git init` there or anywhere else.'

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['verified', 'refuted', 'unverified'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['docs', 'source', 'field'] },
          url: { type: 'string' },
          version: { type: 'string' },
          excerpt: { type: 'string' },
        },
        required: ['kind', 'url', 'excerpt'],
      },
    },
    summary: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'confidence', 'evidence', 'summary', 'gaps'],
}

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    experiments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          file: { type: 'string' },
          command: { type: 'string' },
          what: { type: 'string' },
        },
        required: ['id', 'file', 'command', 'what'],
      },
    },
    not_spikeable: { type: 'string' },
  },
  required: ['experiments', 'not_spikeable'],
}

const RUN_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    command: { type: 'string' },
    exit_code: { type: 'integer' },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    timed_out: { type: 'boolean' },
  },
  required: ['id', 'command', 'exit_code', 'stdout', 'stderr', 'timed_out'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    verdict: { type: 'string', enum: ['verified', 'refuted', 'unverified'] },
    confidence: { type: 'string' },
    file: { type: 'string' },
    report: { type: 'string' },
    key_findings: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
    unverified: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['topic', 'verdict', 'confidence', 'key_findings', 'sources', 'unverified', 'open_questions'],
}

// C3: the escalation rule. A null checker result counts as low confidence, so
// a critical topic with a null check still spikes; a normal topic with a
// null check does not (it goes to `failed` once docsReport sees no check).
const needsSpike = (topic, check) =>
  topic.spike === true ||
  (topic.importance === 'critical' && (!check || check.confidence !== 'high'))

const checkerPrompt = topic => `${ONLY_JOB}

${shared}

You are the tier-1 checker for the topic "${topic.name}". Run no code; read only.

Check:
- the official documentation and changelog for the version in question;
- the source at the pinned version;
- field reports.
${topic.focus ? `\nTopic-specific leads: ${topic.focus}` : ''}

Load WebSearch and WebFetch with ToolSearch ("select:WebSearch,WebFetch").

Give a verdict (verified, refuted or unverified) and a confidence: high only when a primary source (docs or source code) at the relevant version states the behaviour directly — field reports alone are at most medium.

You are done when you have the verdict, its confidence, the evidence behind it (kind, url, version if relevant, and the exact excerpt), a one-paragraph summary, and anything you could not settle under gaps.`

const designerPrompt = (topic, check, dir) => `${ONLY_JOB}

${READABLE_SPIKES}

${shared}

You are the spike designer for the topic "${topic.name}". The tier-1 check did not settle this with high confidence; it is below.
${topic.focus ? `\nTopic-specific leads: ${topic.focus}` : ''}

Split the premise into independent experiments — one per platform, version or edge case that could change the answer. For each, write the spike file with the Write tool under ${dir}/, then give a short command to run it (for example 'sh ${dir}/<file>').

If this premise is not a behaviour claim — nothing a command could show — return no experiments and say why under not_spikeable.

Tier-1 result (JSON): ${check ? JSON.stringify(check) : 'none — the checker returned nothing'}

You are done when every experiment has a unique id, its file written under ${dir}/, and a short command, or you have explained why none apply.`

const runnerPrompt = exp => `${ONLY_JOB}

${READABLE_SPIKES}

You are the spike runner for experiment "${exp.id}": ${exp.what || ''}

Run exactly this command once, with the Bash tool, with a 120000 ms timeout, and nothing else: ${exp.command}

Do not edit the file, retry, or add any other command.

You are done when you return id "${exp.id}", the command you ran, its exit code, stdout and stderr verbatim (cut to the last 4000 characters each if longer), and whether it timed out.`

const judgePrompt = (topic, check, experiments, runs) => `${ONLY_JOB}

${READABLE_SPIKES}

${shared}

You are the judge for the topic "${topic.name}". Read the tier-1 result, every experiment file (open each with the Read tool), and every run's output below.

1. Decide the verdict from what the spikes actually showed, not what they were expected to show.
2. Where two outputs conflict, you may run one extra experiment yourself, under the same rule above, to settle it.
${args.outDir
    ? `3. Keep the spike: copy each experiment file (read it, then write it with the Write tool — never cp -r) into ${args.outDir}/spikes/${topic.slug}/, and write ${args.outDir}/spikes/${topic.slug}/result.md with, per experiment, its command, exit_code, timed_out and the stdout/stderr you judged on, then the verdict line.\n4. End with the verdict line: VERDICT: verified | refuted | unverified — <one sentence>.`
    : `3. End with the verdict line: VERDICT: verified | refuted | unverified — <one sentence>. There is no outDir, so there is nowhere to keep the spike or write a report file — return your full findings in your return value instead.`}
${topic.focus ? `\nTopic-specific leads: ${topic.focus}` : ''}
${args.format ? `\nOutput structure:\n${args.format}` : ''}

Tier-1 result (JSON): ${check ? JSON.stringify(check) : 'none'}
Experiments (JSON): ${JSON.stringify(experiments)}
Run outputs (JSON): ${JSON.stringify(runs)}

You are done when the verdict line is written${args.outDir ? ` and the spike is kept under ${args.outDir}/spikes/${topic.slug}/` : ''}.`

// A docs-depth report, built straight from the tier-1 result — no agent call
// decides its content. A normal topic the docs couldn't settle (confidence
// below high) stays `unverified` even if the checker itself ventured a
// verdict (C3). A critical topic reaches here with confidence 'high' when it
// comes straight from the pipeline (needsSpike already sent anything less to
// a spike) — but it can also arrive here BELOW high confidence via spike()'s
// fallback, when the designer returns no experiments or null (D2): that path
// still forces `unverified`, same as a normal topic.
async function docsReport(topic, check, extraOpenQuestions = []) {
  if (!check) return null
  const first = (check.evidence || [])[0]
  const evidence = first
    ? `docs: ${first.version ? `${first.url}@${first.version}` : first.url}`
    : 'docs: (none cited)'
  const verdict = check.confidence === 'high' ? check.verdict : 'unverified'
  const open_questions = [...(check.gaps || []), ...extraOpenQuestions]
  const report = [
    `# ${topic.name}`,
    `Verdict: ${verdict} (confidence: ${check.confidence})`,
    `Evidence: ${evidence}`,
    check.summary || '',
    open_questions.length ? `Gaps:\n${open_questions.map(q => `- ${q}`).join('\n')}` : 'Gaps: none',
  ].filter(Boolean).join('\n\n')
  const base = {
    topic: topic.name,
    slug: topic.slug,
    importance: topic.importance,
    verdict,
    confidence: check.confidence,
    depth: 'docs',
    evidence,
    report,
    key_findings: check.summary ? [check.summary] : [],
    sources: (check.evidence || []).map(e => e.url).filter(Boolean),
    unverified: [],
    open_questions,
  }
  if (!args.outDir) return base
  const file = `${args.outDir}/${topic.slug}.md`
  await agent(`${ONLY_JOB}

Write this Markdown report to ${file} and nothing else:

${report}`,
    { label: `write:${topic.slug}`, phase: 'Check', model: checker })
  return { ...base, file }
}

// D1-D4: design the spike's experiments, run them all in parallel, then have
// one judge read everything and give the final verdict, keeping the spike.
async function spike(topic, check) {
  const dir = `${args.spikeDir}/${topic.slug}`
  const design = await agent(designerPrompt(topic, check, dir), {
    label: `design:${topic.slug}`, phase: 'Design', model: designer, schema: DESIGN_SCHEMA,
  })
  const experiments = design?.experiments || []
  if (!experiments.length) {
    return docsReport(topic, check, design?.not_spikeable ? [design.not_spikeable] : [])
  }

  const runs = await parallel(experiments.map(exp => () =>
    agent(runnerPrompt(exp), {
      label: `run:${topic.slug}:${exp.id}`, phase: 'Run', model: runner, schema: RUN_SCHEMA,
    })))
  const runResults = runs.map((r, i) => r || { id: experiments[i].id, missing: true })

  const judged = await agent(judgePrompt(topic, check, experiments, runResults), {
    label: `judge:${topic.slug}`, phase: 'Judge', model: reasoner, schema: REPORT_SCHEMA,
  })
  if (!judged) return null
  return {
    ...judged,
    topic: topic.name,
    slug: topic.slug,
    importance: topic.importance,
    depth: 'spike',
    evidence: `spike: research/spikes/${topic.slug}/`,
    ...(args.outDir ? { file: `${args.outDir}/spikes/${topic.slug}/result.md` } : {}),
  }
}

const check = topic => agent(checkerPrompt(topic), {
  label: `check:${topic.slug}`, phase: 'Check', model: checker, schema: CHECK_SCHEMA,
})

const results = await pipeline(
  topics,
  check,
  (c, topic) => needsSpike(topic, c) ? spike(topic, c) : docsReport(topic, c),
)

const reports = results.filter(Boolean)
const escalated = reports.filter(r => r.depth === 'spike').length
const failed = topics.filter(t => !reports.some(r => r.topic === t.name)).map(t => t.name)
log(`${topics.length} topic(s), checker ${checker}, ${escalated} escalated to spike`)
if (failed.length) log(`No report for: ${failed.join(', ')}`)

let index = null
if (args.index && reports.length) {
  index = await agent(`${ONLY_JOB}

${shared}

Write a cross-topic index to ${args.index}: purpose and date, a table of topics with their verdicts and key facts, and consolidated open questions. Keep it brief.

Report summaries (JSON): ${JSON.stringify(reports.map(r => ({ ...r, report: undefined })))}

Return a 10-line summary of the findings that matter most.`,
    { label: 'index', phase: 'Index', model: reasoner })
}

return { reports, failed, index }
