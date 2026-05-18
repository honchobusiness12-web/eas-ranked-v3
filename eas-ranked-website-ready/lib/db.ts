import { Pool } from "pg";

declare global {
  var easPool: Pool | undefined;
}

export const pool =
  global.easPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  global.easPool = pool;
}
