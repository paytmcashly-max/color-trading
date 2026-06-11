import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

export function findWalletMismatches(rows) {
  return rows
    .map((row) => {
      const snapshotTotal = BigInt(row.depositBalance) + BigInt(row.winningBalance);
      const ledgerTotal = BigInt(row.ledgerTotal);

      return {
        userId: row.userId,
        walletId: row.walletId,
        depositBalance: String(row.depositBalance),
        winningBalance: String(row.winningBalance),
        snapshotTotal: snapshotTotal.toString(),
        ledgerTotal: ledgerTotal.toString(),
        difference: (snapshotTotal - ledgerTotal).toString(),
      };
    })
    .filter((row) => row.difference !== "0");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query(`
      SELECT
        wallets.id::text AS "walletId",
        wallets.user_id::text AS "userId",
        wallets.deposit_balance::text AS "depositBalance",
        wallets.winning_balance::text AS "winningBalance",
        COALESCE(SUM(
          CASE
            WHEN coin_ledger.status <> 'SUCCESS' THEN 0
            WHEN coin_ledger.direction = 'CREDIT' THEN coin_ledger.amount_coins
            ELSE -coin_ledger.amount_coins
          END
        ), 0)::text AS "ledgerTotal"
      FROM wallets
      LEFT JOIN coin_ledger ON coin_ledger.wallet_id = wallets.id
      GROUP BY wallets.id
      ORDER BY wallets.user_id
    `);
    const mismatches = findWalletMismatches(result.rows);

    console.log(JSON.stringify({
      mode: "DRY_RUN",
      walletsChecked: result.rows.length,
      mismatchCount: mismatches.length,
      mismatches,
    }, null, 2));

    if (mismatches.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
