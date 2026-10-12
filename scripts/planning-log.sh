#!/bin/sh
# planning-log.sh — writes <change folder>/planning-log.jsonl: the trimmed,
# redacted record of the spec and plan sessions that defined a change (2.2).
# POSIX sh + jq >= 1.6.
#
#   planning-log.sh --project <root> --change <change folder> --out <file>
#
# Takes the sessions from `sessions.sh list` whose stages include spec or
# plan. For each, in list order, writes a `session` entry then the
# session's kept lines in transcript order (2.2.3, 2.2.4). The output is
# piped through redact.sh (2.2.5) before it lands at <file>: writes
# <file>.tmp, renames it to <file> only on success, removes the .tmp on
# failure.
#
# Exit: 0 written; 2 usage error, no planning session in the map, a jq
#       failure while building the log, or a redaction failure (nothing is
#       written in any of these cases); 3 written, with at least one
#       transcript missing; 4 jq not found.
set -u

here=$(cd "$(dirname "$0")" && pwd)

project=""; change=""; out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project) [ $# -ge 2 ] || { echo "kentra-rpir: planning-log.sh: --project needs a value" >&2; exit 2; }; project=$2; shift 2 ;;
    --change) [ $# -ge 2 ] || { echo "kentra-rpir: planning-log.sh: --change needs a value" >&2; exit 2; }; change=$2; shift 2 ;;
    --out) [ $# -ge 2 ] || { echo "kentra-rpir: planning-log.sh: --out needs a value" >&2; exit 2; }; out=$2; shift 2 ;;
    *) echo "kentra-rpir: planning-log.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
if [ -z "$project" ] || [ -z "$change" ] || [ -z "$out" ]; then
  echo "kentra-rpir: usage: planning-log.sh --project <root> --change <change folder> --out <file>" >&2
  exit 2
fi

command -v jq >/dev/null 2>&1 || { echo "kentra-rpir: planning-log.sh: jq not found" >&2; exit 4; }

sessions=$("$here/sessions.sh" list --project "$project" --change "$change") || sessions=""

