# Fraud Detection Layer

This module monitors abuse without changing wallet ledger internals or the game round engine.

## Structure

```text
/modules/fraud
  risk.engine.ts
  fraud.service.ts
  rateLimiter.ts
  botDetector.ts
  sessionTracker.ts
  fraud.middleware.ts
  fraud.module.ts
```

## Risk Response

- `0-30`: normal monitoring
- `31-60`: closer monitoring and admin visibility
- `61-80`: soft betting frequency restriction
- `81-100`: temporary betting block

Risk decays slowly over time so false positives can recover without manual intervention.

## Example Scenarios

| Scenario | Detection | Response |
| --- | --- | --- |
| User submits many bets in seconds | Redis per-user betting limiter | Log `BET_USER_RATE_LIMIT`, add risk, emit `fraud:rate_limit_triggered` |
| Many users submit from one IP | Redis per-IP betting limiter and session tracker | Log `BET_IP_RATE_LIMIT` or `MULTI_ACCOUNT_IP`, add risk, alert admins |
| Repeated identical timing between bets | `BotDetector` interval analysis | Log `BOT_TIMING_PATTERN`, mark `botSuspected`, emit `fraud:high_risk_user` |
| Same behavior signature across users | Redis signature sets by choice/amount/time bucket | Log `BOT_SHARED_BEHAVIOR_PATTERN`, add risk |
| Socket event flood | Redis socket limiter plus local fallback | Log `SOCKET_RATE_LIMIT`, emit admin alert |
| Login burst from one IP | Redis auth limiter | Block auth attempt with `429`, log `LOGIN_RATE_LIMIT` |
| High-risk user tries to bet | Risk profile gate before bet controller | Block betting with `423`, log `BET_BLOCKED_HIGH_RISK` |

PostgreSQL remains the source of truth for fraud logs and user risk profiles. Redis is used only for fast counters, short-lived behavior windows, and cached signals.
