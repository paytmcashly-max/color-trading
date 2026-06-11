# Production Launch Checklist

Use this checklist for the final Render backend and Vercel frontend launch.

## 1. Render Backend Environment

Set these variables in the Render service before deploying production:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_ACCESS_SECRET=<unique-strong-secret>
JWT_REFRESH_SECRET=<different-unique-strong-secret>
COOKIE_SECRET=<different-unique-strong-secret>
CLIENT_ORIGIN=https://your-client.vercel.app
ALLOWED_ORIGINS=https://your-client.vercel.app
SOCKET_ALLOWED_ORIGINS=https://your-client.vercel.app
GAME_ENGINE_ENABLED=true
GAME_MAX_BET_PER_USER_PER_ROUND=1000
GAME_MAX_EXPOSURE_PER_COLOR=100000
```

For first admin creation only, temporarily set:

```bash
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=<12-72 chars with uppercase lowercase number symbol>
ADMIN_BOOTSTRAP_TOKEN=<private-one-time-token>
```

The bootstrap script also accepts the older `ADMIN_EMAIL` and `ADMIN_PASSWORD`
names as fallbacks, but new production setup should use the
`ADMIN_BOOTSTRAP_*` names.

## 2. Vercel Frontend Environment

Set these variables in the Vercel project:

```bash
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_API_BASE_PATH=/api/v1
NEXT_PUBLIC_SOCKET_URL=https://your-api.onrender.com
BACKEND_API_URL=https://your-api.onrender.com
```

## 3. Pre-Deploy Verification

Run locally before pushing the release:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm test
npm run db:validate -w @color-trading/server
```

## 4. Database Migration

Run the production migration once, from a controlled job or Render shell:

```bash
npm run db:migrate:deploy -w @color-trading/server
```

Do not run destructive schema changes during a launch window. Take a managed
PostgreSQL snapshot before applying migrations.

## 5. First Admin Bootstrap

Run only after production migrations are applied:

```bash
ADMIN_BOOTSTRAP_EMAIL="admin@example.com" \
ADMIN_BOOTSTRAP_PASSWORD="<private-password>" \
ADMIN_BOOTSTRAP_TOKEN="<private-one-time-token>" \
npm run db:seed:admin -w @color-trading/server
```

After the first admin can log in:

```bash
npm run db:disable-admin-bootstrap -w @color-trading/server
```

Then remove `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, and
`ADMIN_BOOTSTRAP_TOKEN` from Render, rotate the admin password if it was shared
over an operations channel, and redeploy.

## 6. Smoke-Test Checklist

Use the production URLs and confirm:

- `GET https://your-api.onrender.com/health/live` returns healthy.
- `GET https://your-api.onrender.com/health/ready` returns healthy.
- Normal user registration succeeds.
- Normal user login succeeds.
- Normal user cannot access `GET /api/v1/admin/dashboard`.
- Admin login succeeds.
- Admin dashboard loads in the Vercel app.
- Wallet balance loads for a normal user.
- Current round loads.
- A bet can be placed during the open betting window.
- Settlement updates the wallet after the round result.
- Logout clears the session.
- Refresh flow works after reloading the app.

## 7. Rollback Notes

- Backend: use Render rollback to the previous healthy deploy.
- Frontend: use Vercel instant rollback to the previous production deployment.
- Database: restore the pre-launch PostgreSQL snapshot only if a migration is
  not backward compatible; otherwise roll back app code first.
- If ledger writes fail, pause betting or roll back immediately. Data integrity
  wins over availability.
- Keep `GAME_ENGINE_ENABLED=false` available as an emergency backend env toggle
  for stopping the scheduler during incident response.
