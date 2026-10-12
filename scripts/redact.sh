#!/bin/sh
# redact.sh — redacts common credentials from stdin, writing the result to
# stdout. Used by planning-log.sh (2.2.5); the sed program is unchanged from
# the old hooks/capture-session.sh redact().
sed -E \
  -e 's/-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----.*-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----/[REDACTED PRIVATE KEY]/g' \
  -e 's/github_pat_[A-Za-z0-9_]{20,}/[REDACTED]/g' \
  -e 's/gh[oprsu]_[A-Za-z0-9]{20,}/[REDACTED]/g' \
  -e 's/sk-ant-[A-Za-z0-9_-]{20,}/[REDACTED]/g' \
  -e 's/(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/\1[REDACTED]/g' \
  -e 's/A[KS]IA[0-9A-Z]{16}/[REDACTED]/g' \
  -e 's/xox[abprs]-[A-Za-z0-9-]{10,}/[REDACTED]/g' \
  -e 's/glpat-[A-Za-z0-9_-]{20,}/[REDACTED]/g' \
  -e 's/npm_[A-Za-z0-9]{20,}/[REDACTED]/g' \
  -e 's/AIza[A-Za-z0-9_-]{30,}/[REDACTED]/g' \
  -e 's#Bearer [A-Za-z0-9._~+/=_-]+#Bearer [REDACTED]#g' \
  -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[REDACTED]/g' \
  -e 's/(aws_secret_access_key|AWS_SECRET_ACCESS_KEY)("?[[:space:]]*[:=][[:space:]]*"?)[^",[:space:]]+/\1\2[REDACTED]/g' \
  -e 's/([\]?"[A-Za-z0-9_]*(password|secret|token|api_key|apikey)[\]?"[[:space:]]*:[[:space:]]*[\]?")[^"\\]*([\]?")/\1[REDACTED]\3/g' \
  -e 's#([A-Za-z][A-Za-z0-9+.-]*://)[^/@[:space:]"\]+@#\1[REDACTED]@#g'
