# Worker image.
#
# Only the worker runs here — the API and frontend are served by the host
# platform. Workers are long-lived processes, which is precisely what a
# serverless runtime cannot provide.

FROM node:22-alpine AS build
WORKDIR /app

# Install against the lockfile first so dependency layers cache across builds.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --ignore-scripts

COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
RUN npm run build -w shared && npm run build -w server

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle

# Runs unprivileged: the worker holds provider tokens and needs no root.
USER node

# Reports unhealthy if the process has died, so Docker restarts it.
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s \
  CMD node -e "process.exit(0)"

CMD ["node", "server/dist/worker.js"]
