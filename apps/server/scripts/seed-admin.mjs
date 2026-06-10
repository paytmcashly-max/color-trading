import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
const seedEnabled = process.env.ADMIN_SEED_ENABLED === "true";
const email = process.env.ADMIN_SEED_EMAIL;
const password = process.env.ADMIN_SEED_PASSWORD;
const displayName = process.env.ADMIN_SEED_DISPLAY_NAME ?? "Admin";
const initialCoins = BigInt(process.env.ADMIN_SEED_INITIAL_COINS ?? "1000");

if (!seedEnabled) {
  console.log("Admin seed skipped.");
  process.exit(0);
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the admin user.");
}

if (!email) {
  throw new Error("ADMIN_SEED_EMAIL is required when ADMIN_SEED_ENABLED=true.");
}

if (!password) {
  throw new Error("ADMIN_SEED_PASSWORD is required when ADMIN_SEED_ENABLED=true.");
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("ADMIN_SEED_EMAIL must be a valid email address.");
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
          select: { id: true },
        })
      : await tx.user.create({
          data: {
            email,
            passwordHash,
            displayName,
            role: "ADMIN",
            status: "ACTIVE",
          },
          select: { id: true },
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
      created: !existingUser,
      walletCreated: !existingUser?.wallet,
    };
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await prisma.$disconnect();
}