# Keep only sessions whose ("+"-joined) stages include spec or plan.
planning=$(printf '%s\n' "$sessions" | awk '
  NF >= 1 {
    n = split($2, parts, "+")
    keep = 0
    for (i = 1; i <= n; i++) if (parts[i] == "spec" || parts[i] == "plan") keep = 1
    if (keep) print
  }
')

if [ -z "$planning" ]; then
  echo "kentra-rpir: planning-log.sh: no spec or plan session registered for $change" >&2
  exit 2
fi

# jq program implementing 2.2.3/2.2.4: reads the transcript leniently
# (fromjson?; unparseable lines are skipped) and emits the kept lines.
FILTER=$(cat <<'JQEOF'
# 2.2.3 is explicit that reading is lenient: an unexpected-but-valid JSON
# shape (a null where text is expected, a number where a path is expected,
# a scalar where an object or array is expected, ...) must never raise a
# jq runtime error and abort the whole run — it is dropped or coerced, the
# same way an unparseable line already is via `fromjson?`.
def s: if . == null then "" elif (type == "string") then . else tostring end;
def cut200: tostring | gsub("\n"; " ") | if (. | length) > 200 then .[0:200] else . end;
def asObj: if (type == "object") then . else {} end;
def asArr: if (type == "array") then . else [] end;
def toolInputSummary(name; rawinput):
  (rawinput | asObj) as $i
  | ($i.args | asObj) as $args
  | (
      if ($i.description != null) then ($i.description | s)
      elif (name == "Read" or name == "Write" or name == "Edit" or name == "NotebookEdit") then ($i.file_path | s)
      elif (name == "Grep" or name == "Glob") then
        (($i.pattern | s) + (if ($i.path | s) != "" then (" " + ($i.path | s)) else "" end))
      elif name == "Skill" then ($i.skill | s)
      elif name == "WebFetch" then ($i.url | s)
      elif name == "WebSearch" then ($i.query | s)
      elif name == "Workflow" then
        (($i.name // $i.path | s)
          + (if ($args.stage | s) != "" then (" " + ($args.stage | s))
             elif ($args.mode | s) != "" then (" " + ($args.mode | s))
             else "" end))
      else ($i | tojson)
      end
    ) | cut200;
def optionLabels: asArr | map(if (type == "object") then (if .label == null then (. | tostring) else (.label | s) end) else (. | s) end);
(fromjson?) | objects as $l
| select(($l.isMeta // false) == false)
| select(($l.isSidechain // false) == false)
| ($l.timestamp) as $ts
| if $l.type == "user" then
    (($l.message | asObj).content) as $c
    | (if ($c | type) == "string" then [{type: "text", text: $c}]
       elif ($c | type) == "array" then ($c | map(select(type == "object" and .type == "text")))
       else [] end) as $textblocks
    | ($textblocks | map(select((.text | type) == "string"))
                   | map(select((.text | startswith("<system-reminder>")) | not))) as $kept
    | ($l.toolUseResult.answers? // null) as $answers
    | if ($answers != null and ($answers | type) == "object") then
        {kind: "answer", ts: $ts, sid: $sid8, answers: $answers}
      elif ($kept | length) > 0 then
        {kind: "user", ts: $ts, sid: $sid8, text: ($kept | map(.text) | join("\n"))}
      else
        empty
      end
  elif $l.type == "assistant" then
    (($l.message | asObj).content | asArr) as $c
    | ($c | map(select(type == "object" and .type == "text"))
          | map(select((.text | type) == "string"))
          | map(.text) | join("\n")) as $atext
    | ($c | map(select(type == "object" and .type == "tool_use"))) as $tools
    | (
        (if ($atext | length) > 0 then [{kind: "assistant", ts: $ts, sid: $sid8, text: $atext}] else [] end)
        +
        ($tools | map(
            if .name == "AskUserQuestion" then
              {kind: "ask", ts: $ts, sid: $sid8,
               questions: (((.input | asObj).questions) | asArr | map(select(type == "object")) | map({
                 question: .question,
                 options: (.options | optionLabels),
                 multiSelect: (.multiSelect // false)
               }))}
            else
              {kind: "tool", ts: $ts, sid: $sid8, tool: .name, input: toolInputSummary(.name; .input)}
            end
          ))
      )[]
  elif ($l.type == "system" and $l.subtype == "compact_boundary") then
    {kind: "compact", ts: $ts, sid: $sid8}
  else
    empty
  end
JQEOF
)

raw=$(mktemp "${TMPDIR:-/tmp}/kentra-rpir-planning-log.XXXXXX")
missingflag="$raw.missing"
failflag="$raw.failed"
rm -f "$missingflag" "$failflag"

{
  printf '%s\n' "$planning" | while IFS=' ' read -r sid stages tpath; do
    sid8=$(printf '%s' "$sid" | cut -c1-8)
    if [ "$tpath" = "-" ] || [ ! -f "$tpath" ]; then
      jq -n -c --arg sid8 "$sid8" --arg id "$sid" --arg stages "$stages" \
        '{kind: "session", sid: $sid8, id: $id, stages: $stages, claudeCode: null, missing: true}'
      echo "kentra-rpir: transcript for $sid not found" >&2
      : > "$missingflag"
    else
      # Run jq without piping to head: a pipe would hide jq's own exit
      # status behind head's.
      verout=$(jq -R -r '(fromjson?) | objects | .version // empty' "$tpath")
      verrc=$?
      if [ "$verrc" -ne 0 ]; then
        echo "kentra-rpir: planning-log.sh: jq failed reading $tpath" >&2
        : > "$failflag"
      fi
      ver=$(printf '%s\n' "$verout" | head -n 1)
      if [ -z "$ver" ]; then
        jq -n -c --arg sid8 "$sid8" --arg id "$sid" --arg stages "$stages" \
          '{kind: "session", sid: $sid8, id: $id, stages: $stages, claudeCode: null}'
      else
        jq -n -c --arg sid8 "$sid8" --arg id "$sid" --arg stages "$stages" --arg cc "$ver" \
          '{kind: "session", sid: $sid8, id: $id, stages: $stages, claudeCode: $cc}'
      fi
      jq -R -c --arg sid8 "$sid8" "$FILTER" "$tpath"
      filterrc=$?
      if [ "$filterrc" -ne 0 ]; then
        echo "kentra-rpir: planning-log.sh: jq failed filtering $tpath" >&2
        : > "$failflag"
      fi
    fi
  done
} > "$raw"

if [ -f "$failflag" ]; then
  rm -f "$raw" "$missingflag" "$failflag"
  echo "kentra-rpir: planning-log.sh: jq failed; no planning log written" >&2
  exit 2
fi

if [ -f "$missingflag" ]; then status=3; else status=0; fi
rm -f "$missingflag"

tmp="$out.tmp"
rm -f "$tmp"
if "$here/redact.sh" < "$raw" > "$tmp"; then
  rm -f "$raw"
  mv "$tmp" "$out"
  exit "$status"
else
  rm -f "$raw" "$tmp"
  echo "kentra-rpir: planning-log.sh: redaction failed" >&2
  exit 2
fi
