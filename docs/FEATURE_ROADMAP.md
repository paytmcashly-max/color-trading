# Feature Roadmap

This roadmap keeps production hardening separate from future product expansion.
Do not ship financial, KYC, or promotion features as partial hidden code paths.

## Phase 1: Must-Have Platform Trust

- Provably fair page
  - Show `seedHash` before and during a round.
  - Show `seedReveal` only after round completion or cancellation.
  - Explain the hash verification flow in plain language.
  - Add a small UI verifier that hashes the reveal and compares it with the
    committed hash.
- Wallet reconciliation
  - Keep the CLI: `npm run ops:wallet-reconcile -w @color-trading/server`.
  - Add an admin read-only page showing reconciliation status and mismatches.
- Admin audit viewer
  - Filter by actor, action, target, date, and request id.
  - Show sanitized metadata only.
- User session management
  - View active sessions.
  - Logout all devices.
  - Add admin session revoke for compromised accounts.
- Notifications
  - Bet result notification.
  - Wallet update notification.
  - Admin risk and system alerts.

## Phase 2: Monetization And User Controls

These features require legal, risk, compliance, and product review before
implementation.

- Deposits and withdrawals
  - Pending, approved, and rejected states.
  - Admin approval flow.
  - Transaction proof upload placeholder.
  - Withdrawal cooldown.
  - Withdrawal risk checks.
- KYC placeholder
  - Status field and admin review flow only.
  - Do not implement full KYC until the legal/compliance model is ready.
- Referral system
  - Referral code.
  - Anti-abuse checks.
  - Reward ledger entries.
- Leaderboard
  - Daily and weekly winners.
  - User opt-out privacy setting.
- Promotions and bonus wallet
  - Separate bonus wallet.
  - Wagering rules.
  - Expiry.
- Responsible play controls
  - Self-exclusion.
  - Daily loss limit.
  - Cooldown.
  - Account lock.

## Phase 3: Scale And Operations

- Multi-game engine with independent scheduler namespaces.
- Tournament mode.
- Advanced fraud rules and ML-assisted review.
- Admin role permissions:
  - `SUPER_ADMIN`
  - `SUPPORT`
  - `FINANCE`
  - `RISK`
- Web push notifications.
- Analytics dashboard.
