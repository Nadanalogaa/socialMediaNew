# The whole platform in one image: the API serves the built web app, and the
# same image runs the worker with a different command. Built by Portainer from
# the Git repository on every deploy.

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
COPY web ./web

# Vite bakes these into the browser bundle at build time, so they arrive as
# build arguments rather than runtime environment.
ARG VITE_META_APP_ID
ARG VITE_META_CONFIG_ID
ARG VITE_META_INSTAGRAM_ENABLED
ENV VITE_META_APP_ID=$VITE_META_APP_ID \
    VITE_META_CONFIG_ID=$VITE_META_CONFIG_ID \
    VITE_META_INSTAGRAM_ENABLED=$VITE_META_INSTAGRAM_ENABLED
RUN npm run build

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
COPY --from=build /app/web/dist ./web/dist

# Runs unprivileged: the process holds customers' provider tokens and needs no root.
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Migrations run first so the schema is never behind the code that serves it.
CMD ["sh", "-c", "node server/dist/db/migrate.js && node server/dist/index.js"]
