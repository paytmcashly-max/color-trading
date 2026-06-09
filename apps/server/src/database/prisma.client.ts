import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../config/env.js";

let prisma: PrismaClient | null = null;

export function getPrismaClient() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Prisma database access.");
  }

  prisma ??= new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
    }),
    log: ["error", "warn"],
  });

  return prisma;
}
