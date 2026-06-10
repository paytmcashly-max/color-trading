# Color Trading

Production-grade real-time virtual prediction game platform.

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
npm run db:migrate:deploy
npm run dev:server
npm run dev:client
```

## Local Setup

Run PostgreSQL and Redis locally, or use the provided compose stack:

```powershell
docker compose up --build
```

For direct local development, set `DATABASE_URL`, `REDIS_URL`, distinct JWT
access/refresh secrets, and `NEXT_PUBLIC_API_BASE_PATH=/api/v1`.

## Local URLs

- Client: http://localhost:3000
- Server: http://localhost:4000
- API base path: http://localhost:4000/api/v1
- Health check: http://localhost:4000/health
- Liveness check: http://localhost:4000/health/live
- Readiness check: http://localhost:4000/health/ready

## Deploy Setup

Deployment configuration is documented in [docs/deployment.md](docs/deployment.md).
At minimum, production needs managed PostgreSQL, managed Redis, Render backend
environment variables, and Vercel frontend variables:

- Backend: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGIN`, `ALLOWED_ORIGINS`, `SOCKET_CORS_ORIGIN`, `SOCKET_ALLOWED_ORIGINS`
- Frontend: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_BASE_PATH=/api/v1`, `NEXT_PUBLIC_SOCKET_URL`
- Game limits: `GAME_MAX_BET_PER_USER_PER_ROUND`, `GAME_MAX_EXPOSURE_PER_COLOR`

## Security Notes

- Refresh tokens are httpOnly cookies and are stored server-side only as hashes.
- Access tokens are short lived and kept only in browser memory.
- Admin routes require `ADMIN` role and verified admin email.
- Wallet changes go through ledger-backed transactions and idempotency keys.
- Betting is server-gated by round status, per-user limits, and color exposure limits.
- Production rate limits use Redis; local/test environments use memory stores.

## Known Limitations

- Email verification is enforced for admin-sensitive actions, but outbound email delivery is not implemented yet.
- There are no withdrawals or real-money flows in this system.
- The game engine is designed for one active round stream; multi-game independent engines would need separate scheduler namespaces.

## Architecture Decisions

- `apps/server` owns runtime infrastructure: HTTP, Socket.io, environment validation, and database/cache connection placeholders.
- `apps/client` owns user-facing routes and browser-side service/hooks/state folders.
- `packages/shared` owns stable contracts used by both apps, preventing duplicate type drift.
- Backend entry files only compose infrastructure. Domain logic will live under `src/modules/*` in later steps.
- PostgreSQL remains the source of truth, Redis backs realtime/rate-limit scaling, and auth refresh tokens are stored only in httpOnly cookies plus hashed server sessions.
