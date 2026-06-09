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

Rounds move through:

```text
INIT -> OPEN -> LOCKED -> RESOLVING -> COMPLETED
```

- `OPEN`: betting accepted until `lock_time` at 45 seconds.
- `LOCKED`: no more bets until `end_time` at 60 seconds.
- `RESOLVING`: secure RNG result is stored, bets are settled, wallets are credited through ledger.
- `COMPLETED`: result has been broadcast and persisted.

## Redis Lock

`SchedulerService` runs every second, but the lifecycle tick is wrapped by `RedisLockService`:

```text
SET game:round-engine:lock <token> PX 5000 NX
```

Only the instance that acquires the lock creates, locks, or resolves rounds. Release uses a token-checked Lua delete to avoid deleting another instance's lock.

## Betting Flow

1. `POST /game/bets` authenticates the user.
2. The round row is locked with `SELECT ... FOR UPDATE`.
3. The server verifies the round is `OPEN` and `now() < lock_time`.
4. A `PENDING` bet is inserted. Unique `(user_id, round_id)` prevents duplicate bets.
5. Wallet debit is performed through `WalletService.debitCoins()` with a deterministic ledger idempotency key.
6. `bet:placed` and `wallet:update` are emitted.

If wallet debit fails, the bet is marked `CANCELLED`.

## Resolution Flow

1. Scheduler transitions `LOCKED -> RESOLVING`.
2. `ResultService` uses `crypto.randomInt()` to select `RED`, `GREEN`, or `VIOLET`.
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
- `wallet:update`

Socket.io uses Redis Pub/Sub via `@socket.io/redis-adapter` when `REDIS_URL` is configured.
