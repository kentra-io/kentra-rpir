# kentra-rpir — agent instructions

This repository is a Claude Code plugin: skills, agents, workflows, scripts and
templates. There is no build. `docs/process.md` is the process it implements;
read it before changing a skill.

**This is a public repository.** Everything committed is published: code, docs,
change folders, test fixtures and commit messages. Mask work from private
repositories before it is committed:
- project, client, product and change names → "project A", "change 1";
- absolute paths → `/path/to/project/…`;
- session, agent and workflow ids → `<session-id>`;
- quotes of private chats → a neutral paraphrase;
- test fixtures → invented content.

- Every edit to a skill, agent, workflow, script or template bumps `version` in
  `.claude-plugin/plugin.json` — `claude plugin update` compares only that field.
- Run `sh tests/run.sh` before committing. It runs the script tests and the
  workflow checks.
- Workflow scripts are plain JavaScript run by Claude Code's Workflow tool: top-level
  `await`, `return` at the end, a pure-literal `export const meta`.
- Write skills and prompts following the `writing-for-agents` skill.
