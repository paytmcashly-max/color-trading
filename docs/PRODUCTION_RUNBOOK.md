# Production Runbook

This runbook covers production environment setup, database migration, first-admin
bootstrap, launch safety checks, rollback, and emergency admin lockout.

## Production Server Environment

Configure these values in Render before deploying the backend:

```bash
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_ACCESS_SECRET=<unique-random-secret-at-least-32-characters>
JWT_REFRESH_SECRET=<different-unique-random-secret-at-least-32-characters>
JWT_ACCESS_TOKEN_TTL=15m
JWT_REFRESH_TOKEN_TTL=7d
COOKIE_SECRET=<different-unique-random-secret-at-least-32-characters>
CLIENT_ORIGIN=https://your-client.vercel.app
ALLOWED_ORIGINS=https://your-client.vercel.app
SOCKET_ALLOWED_ORIGINS=https://your-client.vercel.app
SOCKET_CORS_ORIGIN=https://your-client.vercel.app
API_PREFIX=/api/v1
GAME_ENGINE_ENABLED=true
```

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `COOKIE_SECRET` must be unique.
Production startup fails when PostgreSQL, Redis, JWT secrets, `COOKIE_SECRET`,
or explicit HTTP/socket origin allow-lists are missing. `API_PREFIX` is
validated as `/api/v1`; the server does not expose duplicate root, `/api`, or
`/v1` module routes.

Recommended production settings:

```bash
JWT_ACCESS_TOKEN_TTL_SECONDS=900
JWT_REFRESH_TOKEN_TTL_DAYS=7
JWT_ISSUER=color-trading-api
JWT_AUDIENCE=color-trading-client
RELEASE_VERSION=<git-commit-sha>
GAME_MAX_BET_PER_USER_PER_ROUND=1000
GAME_MAX_EXPOSURE_PER_COLOR=100000
```

## Production Client Environment

Configure these values in Vercel:

```bash
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_API_BASE_PATH=/api/v1
NEXT_PUBLIC_SOCKET_URL=https://your-api.onrender.com
NEXT_PUBLIC_APP_ENV=production
BACKEND_API_URL=https://your-api.onrender.com
```

Only `NEXT_PUBLIC_*` values are exposed to the browser. Never put JWT secrets,
database credentials, Redis credentials, cookie secrets, or admin bootstrap
credentials in Vercel client environment variables.

Keeping `NEXT_PUBLIC_API_URL` empty routes browser API calls through the Next.js
same-origin proxy. `BACKEND_API_URL` is server-only and points that proxy to
Render, allowing the httpOnly refresh cookie to survive direct navigation.

## Database Migration

Take a managed PostgreSQL backup or snapshot before applying production schema
changes. From a controlled Render shell or migration job, run:

```bash
npm run db:migrate:deploy -w @color-trading/server
```

The migration runner uses a PostgreSQL advisory lock, records checksums, and
can safely be run again to verify idempotency. Do not edit an already-applied
SQL migration.

## First Admin Bootstrap

Public registration can only create `USER` accounts. Bootstrap the first admin
from a trusted production shell.

1. Temporarily configure:

```bash
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=<6-12-characters-with-uppercase-lowercase-number-symbol>
ADMIN_BOOTSTRAP_TOKEN=<private-one-time-token>
```

2. If `ADMIN_BOOTSTRAP_EMAIL` already belongs to a normal user and promotion is
   intentional, additionally set:

```bash
ADMIN_BOOTSTRAP_CONFIRM=PROMOTE_ADMIN
```

3. Run:

```bash
npm run ops:bootstrap-admin -w @color-trading/server
```

4. Log in as the admin through the production client.
5. Confirm `GET /api/v1/admin/dashboard` succeeds with the admin access token.
6. Confirm a normal user receives `403` from the same endpoint.
7. Disable future bootstrap attempts while `ADMIN_BOOTSTRAP_TOKEN` is still
   available:

```bash
npm run db:disable-admin-bootstrap -w @color-trading/server
```

8. Immediately remove `ADMIN_BOOTSTRAP_EMAIL`,
   `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_CONFIRM`,
   `ADMIN_BOOTSTRAP_TOKEN`, and other bootstrap-only variables from Render.
