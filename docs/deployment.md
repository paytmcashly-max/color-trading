# Production Deployment

This monorepo is prepared for a split production deployment:

- Frontend: Vercel, using `vercel.json`
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

## Database Migrations

Database migrations are applied by `npm run db:migrate:deploy`.

The migration runner:

- takes a PostgreSQL advisory lock so only one migration process runs at a time
- bootstraps `apps/server/prisma/init.sql` only when the schema is empty
- records SQL migrations in `schema_migrations`
- verifies migration checksums on later runs

Do not run schema changes from every web process. Use Render `preDeployCommand` or the
manual GitHub Actions workflow: `Production database migration`.

## Local Production-Like Stack

```bash
docker compose up --build
```

Compose runs a one-shot `migrate` service before the backend starts.

## Health Probes

- Liveness: `GET /health/live`
- Readiness: `GET /health/ready`
- Aggregate health: `GET /health`

Use `/health/live` for container restarts and `/health/ready` for traffic admission.
