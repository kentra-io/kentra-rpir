#!/bin/sh
# Tests for scripts/planning-log.sh. POSIX sh; run from the repo root.
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
script="$here/scripts/planning-log.sh"
fails=0
check() { # check <description> <command...>
  desc=$1; shift
  if "$@"; then echo "ok   - $desc"; else echo "FAIL - $desc"; fails=$((fails + 1)); fi
}
checkeq() { # checkeq <description> <actual> <expected>
  desc=$1; actual=$2; expected=$3
  if [ "$actual" = "$expected" ]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc (got [$actual], want [$expected])"
    fails=$((fails + 1))
  fi
}

root=$(mktemp -d "${TMPDIR:-/tmp}/rpir-planning-log.XXXXXX")
trap 'rm -rf "$root"' EXIT
export CLAUDE_CONFIG_DIR="$root/claude"

register() { # register <project> <sid> <change> <stage>
  mkdir -p "$1/.kentra-rpir"
  printf '%s %s %s\n' "$2" "$3" "$4" >> "$1/.kentra-rpir/sessions.map"
}
transcript_path() { # transcript_path <project> <sid> -> prints the path a direct slug lookup would use
  slug=$(printf '%s' "$1" | sed 's/[^A-Za-z0-9]/-/g')
  mkdir -p "$CLAUDE_CONFIG_DIR/projects/$slug"
  printf '%s\n' "$CLAUDE_CONFIG_DIR/projects/$slug/$2.jsonl"
}

# =========================================================================
# Scenario A: one session, every transcript line kind, redaction.
# =========================================================================

projA="$root/projA"
changeA=docs/changes/2026-10-11-demoA
sidMain=aaaaaaaa-1111-1111-1111-111111111111
register "$projA" "$sidMain" "$changeA" spec
tA=$(transcript_path "$projA" "$sidMain")

