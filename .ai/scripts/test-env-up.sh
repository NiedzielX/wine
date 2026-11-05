#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-11-05 generated (cold 22s incl. build, warm 1s reuse): disposable PostgreSQL (Docker postgres:16, else a fresh database on TEST_DATABASE_URL),
#              real migrations + demo seed + second restaurant (as e2e global-setup), BUILT app on a free port
set -eu

# Usage: sh .ai/scripts/test-env-up.sh [--force] [--force-rebuild]
# Result lines (stdout): TEST_ENV_STATUS, TEST_ENV_BASE_URL, TEST_ENV_DESCRIPTOR, TEST_ENV_REUSED,
#   TEST_ENV_DATABASE (docker | TEST_DATABASE_URL), BROWSER_PROVIDER, BROWSER_INSTALLED.
# Stop it with: sh .ai/scripts/test-env-down.sh

# ---------------------------------------------------------------------------
# Project-specific variables (tweak here, not in the logic below)
# ---------------------------------------------------------------------------
QA_DIR=".ai/qa"
UP_SCRIPT=".ai/scripts/test-env-up.sh"
DOWN_SCRIPT=".ai/scripts/test-env-down.sh"
ENV_DESCRIPTOR="$QA_DIR/test-env.json"
BUILD_CACHE="$QA_DIR/test-env-build-cache.json"
CREDENTIALS_FILE="$QA_DIR/test-env.env"
APP_LOG="$QA_DIR/test-env-app.log"
LOCK_DIR="$QA_DIR/test-env.lock"
BROWSER_PROVIDER="agent-browser"
BROWSER_FILE=".ai/browsers/agent-browser.md"

PG_IMAGE="postgres:16"                              # the repo targets PostgreSQL >= 16
DB_PREFIX="winematch_qa_"                           # database name = prefix + run id
APP_DIR="packages/app"
NEXT_BIN="node_modules/next/dist/bin/next"          # run node directly: one process, one pid
HEALTH_PATH="/api/v1/public/restaurants/halka/menu" # same readiness path as the e2e harness
GUEST_PATH="/r/halka"
MIGRATE_CMD="npm run migration:up -w @wine-match/db"
SEED_CMD="npm run seed -w @wine-match/db"
BUILD_CMD="npm run build"
TTL_SECONDS="${TEST_ENV_CACHE_TTL_SECONDS:-600}"

# build cache (see references/build-cache.md): the three project-specific lists
BUILD_INPUTS="packages package.json package-lock.json scripts tsconfig.base.json"
BUILD_ENV_VARS="NODE_ENV"
ARTIFACTS="packages/app/.next/BUILD_ID"

# ---------------------------------------------------------------------------
# Logic
# ---------------------------------------------------------------------------
FORCE=0
FORCE_REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --force-rebuild) FORCE_REBUILD=1 ;;
    *) echo "test-env-up: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
mkdir -p "$QA_DIR"

START_EPOCH=$(date +%s)
utc_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "test-env-up: $*" >&2; }
die() { echo "test-env-up: ERROR: $*" >&2; exit 1; }

case "$(uname -s 2>/dev/null || echo unknown)" in
  Linux*) if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then PLATFORM=wsl2; else PLATFORM=linux; fi ;;
  Darwin*) PLATFORM=darwin ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=win32 ;;
  *) PLATFORM=unknown ;;
esac

command -v node >/dev/null 2>&1 || die "node is required (see .nvmrc)"
[ -d node_modules ] || [ -f package-lock.json ] || die "run from a checkout with package-lock.json"

free_port() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
  elif command -v python >/dev/null 2>&1; then
    python -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
  elif command -v node >/dev/null 2>&1; then
    node -e 's=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
  else
    awk 'BEGIN{srand();print 20000+int(rand()*20000)}'
  fi
}

