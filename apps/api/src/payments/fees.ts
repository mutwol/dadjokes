import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Tx } from "../db/db.module";
import { feePolicies } from "../db/schema";
import type { FeePolicy } from "../db/schema";

/** Where tips are taken for now. Fee policies are kept per country so new markets get their own rates. */
export const HOME_COUNTRY = "KE";

/**
 * The fee policy in force for a creator at a moment: their own rate if they
 * have one, otherwise the country default. The first time there's no policy
 * at all, the default is created from TIP_FEE_PERCENT so every tip can
 * point at the rate it was charged.
 */
export async function resolveFeePolicy(
  tx: Tx,
  opts: { creatorId: string; at: Date; defaultBps: number; country?: string },
): Promise<FeePolicy> {
  const country = opts.country ?? HOME_COUNTRY;
  const find = async () => {
    const [p] = await tx
      .select()
      .from(feePolicies)
      .where(
        and(
          eq(feePolicies.country, country),
          or(eq(feePolicies.creatorId, opts.creatorId), isNull(feePolicies.creatorId)),
          lte(feePolicies.effectiveFrom, opts.at),
        ),
      )
      .orderBy(sql`${feePolicies.creatorId} is null`, desc(feePolicies.effectiveFrom), desc(feePolicies.createdAt))
      .limit(1);
    return p;
  };
  const found = await find();
  if (found) return found;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`fee-policy-default:${country}`}))`);
  const again = await find();
  if (again) return again;
  const [created] = await tx
    .insert(feePolicies)
    .values({ country, bps: opts.defaultBps, note: "Default rate (TIP_FEE_PERCENT)", effectiveFrom: new Date(0) })
    .returning();
  return created;
}

export const percentToBps = (pct: number) => Math.round(pct * 100);
