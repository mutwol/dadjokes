import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Tx } from "../db/db.module";
import { ledgerEntries } from "../db/schema";

export const CLEARING = "mpesa:clearing";
export const FEES = "platform:fees";
export const creatorAccount = (userId: string) => `creator:${userId}`;

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
  refs: { tipId?: string; payoutId?: string } = {},
) {
  const total = postings.reduce((n, p) => n + p.amountCents, 0);
  if (total !== 0) throw new Error(`Unbalanced ledger transaction (${total}) for ${memo}`);
  const txnId = randomUUID();
  await tx.insert(ledgerEntries).values(
    postings
      .filter((p) => p.amountCents !== 0)
      .map((p) => ({ txnId, account: p.account, amountCents: p.amountCents, memo, tipId: refs.tipId, payoutId: refs.payoutId })),
  );
  return txnId;
}

/** What we owe a writer, in cents (their account's credit balance). */
export async function creatorBalanceCents(tx: Tx, userId: string): Promise<number> {
  const [{ cents }] = await tx
    .select({ cents: sql<string>`coalesce(-sum(${ledgerEntries.amountCents}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.account, creatorAccount(userId)));
  return Number(cents);
}

/** Splits a tip into the writer's share and the platform fee, rounding the fee down. */
export function splitTip(amountKes: number, feePercent: number) {
  const totalCents = amountKes * 100;
  const feeCents = Math.floor((totalCents * feePercent) / 100);
  return { totalCents, feeCents, writerCents: totalCents - feeCents };
}
