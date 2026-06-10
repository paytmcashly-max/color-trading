import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.ADMIN_SEED_EMAIL ?? "kishan@gmail.com";
const password = process.env.ADMIN_SEED_PASSWORD ?? "admin pass";
const displayName = process.env.ADMIN_SEED_DISPLAY_NAME ?? "Kishan Admin";
const initialCoins = BigInt(process.env.ADMIN_SEED_INITIAL_COINS ?? "1000");

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the admin user.");
}

if (password.length < 6 || password.length > 72) {
  throw new Error("ADMIN_SEED_PASSWORD must be between 6 and 72 characters.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

const passwordHash = await bcrypt.hash(password, 12);

try {
  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        wallet: {
          select: { id: true },
        },
      },
    });

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash,
            role: "ADMIN",
            status: "ACTIVE",
            displayName,
          },
          select: {
            id: true,
            email: true,
            role: true,
          },
        })
      : await tx.user.create({
          data: {
            email,
            passwordHash,
            displayName,
            role: "ADMIN",
            status: "ACTIVE",
          },
          select: {
            id: true,
            email: true,
            role: true,
          },
        });

    const wallet =
      existingUser?.wallet ??
      (await tx.wallet.create({
        data: {
          userId: user.id,
          depositBalance: initialCoins,
          winningBalance: 0n,
        },
        select: { id: true },
      }));

    if (!existingUser?.wallet) {
      await tx.coinLedger.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          type: "BONUS_CREDIT",
          direction: "CREDIT",
          amountCoins: initialCoins,
          balanceBeforeCoins: 0n,
          balanceAfterCoins: initialCoins,
          idempotencyKey: `user:${user.id}:initial-virtual-coins`,
          referenceType: "ADMIN_ACTION",
          referenceId: user.id,
          status: "SUCCESS",
          metadata: {
            reason: "ADMIN_SEED_INITIAL_BALANCE",
          },
        },
      });
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      created: !existingUser,
      walletCreated: !existingUser?.wallet,
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