http_code() {
  if command -v curl >/dev/null 2>&1; then
    curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H 'x-wine-match-synthetic: 1' "$1" 2>/dev/null || true
  else
    node -e 'fetch(process.argv[1],{headers:{"x-wine-match-synthetic":"1"},signal:AbortSignal.timeout(5000)}).then(r=>process.stdout.write(String(r.status)),()=>process.stdout.write("000"))' "$1"
  fi
}

# ---- build cache (generic; only the three lists above are project-specific) ----
if stat -c '%s' / >/dev/null 2>&1; then
  fp_file() { stat -c '%s:%Y' "$1" 2>/dev/null; }   # GNU (Linux, WSL2, Git Bash)
else
  fp_file() { stat -f '%z:%m' "$1" 2>/dev/null; }   # BSD (macOS)
fi

# Tracked build input files; extra find predicates (e.g. -newer FILE) can be appended.
list_inputs() {
  for p in $BUILD_INPUTS; do
    if [ -d "$p" ]; then
      find "$p" \( -name node_modules -o -name .next -o -name dist -o -name .git -o -name .cache -o -name coverage \
                   -o -name test-results -o -name storybook-static -o -path 'packages/*/tests' \) -prune -o \
        -type f ! -name '*.tsbuildinfo' ! -name next-env.d.ts ! -name '.snapshot-*' ! -name AGENTS.md ! -name CLAUDE.md "$@" -print
    elif [ -f "$p" ]; then
      find "$p" -type f "$@" -print
    fi
  done
}

fingerprint() {
  {
    list_inputs | LC_ALL=C sort | while IFS= read -r f; do printf '%s:%s\n' "$f" "$(fp_file "$f")"; done
    for v in $BUILD_ENV_VARS; do eval "printf 'env:%s=%s\n' \"$v\" \"\${$v:-}\""; done
  } | cksum | awk '{print $1"-"$2}'
}

build_needed() {
  [ "$FORCE_REBUILD" = 1 ] && return 0
  [ -f "$BUILD_CACHE" ] || return 0
  CACHED_FP=$(sed -n 's/.*"sourceFingerprint": *"\([^"]*\)".*/\1/p' "$BUILD_CACHE")
  CACHED_ROOT=$(sed -n 's/.*"projectRoot": *"\([^"]*\)".*/\1/p' "$BUILD_CACHE")
  [ -n "$CACHED_FP" ] || return 0
  [ "$CACHED_FP" = "$(fingerprint)" ] || return 0
  [ "$CACHED_ROOT" = "$(pwd)" ] || return 0          # a worktree never inherits another checkout's cache
  for a in $ARTIFACTS; do [ -s "$a" ] || [ -d "$a" ] || return 0; done
  return 1
}

# ---- descriptor helpers (node: always present in this repo; no jq dependency) ----
# prints: status pid baseUrl ageSeconds credUser credPasswordEnv (space separated; "-" when empty)
read_descriptor() {
  node -e '
    const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const c = (d.credentials || [])[0] || {};
    const age = d.startedAt ? Math.floor((Date.now() - Date.parse(d.startedAt)) / 1000) : 999999;
    const f = (v) => (v === undefined || v === null || v === "" ? "-" : String(v));
    console.log([d.status, d.app && d.app.pid, d.baseUrl, age, c.username, c.passwordEnv].map(f).join(" "));
  ' "$ENV_DESCRIPTOR" 2>/dev/null
}

pid_is_next() {
  [ -n "$1" ] && kill -0 "$1" 2>/dev/null && ps -p "$1" -o command= 2>/dev/null | grep -q 'next'
}

# Unauthenticated app shell + API, then one authenticated round trip (password never leaves this run).
probe_all() { # $1 baseUrl  $2 user  $3 password variable name ("-" to skip the login probe)
  [ "$(http_code "$1$GUEST_PATH")" = 200 ] || return 1
  [ "$(http_code "$1$HEALTH_PATH")" = 200 ] || return 1
  [ "$3" = "-" ] && return 0
  [ -f "$CREDENTIALS_FILE" ] || return 1
  case "$3" in TEST_[A-Z0-9_]*) ;; *) return 1 ;; esac
  code=$(
    # shellcheck disable=SC1090
    . "$ROOT/$CREDENTIALS_FILE"
    eval "pw=\${$3:-}"
    printf '{"email":"%s","password":"%s"}' "$2" "$pw" |
      curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'content-type: application/json' \
        -H 'x-wine-match-synthetic: 1' --data-binary @- "$1/api/v1/auth/login" 2>/dev/null || true
  )
  [ "$code" = 200 ]
}

