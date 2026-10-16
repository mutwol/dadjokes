import { Pool } from "pg";
import { runMigrations } from "../src/db/migrate";

/** Rebuilds the test database schema once before all test files. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://daddy:daddy@localhost:5432/daddy_jokes_test";
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  } finally {
    await pool.end();
  }
  await runMigrations(url);
}
