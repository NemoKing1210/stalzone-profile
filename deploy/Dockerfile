# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages ./packages
COPY scripts ./scripts
COPY app ./app
COPY server ./server
COPY db ./db
COPY nuxt.config.ts tsconfig.json tsconfig.node.json tsup.config.ts eslint.config.mjs ./

RUN npm ci
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
