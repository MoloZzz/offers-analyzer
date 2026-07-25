# syntax=docker/dockerfile:1

# Offers Analyzer — production image.
#
# Two stages: `builder` installs the full dependency tree and compiles TS;
# `runtime` carries only prod deps + `dist/` + `config/`. Pending migrations run
# at container start (see docker-entrypoint.sh), so a deploy is "pull image +
# restart" with no manual step.

# ---------------------------------------------------------------- builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Deps first — this layer is cached until package-lock.json changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build

# Strip dev deps in place so the runtime stage can copy a prod-only node_modules.
# `typeorm` and `pg` stay (they are runtime deps), which is what lets the
# entrypoint run migrations without ts-node.
RUN npm prune --omit=dev


# ---------------------------------------------------------------- runtime ----
FROM node:20-alpine AS runtime

# tini reaps zombies and, more importantly, forwards SIGTERM: node as PID 1
# installs no SIGTERM handler and would ignore `docker stop` until SIGKILL.
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    # Set to false to start without applying migrations (e.g. when a separate
    # release/job step owns them).
    RUN_MIGRATIONS=true

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Read from process.cwd() at runtime: config/heuristics/*.json (repair-risk,
# liquidity-tiers). config/search-profiles.json is deliberately excluded via
# .dockerignore (operator data) — mount it, or set SEARCH_PROFILES_FILE.
COPY config ./config

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 3000

# There are no HTTP controllers yet, so any request 404s — a TCP connect is the
# honest liveness signal that bootstrap finished and the app is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('net').connect(Number(process.env.PORT)||3000,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "-g", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
