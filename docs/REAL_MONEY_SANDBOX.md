# Compliance-Gated Real-Money Sandbox

This repository contains an isolated, sandbox-only paise wallet and betting domain. It never changes the existing virtual coin wallet or premium-credit wallet.

## Safety State

- `REAL_MONEY_ENABLED=false` by default.
- Every player mutation and admin mutation requires all six compliance flags.
- `NODE_ENV=production` rejects `REAL_MONEY_ENABLED=true` in this iteration.
- Cashfree is restricted to its sandbox base URL.
- Browser return URLs never credit a wallet. Only a verified, signed backend event can credit a deposit.
- Withdrawals are manual admin-reviewed state transitions; there is no payout-provider integration.

Render free resources are suitable only for sandbox evaluation. They are not suitable for a real-money production workload.

## Isolated Data

`RealMoneyGameWallet`, `RealMoneyGameLedgerEntry`, `RealMoneyBet`, `RealMoneyRoundSettlement`, `RealMoneyDeposit`, and `RealMoneyWithdrawal` are separate from virtual coins and premium credits. All values are integer paise. Wallet movements are serializable, ledger-backed, and idempotent.

Daily limits reset at midnight `Asia/Kolkata`.

## Enable Locally

Configure the payment service and its separate PostgreSQL database, then deliberately enable all compliance flags in a non-production environment. Review KYC and risk controls through `/api/v1/admin/real-money`.

If the malformed pre-release payment bootstrap was ever attempted, recreate the isolated sandbox
payment database before enabling the service. The migration is transactional, and no production
payment data should exist in this iteration.

Never enable this surface for production without provider approval, legal review, KYC/AML operations, responsible-gaming operations, incident response, and upgraded infrastructure.

## Operations

Dry-run reconciliation:

```bash
npm run ops:real-money-game-reconcile -w @color-trading/server
```

The command reports wallet/ledger mismatches and failed settlements. `--apply` is intentionally rejected; repairs must use an audited migration.

Render auto-deploy temporarily uses `commit` because the latest repository state had no detected GitHub checks. Restore `checksPass` after GitHub Actions is confirmed running on `main`.
