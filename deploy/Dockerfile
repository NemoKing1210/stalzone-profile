# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Only manifests are copied before `npm ci` so a source edit does not bust the dependency layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/sources/package.json ./packages/sources/package.json
COPY packages/mcp/package.json ./packages/mcp/package.json

RUN npm ci

COPY packages ./packages
COPY scripts ./scripts
COPY app ./app
COPY server ./server
COPY db ./db
COPY i18n ./i18n
COPY public ./public
COPY nuxt.config.ts tsconfig.json tsconfig.node.json tsup.config.ts eslint.config.mjs ./

RUN npm run build && npm run build:cli
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/profile.db \
    ICONS_DIR=/data/icons

WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY deploy/docker-entrypoint.sh /usr/local/bin/profile-entrypoint

RUN chmod +x /usr/local/bin/profile-entrypoint \
  && mkdir -p /data \
  && chown -R node:node /data

USER node
EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["profile-entrypoint"]
