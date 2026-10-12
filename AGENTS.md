# kentra-rpir — agent instructions

This repository is a Claude Code plugin: skills, agents, workflows, scripts and
templates. There is no build. `docs/process.md` is the process it implements;
read it before changing a skill.

- Every edit to a skill, agent, workflow, script or template bumps `version` in
  `.claude-plugin/plugin.json` — `claude plugin update` compares only that field.
- Run `sh tests/run.sh` before committing. It runs the script tests and the
  workflow checks.
- Workflow scripts are plain JavaScript run by Claude Code's Workflow tool: top-level
  `await`, `return` at the end, a pure-literal `export const meta`.
- Write skills and prompts following the `writing-for-agents` skill.
