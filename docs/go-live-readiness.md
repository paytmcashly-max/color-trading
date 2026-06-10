# Go-Live Production Readiness

## Production Readiness Checklist

| Area | Status | Evidence |
| --- | --- | --- |
| Auth JWT and cookie secrets from env | YES | Distinct `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `COOKIE_SECRET` validated at boot |
| RBAC admin protection | YES | Admin routes use `authGuard` + `roleGuard(ADMIN)` |
| Token expiry/session revocation | YES | Auth sessions checked on HTTP and socket auth |
| Ledger-only wallet mutations | YES | Wallet service writes ledger then snapshot in transaction |
| Idempotency on wallet operations | YES | `coin_ledger.idempotency_key` unique |
| Direct wallet balance manipulation blocked | YES | Admin adjustment still goes through wallet service |
| One active round engine | YES | Redis `SET NX PX` lock around scheduler tick |
| Duplicate betting blocked | YES | DB unique `(user_id, round_id)` |
| Secure RNG | YES | Result service uses `crypto.randomInt` |
| Socket JWT auth required | YES | Socket middleware verifies access token/session |
| Socket room join validation | YES | Round room joins verify round existence |
| Reconnect state sync | YES | `state:sync` emits current round and wallet snapshot |
| Fraud/rate limiting active | YES | Auth, bet, socket, global API limits |
| Observability active | YES | Request tracing, logs, metrics, alerts, health endpoints |
| Deployment rollback documented | YES | See rollback plan below |
| DB migrations applied | NO | Must run final Prisma migration before launch |
| Load test completed | NO | Must complete before public launch |
| Secrets rotated for production | NO | Must complete in Render/Vercel dashboards |

## Go-Live Deployment Steps

1. Freeze code and tag release: `v0.1.0`.
2. Create and review Prisma migration for all final schema changes.
3. Apply migration to staging.
4. Deploy backend staging on Render with `GAME_ENGINE_ENABLED=true`.
5. Deploy frontend preview on Vercel pointed at staging API/socket URLs.
6. Run smoke tests:
   - `GET /health`
   - `GET /health/db`
   - `GET /health/redis`
   - `GET /health/socket`
   - login/register
   - wallet balance read
   - place one virtual prediction
   - admin dashboard access as ADMIN
7. Run load test for sockets and bet placement.
8. Promote backend production deploy.
9. Promote Vercel production deploy.
10. Watch admin dashboard, Render logs, `/health/metrics`, and alerts for 30 minutes.

## Rollback Strategy

Backend:

- Keep the previous Render deploy available.
- If health checks fail, rollback to the previous Render deploy.
- If DB migration is backward compatible, rollback app only.
- If DB migration is not backward compatible, stop traffic, restore DB snapshot, then rollback app.

Frontend:

- Use Vercel instant rollback to the previous production deployment.
- Keep `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` stable where possible.

Database:

- Take snapshot before migration.
- Never run destructive migrations during launch window.
- Ledger tables are append-only; do not edit historical ledger rows.

## Scaling Limits and Thresholds

| Metric | Warning | Critical | Action |
| --- | ---: | ---: | --- |
| Active sockets | 7,500 | 10,000 | Scale Render instances |
| Socket latency | 100ms | 250ms | Scale backend / inspect Redis |
| DB latency | 50ms | 150ms | Check indexes and connection pool |
| Redis latency | 20ms | 75ms | Check region and plan limits |
| HTTP 5xx/min | 5 | 10 | Stop deploy / rollback |
| Bet failures/min | 10 | 25 | Inspect fraud/rate/ledger errors |
| Ledger write failures | 1 | 3 | Stop betting immediately |
| Round completion delay | 5s | 15s | Check game engine and DB |

## Critical Failure Scenarios

| Scenario | Handling |
| --- | --- |
| Game engine crashes | Render restarts server; scheduler resumes from DB active round state; Redis lock prevents duplicate engines |
| Redis fails | Critical wallet/game state remains in Postgres; sockets degrade and clients resync from DB after Redis returns |
| Socket disconnect spike | Alert fires; scale backend; clients reconnect and call `state:sync` |
| Ledger failure | Treat as launch-stopper; disable betting at routing/load-balancer level or rollback immediately |
| DB health fails | Health returns unhealthy; stop deployment and fail traffic until DB recovers |
| Fraud/rate-limit false positive | Admin can review fraud logs; risk decay reduces score over time |
| Bad frontend deploy | Vercel rollback to previous deployment |
| Bad backend deploy | Render rollback to previous deployment |

## Final Architecture

```text
Users
  -> Vercel CDN / Next.js client
  -> Render Load Balancer
  -> Stateless Node.js API instances
       -> Auth/RBAC
       -> Fraud guards
       -> Game routes
       -> Wallet ledger service
       -> Socket.io server
       -> Observability module
  -> Redis
       -> Socket adapter
       -> Pub/Sub
       -> Rate limits
       -> Game engine lock
  -> PostgreSQL
       -> Users/sessions
       -> Wallet snapshots
       -> Coin ledger source of truth
       -> Rounds/bets
       -> Fraud logs/risk profiles
       -> Logs/metrics/audit logs
  -> Admin Dashboard
       -> Health
       -> Fraud alerts
       -> Metrics
       -> Audit controls
```

## Launch Safety Checklist

- [ ] Production Render env vars set and reviewed.
- [ ] Production Vercel env vars set and reviewed.
- [ ] No secrets committed to repo.
- [ ] DB snapshot taken.
- [ ] Prisma migration applied to staging and production.
- [ ] `/health`, `/health/db`, `/health/redis`, `/health/socket` pass.
- [ ] Admin account exists and can access `/admin-dashboard`.
- [ ] Fraud alerts reach admin dashboard.
- [ ] Observability alerts reach admin dashboard.
- [ ] Load test meets 10k socket target or agreed MVP capacity.
- [ ] Rollback owner assigned.
- [ ] Incident channel open during launch.
- [ ] First 30-minute monitoring window staffed.
