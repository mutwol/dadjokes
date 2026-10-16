import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { AppConfig } from "../config/config.module";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { jokes, ledgerEntries, payoutMethods, payouts, tips } from "../db/schema";
import type { Payout, Tip } from "../db/schema";
import { DeliveriesService } from "../deliveries/deliveries.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CLEARING, FEES, creatorAccount, creatorBalanceCents, post, splitTip } from "./ledger";
import { FAKE_SETTLE_MS, MpesaClient } from "./mpesa.client";
import type { PayoutOut, TipOut } from "./schemas";

export const PAYMENTS_QUEUE = "payments";
/** An STK prompt the customer never answered is given up on after this. */
const TIP_EXPIRES_MS = 10 * 60_000;

export type PaymentJob = { name: "verify-tip"; tipId: string } | { name: "send-payout"; payoutId: string } | { name: "reconcile" };

const TIP_MESSAGES: Record<Tip["status"], string> = {
  pending: "Check your phone and enter your M-Pesa PIN to send the tip.",
  paid: "Tip sent. Thank you!",
  failed: "The payment didn't go through. You weren't charged.",
  cancelled: "You cancelled the payment on your phone.",
  expired: "The payment prompt timed out. You weren't charged.",
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
    private readonly mpesa: MpesaClient,
    private readonly deliveries: DeliveriesService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  /* ------------------------------------------------------------------ tips */

  async createTip(tipperId: string, jokeId: string, amountKes: number, phone: string): Promise<TipOut> {
    const { joke, isMine } = await this.deliveries.access(tipperId, jokeId);
    if (isMine) throw new AppError(422, "cannot_tip_own", "You can't tip your own joke.");
    if (joke.removedAt) throw notFound("Joke");

    const [tip] = await this.db
      .insert(tips)
      .values({ jokeId, tipperId, creatorId: joke.creatorId, amountKes, phone })
      .returning();
    try {
      const stk = await this.mpesa.stkPush({
        phone,
        amountKes,
        reference: "DADDYJOKES",
        description: "Joke tip",
      });
      const [updated] = await this.db
        .update(tips)
        .set({ checkoutRequestId: stk.checkoutRequestId, merchantRequestId: stk.merchantRequestId })
        .where(eq(tips.id, tip.id))
        .returning();
      // Check back soon; the callback (or the minute-by-minute sweep) also settles it.
      await this.enqueue({ name: "verify-tip", tipId: tip.id }, this.mpesa.mode === "fake" ? FAKE_SETTLE_MS + 500 : 30_000);
      return toTip(updated);
    } catch (e) {
      await this.db
        .update(tips)
        .set({ status: "failed", resultDesc: e instanceof Error ? e.message.slice(0, 200) : "error" })
        .where(eq(tips.id, tip.id));
      if (e instanceof AppError) throw e;
      this.logger.error(`STK push failed for tip ${tip.id}: ${(e as Error).message}`);
      throw new AppError(502, "mpesa_unavailable", "M-Pesa isn't responding right now. Try again in a minute.");
    }
  }

  async getTip(tipperId: string, id: string): Promise<TipOut> {
    const [tip] = await this.db
      .select()
      .from(tips)
      .where(and(eq(tips.id, id), eq(tips.tipperId, tipperId)));
    if (!tip) throw notFound("Tip");
    return toTip(tip);
  }

  /** Safaricom's STK callback. Only records what it says; the status query decides. */
  async onStkCallback(body: unknown) {
    const cb = (body as { Body?: { stkCallback?: StkCallback } })?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return;
    const receipt = cb.CallbackMetadata?.Item?.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
    const [tip] = await this.db
      .update(tips)
      .set({ receipt: typeof receipt === "string" ? receipt : undefined, resultCode: String(cb.ResultCode), resultDesc: cb.ResultDesc })
      .where(and(eq(tips.checkoutRequestId, cb.CheckoutRequestID), eq(tips.status, "pending")))
      .returning({ id: tips.id });
    if (tip) await this.enqueue({ name: "verify-tip", tipId: tip.id });
  }

  /**
   * Asks M-Pesa how a pending tip went and settles it. Settling happens once,
   * however many callbacks, retries and sweeps arrive.
   */
  async verifyTip(id: string, now = new Date()) {
    const [tip] = await this.db.select().from(tips).where(eq(tips.id, id));
    if (!tip || tip.status !== "pending" || !tip.checkoutRequestId) return tip?.status;
    const status = await this.mpesa.stkQuery(tip.checkoutRequestId, now.getTime());
    if (status.state === "pending") {
      if (now.getTime() - tip.createdAt.getTime() > TIP_EXPIRES_MS) {
        await this.db.update(tips).set({ status: "expired" }).where(and(eq(tips.id, id), eq(tips.status, "pending")));
        return "expired";
      }
      return "pending";
    }
    if (status.state !== "paid") {
      await this.db
        .update(tips)
        .set({ status: status.state, resultCode: status.resultCode, resultDesc: status.resultDesc })
        .where(and(eq(tips.id, id), eq(tips.status, "pending")));
      return status.state;
    }

    const { totalCents, feeCents, writerCents } = splitTip(tip.amountKes, this.config.get("TIP_FEE_PERCENT"));
    await this.db.transaction(async (tx) => {
      const [paid] = await tx
        .update(tips)
        .set({
          status: "paid",
          paidAt: now,
          receipt: tip.receipt ?? status.receipt ?? null,
          resultCode: status.resultCode,
          resultDesc: status.resultDesc,
        })
        .where(and(eq(tips.id, id), eq(tips.status, "pending")))
        .returning();
      if (!paid) return; // Someone else settled it first.
      await post(
        tx,
        `Tip ${tip.id}`,
        [
          { account: CLEARING, amountCents: totalCents },
          { account: creatorAccount(tip.creatorId), amountCents: -writerCents },
          { account: FEES, amountCents: -feeCents },
        ],
        { tipId: tip.id },
      );
      const [j] = await tx.select({ setup: jokes.setup, caption: jokes.caption }).from(jokes).where(eq(jokes.id, tip.jokeId));
      await this.notifications.notify(
        {
          userId: tip.creatorId,
          type: "tip_received",
          actorId: tip.tipperId,
          jokeId: tip.jokeId,
          data: { amountKes: tip.amountKes, setup: j?.setup ?? j?.caption },
          dedupeKey: `tip:${tip.id}`,
        },
        tx,
      );
    });
    return "paid";
  }

  /* --------------------------------------------------------------- payouts */

  async balance(userId: string) {
    const [available, [sums], [method]] = await Promise.all([
      creatorBalanceCents(this.db, userId),
      this.db
        .select({
          lifetime: sql<string>`coalesce(-sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.tipId} is not null), 0)`,
        })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.account, creatorAccount(userId))),
      this.db.select({ phone: payoutMethods.phone }).from(payoutMethods).where(eq(payoutMethods.userId, userId)),
    ]);
    const [p] = await this.db
      .select({
        paid: sql<number>`coalesce(sum(${payouts.amountKes}) filter (where ${payouts.status} = 'paid'), 0)::int`,
        pending: sql<number>`coalesce(sum(${payouts.amountKes}) filter (where ${payouts.status} in ('requested', 'processing')), 0)::int`,
      })
      .from(payouts)
      .where(eq(payouts.userId, userId));
    return {
      availableKes: available / 100,
      lifetimeTipsKes: Number(sums.lifetime) / 100,
      paidOutKes: p.paid,
      pendingPayoutKes: p.pending,
      minimumPayoutKes: this.config.get("PAYOUT_MIN_KES"),
      payoutPhoneLast3: method?.phone.slice(-3) ?? null,
    };
  }

  async listPayouts(userId: string) {
    const rows = await this.db.select().from(payouts).where(eq(payouts.userId, userId)).orderBy(desc(payouts.createdAt)).limit(50);
    return { data: rows.map(toPayout) };
  }

  /** Moves money out of the writer's balance straight away, then sends it with B2C in the worker. */
  async requestPayout(userId: string, amountKes: number): Promise<PayoutOut> {
    const min = this.config.get("PAYOUT_MIN_KES");
    if (amountKes < min) throw new AppError(422, "payout_too_small", `Withdrawals start at KES ${min}.`);
    const payout = await this.db.transaction(async (tx) => {
      // One withdrawal at a time per writer, so the balance check can't be raced.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payout:${userId}`}))`);
      const [method] = await tx.select().from(payoutMethods).where(eq(payoutMethods.userId, userId));
      if (!method) throw new AppError(422, "no_payout_method", "Add your M-Pesa number in your profile first.");
      const available = await creatorBalanceCents(tx, userId);
      if (amountKes * 100 > available) {
        throw new AppError(422, "insufficient_balance", `You can withdraw up to KES ${Math.floor(available / 100)}.`);
      }
      const [row] = await tx.insert(payouts).values({ userId, amountKes, phone: method.phone }).returning();
      await post(
        tx,
        `Payout ${row.id}`,
        [
          { account: creatorAccount(userId), amountCents: amountKes * 100 },
          { account: CLEARING, amountCents: -amountKes * 100 },
        ],
        { payoutId: row.id },
      );
      return row;
    });
    await this.enqueue({ name: "send-payout", payoutId: payout.id });
    return toPayout(payout);
  }

  /** Worker: asks M-Pesa to send a requested payout. */
  async sendPayout(id: string) {
    const [p] = await this.db.select().from(payouts).where(eq(payouts.id, id));
    if (!p || p.status !== "requested") return;
    try {
      const res = await this.mpesa.b2c({ payoutId: p.id, phone: p.phone, amountKes: p.amountKes, remarks: "Your Daddy Jokes tips" });
      await this.db
        .update(payouts)
        .set({ status: "processing", conversationId: res.conversationId, originatorConversationId: res.originatorConversationId })
        .where(and(eq(payouts.id, id), eq(payouts.status, "requested")));
    } catch (e) {
      await this.finishPayout(id, { ok: false, resultCode: "request_failed", resultDesc: (e as Error).message.slice(0, 200) });
      return;
    }
    if (this.mpesa.mode === "fake") await this.finishPayout(id, this.mpesa.fakeB2cOutcome(p.phone));
  }

  /** Safaricom's B2C result callback. */
  async onB2cResult(body: unknown) {
    const r = (body as { Result?: B2cResult })?.Result;
    if (!r?.OriginatorConversationID) return;
    const [p] = await this.db
      .select({ id: payouts.id })
      .from(payouts)
      .where(eq(payouts.originatorConversationId, r.OriginatorConversationID));
    if (!p) return;
    await this.finishPayout(p.id, {
      ok: String(r.ResultCode) === "0",
      resultCode: String(r.ResultCode),
      resultDesc: r.ResultDesc,
      receipt: r.TransactionID,
    });
  }

  /** Settles a payout once. A failed one puts the money back in the writer's balance. */
  async finishPayout(id: string, outcome: { ok: boolean; resultCode: string; resultDesc: string; receipt?: string }) {
    await this.db.transaction(async (tx) => {
      const [p] = await tx
        .update(payouts)
        .set({
          status: outcome.ok ? "paid" : "failed",
          resultCode: outcome.resultCode,
          resultDesc: outcome.resultDesc,
          receipt: outcome.receipt ?? null,
          completedAt: new Date(),
        })
        .where(and(eq(payouts.id, id), inArray(payouts.status, ["requested", "processing"])))
        .returning();
      if (!p) return;
      if (!outcome.ok) {
        await post(
          tx,
          `Payout ${p.id} failed: returned to balance`,
          [
            { account: creatorAccount(p.userId), amountCents: -p.amountKes * 100 },
            { account: CLEARING, amountCents: p.amountKes * 100 },
          ],
          { payoutId: p.id },
        );
      }
      await this.notifications.notify(
        { userId: p.userId, type: outcome.ok ? "payout_paid" : "payout_failed", data: { amountKes: p.amountKes }, dedupeKey: `payout:${p.id}` },
        tx,
      );
    });
  }

  /* ------------------------------------------------------------ background */

  /** Every minute: settle tips whose callback never came, and send stuck payouts. */
  async reconcile(now = new Date()) {
    const pending = await this.db
      .select({ id: tips.id })
      .from(tips)
      .where(and(eq(tips.status, "pending"), lt(tips.createdAt, new Date(now.getTime() - 15_000))))
      .limit(200);
    for (const t of pending) {
      try {
        await this.verifyTip(t.id, now);
      } catch (e) {
        this.logger.warn(`Couldn't verify tip ${t.id}: ${(e as Error).message}`);
      }
    }
    const requested = await this.db
      .select({ id: payouts.id })
      .from(payouts)
      .where(and(eq(payouts.status, "requested"), lt(payouts.createdAt, new Date(now.getTime() - 60_000))))
      .limit(50);
    for (const p of requested) await this.sendPayout(p.id);
  }

  private async enqueue(job: PaymentJob, delay = 0) {
    await this.queue.add(job.name, job, { delay, attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true, removeOnFail: 200 });
  }
}

interface StkCallback {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number | string;
  ResultDesc: string;
  CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] };
}

interface B2cResult {
  ResultCode: number | string;
  ResultDesc: string;
  OriginatorConversationID: string;
  ConversationID: string;
  TransactionID?: string;
}

function toTip(t: Tip): TipOut {
  return {
    id: t.id,
    jokeId: t.jokeId,
    amountKes: t.amountKes,
    status: t.status,
    message: TIP_MESSAGES[t.status],
    createdAt: t.createdAt.toISOString(),
  };
}

function toPayout(p: Payout): PayoutOut {
  return {
    id: p.id,
    amountKes: p.amountKes,
    phoneLast3: p.phone.slice(-3),
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
  };
}
