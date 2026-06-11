# Wallet Rules

- The wallet snapshot contains `depositBalance` and `winningBalance`; total
  balance is derived and never stored.
- Every mutation is represented by one immutable, idempotent `coin_ledger`
  entry in the same database transaction as the snapshot update.
- Credits from game wins go to `winningBalance`. Other approved credits go to
  `depositBalance`.
- Bet and admin debits consume `depositBalance` first, then
  `winningBalance`. A debit that would make either effective total negative is
  rejected.
- Cancelled-bet refunds currently return to `depositBalance` because historical
  per-bet source allocation is not stored. Source-preserving refunds remain a
  future schema enhancement.
- Direct HTTP wallet mutations are not exposed. Manual changes use only
  `POST /api/v1/admin/wallet/:userId/adjust`.

Run the read-only reconciliation operation with:

```bash
npm run ops:wallet-reconcile -w @color-trading/server
```

It compares each wallet snapshot total with successful ledger credits minus
debits, prints mismatches, changes no data, and exits with code `2` when a
mismatch is found.
