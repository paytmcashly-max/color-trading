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
- `CLIENT_URL`
- `CLIENT_ORIGIN`
- `ALLOWED_ORIGINS`
- `SOCKET_CORS_ORIGIN`
- `SOCKET_ALLOWED_ORIGINS`

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be different in production.

## Required Frontend Environment

Set these values in Vercel:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SOCKET_URL`

Vercel is expected to redeploy the frontend automatically on every push to the
GitHub `main` branch. GitHub Actions does not need a Vercel token for this flow.

## Database Migrations

Database migrations are applied by `npm run db:migrate:deploy`.

The migration runner:

- takes a PostgreSQL advisory lock so only one migration process runs at a time
- bootstraps `apps/server/prisma/init.sql` only when the schema is empty
- records SQL migrations in `schema_migrations`
- verifies migration checksums on later runs

Do not run schema changes from every web process. Use Render `preDeployCommand` or the
manual GitHub Actions workflow: `Production database migration`.

## Admin Bootstrap

Admin users must not be created through public registration or normal deploys. Bootstrap
the first admin with a private one-time operations command in the production environment:

```bash
ADMIN_BOOTSTRAP_EMAIL="admin@example.com" \
ADMIN_BOOTSTRAP_PASSWORD="<private-one-time-password>" \
ADMIN_BOOTSTRAP_DISPLAY_NAME="Admin" \
npm run ops:bootstrap-admin -w @color-trading/server
```

After the first admin can log in:

- remove the bootstrap environment values from the hosting environment
- rotate the password from a secure admin flow or by rerunning the command with `ADMIN_BOOTSTRAP_ROTATE_PASSWORD=true`
- keep normal Render deploys limited to schema migration and app startup

The bootstrap script is idempotent, does not print credentials, and writes an audit log.

## Local Production-Like Stack

```bash
docker compose up --build
```

Compose runs a one-shot `migrate` service before the backend starts.

## Health Probes

- Aggregate health: `GET /health`

Render currently uses `GET /health` as the deployment health check because it verifies
the app and core dependencies together.