report() { # $1 reused(0|1)  $2 baseUrl  $3 db source  $4 browser installed
  echo "TEST_ENV_STATUS=running"
  echo "TEST_ENV_BASE_URL=$2"
  echo "TEST_ENV_DESCRIPTOR=$ENV_DESCRIPTOR"
  echo "TEST_ENV_REUSED=$1"
  echo "TEST_ENV_DATABASE=$3"
  echo "BROWSER_PROVIDER=$BROWSER_PROVIDER"
  echo "BROWSER_INSTALLED=$4"
}

# ---- lock: one bootstrap at a time; handed to the app pid for the environment's lifetime ----
OWN_LOCK=0
HANDOFF=0
lock_owner() { # prints "<pid> <source>" or "- -"
  p=$(sed -n 's/.*"pid": *\([0-9][0-9]*\).*/\1/p' "$LOCK_DIR/owner.json" 2>/dev/null || true)
  s=$(sed -n 's/.*"source": *"\([^"]*\)".*/\1/p' "$LOCK_DIR/owner.json" 2>/dev/null || true)
  echo "${p:--} ${s:--}"
}
# mode "peek": return also when a RUNNING ENVIRONMENT holds the lock (reuse check follows);
# mode "strict": only return once this process owns the lock.
acquire_lock() {
  waited=0
  blank=0
  while :; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      printf '{"pid":%s,"source":"bootstrap","acquiredAt":"%s"}\n' "$$" "$(utc_now)" > "$LOCK_DIR/owner.json"
      OWN_LOCK=1
      return 0
    fi
    set -- $(lock_owner)
    owner_pid=$1
    owner_src=$2
    if [ "$owner_pid" = "-" ]; then
      blank=$((blank + 1))                       # owner.json not written yet, or damaged
      if [ "$blank" -gt 5 ]; then rm -rf "$LOCK_DIR"; blank=0; fi
      sleep 1
      continue
    fi
    if ! kill -0 "$owner_pid" 2>/dev/null; then
      log "removing stale lock (pid $owner_pid is gone)"
      rm -rf "$LOCK_DIR"
      continue
    fi
    if [ "$owner_src" = "environment" ] && [ "${LOCK_MODE:-strict}" = "peek" ]; then
      return 0
    fi
    waited=$((waited + 1))
    if [ "$waited" -gt 300 ]; then
      [ "${LOCK_MODE:-strict}" = "peek" ] && return 0
      die "another bootstrap (pid $owner_pid) held $LOCK_DIR for 5 minutes"
    fi
    sleep 1
  done
}

# ---- rollback of a half-started environment (nothing is recorded in the descriptor yet) ----
STARTED_PID=""
STARTED_CONTAINER=""
STARTED_DB=""
DB_SOURCE=""
ADMIN_URL=""
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [ "$HANDOFF" != 1 ]; then
    if [ -n "$STARTED_PID" ]; then kill "$STARTED_PID" 2>/dev/null || true; fi
    if [ -n "$STARTED_CONTAINER" ]; then docker rm -f "$STARTED_CONTAINER" >/dev/null 2>&1 || true; fi
    if [ -n "$STARTED_DB" ] && [ "$DB_SOURCE" = env ]; then pg_admin drop >/dev/null 2>&1 || true; fi
    if [ "$OWN_LOCK" = 1 ]; then rm -rf "$LOCK_DIR"; fi
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ---- database helpers (the pg driver is already a dependency of the repo) ----
# ADMIN_URL and DB_NAME come from the environment; the connection string is never printed.
pg_admin() { # create | drop | url
  ACTION="$1" ADMIN_URL="$ADMIN_URL" DB_NAME="$DB_NAME" node -e '
    const pg = require("pg");
    const { ACTION, ADMIN_URL, DB_NAME } = process.env;
    if (!/^[a-z][a-z0-9_]{0,50}$/.test(DB_NAME)) { console.error("unusual database name"); process.exit(2); }
    const u = new URL(ADMIN_URL); u.pathname = "/" + DB_NAME;
    if (ACTION === "url") { console.log(u.toString()); process.exit(0); }
    (async () => {
      const c = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 3000 });
      await c.connect();
      try {
        if (ACTION === "create") await c.query("create database \"" + DB_NAME + "\"");
        else if (ACTION === "drop") await c.query("drop database if exists \"" + DB_NAME + "\" with (force)");
        else process.exit(2);
      } finally { await c.end(); }
    })().catch((e) => { console.error(String(e.message || e).replace(/postgres(ql)?:\/\/\S+/g, "<url>")); process.exit(1); });
  '
}

