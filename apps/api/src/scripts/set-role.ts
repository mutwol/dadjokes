import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { roleEnum, userRoles, users } from "../db/schema";
import type { Role } from "../db/schema";

/**
 * Grants or removes a role, e.g. making someone a curator:
 *   pnpm --filter api user:role someone@example.com curator
 *   pnpm --filter api user:role someone@example.com curator --remove
 * In a deployed container: node dist/scripts/set-role.js someone@example.com curator
 */
async function main() {
  const [email, role, flag] = process.argv.slice(2);
  if (!email || !roleEnum.enumValues.includes(role as Role) || (flag && flag !== "--remove")) {
    throw new Error(`Usage: set-role <email> <${roleEnum.enumValues.join("|")}> [--remove]`);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
    if (!user) throw new Error(`No account for ${email}. They need to sign in once first.`);
    if (flag) {
      await db.delete(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.role, role as Role)));
      console.log(`Removed ${role} from ${email}.`);
    } else {
      await db.insert(userRoles).values({ userId: user.id, role: role as Role }).onConflictDoNothing();
      console.log(`${email} is now a ${role}.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
