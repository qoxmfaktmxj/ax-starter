import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as authSchema from "../auth/auth-schema";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  statement_timeout: 5000,
});
export const db = drizzle({
  client: pool,
  schema: { ...schema, ...authSchema },
});
