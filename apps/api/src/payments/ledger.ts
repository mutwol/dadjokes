import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Tx } from "../db/db.module";
import { ledgerEntries } from "../db/schema";

export const CLEARING = "mpesa:clearing";
export const FEES = "platform:fees";
/** Funds the creator fund; its debit balance is what the fund has paid out so far. */
export const CREATOR_FUND = "platform:creator_fund";
/** What we owe a writer that they can withdraw now. */
export const creatorAccount = (userId: string) => `creator:${userId}`;
/** What a writer has earned that is still on hold. */
export const creatorPendingAccount = (userId: string) => `creator:${userId}:pending`;

export interface Posting {
  account: string;
  amountCents: number;
}

/**
 * Posts one balanced transaction. The database also checks the balance at
 * commit, so a bug here can't leave the books out of balance.
 */
export async function post(
  tx: Tx,
  memo: string,
  postings: Posting[],
  refs: { tipId?: string; payoutId?: string; fundAllocationId?: string } = {},
) {
  const total = postings.reduce((n, p) => n + p.amountCents, 0);
  if (total !== 0) throw new Error(`Unbalanced ledger transaction (${total}) for ${memo}`);
  const txnId = randomUUID();
  await tx.insert(ledgerEntries).values(
    postings
      .filter((p) => p.amountCents !== 0)
      .map((p) => ({ txnId, account: p.account, amountCents: p.amountCents, memo, tipId: refs.tipId, payoutId: refs.payoutId, fundAllocationId: refs.fundAllocationId })),
  );
  return txnId;
}

/** A credit balance in cents: what we owe on that account. */
export async function accountBalanceCents(tx: Tx, account: string): Promise<number> {
  const [{ cents }] = await tx
    .select({ cents: sql<string>`coalesce(-sum(${ledgerEntries.amountCents}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.account, account));
  return Number(cents);
}

/** What a writer can withdraw now, in cents. */
export const creatorBalanceCents = (tx: Tx, userId: string) => accountBalanceCents(tx, creatorAccount(userId));

/** Splits a tip into the writer's share and the platform fee (in basis points), rounding the fee down. */
export function splitTip(amountKes: number, feeBps: number) {
  const totalCents = amountKes * 100;
  const feeCents = Math.floor((totalCents * feeBps) / 10_000);
  return { totalCents, feeCents, writerCents: totalCents - feeCents };
}

/**
 * Splits a pool between creators in proportion to their weights, in whole
 * cents (largest remainder, ties to the larger weight). Never allocates more
 * than the pool.
 */
export function splitPool(poolCents: number, weights: { id: string; weight: number }[]) {
  const total = weights.reduce((n, w) => n + w.weight, 0);
  if (total <= 0 || poolCents <= 0) return new Map<string, number>();
  const shares = weights.map((w) => {
    const exact = (poolCents * w.weight) / total;
    return { id: w.id, weight: w.weight, cents: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = poolCents - shares.reduce((n, s) => n + s.cents, 0);
  for (const s of [...shares].sort((a, b) => b.rest - a.rest || b.weight - a.weight)) {
    if (left <= 0) break;
    s.cents += 1;
    left -= 1;
  }
  return new Map(shares.filter((s) => s.cents > 0).map((s) => [s.id, s.cents]));
}
