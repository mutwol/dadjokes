import { readFileSync } from "node:fs";
import path from "node:path";
import { Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "./db.module";

/**
 * Migrations the code expects but the database hasn't applied. Running new
 * code on an old schema fails with opaque 500s (a missing column), so the
 * API says so loudly at startup instead.
 */
export async function warnAboutPendingMigrations(db: Db) {
  const logger = new Logger("Migrations");
  try {
    const journal = JSON.parse(readFileSync(path.join(__dirname, "migrations", "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    const applied = await db.execute<{ created_at: string }>(sql`select created_at from drizzle.__drizzle_migrations`);
    const done = new Set(applied.rows.map((r) => Number(r.created_at)));
    const pending = journal.entries.filter((e) => !done.has(e.when)).map((e) => e.tag);
    if (pending.length) {
      logger.warn(`The database is missing ${pending.length} migration(s): ${pending.join(", ")}. Run \`pnpm db:migrate\` and restart.`);
    }
    return pending;
  } catch (e) {
    logger.warn(`Couldn't check migrations: ${(e as Error).message}. Run \`pnpm db:migrate\` if the schema changed.`);
    return [];
  }
}
