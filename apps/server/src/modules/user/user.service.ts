import type { PrismaClient } from "@prisma/client";

export class UserService {
  constructor(private readonly prisma: PrismaClient) {}

  async getStatus() {
    const [users, wallets] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.wallet.count(),
    ]);

    return {
      module: "user",
      status: "ok",
      users,
      wallets,
      timestamp: new Date().toISOString(),
    };
  }

  async getLeaderboard(limit = 25) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        email: string;
        displayName: string | null;
        depositBalance: bigint;
        winningBalance: bigint;
        totalBalance: bigint;
      }>
    >`
      SELECT
        u.id AS "userId",
        u.email,
        u.display_name AS "displayName",
        w.deposit_balance AS "depositBalance",
        w.winning_balance AS "winningBalance",
        (w.deposit_balance + w.winning_balance) AS "totalBalance"
      FROM wallets w
      JOIN users u ON u.id = w.user_id
      WHERE u.status = 'ACTIVE'
        AND w.status = 'ACTIVE'
      ORDER BY (w.deposit_balance + w.winning_balance) DESC, w.updated_at DESC
      LIMIT ${limit}
    `;

    return {
      users: rows.map((row, index) => ({
        rank: index + 1,
        userId: row.userId,
        email: row.email,
        displayName: row.displayName,
        depositBalance: row.depositBalance.toString(),
        winningBalance: row.winningBalance.toString(),
        totalBalance: row.totalBalance.toString(),
      })),
    };
  }
}