9. Rotate the admin password if it was ever shared through an operations
   channel, then revoke all admin sessions.

The bootstrap script refuses to create or promote another admin after an admin
already exists, does not print passwords, and writes an audit log.

## Launch Safety Checks

Run the repository checks before deployment:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm test
npm run db:validate -w @color-trading/server
```

Verify production:

- `GET /health/live` returns `200`.
- `GET /health/ready` returns `200` with healthy PostgreSQL and Redis.
- Redis adapter, Pub/Sub, distributed game lock, and Redis rate limits connect.
- A normal user can register, log in, refresh, log out, and log out all sessions.
- A normal user cannot access `/api/v1/admin/*`.
- Admin login and `/api/v1/admin/dashboard` work.
- Refresh cookie is `httpOnly`, `Secure`, `SameSite=None`, and scoped to
  `/api/v1/auth`.
- Browser storage contains no access or refresh tokens.
- `GAME_ENGINE_ENABLED` matches the intended release state.
- Current round, countdown sync, lock phase, settlement, and wallet updates work.
- Duplicate bet and wallet retries with the same idempotency key do not double
  debit or credit.
- `seedReveal` is null before a round reaches `COMPLETED` or `CANCELLED`.
- Logs contain no passwords, JWTs, refresh tokens, cookies, bootstrap secrets,
  raw idempotency keys, or unrevealed seeds.

## Rollback

1. Pause the game through `POST /api/v1/admin/game-control/pause` if settlement,
   ledger, or payout correctness is uncertain.
2. Roll back the Render backend to the previous known-good deploy.
3. Roll back the Vercel frontend to the previous production deployment.
4. Restore the previous known-good environment values when an env change caused
   the incident.
5. Verify `/health/ready`, auth, current round recovery, and wallet reads before
   resuming the game.

Do not roll back or restore the database without a verified backup and an
incident-specific recovery plan. Prefer backward-compatible app rollback.
Never manually edit historical ledger rows.

## Emergency Admin Lock

### Suspend a Compromised Admin

An admin cannot ban their own account through the admin API. If an admin account
is compromised, use a trusted database operations session to suspend it and
revoke every session atomically:

```sql
BEGIN;

UPDATE users
SET status = 'SUSPENDED', updated_at = now()
WHERE email = 'compromised-admin@example.com'
  AND role = 'ADMIN';

UPDATE auth_sessions
SET revoked_at = now(), updated_at = now()
WHERE user_id = (
  SELECT id
  FROM users
  WHERE email = 'compromised-admin@example.com'
)
AND revoked_at IS NULL;

INSERT INTO audit_logs (
  actor_type,
  action,
  action_type,
  target_type,
  target_id,
  metadata
)
SELECT
  'SYSTEM',
  'EMERGENCY_ADMIN_LOCK',
  'EMERGENCY_ADMIN_LOCK',
  'USER',
  id::text,
  jsonb_build_object('reason', 'COMPROMISED_ADMIN_ACCOUNT')
FROM users
WHERE email = 'compromised-admin@example.com';

COMMIT;
```

Confirm the account can no longer access `/api/v1/admin/dashboard`.

### Revoke All Sessions

For a trusted logged-in admin, use:

```http
POST /api/v1/auth/logout-all
Authorization: Bearer <admin-access-token>
Origin: https://your-client.vercel.app
```

For a compromised account, use the database session-revocation transaction
above instead.

### Rotate JWT Secrets Safely

1. Pause sensitive game operations if the incident could affect settlement.
2. Revoke active sessions, especially compromised admin sessions.
3. Generate new independent high-entropy values for both
   `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
4. Update the production environment without exposing values in logs or source
   control.
5. Deploy all backend instances together. Mixed old/new secrets across active
   instances cause intermittent authentication failures.
6. Verify health/readiness and require every user to log in again.
7. Resume the game only after auth, admin access, wallet reads, and settlement
   checks pass.

Rotate `COOKIE_SECRET` too if it may have been exposed. Never reuse old JWT or
cookie secrets.
