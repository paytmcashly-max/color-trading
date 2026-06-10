import crypto from "node:crypto";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const databaseUrl = readRequiredEnv("DATABASE_URL");
const nodeEnv = process.env.NODE_ENV ?? "development";
const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

if (nodeEnv === "production" && !bootstrapToken) {
  throw new Error("ADMIN_BOOTSTRAP_TOKEN is required in production.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

try {
  const existing = await prisma.auditLog.findFirst({
    where: { actionType: "ADMIN_BOOTSTRAP_DISABLED" },
    select: { id: true, createdAt: true },
  });

  if (existing) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          disabled: true,
          alreadyDisabled: true,
          disabledAt: existing.createdAt.toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const log = await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "ADMIN_BOOTSTRAP_DISABLED",
        actionType: "ADMIN_BOOTSTRAP_DISABLED",
        targetType: "SYSTEM",
        targetId: "admin-bootstrap",
        metadata: {
          reason: process.env.ADMIN_BOOTSTRAP_DISABLE_REASON ?? "FIRST_ADMIN_CREATED",
          bootstrapTokenHash: bootstrapToken ? sha256(bootstrapToken).slice(0, 16) : null,
        },
      },
      select: {
        createdAt: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          disabled: true,
          disabledAt: log.createdAt.toISOString(),
        },
        null,
        2,
      ),
    );
  }
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
