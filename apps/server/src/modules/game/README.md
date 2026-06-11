# Game Engine

This module owns the real-time round lifecycle and betting integration. It does not implement frontend UI or real money behavior.

## Folder Structure

```text
modules/game/
  controllers/
    bet.controller.ts
    round.controller.ts
  dto/
    place-bet.dto.ts
  repositories/
    game.repository.ts
  services/
    bet.service.ts
    redis-lock.service.ts
    result.service.ts
    round.service.ts
    scheduler.service.ts
  game.bootstrap.ts
  game.events.ts
  game.routes.ts
```

## Lifecycle

Rounds move through the normal lifecycle:

```text
INIT -> OPEN -> LOCKED -> RESOLVING -> COMPLETED
```

An administrator may stop any active lifecycle state and transition it directly
to `CANCELLED`. A cancelled round refunds and cancels pending bets and never
emits the normal completion event.

- `OPEN`: betting accepted until `lock_time` at 45 seconds.
- `LOCKED`: no more bets until `end_time` at 60 seconds.
- `RESOLVING`: secure RNG result is stored, bets are settled, wallets are credited through ledger.
- `COMPLETED`: result has been broadcast and persisted.
- `CANCELLED`: admin-stopped round; pending bets are cancelled and refunded.

## Redis Lock

`SchedulerService` runs every second, but the lifecycle tick is wrapped by `RedisLockService`:

```text
SET game:round-engine:lock <token> PX 5000 NX
```

Only the instance that acquires the lock creates, locks, or resolves rounds. Release uses a token-checked Lua delete to avoid deleting another instance's lock.

## Betting Flow

1. `POST /api/v1/game/bets` authenticates the user.
2. The round row is locked with `SELECT ... FOR UPDATE`.
3. The server verifies the round is `OPEN` and `now() < lock_time`.
4. A `PENDING` bet is inserted. The bet idempotency key prevents duplicate submissions.
5. Wallet debit is performed through `WalletService.debitCoins()` with a deterministic ledger idempotency key.
6. `bet:placed` and `wallet:update` are emitted.

If wallet debit fails, the bet is marked `CANCELLED`.

## Resolution Flow

1. Scheduler transitions `LOCKED -> RESOLVING`.
2. `ResultService` uses the private seed reveal to derive `RED`, `GREEN`, or `VIOLET`.
3. Pending bets are read for the round.
4. Losing bets are marked `LOST`.
5. Winning bets are credited through `WalletService.creditBetWinnings()` and then marked `WON`.
6. Round transitions to `COMPLETED`.
7. `round:result` and `wallet:update` events are broadcast.

## Socket Events

- `round:created`
- `round:timer`
- `round:locked`
- `bet:placed`
- `round:result`
- `round:completed` for normally settled rounds
- `round:cancelled` for admin-stopped/refunded rounds
- `round:update` and `round:state` for every terminal state change
- `wallet:update`

Socket.io uses Redis Pub/Sub via `@socket.io/redis-adapter` when `REDIS_URL` is configured.

Rounds store `seed_hash` and an AES-GCM encrypted durable reveal in
`game_round_secrets` within the same database transaction. Production requires
a stable `ROUND_SEED_ENCRYPTION_KEY`; Redis/local storage is only a best-effort
cache. The public `seed_reveal` field remains null until the round is completed
or cancelled.

## Risk Limits

Bet placement enforces:

- `GAME_MAX_BET_PER_USER_PER_ROUND`: maximum total stake by one user in one round.
- `GAME_MAX_EXPOSURE_PER_COLOR`: maximum total stake on one color in one round.

Both checks run inside the serializable bet transaction before wallet debit.
