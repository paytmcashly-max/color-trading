# Wallet Module

This module owns the virtual coin economy. It does not implement game rules.

## Folder Structure

```text
modules/wallet/
  dto/
    wallet.dto.ts
  wallet.controller.ts
  wallet.repository.ts
  wallet.routes.ts
  wallet.serializer.ts
  wallet.service.ts
```

## Service API

- `getWalletBalance(userId)`
- `creditCoins(userId, amountCoins, referenceId, idempotencyKey)`
- `debitCoins(userId, amountCoins, referenceId, idempotencyKey)`
- `creditBetWinnings(userId, amountCoins, referenceId, idempotencyKey)`
- `adminAdjustCoins(userId, amountCoins, direction, referenceId, idempotencyKey)`
- `getLedgerHistory(userId)`

## HTTP Endpoints

All wallet endpoints require `Authorization: Bearer <accessToken>`.

### GET /api/v1/wallet/balance

Response:

```json
{
  "wallet": {
    "id": "uuid",
    "userId": "uuid",
    "depositBalance": "1000",
    "winningBalance": "0",
    "totalBalance": "1000",
    "ledgerVersion": "4",
    "status": "ACTIVE",
    "createdAt": "2026-06-09T00:00:00.000Z",
    "updatedAt": "2026-06-09T00:00:00.000Z"
  }
}
```

### GET /api/v1/wallet/ledger?limit=50&cursor=<nextCursor>

Response:

```json
{
  "entries": [
    {
      "id": "uuid",
      "type": "BET_DEBIT",
      "direction": "DEBIT",
      "amountCoins": "100",
      "balanceAfterCoins": "900",
      "status": "SUCCESS",
      "idempotencyKey": "bet:user:round:v1"
    }
  ],
  "pageInfo": {
    "limit": 50,
    "nextCursor": null
  }
}
```

### POST /api/v1/wallet/bonus-credit

Request:

```json
{
  "amountCoins": 500,
  "referenceId": "00000000-0000-0000-0000-000000000001",
  "idempotencyKey": "bonus:user:campaign:001"
}
```

### POST /api/v1/wallet/bet-debit

Prepared for future bet placement. It debits coins with `BET_DEBIT`; it does not create bets or rounds.

Request:

```json
{
  "amountCoins": 100,
  "referenceId": "00000000-0000-0000-0000-000000000002",
  "idempotencyKey": "bet:user:round:001"
}
```

### POST /api/v1/wallet/admin/users/:userId/adjust

Requires `ADMIN` role.

```json
{
  "amountCoins": 250,
  "direction": "CREDIT",
  "referenceId": "00000000-0000-0000-0000-000000000003",
  "idempotencyKey": "admin:user:ticket:123"
}
```

## Transaction Flow

Example: user places a future bet.

1. Auth guard resolves the user.
2. `WalletService.debitCoins()` receives amount, reference id, and idempotency key.
3. Repository starts a PostgreSQL transaction with `Serializable` isolation.
4. Wallet row is created if missing, then locked with `SELECT ... FOR UPDATE`.
5. Existing `coin_ledger.idempotency_key` is checked to prevent replay.
6. If balance is sufficient:
   - Insert immutable `coin_ledger` row with `BET_DEBIT` and `SUCCESS`.
   - Update wallet snapshot balance and increment `ledger_version`.
   - Commit.
7. If balance is insufficient:
   - Insert immutable `coin_ledger` row with `BET_DEBIT` and `FAILED`.
   - Do not update wallet snapshot.
   - Commit, then return `409 INSUFFICIENT_FUNDS`.

## Concurrency Safety

- Wallet mutations run inside a single database transaction.
- `SELECT ... FOR UPDATE` serializes simultaneous operations for the same wallet.
- `coin_ledger.idempotency_key` is unique and catches retry races.
- Wallet snapshot is updated only after a ledger entry is inserted.
- Ledger rows are insert-only. They are never updated to change meaning after creation.
- Coin values are stored as database `BigInt`; API responses serialize them as strings to avoid JSON precision loss.
