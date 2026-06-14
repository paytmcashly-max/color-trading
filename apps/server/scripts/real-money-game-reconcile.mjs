import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

export function findRealMoneyMismatches(rows) {
  return rows
    .map((row) => ({
      userId: row.userId,
      walletId: row.walletId,
      snapshotAvailablePaise: String(row.availablePaise),
      snapshotLockedPaise: String(row.lockedPaise),
      ledgerAvailablePaise: String(row.ledgerAvailablePaise),
      ledgerLockedPaise: String(row.ledgerLockedPaise),
      availableDifference: (BigInt(row.availablePaise) - BigInt(row.ledgerAvailablePaise)).toString(),
      lockedDifference: (BigInt(row.lockedPaise) - BigInt(row.ledgerLockedPaise)).toString(),
    }))
    .filter((row) => row.availableDifference !== "0" || row.lockedDifference !== "0");
}

async function main() {
  if (process.argv.includes("--apply")) {
    throw new Error("Apply mode is intentionally unavailable; investigate and repair through an audited migration.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const wallets = await client.query(`
      SELECT w.id::text AS "walletId", w.user_id::text AS "userId",
        w.available_paise::text AS "availablePaise", w.locked_paise::text AS "lockedPaise",
        COALESCE((SELECT l.available_after_paise FROM real_money_game_ledger l WHERE l.wallet_id = w.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1), 0)::text AS "ledgerAvailablePaise",
        COALESCE((SELECT l.locked_after_paise FROM real_money_game_ledger l WHERE l.wallet_id = w.id ORDER BY l.created_at DESC, l.id DESC LIMIT 1), 0)::text AS "ledgerLockedPaise"
      FROM real_money_game_wallets w ORDER BY w.user_id
    `);
    const counts = await client.query(`
      SELECT
        (SELECT count(*) FROM real_money_deposits WHERE status = 'CREDITED')::int AS "creditedDeposits",
        (SELECT count(*) FROM real_money_withdrawals WHERE status IN ('REQUESTED','APPROVED'))::int AS "pendingWithdrawals",
        (SELECT count(*) FROM real_money_bets WHERE status = 'PENDING')::int AS "pendingBets",
        (SELECT count(*) FROM real_money_round_settlements WHERE status = 'FAILED')::int AS "failedSettlements"
    `);
    const mismatches = findRealMoneyMismatches(wallets.rows);
    console.log(JSON.stringify({
      mode: "DRY_RUN",
      walletsChecked: wallets.rows.length,
      mismatchCount: mismatches.length,
      mismatches,
      state: counts.rows[0],
    }, null, 2));
    if (mismatches.length > 0 || counts.rows[0]?.failedSettlements > 0) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) await main();
