---
name: research
description: Runs research as a session pool of background jobs (a lookup for a fact, a spike for a premise, a researcher for a survey), each writing one report and one row in a project-wide research index that is checked first. Use when a spec, plan or review depends on a fact, premise or open technical question, or when the user asks for research.
---

# research — the session research pool

You, the main session, run the pool. Jobs are background Agent dispatches, and
only the main session receives their results and can resume them. A subagent's
background children report to the main session, never to the subagent. Never
hand the pool to a subagent. The conversation goes on while jobs run.

**Where things are:**
- the config is `rpir/config.yaml` at the project root (defaults:
  `${CLAUDE_PLUGIN_ROOT}/templates/config.yaml`), keys under `research:`;
- the index is `rpir/research/index.jsonl`; outside a change, reports go to
  `rpir/research/`;
- inside a change, the queue (`research-queue.tsv`) and spikes live in
  `<change>/.local/`; outside one, in `rpir/research/.local/`;
- the queue is the script `research-queue.sh`; each use below is one complete
  command line. Run it exactly as written, never storing the command or the
  script path in a shell variable or alias;
- the report shape is under "Report" in `${CLAUDE_PLUGIN_ROOT}/agents/researcher.md`.

## 1. Set up (once per session)

1. **Stage start.** Run
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/stage-start.sh" "<project root>"`. On exit 3,
   stop and relay its line. On `user-config: missing`, follow the
   instructions it prints (the user's questions, in one message) before going
   on.
2. **Find the rpir change.** A calling kentra-rpir stage skill names it;
   otherwise run
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/sessions.sh" current --project <project root> --session "${CLAUDE_SESSION_ID}"`
   and take its output only when this session appears in that change's
   `.local/sessions`. Otherwise you are outside an rpir change.
3. **Standalone switch.** Outside an rpir change, when `research.standalone`
   is `false`, stop: tell the user the pool is off outside rpir stages and
   run nothing.
4. **Report dir.** Inside a change, reports go to `<change folder>/research/`
   and spikes to `<change folder>/.local/spikes/`. Outside one, reports go to
   `rpir/research/` and spikes to `rpir/research/.local/spikes/`. Create both
   with `mkdir -p`.
5. **Gitignore.** Make sure `.gitignore` holds `rpir/**/.local/`, adding it
   when missing. Spike files and the queue never reach git; reports and the
   index can.

## 2. Intake: check the index, size, queue

For each question, in turn:

1. **Check the index** (`rpir/research/index.jsonl`). Grep it for the subject's
   name and read the matching rows. A row is identified by its `claim` plus
   its `subject` (`<name>@<version>`). When several rows share both, the last
   one supersedes the earlier ones.
   - **Reuse.** The current row for the same claim at the same version with
     verdict `verified` or `refuted` answers the question. Use its
     `conclusion` and cite its `report`. Queue nothing. A row whose report
     file is missing still counts.
   - **Lead.** A row for another version, or one left `unverified`, does not
     answer it. Queue the job and name that row's report in the question as a
     starting point.
2. **Size it:**

   | Size | When | Agent |
   |---|---|---|
   | `fact` | one fact with a definite answer: a default, a signature, a release date | `kentra-rpir:lookup`, model `haiku` |
   | `premise` | a claim the change depends on; carries an importance, `critical` or `normal` | `kentra-rpir:spike`, model `sonnet` |
   | `survey` | an open question with several candidate answers: compare options, map a landscape | `kentra-rpir:researcher`, model `opus` |

   When you can answer a fact yourself with a read or two (a file in this
   repo, a `--help`), do so and queue nothing.

   **Premises.** A `critical` premise is one that changes the shape of the
   work if wrong; it gets the full spike. A `normal` premise gets a docs
   check only: the spike reads official docs and source and runs no
   experiments. Official docs or source code at the version in question
   settle a premise on their own.
3. **Queue it:**
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/research-queue.sh" add [--change <change folder>] --dir <absolute report dir> <fact|premise|survey> <slug> "<question>"`.
   - The slug is 2–5 kebab-case words.
   - The question is one line: the claim or question with its version, then
     ` — ` and why the work depends on it. A premise's question starts with
     `critical:` or `normal:`; the script refuses (exit 2) one without.
   - `add` prints the job id and its report path. The path is free: a taken
     slug gets a numeric suffix (`-2`, `-3`), so a report is never
     overwritten.

Then start jobs (step 3).

## 3. Start jobs

Run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/research-queue.sh" next [--change <change folder>] --max <research.maxParallel> --stale <research.staleMinutes>`
until it prints no `start` line. Each line is tab-separated:

- `start <id> <kind> <report> <question>`: dispatch the job now.
- `stale <id> <kind> <report> <question>`: a job that ran past
  `research.staleMinutes` without reporting back has lost its slot. Re-queue
  it with `add` if it still matters, or drop it, and tell the user which.

Dispatch each started job with the Agent tool, `run_in_background: true`,
`subagent_type` and `model` from the sizing table, `description`
`research <id>: <report name>` (the report's file name without `.md`, so
any suffix `add` gave it), and this prompt:

```
Research job <id> (<kind>). Today is <YYYY-MM-DD>.
Question: <question>
Report: write it to <absolute report path>.
Index: append your row to <absolute path of rpir/research/index.jsonl>.
Spike folder: <absolute spikes dir (<change>/.local/spikes or rpir/research/.local/spikes)>/<report file name without .md>/   (premise only)
Lookups: run at most <research.maxLookups> at once.   (premise and survey)
Context: <what the work is, and anything the agent cannot find by reading: decisions already taken, the versions pinned>
```

A fact job's lookup writes nothing: its prompt is the question and its
context only.

Several jobs started at once are dispatched in one message.

## 4. On each completion

When a job's completion notification arrives:

1. `sh "${CLAUDE_PLUGIN_ROOT}/scripts/research-queue.sh" done [--change <change folder>] <id> --agent <the job's agent id>`.
2. **Read only the Conclusion.** A premise or survey job's final message is
   its report's Conclusion section. Read that; leave the report file closed
   unless the Conclusion leaves you unable to act.
3. **A fact job.** Its lookup returns sources with excerpts. Write its report
   at the job's path in the shape under "Report" in `agents/researcher.md`.
   Then append its index row with the quoted heredoc under "Index row" in the
   same file: one line of JSON, with `"` and `\` escaped in every value.
4. **Act on it.**
   - A Conclusion with a Size line says the job was sized wrong: re-queue the
     question at its real size if it still matters.
   - A `refuted` premise goes to the user at once: it usually changes the
     design.
   - A `normal` premise left `unverified` after its docs check goes to the
     user, who may ask for a spike: re-queue it as `critical:`.
5. Run step 3 again, so the next queued job takes the free slot.

Questions raised later in the session go through step 2 and join the queue.

## 5. Follow-ups

A follow-up on a topic a job already covered is a new job: queue it with the
earlier job's id in its question. When `next` starts it, route it:

- **Same agent.** When the earlier job is `done` (its agent is idle) and its
  `finished` time is less than 5 minutes ago (`date +%s` minus the
  `finished` column of `sh "${CLAUDE_PLUGIN_ROOT}/scripts/research-queue.sh" list [--change <change folder>]`), send the follow-up to that agent with
  SendMessage: the question, and the new report path. Its prompt cache is
  still warm.
- **Fresh agent.** Otherwise dispatch a fresh job as in step 3, naming the
  earlier report in the Context line.

## Red flags

| Thought | Reality |
|---|---|
| "I'll read the full report to be sure" | The Conclusion carries the answer, its confidence and what it rests on. Open the report only when you cannot act on it. |
| "This was researched in an earlier change, but I'll check again" | A settled index row at the same version is reused. |
| "I'll start all eight jobs now" | `next` starts at most `research.maxParallel`; the rest wait for a free slot. |
| "A normal premise deserves a spike" | A docs check. The user can ask for more. |
| "A vendor benchmark settles it" | Only official docs, source code or an experiment settle a premise. |