# ===========================================================================
# 1. lock + reuse check
# ===========================================================================
LOCK_MODE=peek
acquire_lock

REUSE=0
if [ "$FORCE" != 1 ] && [ -f "$ENV_DESCRIPTOR" ]; then
  set -- $(read_descriptor || echo "- - - - - -")
  d_status=$1 d_pid=$2 d_base=$3 d_age=$4 d_user=$5 d_penv=$6
  if [ "$d_status" = running ] && pid_is_next "$d_pid" &&
     probe_all "$d_base" "$d_user" "$d_penv" &&
     [ "$d_age" != "-" ] && [ "$d_age" -le "$TTL_SECONDS" ] &&
     [ -z "$(list_inputs -newer "$ENV_DESCRIPTOR" | head -n 1)" ]; then
    REUSE=1
  fi
fi
if [ "$REUSE" = 1 ]; then
  d_db=$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const s=(d.services||[])[0]||{};console.log(s.source==="TEST_DATABASE_URL"?"TEST_DATABASE_URL":"docker")' "$ENV_DESCRIPTOR")
  d_bi=$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(d.browser&&d.browser.installed?1:0)' "$ENV_DESCRIPTOR")
  log "reusing the running environment (age ${d_age}s, ttl ${TTL_SECONDS}s)"
  report 1 "$d_base" "$d_db" "$d_bi"
  exit 0
fi

# Stale, forced or half-dead: stop what an earlier run started, then take the lock.
if [ -f "$ENV_DESCRIPTOR" ]; then
  set -- $(read_descriptor || echo "- - - - - -")
  if [ "$1" = running ]; then
    log "previous environment is stale or --force: tearing it down"
    sh "$DOWN_SCRIPT" >&2 || die "could not stop the previous environment"
  fi
fi
if [ "$OWN_LOCK" != 1 ]; then
  LOCK_MODE=strict
  acquire_lock
fi

# ===========================================================================
# 2. build cache: install -> build (only when sources changed)
# ===========================================================================
BUILT=0
if build_needed; then
  BUILD_STARTED=$(date +%s)
  log "sources changed (or no cache): preparing the workspace"
  if [ ! -f node_modules/.package-lock.json ] || [ -n "$(find package-lock.json -newer node_modules/.package-lock.json 2>/dev/null)" ]; then
    npm ci >&2
  fi
  $BUILD_CMD >&2
  printf '{ "builtAt": "%s", "sourceFingerprint": "%s", "projectRoot": "%s", "artifactPaths": "%s" }\n' \
    "$(utc_now)" "$(fingerprint)" "$(pwd)" "$ARTIFACTS" > "$BUILD_CACHE"
  BUILT=1
  BUILD_SECONDS=$(( $(date +%s) - BUILD_STARTED ))
else
  log "build cache valid: skipping install and build"
  BUILD_SECONDS=0
fi

