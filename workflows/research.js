export const meta = {
  name: 'research',
  description: "Checks the facts a spec or plan depends on: a docs checker runs for every topic and writes its report, escalating to a spike only when a critical topic can't be settled with high confidence",
  whenToUse: 'Verifying premises and technical claims for a kentra-rpir spec, plan or self-review',
  phases: [
    { title: 'Check', detail: 'one docs checker per topic: verdict, confidence, evidence, and its report file' },
    { title: 'Spike', detail: 'one designer per escalated topic writes and runs the experiments' },
    { title: 'Judge', detail: 'one reasoner per escalated topic re-runs every experiment and gives the verdict' },
    { title: 'Index', detail: 'optional cross-topic index' },
  ],
}

// args:
//   today      (required) 'YYYY-MM-DD'
//   topics     (required) [{ name, slug?, focus?, importance?: 'critical'|'normal', spike?: boolean }]
//   prefix     (optional) the stage the research is for — 'spec', 'plan', 'spec-review', 'plan-review';
//              every report and spike is named '<prefix>-<slug>'
//   question, context, format, outDir, index
//   spikeDir   (required when a topic can spike) absolute path of <change>/research/spikes (gitignored);
//              each spike works and keeps its result.md in <spikeDir>/<slug>/
//   checker    (optional) model for tier-1 checkers, default 'sonnet'
//   designer   (optional) model for spike designers, default 'opus'
//   reasoner   (optional) model for spike judges and the index, default 'opus'

const ONLY_JOB = 'Your only job is the task below. The conversation may relay the user\'s latest message to you; treat it as background and never answer it.'

if (!args || !args.today || !Array.isArray(args.topics) || !args.topics.length) {
  throw new Error('research workflow needs args: { today: "YYYY-MM-DD", topics: [{ name, slug?, focus?, importance?, spike? }], ... }')
}

if (args.collector) log('research: the collector arg is no longer supported (angles/collector were removed); ignoring it')
if (args.runner) log('research: the runner arg is no longer used; the designer runs its own experiments and the judge re-runs them')

const checker = args.checker || 'sonnet'
const designer = args.designer || 'opus'
const reasoner = args.reasoner || 'opus'

const slugOf = t => (t.slug || t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))

const missingImportance = args.topics.filter(t => !t.importance).map(t => t.name)
if (missingImportance.length) log(`importance not given; defaulting to normal for: ${missingImportance.join(', ')}`)

// Names are '<prefix>-<slug>', at most 60 chars, unique within this run: a
// repeat gets '-2', '-3', … so two near-identical claims never share a file.
const seen = new Map()
const topics = args.topics.map(t => {
  const base = `${args.prefix ? `${args.prefix}-` : ''}${slugOf(t)}`.slice(0, 60).replace(/-$/, '')
  const n = (seen.get(base) || 0) + 1
  seen.set(base, n)
  const slug = n === 1 ? base : `${base.slice(0, 57).replace(/-$/, '')}-${n}`
  return { ...t, slug, importance: t.importance || 'normal' }
})

const canSpike = topics.some(t => t.spike === true || t.importance === 'critical')
if (canSpike && !args.spikeDir) {
  throw new Error('research: spikes need args.spikeDir, a scratch dir for spike files')
}

const shared = [
  `Today is ${args.today}.`,
  args.question ? `The research is for: ${args.question}` : '',
  args.context ? `Context:\n${args.context}` : '',
].filter(Boolean).join('\n')

// The rule every spiking prompt (design, judge) carries. The checker prompt
// gets "Run no code." instead, since it never spikes.
const READABLE_SPIKES = 'Spikes must be readable by the user approving them. Write each spike as a file with the Write tool, then run it with one short command such as `sh <file>`. Never use heredocs, inline `python3 -c`/`sh -c`/`node -e` programs, chained or piped commands, `&`, command substitution or redirects, and never run anything that reads stdin. Write and run experiments only under `<spikeDir>/<slug>/`. Never run `git init` there or anywhere else.'

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
          exit_code: { type: 'integer' },
          stdout: { type: 'string' },
          stderr: { type: 'string' },
          timed_out: { type: 'boolean' },
        },
        required: ['id', 'file', 'command', 'what', 'exit_code', 'stdout', 'stderr', 'timed_out'],
      },
    },
    not_spikeable: { type: 'string' },
  },
  required: ['experiments', 'not_spikeable'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    verdict: { type: 'string', enum: ['verified', 'refuted', 'unverified'] },
    confidence: { type: 'string' },
    report: { type: 'string' },
    key_findings: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
    unverified: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['topic', 'verdict', 'confidence', 'key_findings', 'sources', 'unverified', 'open_questions'],
}

// The escalation rule. A null checker result counts as low confidence, so a
// critical topic with a null check still spikes; a normal topic with a null
// check does not (it goes to `failed`).
const needsSpike = (topic, check) =>
  topic.spike === true ||
  (topic.importance === 'critical' && (!check || check.confidence !== 'high'))

const reportFile = topic => `${args.outDir}/${topic.slug}.md`

