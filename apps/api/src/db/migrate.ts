import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Applies pending SQL migrations from src/db/migrations. Safe to run repeatedly. */
export async function runMigrations(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(__dirname, "migrations") });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  runMigrations(url)
    .then(() => console.log("Migrations applied."))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