# Fixture key shapes are assembled at run time so the source holds no literal
# credential pattern (GitHub push protection rejects them, even fake ones).
unmask() {
  sed -e "s|@AKIA@|AK""IA|g" -e "s|@ASIA@|AS""IA|g" -e "s|@WJAL@|wJalrXUtnFEMI""/K7MDENG/bPxRfiCY|g"
}
unmask > "$tA" <<'JSONL'
{"type":"user","timestamp":"2026-10-12T09:01:00Z","version":"2.1.301","isSidechain":false,"message":{"role":"user","content":"token ghp_abcdefghijklmnopqrstuvwxyz0123456789 and sk-ant-api03-abcdefghijklmnopqrstuv and @AKIA@ABCDEFGHIJKLMNOP and xoxb-1234567890-abcdef and github_pat_11ABCDEFG0123456789_abcdefghijk and ghr_1234567890abcdefghijklmnopqrstuvwxyz and @ASIA@ABCDEFGHIJKLMNOP and aws_secret_access_key = @WJAL@EXAMPLE and export AWS_SECRET_ACCESS_KEY=@WJAL@EXAMPLE2 and plain text stays and disk-7f9a2b4c1d3e5f6a8b9c0d1e2f3a4b5c mounted and risk-3f9a2b4c1d3e5f6a8b9c0d1e2f3a4b5c noted and boundary1 {\"a\":\"http://h\",\"b\":{\"c\":\"u@x\"}} and boundary2 {\"a\":\"http://localhost:8080\",\"b\":\"me@x.com\"}"}}
{"type":"user","isMeta":true,"timestamp":"2026-10-12T09:01:05Z","isSidechain":false,"message":{"role":"user","content":"meta text should not appear anywhere"}}
{"type":"user","isSidechain":true,"timestamp":"2026-10-12T09:01:06Z","message":{"role":"user","content":"sidechain text should not appear anywhere"}}
{"type":"user","timestamp":"2026-10-12T09:01:07Z","isSidechain":false,"message":{"role":"user","content":[{"type":"text","text":"<system-reminder>ignore this reminder text</system-reminder>"}]}}
{"type":"assistant","timestamp":"2026-10-12T09:01:10Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"thinking","thinking":"secret chain of thought should not appear anywhere"},{"type":"text","text":"Research verified glpat-AbCdEfGhIjKlMnOpQrSt and npm_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 and AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz01234567 and url https://alice:p4ssw0rd@example.com/repo.git and url https://bob:pw@host/repo.git and Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U and raw jwt eyJhbGciOiJIUzI1NiJ9.eyJuYW1lIjoiSmFuIn0.4Qz9fKslVQ5sm_WAMFl2itgdAXERFTIsSwPKaSsJYEo and {\"password\":\"sup3rSecretPW!\"} and nested \"secret\":\"sup3rSecretPW2!\" and \"token\":\"tok12345value\" and \"api_key\":\"apikeyvalue123\" and {\"client_secret\":\"cs_abcdef123456\",\"access_token\":\"at_abcdef123456\",\"refresh_token\":\"rt_abcdef123456\",\"input_tokens\":123} and key block -----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA=\n-----END OPENSSH PRIVATE KEY----- and pgp -----BEGIN PGP PRIVATE KEY BLOCK-----\nxVgEZ-abc123==\n-----END PGP PRIVATE KEY BLOCK-----"}]}}
{"type":"assistant","timestamp":"2026-10-12T09:01:20Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls -la /tmp","description":"List files"}}]}}
{"type":"assistant","timestamp":"2026-10-12T09:01:21Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"/p/greet.sh"}}]}}
{"type":"user","timestamp":"2026-10-12T09:01:22Z","isSidechain":false,"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t2","content":"file contents here, tool_result marker"}]}}
{"type":"assistant","timestamp":"2026-10-12T09:01:25Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"tool_use","id":"t3","name":"AskUserQuestion","input":{"questions":[{"question":"Can both flags be given at once?","header":"Flags","multiSelect":false,"options":[{"label":"Yes, compose (Recommended)","description":"d1"},{"label":"No, error","description":"d2"}]}]}}]}}
{"type":"user","timestamp":"2026-10-12T09:01:40Z","isSidechain":false,"toolUseResult":{"answers":{"Can both flags be given at once?":"Yes, compose (Recommended)"}},"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t3","content":"answered"}]}}
{"type":"attachment","timestamp":"2026-10-12T09:01:41Z","note":"should not appear anywhere"}
{"type":"file-history-snapshot","timestamp":"2026-10-12T09:01:42Z","note":"should not appear anywhere"}
{"type":"system","subtype":"compact_boundary","timestamp":"2026-10-12T09:02:00Z"}
not valid json {{{
JSONL

# The session's own directory (2.1.3) is the transcript path without
# .jsonl, NOT the slug directory it lives in.
mkdir -p "${tA%.jsonl}/subagents"
echo '{"type":"user","message":{"role":"user","content":"SUBAGENT_SENTINEL_TEXT ghp_zyxwvutsrqponmlkjihgfedcba9876543210"}}' \
  > "${tA%.jsonl}/subagents/agent-a1.jsonl"

outA="$projA/$changeA/planning-log.jsonl"
mkdir -p "$(dirname "$outA")"
sh "$script" --project "$projA" --change "$changeA" --out "$outA"
rcA=$?
checkeq "scenario A exits 0" "$rcA" "0"
check "scenario A: output file written" test -f "$outA"
check "scenario A: no .tmp left behind" test ! -e "$outA.tmp"

check "every output line parses with jq" sh -c "while IFS= read -r l; do printf '%s' \"\$l\" | jq -e . >/dev/null || exit 1; done < '$outA'"

kinds=$(jq -r '.kind' "$outA")
checkeq "one session header" "$(printf '%s\n' "$kinds" | grep -c '^session$')" "1"
checkeq "one user entry" "$(printf '%s\n' "$kinds" | grep -c '^user$')" "1"
checkeq "one assistant entry" "$(printf '%s\n' "$kinds" | grep -c '^assistant$')" "1"
checkeq "two tool entries" "$(printf '%s\n' "$kinds" | grep -c '^tool$')" "2"
checkeq "one ask entry" "$(printf '%s\n' "$kinds" | grep -c '^ask$')" "1"
checkeq "one answer entry" "$(printf '%s\n' "$kinds" | grep -c '^answer$')" "1"
checkeq "one compact entry" "$(printf '%s\n' "$kinds" | grep -c '^compact$')" "1"

check "Bash tool input is its description" sh -c "jq -e 'select(.kind==\"tool\" and .tool==\"Bash\") | .input==\"List files\"' '$outA' | grep -qx true"
check "Read tool input is the path" sh -c "jq -e 'select(.kind==\"tool\" and .tool==\"Read\") | .input==\"/p/greet.sh\"' '$outA' | grep -qx true"
check "ask options are labels" sh -c "jq -e 'select(.kind==\"ask\") | .questions[0].options==[\"Yes, compose (Recommended)\",\"No, error\"]' '$outA' | grep -qx true"
check "answer carries the answers object" sh -c "jq -e 'select(.kind==\"answer\") | .answers[\"Can both flags be given at once?\"]==\"Yes, compose (Recommended)\"' '$outA' | grep -qx true"
check "session header carries claudeCode" sh -c "jq -e 'select(.kind==\"session\") | .claudeCode==\"2.1.301\"' '$outA' | grep -qx true"
checkeq "every tool.input is <= 200 characters" \
  "$(jq -r 'select(.kind=="tool") | .input | length' "$outA" | awk '$1>200{c++} END{print c+0}')" "0"

checkeq "dropped: tool_result marker count" "$(grep -c 'tool_result' "$outA")" "0"
checkeq "dropped: thinking text" "$(grep -c 'secret chain of thought' "$outA")" "0"
checkeq "dropped: system-reminder text" "$(grep -c 'ignore this reminder text' "$outA")" "0"
checkeq "dropped: file-history-snapshot marker" "$(grep -c 'file-history-snapshot' "$outA")" "0"
checkeq "dropped: isMeta text" "$(grep -c 'meta text should not appear' "$outA")" "0"
checkeq "dropped: isSidechain text" "$(grep -c 'sidechain text should not appear' "$outA")" "0"
checkeq "dropped: attachment marker" "$(grep -c 'should not appear anywhere' "$outA")" "0"
checkeq "no subagent content" "$(grep -c 'SUBAGENT_SENTINEL_TEXT' "$outA")" "0"

for secret in \
  ghp_abcdef sk-ant-api03 AKIAABCDEF xoxb-1234 github_pat_11 \
  ghr_123456789 ASIAABCDEF 'wJalrXUtnFEMI' \
  'eyJhbGciOiJIUzI1NiJ9' 'dozjgNryP4J3' '4Qz9fKslVQ5sm' \
  'sup3rSecretPW!' 'sup3rSecretPW2!' tok12345value apikeyvalue123 \
  'xVgEZ-abc123' 'glpat-AbCdEf' 'npm_AbCdEfGh' 'AIzaSyAbCdEf' p4ssw0rd pw \
  cs_abcdef123456 at_abcdef123456 rt_abcdef123456 'b3BlbnNzaC1r' \
  'bPxRfiCYEXAMPLE2'; do
  check "redacted $secret" sh -c "! grep -q '$secret' '$outA'"
done
check "redaction marker present" grep -q 'REDACTED' "$outA"
check "pgp redaction marker present" grep -q 'REDACTED PRIVATE KEY' "$outA"
check "url credential redacted" sh -c "grep -q 'REDACTED\]@example.com' '$outA'"
check "second url credential redacted" sh -c "grep -q 'REDACTED\]@host' '$outA'"
check "disk- false positive preserved" grep -q 'disk-7f9a2b4c1d3e5f6a8b9c0d1e2f3a4b5c' "$outA"
check "risk- false positive preserved" grep -q 'risk-3f9a2b4c1d3e5f6a8b9c0d1e2f3a4b5c' "$outA"
check "url rule does not cross a JSON string boundary (bare host)" \
  grep -qF '{\"a\":\"http://h\",\"b\":{\"c\":\"u@x\"}}' "$outA"
check "url rule does not cross a JSON string boundary (port + sibling email)" \
  grep -qF '{\"a\":\"http://localhost:8080\",\"b\":\"me@x.com\"}' "$outA"
check "input_tokens numeric value left untouched" grep -qF 'input_tokens\":123' "$outA"
check "plain text kept" grep -q 'plain text stays' "$outA"

# =========================================================================
# Scenario B: session grouping and ordering across the map.
# =========================================================================

projB="$root/projB"
changeB=docs/changes/2026-10-11-demoB
sidX=bbbbbbbb-1111-1111-1111-111111111111
sidY=bbbbbbbb-2222-2222-2222-222222222222
sidZ=bbbbbbbb-3333-3333-3333-333333333333
sidW=bbbbbbbb-4444-4444-4444-444444444444

register "$projB" "$sidX" "$changeB" spec
register "$projB" "$sidY" "$changeB" plan
register "$projB" "$sidZ" "$changeB" spec
register "$projB" "$sidW" "$changeB" review
register "$projB" "$sidZ" "$changeB" plan

for s in "$sidX" "$sidY" "$sidZ" "$sidW"; do
  tp=$(transcript_path "$projB" "$s")
  printf '{"type":"user","timestamp":"2026-10-12T09:00:00Z","version":"2.2.1","message":{"role":"user","content":"hello from %s"}}\n' "$s" > "$tp"
done

outB="$projB/$changeB/planning-log.jsonl"
mkdir -p "$(dirname "$outB")"
sh "$script" --project "$projB" --change "$changeB" --out "$outB"
rcB=$?
checkeq "scenario B exits 0" "$rcB" "0"

ids=$(jq -r 'select(.kind=="session") | .id' "$outB")
checkeq "two single-stage sessions + one dual-stage session, in map order" \
  "$ids" "$(printf '%s\n%s\n%s' "$sidX" "$sidY" "$sidZ")"
checkeq "sidX stage" "$(jq -r --arg id "$sidX" 'select(.kind=="session" and .id==$id) | .stages' "$outB")" "spec"
checkeq "sidY stage" "$(jq -r --arg id "$sidY" 'select(.kind=="session" and .id==$id) | .stages' "$outB")" "plan"
checkeq "sidZ joined stages" "$(jq -r --arg id "$sidZ" 'select(.kind=="session" and .id==$id) | .stages' "$outB")" "spec+plan"
checkeq "a review-only session is not included" "$(jq -r --arg id "$sidW" 'select(.id==$id)' "$outB")" ""

# =========================================================================
# Scenario C: a missing transcript is reported, not fatal; the other
# session's entries are still written.
# =========================================================================

projC="$root/projC"
changeC=docs/changes/2026-10-11-demoC
sidMissing=cccccccc-1111-1111-1111-111111111111
sidOk=cccccccc-2222-2222-2222-222222222222

register "$projC" "$sidMissing" "$changeC" plan
register "$projC" "$sidOk" "$changeC" spec
tOk=$(transcript_path "$projC" "$sidOk")
echo '{"type":"user","timestamp":"2026-10-12T09:00:00Z","message":{"role":"user","content":"kept line for sidOk"}}' > "$tOk"
# sidMissing is registered but no transcript file exists anywhere for it.

outC="$projC/$changeC/planning-log.jsonl"
mkdir -p "$(dirname "$outC")"
errC=$(sh "$script" --project "$projC" --change "$changeC" --out "$outC" 2>&1 1>/dev/null)
rcC=$?
checkeq "scenario C exits 3 (missing transcript)" "$rcC" "3"
check "scenario C: stderr names the missing session" sh -c "printf '%s' \"$errC\" | grep -q '$sidMissing'"
check "scenario C: output file still written" test -f "$outC"
check "scenario C: missing session entry has missing:true" \
  sh -c "jq -e --arg id '$sidMissing' 'select(.kind==\"session\" and .id==\$id) | .missing==true' '$outC' | grep -qx true"
check "scenario C: the other session's entries are still written" \
  grep -q 'kept line for sidOk' "$outC"
check "scenario C: no .tmp left behind" test ! -e "$outC.tmp"

# =========================================================================
# Scenario D: no spec/plan session registered for the change.
# =========================================================================

projD="$root/projD"
changeD=docs/changes/2026-10-11-demoD
mkdir -p "$projD/$changeD" "$projD/.kentra-rpir"
sidReviewOnly=dddddddd-1111-1111-1111-111111111111
register "$projD" "$sidReviewOnly" "$changeD" review

outD="$projD/$changeD/planning-log.jsonl"
sh "$script" --project "$projD" --change "$changeD" --out "$outD" >/dev/null 2>&1
rcD=$?
checkeq "scenario D (no planning session) exits 2" "$rcD" "2"
check "scenario D: no file written" test ! -e "$outD"
check "scenario D: no .tmp left behind" test ! -e "$outD.tmp"

# Also: no sessions.map at all.
projD2="$root/projD2"
changeD2=docs/changes/2026-10-11-demoD2
mkdir -p "$projD2/$changeD2"
outD2="$projD2/$changeD2/planning-log.jsonl"
sh "$script" --project "$projD2" --change "$changeD2" --out "$outD2" >/dev/null 2>&1
rcD2=$?
checkeq "scenario D2 (no map at all) exits 2" "$rcD2" "2"
check "scenario D2: no file written" test ! -e "$outD2"
check "scenario D2: no .tmp left behind" test ! -e "$outD2.tmp"

# =========================================================================
# Scenario E: a jq failure while building the log leaves no output file
# and no .tmp, and is reported as a non-zero exit. Simulated with a
# PATH-shimmed jq that fails only the main filter invocation (the one
# called with both -R and -c), so the session-header jq -n calls and the
# version-probe jq -R -r call still succeed.
# =========================================================================

realjq=$(command -v jq)
shimdir="$root/shim-bin"
mkdir -p "$shimdir"
cat > "$shimdir/jq" <<'SHIMEOF'
#!/bin/sh
has_R=0; has_c=0
for a in "$@"; do
  case "$a" in
    -R) has_R=1 ;;
    -c) has_c=1 ;;
  esac
done
if [ "$has_R" -eq 1 ] && [ "$has_c" -eq 1 ]; then
  echo "fake-jq: simulated failure" >&2
  exit 1
fi
exec "$REAL_JQ" "$@"
SHIMEOF
chmod +x "$shimdir/jq"

projE="$root/projE"
changeE=docs/changes/2026-10-11-demoE
sidE=eeeeeeee-1111-1111-1111-111111111111
register "$projE" "$sidE" "$changeE" spec
tE=$(transcript_path "$projE" "$sidE")
echo '{"type":"user","timestamp":"2026-10-12T09:00:00Z","message":{"role":"user","content":"hello"}}' > "$tE"

outE="$projE/$changeE/planning-log.jsonl"
mkdir -p "$(dirname "$outE")"
REAL_JQ="$realjq" PATH="$shimdir:$PATH" sh "$script" --project "$projE" --change "$changeE" --out "$outE" >/dev/null 2>"$root/scenario-e-stderr"
rcE=$?
checkeq "scenario E (jq failure) exits exactly 2" "$rcE" "2"
check "scenario E: no output file written" test ! -e "$outE"
check "scenario E: no .tmp left behind" test ! -e "$outE.tmp"

# =========================================================================
# Scenario F: 2.2.3's lenient reading must survive well-formed JSON of an
# unexpected shape, even on the LAST line of the transcript (jq can raise a
# runtime error — not just skip via fromjson? — on a shape it did not
# expect; that must never abort the whole run). Exit 0, earlier kept
# entries still written.
# =========================================================================

projF="$root/projF"
changeF=docs/changes/2026-10-11-demoF
sidF=ffffffff-1111-1111-1111-111111111111
register "$projF" "$sidF" "$changeF" spec
tF=$(transcript_path "$projF" "$sidF")

cat > "$tF" <<'JSONL'
{"type":"user","timestamp":"2026-10-12T09:00:00Z","message":{"role":"user","content":"an ordinary kept line"}}
{"type":"assistant","timestamp":"2026-10-12T09:00:01Z","message":{"role":"assistant","content":"odd: assistant content is a bare string, not a block array"}}
{"type":"user","timestamp":"2026-10-12T09:00:02Z","message":{"role":"user","content":[{"type":"text","text":null}]}}
{"type":"assistant","timestamp":"2026-10-12T09:00:03Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"t9","name":"Bash","input":{"command":"ls","description":12345}}]}}
"just a bare JSON string, not an object"
JSONL

outF="$projF/$changeF/planning-log.jsonl"
mkdir -p "$(dirname "$outF")"
sh "$script" --project "$projF" --change "$changeF" --out "$outF" >/dev/null 2>"$root/scenario-f-stderr"
rcF=$?
checkeq "scenario F (odd-but-valid shapes, including on the last line) exits 0" "$rcF" "0"
check "scenario F: output file written" test -f "$outF"
check "scenario F: no .tmp left behind" test ! -e "$outF.tmp"
check "scenario F: every output line parses with jq" \
  sh -c "while IFS= read -r l; do printf '%s' \"\$l\" | jq -e . >/dev/null || exit 1; done < '$outF'"
check "scenario F: the earlier ordinary line is still kept" grep -q 'an ordinary kept line' "$outF"
check "scenario F: the odd Bash description is coerced to a string, not dropped" \
  sh -c "jq -e 'select(.kind==\"tool\" and .tool==\"Bash\") | .input==\"12345\"' '$outF' | grep -qx true"
checkeq "scenario F: the string-content assistant line yields no assistant entry" \
  "$(jq -r 'select(.kind=="assistant")' "$outF")" ""
checkeq "scenario F: the null-text user block yields no extra user entry (only the ordinary line's)" \
  "$(jq -c 'select(.kind=="user")' "$outF" | wc -l | tr -d ' ')" "1"

[ "$fails" -eq 0 ] && echo "all planning-log tests passed"
exit "$fails"