# ===========================================================================
# 3. database: Docker postgres:16 when Docker works, else a fresh database on TEST_DATABASE_URL
# ===========================================================================
RUN_ID="$(date -u +%Y%m%d%H%M%S)$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
DB_NAME="${DB_PREFIX}${RUN_ID}"
CONTAINER=""
DB_PORT=""

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DB_SOURCE=container
  CONTAINER="wm-qa-pg-$RUN_ID"
  PG_PASS=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')      # disposable, lives only in this container
  log "starting $PG_IMAGE in container $CONTAINER"
  docker run -d --rm --name "$CONTAINER" -e POSTGRES_USER=wm -e "POSTGRES_PASSWORD=$PG_PASS" \
    -e POSTGRES_DB=postgres -p 127.0.0.1::5432 "$PG_IMAGE" >/dev/null
  STARTED_CONTAINER="$CONTAINER"
  DB_PORT=$(docker port "$CONTAINER" 5432/tcp | head -n 1 | sed 's/.*://')
  ADMIN_URL="postgres://wm:${PG_PASS}@127.0.0.1:${DB_PORT}/postgres"
elif [ -n "${TEST_DATABASE_URL:-}" ]; then
  DB_SOURCE=env
  ADMIN_URL="$TEST_DATABASE_URL"
  DB_PORT=$(node -e 'console.log(new URL(process.argv[1]).port||5432)' "$ADMIN_URL")
  log "Docker is not available: using a new database on TEST_DATABASE_URL (dropped by the down script)"
else
  die "no Docker daemon and no TEST_DATABASE_URL: start Docker, or point TEST_DATABASE_URL at a PostgreSQL server you can create databases on"
fi

# create the database; retry while the server is still starting (never race the app ahead of its database)
tries=0
until pg_admin create 2>/dev/null; do
  tries=$((tries + 1))
  [ "$tries" -le 60 ] || { pg_admin create >&2 || true; die "PostgreSQL did not accept connections in time"; }
  sleep 1
done
STARTED_DB="$DB_NAME"
DB_URL=$(pg_admin url)

# ===========================================================================
# 4. the repo's own migrate / seed / operator command (as packages/app/tests/e2e/global-setup.ts)
# ===========================================================================
log "applying migrations and demo data to $DB_NAME"
DATABASE_URL="$DB_URL" $MIGRATE_CMD >&2
DATABASE_URL="$DB_URL" $SEED_CMD >&2
# MikroORM writes a per-database schema snapshot next to the migrations; it is run state, not source
rm -f "packages/db/src/migrations/.snapshot-${DB_NAME}.json"

# Second restaurant by the real operator command, like global-setup. Account values come from the committed
# sources (core demo users, e2e NEW_RESTAURANT) at run time, so no password is written into this script;
# they land only in the gitignored credentials file next to the descriptor.
CRED_JSON="$QA_DIR/.test-env-credentials.$$.json"
: > "$CREDENTIALS_FILE"
chmod 600 "$CREDENTIALS_FILE"
DATABASE_URL="$DB_URL" CRED_FILE="$CREDENTIALS_FILE" CRED_JSON="$CRED_JSON" node_modules/.bin/tsx -e '
  import { execFileSync } from "node:child_process";
  import { writeFileSync } from "node:fs";
  import { DEMO_PASSWORD, DEMO_USERS } from "./packages/core/src/demo/users.ts";
  import { NEW_RESTAURANT as r } from "./packages/app/tests/e2e/new-restaurant.ts";
  const env = process.env;
  execFileSync("npm", ["run", "restaurant:create", "-w", "@wine-match/db", "--",
    "--name", r.name, "--slug", r.slug, "--address", r.address, "--city", r.city, "--wine-director", r.wineDirector,
    "--owner-email", r.ownerEmail, "--owner-name", r.ownerName],
    { env: { ...env, USER_PASSWORD: r.password }, stdio: ["ignore", "inherit", "inherit"] });
  const varName = (role) => "TEST_" + role.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_PASSWORD";
  const accounts = [
    ...DEMO_USERS.map((u) => ({ role: u.role, username: u.email, restaurant: "halka", value: DEMO_PASSWORD })),
    { role: "owner", username: r.ownerEmail, restaurant: r.slug, value: r.password }
  ];
  const q = String.fromCharCode(39);
  writeFileSync(env.CRED_FILE, accounts.map((a) => varName(a.role) + "=" + q + a.value + q + "\n").join(""), { mode: 0o600 });
  writeFileSync(env.CRED_JSON, JSON.stringify(accounts.map((a) => ({ role: a.role, username: a.username, passwordEnv: varName(a.role), restaurant: a.restaurant }))));
