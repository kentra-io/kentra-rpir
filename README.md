# kentra-rpir

A Claude Code plugin that runs one change — a feature, a bug or a chore — from
idea to merged code, in four stages:

| Stage | Skill | You | It writes |
|---|---|---|---|
| **spec** | `/kentra-rpir:spec` | answer questions until you agree | `spec.md` |
| **plan** | `/kentra-rpir:plan` | approve | `plan.yaml` |
| **implement** | `/kentra-rpir:implement` | settle what the orchestrator asks | code, `impl-report.md` |
| **review** | `/kentra-rpir:review` | review the code and the retro | `spec-retro.md` |

It is RPI (Research → Plan → Implement) with an explicit Review stage, for a solo
founder:

- **Files are the handoff.** Each stage reads the previous stage's file, not
  its conversation.
- **Checked against the source.** An independent reviewer checks the spec and
  the plan against the conversation, the spec, the project's rules and its
  constitution — split per milestone for a plan. Research agents check every
  premise that could change the plan with a docs check, and spike only a
  critical premise the docs don't settle.
- **Two tiers.** `full` for code that ships; `light` for proofs of concept,
  researching only what could change the plan's shape.
- **Plans written in parallel.** The main session writes the plan's skeleton;
  one writer per milestone fills in the detail.
- **Parallel, verified implementation.** Milestones from the plan's DAG run in
  parallel git worktrees. Each one is checked by a fresh verifier before it
  merges.
- **The process records itself.** The spec and plan sessions are kept as a
  trimmed, redacted log in the change folder; the retro reads every session's
  transcript, not the agents' account of their work.

Everything for one change lives in `docs/changes/<date>-<slug>/`. See
[`docs/process.md`](docs/process.md) for the whole process.

## Install

```
/plugin marketplace add kentra-io/kentra-agentic-plugins
/plugin install kentra-rpir@kentra-agentic-plugins
brew install kentra-io/tap/milestoned-plan-dag
```

Needs `milestoned-plan-dag` 0.3.0 or later and `jq` 1.6 or later.

Optional: [`adr-sourced-constitution`](https://github.com/kentra-io/adr-sourced-constitution)
for a project constitution that every stage reads.

## Configure

The first `/kentra-rpir:spec` in a project writes `.kentra-rpir.yaml`. Models and
agents per role, question batch size, worktree location and research settings
live there — see [`templates/kentra-rpir.yaml`](templates/kentra-rpir.yaml).

## History

This repository was `spec-lifecycle`: a gated, OpenSpec-format lifecycle with a
Go CLI. Its last release is v0.2.0; the history is in git.

## License

MIT
