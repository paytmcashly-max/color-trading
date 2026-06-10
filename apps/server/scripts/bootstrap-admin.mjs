import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const displayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME ?? "Admin";
const rotatePassword = process.env.ADMIN_BOOTSTRAP_ROTATE_PASSWORD === "true";
const initialCoins = BigInt(process.env.ADMIN_BOOTSTRAP_INITIAL_COINS ?? "1000");

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to bootstrap an admin user.");
}

if (!email) {
  throw new Error("ADMIN_BOOTSTRAP_EMAIL is required.");
}

if (!password) {
  throw new Error("ADMIN_BOOTSTRAP_PASSWORD is required.");
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("ADMIN_BOOTSTRAP_EMAIL must be a valid email address.");
}

if (password.length < 12 || password.length > 72) {
  throw new Error("ADMIN_BOOTSTRAP_PASSWORD must be between 12 and 72 characters.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

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

    const shouldSetPassword = !existingUser || existingUser.role !== "ADMIN" || rotatePassword;
    const passwordHash = shouldSetPassword ? await bcrypt.hash(password, 12) : undefined;

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            ...(passwordHash ? { passwordHash } : {}),
            role: "ADMIN",
            status: "ACTIVE",
            displayName,
          },
          select: { id: true },
        })
      : await tx.user.create({
          data: {
            email,
            passwordHash: passwordHash ?? (await bcrypt.hash(password, 12)),
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
            reason: "ADMIN_BOOTSTRAP_INITIAL_BALANCE",
          },
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "ADMIN_BOOTSTRAP",
        actionType: "ADMIN_BOOTSTRAP",
        targetType: "USER",
        targetId: user.id,
        metadata: {
          created: !existingUser,
          promoted: Boolean(existingUser && existingUser.role !== "ADMIN"),
          passwordRotated: Boolean(existingUser && rotatePassword),
          walletCreated: !existingUser?.wallet,
        },
      },
    });

    return {
      created: !existingUser,
      promoted: Boolean(existingUser && existingUser.role !== "ADMIN"),
      passwordChanged: shouldSetPassword,
      walletCreated: !existingUser?.wallet,
    };
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally {
  await prisma.$disconnect();
}
