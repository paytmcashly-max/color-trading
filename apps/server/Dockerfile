FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV npm_config_update_notifier=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl tini \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci \
  --workspace @color-trading/server \
  --workspace @color-trading/shared \
  --include-workspace-root=false

FROM deps AS builder

COPY tsconfig.base.json ./
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY apps/server/prisma ./apps/server/prisma
COPY apps/server/scripts ./apps/server/scripts
COPY apps/server/src ./apps/server/src
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/shared/src ./packages/shared/src

RUN npx prisma generate --schema apps/server/prisma/schema.prisma \
  && npm run db:validate -w @color-trading/server \
  && npm run build -w @color-trading/shared \
  && npm run build -w @color-trading/server

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=4000
ENV NODE_OPTIONS=--enable-source-maps
ENV NPM_CONFIG_LOGLEVEL=warn

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci --omit=dev \
  --workspace @color-trading/server \
  --workspace @color-trading/shared \
  --include-workspace-root=false \
  && npm cache clean --force \
  && groupadd --system nodejs \
  && useradd --system --gid nodejs --create-home nodejs

COPY --chown=nodejs:nodejs --from=builder /app/apps/server/dist ./apps/server/dist
COPY --chown=nodejs:nodejs --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --chown=nodejs:nodejs --from=builder /app/apps/server/scripts ./apps/server/scripts
COPY --chown=nodejs:nodejs --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --chown=nodejs:nodejs --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nodejs:nodejs --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nodejs
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/server/scripts/start-production.mjs"]
