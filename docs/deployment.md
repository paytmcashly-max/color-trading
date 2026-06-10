# Production Deployment

This monorepo is prepared for a split production deployment:

- Frontend: Vercel, using `vercel.json` and Vercel Git integration for auto-deploys from `main`
- Backend: Render Docker web service, using `render.yaml`
- Database: managed PostgreSQL
- Realtime/cache: managed Redis

## Required Backend Environment

Set these values in the backend hosting environment:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `COOKIE_SECRET`
- `CLIENT_URL`
- `CLIENT_ORIGIN`
- `ALLOWED_ORIGINS`
- `SOCKET_CORS_ORIGIN`
- `SOCKET_ALLOWED_ORIGINS`
- `ADMIN_BOOTSTRAP_EMAIL` only while bootstrapping
- `ADMIN_BOOTSTRAP_PASSWORD` only while bootstrapping
- `ADMIN_BOOTSTRAP_TOKEN` only while bootstrapping or disabling bootstrap

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `COOKIE_SECRET` must be unique,
high-entropy values in production. Access and refresh JWT secrets must be
different, and placeholders are rejected at startup.
Set `GAME_MAX_BET_PER_USER_PER_ROUND` and `GAME_MAX_EXPOSURE_PER_COLOR` to
match your risk limits. Admin-sensitive APIs require the admin user's
`email_verified_at` column to be set; the bootstrap command marks bootstrap
admins as verified.

## Required Frontend Environment

Set these values in Vercel:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_API_BASE_PATH=/api/v1`
- `NEXT_PUBLIC_SOCKET_URL`

The browser stores only the short-lived access token in memory. Refresh sessions
are kept in an httpOnly cookie set by the backend. In production, the backend
sets that cookie with `Secure` and `SameSite=None` so the Vercel frontend can
refresh sessions against the Render API over CORS. The refresh cookie is scoped
to `/api/v1/auth`.

Vercel is expected to redeploy the frontend automatically on every push to the
GitHub `main` branch. GitHub Actions does not need a Vercel token for this flow.

## Database Migrations

Database migrations are applied by `npm run db:migrate:deploy`.

The migration runner:

- takes a PostgreSQL advisory lock so only one migration process runs at a time
- bootstraps `apps/server/prisma/init.sql` only when the schema is empty
- records SQL migrations in `schema_migrations`
- verifies line-ending-independent migration checksums on later runs

Use Render `preDeployCommand` or the manual GitHub Actions workflow:
`Production database migration` as the primary migration path. The production
container also runs the advisory-lock protected migration runner before starting
the API, preventing a skipped pre-deploy hook from launching against an older
schema.

## Admin Bootstrap

Admin users must not be created through public registration or normal deploys. Bootstrap
the first admin with a private one-time operations command in the production environment:

```bash
ADMIN_BOOTSTRAP_EMAIL="admin@example.com" \
ADMIN_BOOTSTRAP_PASSWORD="<private-strong-password>" \
ADMIN_BOOTSTRAP_TOKEN="<private-one-time-bootstrap-token>" \
npm run db:seed:admin -w @color-trading/server
```

`ADMIN_BOOTSTRAP_PASSWORD` must be 12-72 characters and include uppercase,
lowercase, number, and symbol. If `ADMIN_BOOTSTRAP_EMAIL` already belongs to a normal user,
set `ADMIN_BOOTSTRAP_CONFIRM=PROMOTE_ADMIN`; otherwise the script refuses to
promote the account. In production, `ADMIN_BOOTSTRAP_TOKEN` is required and only
a hash prefix is stored in audit metadata.

Once any admin exists, the bootstrap script refuses to create or promote another
admin account. After the first admin can log in:

- remove the bootstrap environment values from the hosting environment
- run `npm run db:disable-admin-bootstrap -w @color-trading/server`
- rotate the password from a secure admin flow or by rerunning the command with `ADMIN_BOOTSTRAP_ROTATE_PASSWORD=true`
- keep normal Render deploys limited to schema migration and app startup

The bootstrap script is idempotent, does not print credentials, writes an audit
log, and revokes existing admin sessions when it changes the admin password.
Admin TOTP/2FA is intentionally left as a production TODO before broad admin
rollout.

## Local Production-Like Stack

```bash
docker compose up --build
```

Compose runs a one-shot `migrate` service before the backend starts.

## Health Probes

- Aggregate health: `GET /health`
- Liveness: `GET /health/live`
- Readiness: `GET /health/ready`

Render currently uses `GET /health` as the deployment health check because it verifies
the app and core dependencies together.
