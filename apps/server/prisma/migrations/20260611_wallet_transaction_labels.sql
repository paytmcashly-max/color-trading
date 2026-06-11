CREATE OR REPLACE VIEW wallet_transactions AS
SELECT
  id,
  user_id,
  CASE
    WHEN type = 'BET_DEBIT' THEN 'BET_PLACED'
    WHEN type = 'BET_WIN_CREDIT' THEN 'BET_WIN_PAYOUT'
    WHEN type = 'ADMIN_ADJUSTMENT' AND reference_type = 'BET' AND direction = 'CREDIT'
      THEN 'BET_REFUND'
    WHEN type = 'ADMIN_ADJUSTMENT' THEN 'ADMIN_ADJUSTMENT'
    ELSE 'DEPOSIT'
  END AS type,
  amount_coins AS amount,
  balance_before_coins AS balance_before,
  balance_after_coins AS balance_after,
  created_at
FROM coin_ledger;
