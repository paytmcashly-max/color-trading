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
access/refresh secrets, `COOKIE_SECRET`, and `NEXT_PUBLIC_API_BASE_PATH=/api/v1`.

## Local URLs

- Client: http://localhost:3000
- Server: http://localhost:4000
- API base path: http://localhost:4000/api/v1
- Health check: http://localhost:4000/health
- Liveness check: http://localhost:4000/health/live
- Readiness check: http://localhost:4000/health/ready

## Deploy Setup

Deployment configuration is documented in [docs/deployment.md](docs/deployment.md).
The final launch checklist is documented in
[docs/production-launch-checklist.md](docs/production-launch-checklist.md).
Production environment setup, first-admin bootstrap, rollback, and emergency
admin lock procedures are in [docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md).
The authoritative variable inventory and API URL composition rules are in
[docs/PRODUCTION_ENV.md](docs/PRODUCTION_ENV.md).
At minimum, production needs managed PostgreSQL, managed Redis, Render backend
environment variables, and Vercel frontend variables:

- Backend: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `ROUND_SEED_ENCRYPTION_KEY`, `CLIENT_ORIGIN`, `ALLOWED_ORIGINS`, `SOCKET_ALLOWED_ORIGINS`
- Frontend: `NEXT_PUBLIC_API_URL` (leave empty in production), `NEXT_PUBLIC_API_BASE_PATH=/api/v1`, `NEXT_PUBLIC_SOCKET_URL`, `BACKEND_API_URL`
- Game limits: `GAME_MAX_BET_PER_USER_PER_ROUND`, `GAME_MAX_EXPOSURE_PER_COLOR`

## Production Launch Checklist

Before production launch, verify Render has:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `COOKIE_SECRET`
- `ROUND_SEED_ENCRYPTION_KEY`
- `CLIENT_ORIGIN`
- `ALLOWED_ORIGINS`
- `SOCKET_ALLOWED_ORIGINS`

Verify Vercel has:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_API_BASE_PATH=/api/v1`
- `NEXT_PUBLIC_SOCKET_URL`
- `BACKEND_API_URL`

For reliable production browser sessions, leave `NEXT_PUBLIC_API_URL` empty and
set `BACKEND_API_URL` to the Render API URL. Next.js proxies `/api/v1/*` through
the frontend origin so the httpOnly refresh cookie remains first-party.

Apply the production database migration:

```powershell
npm run db:migrate:deploy -w @color-trading/server
```

Create the first admin only once:

```powershell
$env:ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
$env:ADMIN_BOOTSTRAP_PASSWORD="<private-password>"
$env:ADMIN_BOOTSTRAP_TOKEN="<private-bootstrap-token>"
npm run db:seed:admin -w @color-trading/server
```

After the first admin can log in, remove or rotate all bootstrap env vars and
disable future bootstrap attempts:

```powershell
npm run db:disable-admin-bootstrap -w @color-trading/server
```

Smoke test production before traffic: health/readiness, normal register/login,
normal user blocked from `/api/v1/admin`, admin login/dashboard, wallet balance,
current round, place bet, settlement wallet update, logout, and refresh after
reload. Roll back via Render for backend and Vercel for frontend if health,
auth, wallet, or settlement checks fail.

## Admin Bootstrap

Create the first admin only through the one-time operations script:

```powershell
$env:ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
$env:ADMIN_BOOTSTRAP_PASSWORD="<private-strong-password>"
$env:ADMIN_BOOTSTRAP_TOKEN="<private-bootstrap-token>"
npm run db:seed:admin
```

Admin passwords must be 12-72 characters with uppercase, lowercase, number, and symbol.
If the email already belongs to a normal user, also set
`ADMIN_BOOTSTRAP_CONFIRM=PROMOTE_ADMIN`. After the first admin is verified, disable
future bootstrap attempts:

```powershell
npm run db:disable-admin-bootstrap
```

## Security Notes

- Refresh tokens are httpOnly cookies and are stored server-side only as hashes.
- In production, auth cookies use `Secure`, `SameSite=None`, and are scoped to `/api/v1/auth`.
- Access tokens are short lived and kept only in browser memory.
- Admin routes require `ADMIN` role and verified admin email.
- Public registration rejects role fields and can only create normal users.
- Admin bootstrap writes audit logs, never prints passwords, and revokes sessions after password rotation.
- Admin TOTP/2FA is reserved as a required production follow-up before broad admin rollout.
- Wallet changes go through ledger-backed transactions and idempotency keys.
- Betting is server-gated by round status, per-user limits, and color exposure limits.
- Production rate limits use Redis; local/test environments use memory stores.

## Known Limitations

- Email verification is enforced for admin-sensitive actions, but outbound email delivery is not implemented yet.
- The isolated real-money gameplay domain is sandbox-only, compliance-gated, disabled by default,
  and hard-blocked from production enablement in this iteration. Withdrawals are manual review
  records only; there is no automatic payout integration.
- Cashfree sandbox payments credit a separate premium-credit ledger. Premium credits cannot enter
  game wallets, bets, winnings, or gameplay balances.

## Isolated Cashfree sandbox payment service

`apps/payment` owns Cashfree credentials, provider verification, its own PostgreSQL database, and
a durable signed-event outbox. The main API creates short-lived signed payment intents and credits
premium credits only after it verifies a signed backend event from the payment service.

Local setup:

```bash
npm ci
npm run db:migrate:deploy -w @color-trading/server
npm run db:migrate:deploy -w @color-trading/payment
npm run dev:server
npm run dev:payment
npm run dev:client
```

Open `/sandbox-checkout` while authenticated. Configure real Cashfree sandbox credentials only in
the payment-service environment. A browser return redirect is never treated as payment success.

The payment service now boots safely with `PAYMENT_SERVICE_ENABLED=false` and reports readiness as
disabled. The isolated real-money sandbox uses separate paise wallets, ledger, bets, settlements,
deposits, and withdrawals. See [docs/REAL_MONEY_SANDBOX.md](docs/REAL_MONEY_SANDBOX.md).

Dry-run real-money reconciliation:

```bash
npm run ops:real-money-game-reconcile -w @color-trading/server
```
- The game engine is designed for one active round stream; multi-game independent engines would need separate scheduler namespaces.

## Architecture Decisions

- `apps/server` owns runtime infrastructure: HTTP, Socket.io, environment validation, and database/cache connection placeholders.
- `apps/client` owns user-facing routes and browser-side service/hooks/state folders.
- `packages/shared` owns stable contracts used by both apps, preventing duplicate type drift.
- Backend entry files only compose infrastructure. Domain logic will live under `src/modules/*` in later steps.
- PostgreSQL remains the source of truth, Redis backs realtime/rate-limit scaling, and auth refresh tokens are stored only in httpOnly cookies plus hashed server sessions.
