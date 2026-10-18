import { randomBytes } from "node:crypto";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import { and, desc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { AppConfig } from "../config/config.module";
import { InjectDb } from "../db/db.module";
import type { Db, Tx } from "../db/db.module";
import { creatorFundAllocations, jokes, payoutMethods, payouts, tips, userRoles, users } from "../db/schema";
import type { Payout, Tip } from "../db/schema";
import { DeliveriesService } from "../deliveries/deliveries.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../platform/audit.service";
import { EventsService } from "../platform/events.service";
import { HOME_COUNTRY, percentToBps, resolveFeePolicy } from "./fees";
import { CLEARING, FEES, accountBalanceCents, creatorAccount, creatorBalanceCents, creatorPendingAccount, post, splitTip } from "./ledger";
import { PaymentProviders } from "./providers";
import type { CreateTipRequest, PayoutOut, TipOut, TipWallOut } from "./schemas";

export const PAYMENTS_QUEUE = "payments";
/** An STK prompt the customer never answered is given up on after this. */
const TIP_EXPIRES_MS = 10 * 60_000;

export type PaymentJob =
  | { name: "verify-tip"; tipId: string }
  | { name: "send-payout"; payoutId: string }
  | { name: "reconcile" }
  | { name: "reconcile-books" };

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
    private readonly providers: PaymentProviders,
    private readonly deliveries: DeliveriesService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------------ tips */

  async createTip(tipperId: string, jokeId: string, req: CreateTipRequest): Promise<TipOut> {
    const { amountKes, phone } = req;
    const { joke, isMine } = await this.deliveries.access(tipperId, jokeId);
    if (isMine) throw new AppError(422, "cannot_tip_own", "You can't tip your own joke.");
    if (joke.removedAt) throw notFound("Joke");
    const provider = this.providers.for(HOME_COUNTRY, "mpesa");
    const note = req.note?.replace(/\s+/g, " ").trim() || null;

    const [tip] = await this.db
      .insert(tips)
      .values({ jokeId, tipperId, creatorId: joke.creatorId, amountKes, phone, provider: provider.id, note, anonymous: req.anonymous ?? false })
      .returning();
    try {
      const stk = await provider.collect({
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
      await this.enqueue({ name: "verify-tip", tipId: tip.id }, provider.settleAfterMs);
      return toTip(updated, provider.simulated);
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

  /**
   * Test mode only: the tipper answers the simulated M-Pesa prompt. It arrives
   * the way Safaricom's callback would, then settles through the normal path
   * (status check, ledger, hold, notification, tip wall).
   */
  async simulateTipAnswer(tipperId: string, id: string, answer: SimulatedAnswer): Promise<TipOut> {
    const [tip] = await this.db
      .select()
      .from(tips)
      .where(and(eq(tips.id, id), eq(tips.tipperId, tipperId)));
    if (!tip) throw notFound("Tip");
    const provider = this.providers.get(tip.provider);
    if (!provider.simulated) throw notFound("Tip");
    if (tip.status !== "pending" || !tip.checkoutRequestId) return toTip(tip, provider.simulated);
    const outcome = SIMULATED_ANSWERS[answer];
    const items: { Name: string; Value: string | number }[] = [
      { Name: "Amount", Value: tip.amountKes },
      { Name: "MpesaReceiptNumber", Value: simulatedReceipt() },
      { Name: "PhoneNumber", Value: Number(tip.phone) },
    ];
    await this.onStkCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: tip.merchantRequestId ?? "",
          CheckoutRequestID: tip.checkoutRequestId,
          ResultCode: Number(outcome.code),
          ResultDesc: outcome.desc,
          ...(outcome.code === "0" ? { CallbackMetadata: { Item: items } } : {}),
        },
      },
    });
    await this.verifyTip(id);
    return this.getTip(tipperId, id);
  }

  async getTip(tipperId: string, id: string): Promise<TipOut> {
    const [tip] = await this.db
      .select()
      .from(tips)
      .where(and(eq(tips.id, id), eq(tips.tipperId, tipperId)));
    if (!tip) throw notFound("Tip");
    return toTip(tip, this.providers.get(tip.provider).simulated);
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
    const status = await this.providers
      .get(tip.provider)
      .collectStatus(tip.checkoutRequestId, now.getTime(), { resultCode: tip.resultCode, resultDesc: tip.resultDesc, receipt: tip.receipt });
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

    await this.db.transaction(async (tx) => {
      // The rate is fixed at the moment the money arrives and stored on the tip, never recomputed.
      const policy = await resolveFeePolicy(tx, {
        creatorId: tip.creatorId,
        at: now,
        defaultBps: percentToBps(this.config.get("TIP_FEE_PERCENT")),
      });
      const { totalCents, feeCents, writerCents } = splitTip(tip.amountKes, policy.bps);
      const releaseAt = new Date(now.getTime() + this.config.get("TIP_HOLD_HOURS") * 3_600_000);
      const [paid] = await tx
        .update(tips)
        .set({
          status: "paid",
          paidAt: now,
          receipt: tip.receipt ?? status.receipt ?? null,
          resultCode: status.resultCode,
          resultDesc: status.resultDesc,
          feePolicyId: policy.id,
          feeBps: policy.bps,
          feeCents,
          writerCents,
          releaseAt,
        })
        .where(and(eq(tips.id, id), eq(tips.status, "pending")))
        .returning();
      if (!paid) return; // Someone else settled it first.
      // Earnings start on hold, in case M-Pesa reverses the payment.
      await post(
        tx,
        `Tip ${tip.id}`,
        [
          { account: CLEARING, amountCents: totalCents },
          { account: creatorPendingAccount(tip.creatorId), amountCents: -writerCents },
          { account: FEES, amountCents: -feeCents },
        ],
        { tipId: tip.id },
      );
      if (releaseAt <= now) await this.releaseTip(tx, paid.id, now);
      const [j] = await tx.select({ setup: jokes.setup, caption: jokes.caption }).from(jokes).where(eq(jokes.id, tip.jokeId));
      await this.events.emit(
        {
          type: "tip.paid",
          userId: tip.tipperId,
          payload: { tipId: tip.id, jokeId: tip.jokeId, creatorId: tip.creatorId, amountKes: tip.amountKes, feeBps: policy.bps },
          dedupeKey: `tip:${tip.id}`,
        },
        tx,
      );
      await this.notifications.notify(
        {
          userId: tip.creatorId,
          type: "tip_received",
          actorId: tip.anonymous ? null : tip.tipperId,
          jokeId: tip.jokeId,
          data: { amountKes: tip.amountKes, setup: j?.setup ?? j?.caption, note: tip.note, anonymous: tip.anonymous },
          dedupeKey: `tip:${tip.id}`,
        },
        tx,
      );
    });
    return "paid";
  }

  /* --------------------------------------------------------------- payouts */

  async balance(userId: string) {
    const [available, pending, [sums], [fund], [method]] = await Promise.all([
      creatorBalanceCents(this.db, userId),
      accountBalanceCents(this.db, creatorPendingAccount(userId)),
      this.db
        .select({
          lifetime: sql<string>`coalesce(sum(${tips.writerCents}), 0)`,
          next: sql<Date | null>`min(${tips.releaseAt}) filter (where ${tips.releasedAt} is null)`,
        })
        .from(tips)
        .where(and(eq(tips.creatorId, userId), eq(tips.status, "paid"))),
      this.db
        .select({
          lifetime: sql<string>`coalesce(sum(${creatorFundAllocations.amountCents}), 0)`,
          next: sql<Date | null>`min(${creatorFundAllocations.releaseAt}) filter (where ${creatorFundAllocations.releasedAt} is null)`,
        })
        .from(creatorFundAllocations)
        .where(eq(creatorFundAllocations.creatorId, userId)),
      this.db.select({ phone: payoutMethods.phone }).from(payoutMethods).where(eq(payoutMethods.userId, userId)),
    ]);
    const nexts = [sums.next, fund.next].filter((d): d is Date => d != null).map((d) => new Date(d).getTime());
    const [p] = await this.db
      .select({
        paid: sql<number>`coalesce(sum(${payouts.amountKes}) filter (where ${payouts.status} = 'paid'), 0)::int`,
        pending: sql<number>`coalesce(sum(${payouts.amountKes}) filter (where ${payouts.status} in ('requested', 'processing')), 0)::int`,
      })
      .from(payouts)
      .where(eq(payouts.userId, userId));
    return {
      availableKes: available / 100,
      pendingKes: pending / 100,
      nextReleaseAt: nexts.length ? new Date(Math.min(...nexts)).toISOString() : null,
      holdHours: this.config.get("TIP_HOLD_HOURS"),
      lifetimeTipsKes: Number(sums.lifetime) / 100,
      creatorFundKes: Number(fund.lifetime) / 100,
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
        throw new AppError(422, "insufficient_balance", `You can withdraw up to KES ${Math.floor(available / 100)}. Newer earnings are still on hold.`);
      }
      const [row] = await tx
        .insert(payouts)
        .values({ userId, amountKes, phone: method.phone, provider: this.providers.for(HOME_COUNTRY, "mpesa").id })
        .returning();
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
    const provider = this.providers.get(p.provider);
    const req = { payoutId: p.id, phone: p.phone, amountKes: p.amountKes, remarks: "Your Daddy Jokes tips" };
    try {
      const res = await provider.send(req);
      await this.db
        .update(payouts)
        .set({ status: "processing", conversationId: res.conversationId, originatorConversationId: res.originatorConversationId })
        .where(and(eq(payouts.id, id), eq(payouts.status, "requested")));
    } catch (e) {
      await this.finishPayout(id, { ok: false, resultCode: "request_failed", resultDesc: (e as Error).message.slice(0, 200) });
      return;
    }
    const outcome = provider.immediateOutcome?.(req);
    if (outcome) await this.finishPayout(id, outcome);
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
    await this.releaseDue(now);
  }

  /* ----------------------------------------------------------------- holds */

  /** Moves earnings whose hold is over from pending to available. Safe to repeat. */
  async releaseDue(now = new Date()) {
    let released = 0;
    const due = await this.db
      .select({ id: tips.id })
      .from(tips)
      .where(and(eq(tips.status, "paid"), isNull(tips.releasedAt), lte(tips.releaseAt, now)))
      .limit(500);
    for (const t of due) {
      if (await this.db.transaction((tx) => this.releaseTip(tx, t.id, now))) released++;
    }
    const fund = await this.db
      .select({ id: creatorFundAllocations.id })
      .from(creatorFundAllocations)
      .where(and(isNull(creatorFundAllocations.releasedAt), lte(creatorFundAllocations.releaseAt, now)))
      .limit(500);
    for (const a of fund) {
      const ok = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(creatorFundAllocations)
          .set({ releasedAt: now })
          .where(and(eq(creatorFundAllocations.id, a.id), isNull(creatorFundAllocations.releasedAt)))
          .returning();
        if (!row) return false;
        await post(
          tx,
          `Creator fund ${row.runId}: released`,
          [
            { account: creatorPendingAccount(row.creatorId), amountCents: row.amountCents },
            { account: creatorAccount(row.creatorId), amountCents: -row.amountCents },
          ],
          { fundAllocationId: row.id },
        );
        return true;
      });
      if (ok) released++;
    }
    return released;
  }

  private async releaseTip(tx: Tx, id: string, now: Date) {
    const [t] = await tx
      .update(tips)
      .set({ releasedAt: now })
      .where(and(eq(tips.id, id), eq(tips.status, "paid"), isNull(tips.releasedAt)))
      .returning();
    if (!t?.writerCents) return false;
    await post(
      tx,
      `Tip ${t.id}: released`,
      [
        { account: creatorPendingAccount(t.creatorId), amountCents: t.writerCents },
        { account: creatorAccount(t.creatorId), amountCents: -t.writerCents },
      ],
      { tipId: t.id },
    );
    return true;
  }

  /* --------------------------------------------------------------- tip wall */

  /** Paid tips on a joke, newest first, with their messages: what readers see under the joke. */
  async jokeTips(viewerId: string, jokeId: string): Promise<TipWallOut> {
    const { joke, isMine, staff } = await this.deliveries.access(viewerId, jokeId);
    const canModerate = isMine || staff;
    const rows = await this.db
      .select({
        t: tips,
        name: users.name,
        handle: users.handle,
        tone: users.tone,
      })
      .from(tips)
      .leftJoin(users, eq(users.id, tips.tipperId))
      .where(and(eq(tips.jokeId, joke.id), eq(tips.status, "paid")))
      .orderBy(desc(tips.paidAt))
      .limit(50);
    const [sum] = await this.db
      .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${tips.amountKes}), 0)::int` })
      .from(tips)
      .where(and(eq(tips.jokeId, joke.id), eq(tips.status, "paid")));
    return {
      count: sum.count,
      totalKes: sum.total,
      canModerate,
      data: rows.map(({ t, name, handle, tone }) => {
        const hidden = t.noteHiddenAt != null;
        const showName = !t.anonymous || t.tipperId === viewerId;
        return {
          id: t.id,
          amountKes: t.amountKes,
          note: hidden ? null : t.note,
          noteHidden: hidden && t.note != null,
          anonymous: t.anonymous,
          isMine: t.tipperId === viewerId,
          from: showName && handle ? { name: name ?? handle, handle, tone: tone ?? "navy" } : null,
          paidAt: (t.paidAt ?? t.createdAt).toISOString(),
        };
      }),
    };
  }

  /** The writer of the joke, or a curator, hides (or shows again) the message on a tip. The tip itself stays. */
  async setTipNoteHidden(viewerId: string, tipId: string, hidden: boolean) {
    const [row] = await this.db
      .select({
        t: tips,
        staff: sql<boolean>`exists (select 1 from ${userRoles} r where r.user_id = ${viewerId} and r.role in ('curator', 'admin'))`,
      })
      .from(tips)
      .where(eq(tips.id, tipId));
    if (!row || row.t.status !== "paid" || (row.t.creatorId !== viewerId && !row.staff)) throw notFound("Tip");
    await this.db.transaction(async (tx) => {
      await tx
        .update(tips)
        .set(hidden ? { noteHiddenAt: new Date(), noteHiddenBy: viewerId } : { noteHiddenAt: null, noteHiddenBy: null })
        .where(eq(tips.id, tipId));
      if (row.t.creatorId !== viewerId) {
        await this.audit.record(
          { actorId: viewerId, action: hidden ? "tip_note.hidden" : "tip_note.shown", targetType: "tip", targetId: tipId, data: { jokeId: row.t.jokeId } },
          tx,
        );
      }
    });
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

export type SimulatedAnswer = "approve" | "cancel" | "insufficient_funds" | "wrong_pin";

/** Daraja's own result codes for each answer, so the simulated callback looks like the real one. */
const SIMULATED_ANSWERS: Record<SimulatedAnswer, { code: string; desc: string }> = {
  approve: { code: "0", desc: "The service request is processed successfully." },
  cancel: { code: "1032", desc: "Request cancelled by user." },
  insufficient_funds: { code: "1", desc: "The balance is insufficient for the transaction." },
  wrong_pin: { code: "2001", desc: "The initiator information is invalid." },
};

/** Looks like an M-Pesa receipt (10 characters), marked SIM so it can't be mistaken for a real one. */
function simulatedReceipt() {
  return `SIM${randomBytes(4).toString("hex").toUpperCase().slice(0, 7)}`;
}

function toTip(t: Tip, simulated: boolean): TipOut {
  return {
    id: t.id,
    jokeId: t.jokeId,
    amountKes: t.amountKes,
    status: t.status,
    message: TIP_MESSAGES[t.status],
    simulated,
    phoneLast3: t.phone.slice(-3),
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
