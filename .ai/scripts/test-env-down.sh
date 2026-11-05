#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2) -- teardown half
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-11-05 generated: stops the app pid, removes the Docker container or drops the database the up script
#              created on TEST_DATABASE_URL, marks the descriptor "stopped"; safe to run twice
set -eu

# Usage: sh .ai/scripts/test-env-down.sh
# Stops exactly what test-env-up.sh recorded in the descriptor; never touches anything else.

QA_DIR=".ai/qa"
ENV_DESCRIPTOR="$QA_DIR/test-env.json"
LOCK_DIR="$QA_DIR/test-env.lock"

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
log() { echo "test-env-down: $*" >&2; }

if [ ! -f "$ENV_DESCRIPTOR" ]; then
  log "no descriptor: nothing to stop"
  echo "TEST_ENV_STATUS=stopped"
  exit 0
fi

# status pid container source database credentialsFile startedByThisRepo (space separated, "-" when empty)
set -- $(node -e '
  const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const s = (d.services || [])[0] || {};
  const f = (v) => (v === undefined || v === null || v === "" || v === false ? "-" : String(v));
  console.log([d.status, d.app && d.app.pid, s.container, s.source, s.database, d.credentialsFile, d.startedByThisRepo].map(f).join(" "));
' "$ENV_DESCRIPTOR")
status=$1 pid=$2 container=$3 source=$4 database=$5 credfile=$6 mine=$7

if [ "$mine" = "-" ]; then
  log "this repo did not start the recorded environment: leaving it alone"
  exit 0
fi
if [ "$status" = stopped ]; then
  log "already stopped"
  echo "TEST_ENV_STATUS=stopped"
  exit 0
fi

# 1. the app: only a live pid that is really a next server
if [ "$pid" != "-" ] && kill -0 "$pid" 2>/dev/null && ps -p "$pid" -o command= 2>/dev/null | grep -q 'next'; then
  kill "$pid" 2>/dev/null || true
  i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 20 ]; do i=$((i + 1)); sleep 0.5 2>/dev/null || sleep 1; done
  if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null || true; fi
  log "app stopped (pid $pid)"
fi

# 2. the database: the container, or the one database created on TEST_DATABASE_URL
failed=0
if [ "$container" != "-" ]; then
  case "$container" in wm-qa-pg-[0-9a-f]*) ;; *) log "unexpected container name, not touching it"; failed=1 ;; esac
  if [ "$failed" = 0 ] && command -v docker >/dev/null 2>&1; then
    docker rm -f "$container" >/dev/null 2>&1 || true
    log "container $container removed"
  fi
elif [ "$source" = TEST_DATABASE_URL ] && [ "$database" != "-" ]; then
  case "$database" in winematch_qa_[0-9a-f]*) ;; *) log "unexpected database name, not touching it"; failed=1 ;; esac
  if [ "$failed" = 0 ]; then
    if [ -z "${TEST_DATABASE_URL:-}" ]; then
      log "TEST_DATABASE_URL is not set: cannot drop database $database; set it and run this script again"
      failed=1
    elif ACTION=drop ADMIN_URL="$TEST_DATABASE_URL" DB_NAME="$database" node -e '
      const pg = require("pg");
      const { ADMIN_URL, DB_NAME } = process.env;
      if (!/^winematch_qa_[0-9a-f]+$/.test(DB_NAME)) process.exit(2);
      (async () => {
        const c = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 3000 });
        await c.connect();
        try { await c.query("drop database if exists \"" + DB_NAME + "\" with (force)"); } finally { await c.end(); }
      })().catch((e) => { console.error(String(e.message || e).replace(/postgres(ql)?:\/\/\S+/g, "<url>")); process.exit(1); });
    ' >&2; then
      log "database $database dropped"
    else
      log "could not drop database $database; run this script again"
      failed=1
    fi
  fi
fi
[ "$failed" = 0 ] || exit 1

# 3. lock (only when it belongs to the environment or its owner is gone) and the credentials file
if [ -d "$LOCK_DIR" ]; then
  lp=$(sed -n 's/.*"pid": *\([0-9][0-9]*\).*/\1/p' "$LOCK_DIR/owner.json" 2>/dev/null || true)
  ls_=$(sed -n 's/.*"source": *"\([^"]*\)".*/\1/p' "$LOCK_DIR/owner.json" 2>/dev/null || true)
  if [ "$ls_" = environment ] || [ -z "$lp" ] || ! kill -0 "$lp" 2>/dev/null; then rm -rf "$LOCK_DIR"; fi
fi
case "$credfile" in "$QA_DIR"/*) rm -f "$ROOT/$credfile" ;; esac

# 4. mark the descriptor stopped
node -e '
  const fs = require("fs");
  const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  d.status = "stopped";
  d.stoppedAt = new Date().toISOString();
  if (d.app) d.app.pid = null;
  fs.writeFileSync(process.argv[1], JSON.stringify(d, null, 2) + "\n");
' "$ENV_DESCRIPTOR"
echo "TEST_ENV_STATUS=stopped"
