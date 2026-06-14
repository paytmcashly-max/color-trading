import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env.PAYMENT_DATABASE_URL ??
      "postgresql://user:password@localhost:5433/color_trading_payments",
  },
});
