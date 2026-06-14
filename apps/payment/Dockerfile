FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV npm_config_update_notifier=false
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/payment/package.json ./apps/payment/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci --workspace @color-trading/payment --workspace @color-trading/shared --include-workspace-root=false

FROM deps AS builder
COPY tsconfig.base.json ./
COPY apps/payment/tsconfig.json ./apps/payment/tsconfig.json
COPY apps/payment/src ./apps/payment/src
COPY apps/payment/prisma ./apps/payment/prisma
COPY apps/payment/scripts ./apps/payment/scripts
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/shared/src ./packages/shared/src
RUN npm run build -w @color-trading/shared && npm run build -w @color-trading/payment

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4100
COPY package.json package-lock.json ./
COPY apps/payment/package.json ./apps/payment/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci --omit=dev --workspace @color-trading/payment --workspace @color-trading/shared --include-workspace-root=false \
  && npm cache clean --force \
  && groupadd --system nodejs \
  && useradd --system --gid nodejs --create-home nodejs
COPY --chown=nodejs:nodejs --from=builder /app/apps/payment/dist ./apps/payment/dist
COPY --chown=nodejs:nodejs --from=builder /app/apps/payment/prisma ./apps/payment/prisma
COPY --chown=nodejs:nodejs --from=builder /app/apps/payment/scripts ./apps/payment/scripts
COPY --chown=nodejs:nodejs --from=builder /app/packages/shared/dist ./packages/shared/dist
USER nodejs
EXPOSE 4100
ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/payment/scripts/start-production.mjs"]
