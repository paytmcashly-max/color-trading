# Observability Layer

Production monitoring, structured logging, request tracing, metrics, health checks, and admin alerts live here.

## Structure

```text
/modules/observability
  logger.service.ts
  requestTracer.ts
  metrics.service.ts
  error.handler.ts
  audit.service.ts
  health.controller.ts
  alert.service.ts
  observability.module.ts
```

## Endpoints

- `GET /health`
- `GET /health/live` - process liveness probe; does not depend on external services
- `GET /health/ready` - traffic readiness probe; requires PostgreSQL and Redis
- `GET /health/db`
- `GET /health/redis`
- `GET /health/socket`
- `GET /health/metrics`

Each dependency endpoint returns status, connection state, and latency where applicable.

Use `/health/live` for container/process restarts and `/health/ready` for load-balancer
traffic admission. The aggregate `/health` endpoint includes dependencies and a metrics
snapshot for operators.

## Data Stores

- `logs`: async batched structured logs
- `audit_logs`: admin/system/user audit trail
- `system_metrics`: periodic metrics snapshots

## Signals

The module records:

- request start/completion with `request_id`, route, user, response time, and status
- Pino JSON logs with secret redaction and asynchronous database persistence
- request throughput, 4xx/5xx rate, average latency, and p95 latency
- game lifecycle events from the realtime event bus
- bet and wallet transaction rates
- socket and active-user gauges
- HTTP error-rate spikes
- DB/Redis health failures
- round engine failures

Alerts are sent to the admin realtime room with `observability:alert` and logged as structured warnings.
