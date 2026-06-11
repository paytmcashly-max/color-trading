# Production Environment Reference

This file is the authoritative environment reference for the current runtime.
Use `.env.example` for annotated local-safe examples. Never commit real secrets.

## Server Runtime Variables

The server validates these variables in `apps/server/src/config/env.ts`.

| Variable | Requirement | Notes |
| --- | --- | --- |
| `NODE_ENV` | Required conceptually; defaults to `development` | Use `production` on Render. Accepted: `development`, `test`, `staging`, `production`. |
| `PORT` | Optional; defaults to `4000` | Render may inject it. |
| `CLIENT_ORIGIN` | Optional in dev; set in production | Primary browser origin, for example `https://app.example.com`. |
| `ALLOWED_ORIGINS` | Required in production | Comma-separated explicit HTTP origins. Never use `*`. |
| `SOCKET_ALLOWED_ORIGINS` | Required in production | Comma-separated explicit Socket.IO origins. Never use `*`. |
| `API_PREFIX` | Optional but fixed | Must be exactly `/api/v1`. |
| `API_VERSION` | Optional; defaults to `v1` | Version metadata only. |
| `RELEASE_VERSION` | Optional; defaults to `0.1.0` | Set to the deployed commit SHA in production. |
| `DATABASE_URL` | Required for a working server and production | PostgreSQL connection URL. |
| `REDIS_URL` | Required in staging and production | Used by rate limits, fraud protection, sockets, cache, and distributed locks. |
| `JWT_ACCESS_SECRET` | Required | Secret, random, at least 32 characters. Must differ from refresh secret. |
| `JWT_REFRESH_SECRET` | Required | Secret, random, at least 32 characters. Must differ from access secret. |
| `COOKIE_SECRET` | Required in production | Secret, random, unique, at least 32 characters. |
| `ROUND_SEED_ENCRYPTION_KEY` | Required in production | Secret, random, unique, at least 32 characters. Keep stable across deploys. |
| `JWT_ACCESS_TOKEN_TTL` | Optional; defaults to `15m` | JWT library duration. Keep aligned with seconds value. |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | Optional; defaults to `900` | Public access-token expiry metadata. |
| `JWT_REFRESH_TOKEN_TTL` | Optional; defaults to `7d` | JWT library duration. Keep aligned with days value. |
| `JWT_REFRESH_TOKEN_TTL_DAYS` | Optional; defaults to `7` | Session and refresh-cookie duration. |
| `JWT_ISSUER` | Optional | Defaults to `color-trading-api`. |
| `JWT_AUDIENCE` | Optional | Defaults to `color-trading-client`. |
| `GAME_ROUND_DURATION_SECONDS` | Optional; defaults to `60` | Range: 10-3600. |
| `GAME_BETTING_DURATION_SECONDS` | Optional; defaults to `45` | Must be less than round duration. |
| `GAME_SCHEDULER_TICK_MS` | Optional; defaults to `1000` | Range: 250-10000. |
| `GAME_ROUND_LOCK_TTL_MS` | Optional; defaults to `5000` | Range: 1000-60000. |
| `GAME_MAX_BET_PER_USER_PER_ROUND` | Optional; defaults to `1000` | Positive safe integer coin limit. |
| `GAME_MAX_EXPOSURE_PER_COLOR` | Optional; defaults to `100000` | Positive safe integer coin limit. |
| `GAME_ENGINE_ENABLED` | Optional; defaults to `true` | Set `false` to prevent scheduler startup. |

Compatibility aliases accepted by runtime are `CLIENT_URL`, `SOCKET_CORS_ORIGIN`,
and `JWT_SECRET`. New deployments should use `CLIENT_ORIGIN`,
`SOCKET_ALLOWED_ORIGINS`, and distinct `JWT_ACCESS_SECRET` /
`JWT_REFRESH_SECRET` instead.

## Client Runtime Variables

| Variable | Exposure | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Browser-visible | Server origin only, without `/api/v1`. Leave empty for the recommended same-origin Next.js proxy. |
| `NEXT_PUBLIC_API_BASE_PATH` | Browser-visible | Keep exactly `/api/v1`. |
| `NEXT_PUBLIC_SOCKET_URL` | Browser-visible | Direct Socket.IO server origin. |
| `BACKEND_API_URL` | Server-only Next.js setting | Destination for `/api/v1/*` and `/health/*` rewrites. Required when `NEXT_PUBLIC_API_URL` is empty. |

