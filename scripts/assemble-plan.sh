#!/bin/sh
# assemble-plan.sh — builds plan.yaml from the plan stage's draft fragments:
#   <draft>/head.yaml              plan-level fields, ending with "milestones:"
#   <draft>/milestones/*.yaml      one milestone list item each, in name order
#   <draft>/tail.yaml              optional: the # premises: and # writerGaps: blocks
# Every file is copied line by line with awk, so a fragment missing its final
# newline still ends its own line. POSIX sh.
#
#   assemble-plan.sh <draft dir> <out plan.yaml>
set -u

if [ $# -ne 2 ]; then
  echo "usage: assemble-plan.sh <draft dir> <out plan.yaml>" >&2
  exit 2
fi
draft=$1
out=$2

if [ ! -f "$draft/head.yaml" ]; then
  echo "kentra-rpir: $draft/head.yaml is missing" >&2
  exit 1
fi
if [ "$(awk 'NF { last = $0 } END { print last }' "$draft/head.yaml")" != "milestones:" ]; then
  echo "kentra-rpir: $draft/head.yaml must end with a line \"milestones:\"" >&2
  exit 1
fi
set -- "$draft"/milestones/*.yaml
if [ ! -f "$1" ]; then
  echo "kentra-rpir: no milestone fragments in $draft/milestones/" >&2
  exit 1
fi

tmp="$out.tmp.$$"
{
  awk 1 "$draft/head.yaml"
  for f in "$@"; do awk 1 "$f"; done
  if [ -f "$draft/tail.yaml" ]; then awk 1 "$draft/tail.yaml"; fi
} > "$tmp" || { rm -f "$tmp"; exit 1; }
mv "$tmp" "$out"
