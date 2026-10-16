import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { topics } from "./schema";

/** Product data every environment needs, production included. Safe to re-run. */
export const TOPICS = ["Wordplay", "Food", "School", "Work", "Animals", "Kids", "Science", "Sports"];

/** Applies pending SQL migrations, then makes sure reference data (topics) exists. Safe to run repeatedly. */
export async function runMigrations(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: path.join(__dirname, "migrations") });
    await db
      .insert(topics)
      .values(TOPICS.map((label, position) => ({ slug: label.toLowerCase(), label, position })))
      .onConflictDoNothing();
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
