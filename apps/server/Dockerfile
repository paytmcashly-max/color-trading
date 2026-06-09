FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV npm_config_update_notifier=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
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

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nodejs
EXPOSE 4000

CMD ["node", "apps/server/dist/main.js"]
