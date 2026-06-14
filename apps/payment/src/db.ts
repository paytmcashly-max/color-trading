import pg from "pg";

import { config } from "./config.js";

export const pool = new pg.Pool({
  connectionString: config.PAYMENT_DATABASE_URL,
  max: 10,
});