' >&2 || { rm -f "$CRED_JSON"; die "creating the second restaurant failed"; }

# ===========================================================================
# 5. the BUILT app on a free port (same environment as the e2e harness + local-only flags)
# ===========================================================================
APP_PORT=$(free_port)
BASE_URL="http://127.0.0.1:$APP_PORT"
: > "$APP_LOG"
log "starting the built app on $BASE_URL"
(
  cd "$ROOT/$APP_DIR"
  exec nohup env -i PATH="$PATH" HOME="${HOME:-}" NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
    DATA_SOURCE=postgres DATABASE_URL="$DB_URL" AUTH_COOKIE_SECURE=false ALLOW_DEMO_DATA=true LOG_LEVEL=info \
    node "$ROOT/$NEXT_BIN" start -H 127.0.0.1 -p "$APP_PORT"
) </dev/null >"$ROOT/$APP_LOG" 2>&1 &
APP_PID=$!
STARTED_PID="$APP_PID"

waited=0
until [ "$(http_code "$BASE_URL$HEALTH_PATH")" = 200 ]; do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    tail -n 20 "$APP_LOG" >&2 || true
    die "the app exited before it answered (log: $APP_LOG)"
  fi
  waited=$((waited + 1))
  if [ "$waited" -gt 120 ]; then
    tail -n 20 "$APP_LOG" >&2 || true
    die "the app did not answer on $BASE_URL$HEALTH_PATH within 60s"
  fi
  sleep 0.5 2>/dev/null || sleep 1
done

first_user=$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[0];console.log(c.username+" "+c.passwordEnv)' "$CRED_JSON")
# shellcheck disable=SC2086
set -- $first_user
probe_all "$BASE_URL" "$1" "$2" || { tail -n 20 "$APP_LOG" >&2 || true; die "the started app failed its readiness probes"; }

# ===========================================================================
# 6. browser provider state (verified at generation time; this script only records it, never installs)
# ===========================================================================
BROWSER_BIN="${AGENT_BROWSER_BIN:-}"
[ -n "$BROWSER_BIN" ] || BROWSER_BIN=$(command -v agent-browser 2>/dev/null || true)
BROWSER_VERSION=""
BROWSER_INSTALLED=0
BROWSER_NOTES=""
if [ -n "$BROWSER_BIN" ] && BROWSER_VERSION=$("$BROWSER_BIN" --version 2>/dev/null | head -n 1); then
  BROWSER_INSTALLED=1
else
  BROWSER_BIN=""
  BROWSER_VERSION=""
  BROWSER_NOTES="agent-browser not found in PATH or AGENT_BROWSER_BIN: install it through $BROWSER_FILE (ensure-installed) before driving the UI; API checks work without it."
fi

