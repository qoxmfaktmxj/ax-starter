import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../packages/server/db";
import { PgBoss } from "pg-boss";

try {
  await migrate(db, { migrationsFolder: "./packages/server/db/migrations" });
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: "pgboss",
    max: 2,
  });
  try {
    await boss.start();
    await boss.createQueue("employee-export", {
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
    });
  } finally {
    await boss.stop();
  }
  console.log("Migration complete");
} finally {
  await pool.end();
}