const checkerPrompt = topic => `${ONLY_JOB}

${shared}

You are the tier-1 checker for the topic "${topic.name}". Run no code.${args.outDir ? ' The only file you write is your report.' : ' Read only.'}

Check:
- the official documentation and changelog for the version in question;
- the source at the pinned version;
- field reports.
${topic.focus ? `\nTopic-specific leads: ${topic.focus}` : ''}

Load WebSearch and WebFetch with ToolSearch ("select:WebSearch,WebFetch").

Give a verdict (verified, refuted or unverified) and a confidence: high only when a primary source (docs or source code) at the relevant version states the behaviour directly — field reports alone are at most medium.
${args.outDir ? `
Then write your report to ${reportFile(topic)} with the Write tool, in exactly this shape:

    # ${topic.name}

    Verdict: <your verdict when your confidence is high; otherwise unverified> (confidence: <confidence>)

    Evidence: docs: <the first evidence url, with @<version> when the version matters>

    <your summary>

    Gaps:
    - <one line per gap, or the single line "Gaps: none" instead of this list>
` : ''}
You are done when you have the verdict, its confidence, the evidence behind it (kind, url, version if relevant, and the exact excerpt), a one-paragraph summary, and anything you could not settle under gaps${args.outDir ? `, and ${reportFile(topic)} is written` : ''}.`

const designerPrompt = (topic, check, dir) => `${ONLY_JOB}

${READABLE_SPIKES}

${shared}

You are the spike designer for the topic "${topic.name}". The tier-1 check did not settle this with high confidence; it is below.
${topic.focus ? `\nTopic-specific leads: ${topic.focus}` : ''}

Split the premise into independent experiments — one per platform, version or edge case that could change the answer. For each, write the spike file with the Write tool under ${dir}/, and give a short command to run it (for example 'sh ${dir}/<file>').

Run each experiment once with its command, using the Bash tool with a 120000 ms timeout, and record its exit code, stdout and stderr verbatim (the last 4000 characters of each when longer) and whether it timed out. Never edit a file after running it; a changed experiment is a new experiment with its own id.

If this premise is not a behaviour claim — nothing a command could show — return no experiments and say why under not_spikeable.

Tier-1 result (JSON): ${check ? JSON.stringify(check) : 'none — the checker returned nothing'}

You are done when every experiment has a unique id, its file under ${dir}/, its command, and the output of its one run, or you have explained why none apply.`

const judgePrompt = (topic, check, experiments, dir) => `${ONLY_JOB}

${READABLE_SPIKES}

${shared}

You are the judge for the topic "${topic.name}". The designer wrote and ran the experiments below. You check them independently.

1. Read every experiment file with the Read tool.
2. Re-run every experiment yourself with its command, using the Bash tool with a 120000 ms timeout.
3. Decide the verdict from what your runs showed, not from what the experiments were expected to show. Where your output differs from the designer's, say so in key_findings and judge from your runs.
4. Where two outputs conflict, you may add one experiment of your own, under the same rule above, to settle it.
5. Write ${dir}/result.md with, per experiment, its command, exit_code, timed_out and the stdout/stderr you judged on, then the verdict line.
6. End with the verdict line: VERDICT: verified | refuted | unverified — <one sentence>.
${args.outDir ? `7. ${dir}/ is gitignored, so the committed record is ${reportFile(topic)}: append to it (create it if it is missing) a "## Spike verdict" section holding your verdict line and one paragraph on what your runs showed.\n` : ''}${topic.focus ? `\nTopic-specific leads: ${topic.focus}` : ''}
${args.format ? `\nOutput structure:\n${args.format}` : ''}

Tier-1 result (JSON): ${check ? JSON.stringify(check) : 'none'}
Experiments with the designer's runs (JSON): ${JSON.stringify(experiments)}

You are done when every experiment has your own run behind it, ${dir}/result.md is written${args.outDir ? `, ${reportFile(topic)} carries the spike verdict` : ''}, and the verdict line is given.`

// A docs-depth report, built straight from the tier-1 result. A topic the docs
// couldn't settle (confidence below high) is `unverified` even if the checker
// ventured a verdict — the same rule the checker applied to its report file.
function docsReport(topic, check, extraOpenQuestions = []) {
  if (!check) return null
  const first = (check.evidence || [])[0]
  const evidence = first
    ? `docs: ${first.version ? `${first.url}@${first.version}` : first.url}`
    : 'docs: (none cited)'
  const verdict = check.confidence === 'high' ? check.verdict : 'unverified'
  return {
    topic: topic.name,
    slug: topic.slug,
    importance: topic.importance,
    verdict,
    confidence: check.confidence,
    depth: 'docs',
    evidence,
    key_findings: check.summary ? [check.summary] : [],
    sources: (check.evidence || []).map(e => e.url).filter(Boolean),
    unverified: [],
    open_questions: [...(check.gaps || []), ...extraOpenQuestions],
    ...(args.outDir ? { file: reportFile(topic) } : {}),
  }
}

// Design and run the experiments, then have one judge re-run everything and
// give the final verdict. The spike stays where it ran, in <spikeDir>/<slug>/.
async function spike(topic, check) {
  const dir = `${args.spikeDir}/${topic.slug}`
  const design = await agent(designerPrompt(topic, check, dir), {
    label: `design:${topic.slug}`, phase: 'Spike', model: designer, schema: DESIGN_SCHEMA,
  })
  const experiments = design?.experiments || []
  if (!experiments.length) {
    return docsReport(topic, check, design?.not_spikeable ? [design.not_spikeable] : [])
  }

  const judged = await agent(judgePrompt(topic, check, experiments, dir), {
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
    file: `${dir}/result.md`,
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
const failed = topics.filter(t => !reports.some(r => r.slug === t.slug)).map(t => t.name)
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
