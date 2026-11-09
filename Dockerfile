#
# Wine Match image (spec .ai/specs/2026-10-15-production-deployment.md, phase F2). One file, two deliverable targets:
#
#   runtime   the web app (`next start`); non-root; no secrets, no .env, nothing about the environment baked in except NODE_ENV
#   migrator  operator commands against PostgreSQL: db:migrate (default), migration:pending, restaurant:create, user:create,
#             user:invite and db:seed (which refuses in production without ALLOW_DEMO_DATA=true)
#
#   docker build --target runtime  -t wine-match:<git-tag> .
#   docker build --target migrator -t wine-match-migrator:<git-tag> .
#
# Everything is configured at RUN time (see .env.example and docs/DEPLOYMENT.md); the build needs no variables and no database.
# Base image: Node 22.22 (as .nvmrc) on Debian 12, multi-arch, pinned by digest. To move to a newer patch release: pick the new
# tag, read its digest (`docker buildx imagetools inspect node:<tag>`), change both the tag and the digest here, and run CI.
ARG NODE_IMAGE=node:22.22-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752

# ---- base: Node plus the npm version CI uses (the lockfile needs npm >= 11.6; Node 22 ships npm 10) ----
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
RUN npm install -g npm@11.20.0 && npm cache clean --force
WORKDIR /app

# ---- manifests: only what `npm ci` needs, so a source change does not invalidate the dependency layer ----
FROM base AS manifests
COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/app/package.json packages/app/package.json
COPY packages/mockups/package.json packages/mockups/package.json
COPY packages/testkit/package.json packages/testkit/package.json

# ---- deps: ALL dependencies (devDependencies hold the build tools, the MikroORM CLI and tsx). NODE_ENV is NOT production here. ----
FROM manifests AS deps
RUN npm ci

# ---- build: the app, with no environment, no .env and no database (`next build` needs none of them) ----
FROM deps AS build
COPY packages packages
COPY scripts scripts
COPY tsconfig.base.json ./
RUN npm run check:boundaries && npm run build -w @wine-match/app

# ---- prod-deps: runtime dependencies only ----
FROM manifests AS prod-deps
RUN npm ci --omit=dev

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# production dependencies plus the manifests and any workspace-level node_modules (packages/db has its own: MikroORM drivers)
COPY --from=prod-deps /app ./
# internal packages ship TypeScript sources (no dist/): they are bundled at build time; their package.json is read at run time.
# COPY merges into the existing directories, so the nested node_modules from prod-deps stay.
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/ui packages/ui
COPY packages/app/package.json packages/app/next.config.ts packages/app/tsconfig.json packages/app/
# .next is the only thing the process writes under /app (its cache); everything else stays root-owned and read-only for the user
COPY --from=build --chown=node:node /app/packages/app/.next packages/app/.next
USER node
WORKDIR /app/packages/app
EXPOSE 3000
# Liveness, not readiness: healthy when the process ANSWERS (any HTTP status), unhealthy only when it does not. Docker itself never
# restarts a container for being unhealthy (`restart:` reacts to the process exiting); an orchestrator or an "autoheal" add-on does.
# A database outage makes /api/v1/health answer 503, and that must not read as "dead process" for them (spec Q5, edge case
# "database unavailable"); the load balancer and the uptime check read the status code. No curl in the image: Node's fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health',{headers:{'x-wine-match-synthetic':'1'},signal:AbortSignal.timeout(4000)}).then(()=>process.exit(0),()=>process.exit(1))"]
# exec form: Node is PID 1 and gets SIGTERM; run with `init: true` (Compose) or `docker run --init` to reap children
CMD ["node", "../../node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]

# ---- migrator: full dependencies, then NODE_ENV=production (so `npm ci` still installs the CLI and tsx) ----
FROM deps AS migrator
# packages/db is writable for `node`: `migration:up` writes `.snapshot-<database>.json` next to the migrations (found by running it)
COPY --chown=node:node packages packages
COPY --chown=node:node scripts scripts
COPY tsconfig.base.json ./
# `COPY --chown` does not reliably change directories that already exist from the `deps` layer (workspace symlink targets), so the
# one directory the CLI writes to is made writable explicitly. CI proves it (job `image`: a write probe as `node`).
RUN chown -R node:node /app/packages/db/src/migrations
ENV NODE_ENV=production
USER node
WORKDIR /app
CMD ["npm", "run", "db:migrate"]
