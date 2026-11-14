# A plugin can carry a SessionStart command hook beside "modules" in hooks/hooks.json

## Conclusion

- **Answer:** Yes. One hooks/hooks.json can hold `"modules": [...]` and a standard `"hooks": {"SessionStart": [{"hooks":[{"type":"command","command":"sh \"${CLAUDE_PLUGIN_ROOT}/hooks/nudge.sh\""}]}]}`; no mod API route is needed. `${CLAUDE_PLUGIN_ROOT}` is set in the command (it resolved to the plugin folder). Plain stdout and JSON `hookSpecificOutput.additionalContext` both reach the model as context; the mod API's equivalent `session.start` hook only returns `{cwd}` and cannot inject context, so the command hook is the right route.
- **Verdict:** verified
- **Confidence:** medium
- **Rests on:** experiment (Claude Code 2.1.325, macOS, scratch plugin via --plugin-dir, `claude -p`), working installed plugins (superpowers 7.0.0, ponytail 5.3.3), plugin-authoring type declarations (build 2.1.323)
- **Size:** (a) and (c) and model-context half of (b) settled; user-visible display half of (b) is not.

Not settled: whether the line is shown to the person in the interactive TUI. `-p` cannot show it; the stream shows the hook's stdout only as a `hook_response` event, and `systemMessage` was not rendered in `-p` output. Presumably a JSON `systemMessage` is the user-facing channel and plain stdout is model context (the model sees it, labelled "SessionStart:startup hook success"), but this was not observed in a TUI; a nudge meant for the person should be tested once interactively, or also tell the model to relay it. The advisor and a docs lookup were dispatched but their reports had not arrived when this was written, so no advisor read is recorded. Matcher: omit it, or use `startup|resume` to avoid firing on clear/compact.

## References

- [experiment] `sh run1.sh` (spikes/plugin-sessionstart-hook/) — exit 0 — `claude plugin validate scratch` "Validation passed with warnings"; hook_response "output":"NUDGE-PLAIN root=.../scratch\n","exit_code":0,"outcome":"success", with hooks.json = modules + hooks.SessionStart
- [experiment] `sh run2.sh` — model: "Yes. It appears in the first SessionStart hook output: > SessionStart:startup hook success: NUDGE-PLAIN root=..."
- [experiment] `sh run3.sh` — JSON variant: model: "SessionStart hook additional context: NUDGE-CTX for model"; systemMessage not echoed in -p
- [source] ponytail 5.3.3 hooks/claude-band.json — `{"hooks": {}, "modules": ["./band/register.tsx"]}` (same file holds both keys); its claude-codex-hooks.json uses SessionStart command with `process.env.CLAUDE_PLUGIN_ROOT`
- [source] superpowers 7.0.0 hooks/hooks.json — SessionStart command `"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start`; its script emits `hookSpecificOutput.additionalContext` for Claude Code
- [source] plugin-authoring types/claude-code.d.ts (2.1.323) — "SessionStartResult = { cwd: string } ... a hook's own value does not change the session"
- [official docs, via WebFetch summary, undated, version unstated] Anthropic, https://code.claude.com/docs/en/hooks — "`UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, and `PostModelSwitch`: Claude Code adds plain-text stdout as context that Claude can see and act on." and "A successful hook's stdout is never shown in the transcript" (so plain stdout is model-only; the user-facing channel is `systemMessage`: "Warning message shown to the user.")
- [official docs, via WebFetch summary, undated] Anthropic, https://code.claude.com/docs/en/plugins-reference — Hook commands resolve `${CLAUDE_PLUGIN_ROOT}` "Anywhere in `command` and `args`"; a hooks file wraps the event map in a top-level `"hooks"` key. These docs corroborate the experiment; they do not say whether `modules` may sit beside `hooks` (ponytail's claude-band.json shows it does).

## Advisor read (arrived after the Conclusion was handed back)

The advisor re-ran `sh run3.sh` (exit 0, same result) and agreed the conclusion holds: coexistence, `${CLAUDE_PLUGIN_ROOT}` and model context verified; user visibility unverified. Its gaps: the JSON `additionalContext` path was re-run, but plain stdout rests on the recorded run1 and run2; only `--plugin-dir` and the `startup` source were tested (not an installed plugin, nor resume, clear or compact); `systemMessage` display needs one interactive session.
