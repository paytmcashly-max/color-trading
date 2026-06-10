import crypto from "node:crypto";

import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const databaseUrl = readRequiredEnv("DATABASE_URL");
const email = readFirstRequiredEnv(["ADMIN_BOOTSTRAP_EMAIL", "ADMIN_EMAIL"]).trim().toLowerCase();
const password = readFirstRequiredEnv(["ADMIN_BOOTSTRAP_PASSWORD", "ADMIN_PASSWORD"]);
const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || "Admin";
const confirm = process.env.ADMIN_BOOTSTRAP_CONFIRM;
const rotatePassword = process.env.ADMIN_BOOTSTRAP_ROTATE_PASSWORD === "true";
const initialCoins = BigInt(process.env.ADMIN_BOOTSTRAP_INITIAL_COINS ?? "1000");
const nodeEnv = process.env.NODE_ENV ?? "development";
const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("ADMIN_BOOTSTRAP_EMAIL must be a valid email address.");
}

assertStrongAdminPassword(password);

if (nodeEnv === "production" && !bootstrapToken) {
  throw new Error("ADMIN_BOOTSTRAP_TOKEN is required in production.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

try {
  const disabled = await isBootstrapDisabled(prisma);

  if (disabled) {
    throw new Error("Admin bootstrap is disabled. Refusing to create or promote an admin.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        wallet: {
          select: { id: true },
        },
      },
    });
    const existingAdmin = await tx.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true, email: true },
    });

    if (existingAdmin && existingUser?.role !== "ADMIN") {
      throw new Error(
        `Admin bootstrap already completed for ${existingAdmin.email}. Refusing to create or promote another admin.`,
      );
    }

    if (existingUser && existingUser.role !== "ADMIN" && confirm !== "PROMOTE_ADMIN") {
      throw new Error(
        'A user with ADMIN_BOOTSTRAP_EMAIL already exists. Set ADMIN_BOOTSTRAP_CONFIRM="PROMOTE_ADMIN" to promote it.',
      );
    }

    const shouldSetPassword = !existingUser || existingUser.role !== "ADMIN" || rotatePassword;
    const passwordHash = shouldSetPassword ? await bcrypt.hash(password, 12) : undefined;
    const now = new Date();

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            ...(passwordHash ? { passwordHash } : {}),
            role: "ADMIN",
            status: "ACTIVE",
            emailVerifiedAt: now,
            displayName,
          },
          select: { id: true, email: true, role: true },
        })
      : await tx.user.create({
          data: {
            email,
            passwordHash: passwordHash ?? (await bcrypt.hash(password, 12)),
            displayName,
            role: "ADMIN",
            status: "ACTIVE",
            emailVerifiedAt: now,
          },
          select: { id: true, email: true, role: true },
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

    const revokedSessions = shouldSetPassword
      ? await tx.authSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        })
      : { count: 0 };

    await tx.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "ADMIN_BOOTSTRAP",
        actionType: "ADMIN_BOOTSTRAP",
        targetType: "USER",
        targetId: user.id,
        metadata: {
          adminEmail: user.email,
          created: !existingUser,
          promoted: Boolean(existingUser && existingUser.role !== "ADMIN"),
          passwordRotated: Boolean(existingUser && rotatePassword),
          sessionsRevoked: revokedSessions.count,
          walletCreated: !existingUser?.wallet,
          bootstrapTokenHash: bootstrapToken ? sha256(bootstrapToken).slice(0, 16) : null,
          adminTotpStatus: "TODO_REQUIRED_BEFORE_BROAD_ADMIN_ROLLOUT",
        },
      },
    });

    return {
      email: user.email,
      created: !existingUser,
      promoted: Boolean(existingUser && existingUser.role !== "ADMIN"),
      passwordChanged: shouldSetPassword,
      sessionsRevoked: revokedSessions.count,
      walletCreated: !existingUser?.wallet,
    };
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        adminEmail: result.email,
        created: result.created,
        promoted: result.promoted,
        passwordChanged: result.passwordChanged,
        sessionsRevoked: result.sessionsRevoked,
        walletCreated: result.walletCreated,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}

function readRequiredEnv(key) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function readFirstRequiredEnv(keys) {
  for (const key of keys) {
    const value = process.env[key];

    if (value) {
      return value;
    }
  }

  throw new Error(`${keys[0]} is required.`);
}

function assertStrongAdminPassword(value) {
  const errors = [];

  if (value.length < 6 || value.length > 12) {
    errors.push("between 6 and 12 characters");
  }

  if (!/[A-Z]/.test(value)) {
    errors.push("one uppercase letter");
  }

  if (!/[a-z]/.test(value)) {
    errors.push("one lowercase letter");
  }

  if (!/[0-9]/.test(value)) {
    errors.push("one number");
  }

  if (!/[^A-Za-z0-9]/.test(value)) {
    errors.push("one symbol");
  }

  if (errors.length > 0) {
    throw new Error(`ADMIN_BOOTSTRAP_PASSWORD must include ${errors.join(", ")}.`);
  }
}

async function isBootstrapDisabled(client) {
  const disabled = await client.auditLog.findFirst({
    where: {
      actionType: "ADMIN_BOOTSTRAP_DISABLED",
    },
    select: { id: true },
  });

  return Boolean(disabled);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
