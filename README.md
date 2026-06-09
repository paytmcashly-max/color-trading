# Color Trading

Production-grade foundation for a real-time virtual prediction game platform.

This repository is intentionally scoped to Step 1: monorepo architecture, environment configuration, shared contracts, server bootstrap, and frontend bootstrap. Game, wallet, bet, and auth business logic are not implemented yet.

## Folder Structure

```text
color-trading/
  apps/
    client/       Next.js App Router frontend
    server/       Express + TypeScript backend
  packages/
    shared/       Shared types, interfaces, and constants
```

## Installation Commands

```powershell
npm install
Copy-Item apps/server/.env.example apps/server/.env
Copy-Item apps/client/.env.example apps/client/.env.local
npm run dev:server
npm run dev:client
```

## Local URLs

- Client: http://localhost:3000
- Server: http://localhost:4000
- Health check: http://localhost:4000/health

## Architecture Decisions

- `apps/server` owns runtime infrastructure: HTTP, Socket.io, environment validation, and database/cache connection placeholders.
- `apps/client` owns user-facing routes and browser-side service/hooks/state folders.
- `packages/shared` owns stable contracts used by both apps, preventing duplicate type drift.
- Backend entry files only compose infrastructure. Domain logic will live under `src/modules/*` in later steps.
- PostgreSQL and Redis clients are lazy placeholders so the app can boot for health checks before real services are configured.
