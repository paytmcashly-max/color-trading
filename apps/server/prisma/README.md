# Database Schema

This directory contains the Step 2 database design for the virtual coin prediction platform.

## Relationships

- `users` owns one `wallets` row through `wallets.user_id`.
- `wallets` is a cached balance snapshot. It is not the financial source of truth.
- `coin_ledger` belongs to both `users` and `wallets` and records every coin movement.
- `game_rounds` has many `bets`.
- `bets` belongs to one `users` row and one `game_rounds` row.
- `coin_packages` is independent catalog data for future virtual coin purchases.

## Ledger Rule

`coin_ledger` is the source of truth. Wallet balance must be changed only inside the same database transaction that creates a ledger row. The snapshot exists so reads are fast, but it must always be reconcilable from successful ledger rows.

## Indexing Strategy

- `users.email` is unique for authentication lookup.
- `wallets.user_id` is unique so each user has one wallet.
- `coin_ledger.idempotency_key` is unique to prevent duplicate coin movements from retries.
- `coin_ledger.user_id`, `wallet_id`, `status`, `type`, and polymorphic reference columns support account history and reconciliation.
- `game_rounds.status + start_time` supports scheduler queries for the active round.
- `bets.user_id + round_id` is unique to prevent double betting in a round.
- `bets.round_id + status` supports settlement scans.

## Concurrency Rules

Use a PostgreSQL transaction for bet placement:

1. Read the open round and verify `now() < lock_time`.
2. Lock the wallet row with `SELECT ... FOR UPDATE`.
3. Insert the `bets` row. The unique `(user_id, round_id)` constraint rejects duplicate betting.
4. Insert a `coin_ledger` row with a unique `idempotency_key`.
5. Update the wallet snapshot balance and `ledger_version`.
6. Commit.

Settlement follows the same pattern: update bet status, insert winning credit ledger rows with deterministic idempotency keys, then update wallet snapshots in the same transaction.

## PostgreSQL Constraints to Add in First Migration

Prisma does not model every useful PostgreSQL check constraint. Apply the companion SQL in `integrity.sql` in the first migration after Prisma creates the tables.

```sql
psql "$DATABASE_URL" -f apps/server/prisma/integrity.sql
```