# ===========================================================================
# 7. descriptor + hand the lock to the app pid + result lines
# ===========================================================================
ELAPSED=$(( $(date +%s) - START_EPOCH ))
if [ "$BUILT" = 1 ]; then BUILD_NOTE="build ran (${BUILD_SECONDS}s)"; else BUILD_NOTE="build skipped (cache valid)"; fi
NOTES="boot ${ELAPSED}s, ${BUILD_NOTE}. Fresh database ${DB_NAME} with the real migrations, demo data (restaurant halka) and a second restaurant (bistro-e2e) made by restaurant:create, like the e2e global-setup. Built app, DATA_SOURCE=postgres, AUTH_COOKIE_SECURE=false, ALLOW_DEMO_DATA=true. Passwords are in the credentials file (public demo values); log in as the first credential for the panel. Stop with: sh ${DOWN_SCRIPT}. Re-running the up script reuses this environment while it is healthy, younger than ${TTL_SECONDS}s and no source changed."
RUN_ID="$RUN_ID" BASE_URL="$BASE_URL" UP_SCRIPT="$UP_SCRIPT" DOWN_SCRIPT="$DOWN_SCRIPT" APP_PORT="$APP_PORT" \
HEALTH_PATH="$HEALTH_PATH" APP_PID="$APP_PID" DB_PORT="$DB_PORT" CONTAINER="$CONTAINER" DB_SOURCE="$DB_SOURCE" \
DB_NAME="$DB_NAME" DB_URL="$DB_URL" CRED_JSON="$CRED_JSON" CREDENTIALS_FILE="$CREDENTIALS_FILE" PLATFORM="$PLATFORM" \
BROWSER_PROVIDER="$BROWSER_PROVIDER" BROWSER_INSTALLED="$BROWSER_INSTALLED" BROWSER_BIN="$BROWSER_BIN" \
BROWSER_VERSION="$BROWSER_VERSION" BROWSER_FILE="$BROWSER_FILE" BROWSER_NOTES="$BROWSER_NOTES" NOTES="$NOTES" \
STARTED_AT="$(utc_now)" ENV_DESCRIPTOR="$ENV_DESCRIPTOR" node -e '
  const fs = require("fs");
  const e = process.env;
  const dbUrl = new URL(e.DB_URL);
  if (e.DB_SOURCE === "env") dbUrl.password = "";          // a server we do not own: never record its secret
  const desc = {
    version: 1,
    runId: e.RUN_ID,
    status: "running",
    mode: "ephemeral",
    baseUrl: e.BASE_URL,
    startedByThisRepo: true,
    startScript: e.UP_SCRIPT,
    stopScript: e.DOWN_SCRIPT,
    app: {
      startCommand: "next start -H 127.0.0.1 -p " + e.APP_PORT + " (cwd packages/app, built app)",
      port: Number(e.APP_PORT), healthPath: e.HEALTH_PATH, pid: Number(e.APP_PID)
    },
    services: [{
      type: "postgres", host: "127.0.0.1", port: Number(e.DB_PORT), container: e.CONTAINER,
      source: e.DB_SOURCE === "env" ? "TEST_DATABASE_URL" : "docker", database: e.DB_NAME,
      url: dbUrl.toString(), env: { DATABASE_URL: dbUrl.toString() }
    }],
    credentials: JSON.parse(fs.readFileSync(e.CRED_JSON, "utf8")),
    credentialsFile: e.CREDENTIALS_FILE,
    browser: {
      provider: e.BROWSER_PROVIDER, installed: e.BROWSER_INSTALLED === "1", command: e.BROWSER_BIN,
      version: e.BROWSER_VERSION, descriptor: e.BROWSER_FILE, notes: e.BROWSER_NOTES
    },
    testRunner: { name: "other", config: "packages/app/vitest.e2e.config.ts" },
    platform: e.PLATFORM,
    startedAt: e.STARTED_AT,
    notes: e.NOTES
  };
  fs.writeFileSync(e.ENV_DESCRIPTOR, JSON.stringify(desc, null, 2) + "\n");
' || die "could not write the descriptor"
rm -f "$CRED_JSON"

# The lock now belongs to the environment: its owner is the app pid, so a second bootstrap cannot rebuild
# the artifacts under a running app. The down script (or a stale-owner check) releases it.
printf '{"pid":%s,"source":"environment","acquiredAt":"%s"}\n' "$APP_PID" "$(utc_now)" > "$LOCK_DIR/owner.json"
HANDOFF=1

log "ready in ${ELAPSED}s at $BASE_URL"
if [ "$DB_SOURCE" = env ]; then db_label=TEST_DATABASE_URL; else db_label=docker; fi
report 0 "$BASE_URL" "$db_label" "$BROWSER_INSTALLED"