No other `NEXT_PUBLIC_*` variable is currently read by the client. Never place a
database URL, Redis URL, JWT secret, cookie secret, seed key, or admin bootstrap
credential in a `NEXT_PUBLIC_*` variable.

## Logging Safety

Never log secrets, cookies, tokens, passwords, refresh-token hashes, database
URLs, Redis URLs, raw idempotency keys, or seed reveals. New logging and audit
paths must pass metadata through `apps/server/src/common/security/redact.ts`.
Realtime observability should store event names plus safe identifiers such as
`userId`, `roundId`, `betId`, status, and code instead of full payload bodies.

## API Prefix And Cookie Path

Application routes are registered only under `/api/v1`. `API_PREFIX` is
validated as exactly `/api/v1`; it is not an arbitrary deployment prefix.

The refresh cookie path is `/api/v1/auth`. The client builds REST URLs as:

```text
NEXT_PUBLIC_API_URL + NEXT_PUBLIC_API_BASE_PATH + route
```

Therefore:

- Direct API mode: `NEXT_PUBLIC_API_URL=https://api.example.com` and
  `NEXT_PUBLIC_API_BASE_PATH=/api/v1`.
- Recommended same-origin proxy mode: leave `NEXT_PUBLIC_API_URL` empty, keep
  `NEXT_PUBLIC_API_BASE_PATH=/api/v1`, and set
  `BACKEND_API_URL=https://api.example.com`.
- Never set `NEXT_PUBLIC_API_URL=https://api.example.com/api/v1`; that duplicates
  the prefix.

## One-Time Admin Bootstrap Variables

These are read by operations scripts, not the normal server runtime:

| Variable | Requirement | Notes |
| --- | --- | --- |
| `ADMIN_BOOTSTRAP_EMAIL` | Required during bootstrap | `ADMIN_EMAIL` is a legacy alias. |
| `ADMIN_BOOTSTRAP_PASSWORD` | Required during bootstrap | Secret; 12-72 chars with uppercase, lowercase, number, and symbol. `ADMIN_PASSWORD` is a legacy alias. |
| `ADMIN_BOOTSTRAP_CONFIRM` | Conditional | Set exactly `PROMOTE_ADMIN` only to promote an existing normal user. |
| `ADMIN_BOOTSTRAP_TOKEN` | Required during production bootstrap/disable | Secret one-time authorization value. |
| `ADMIN_DISPLAY_NAME` | Optional | Defaults to `Admin`. |
| `ADMIN_BOOTSTRAP_ROTATE_PASSWORD` | Optional | Set `true` only for an intentional admin password rotation. |
| `ADMIN_BOOTSTRAP_INITIAL_COINS` | Optional | Defaults to `1000`; virtual coins only. |
| `ADMIN_BOOTSTRAP_DISABLE_REASON` | Optional | Audit reason used by the disable script. |

After creating and verifying the first admin:

1. Run `npm run db:disable-admin-bootstrap -w @color-trading/server`.
2. Remove `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_TOKEN`,
   `ADMIN_BOOTSTRAP_CONFIRM`, and other bootstrap-only variables from Render.
3. Rotate any bootstrap credential that entered a shared operations channel.

## Production Checklist

- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` points to managed PostgreSQL with TLS
- [ ] `REDIS_URL` points to managed Redis with TLS where supported
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are random, at least 32 chars, and different
- [ ] `COOKIE_SECRET` is random, unique, and at least 32 chars
- [ ] `ROUND_SEED_ENCRYPTION_KEY` is random, unique, backed up securely, and stable
- [ ] `ALLOWED_ORIGINS` contains only explicit Vercel/client origins and no `*`
- [ ] `SOCKET_ALLOWED_ORIGINS` contains only explicit Vercel/client origins and no `*`
- [ ] `API_PREFIX=/api/v1`
- [ ] `NEXT_PUBLIC_API_URL` does not include `/api/v1`
- [ ] Bootstrap-only variables are absent after first-admin setup
