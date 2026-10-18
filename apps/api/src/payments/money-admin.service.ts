import { Injectable, Logger } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { AppConfig } from "../config/config.module";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { creatorFundAllocations, creatorFundRuns, feePolicies, reconciliationRuns, users } from "../db/schema";
import type { ReconciliationCheck, ReconciliationRun } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../platform/audit.service";
import { HOME_COUNTRY, percentToBps, resolveFeePolicy } from "./fees";
import { CREATOR_FUND, creatorPendingAccount, post, splitPool } from "./ledger";
import { PaymentsService } from "./payments.service";
import type {
  CreateFeePolicyRequest,
  CreatorFundPreviewOut,
  CreatorFundRequest,
  CreatorFundRunOut,
  FeePolicyOut,
  ReconciliationRunOut,
} from "./schemas";

const kes = (cents: number | string) => Math.round(Number(cents)) / 100;

/** Admin money tools: fee rates, the books check, and the creator fund. */
@Injectable()
export class MoneyAdminService {
  private readonly logger = new Logger(MoneyAdminService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
  ) {}

  /* ------------------------------------------------------------ fee rates */

  async feePolicies(): Promise<{ data: FeePolicyOut[] }> {
    // Make sure the default exists, so the list always shows the rate in force.
    await this.db.transaction((tx) =>
      resolveFeePolicy(tx, { creatorId: "00000000-0000-0000-0000-000000000000", at: new Date(), defaultBps: this.defaultBps() }),
    );
    const rows = await this.db.execute<{
      id: string;
      country: string;
      creator_id: string | null;
      handle: string | null;
      name: string | null;
      bps: number;
      note: string;
      effective_from: Date;
      superseded_at: Date | null;
      tips: number;
      created_at: Date;
    }>(sql`
      select p.id, p.country, p.creator_id, u.handle, u.name, p.bps, p.note, p.effective_from, p.created_at,
        (select min(n.effective_from) from fee_policies n
          where n.country = p.country and n.creator_id is not distinct from p.creator_id
            and (n.effective_from, n.created_at) > (p.effective_from, p.created_at)) as superseded_at,
        (select count(*)::int from tips t where t.fee_policy_id = p.id) as tips
      from fee_policies p left join users u on u.id = p.creator_id
      order by p.creator_id is not null, u.handle nulls first, p.effective_from desc, p.created_at desc
      limit 200`);
    return {
      data: rows.rows.map((r) => ({
        id: r.id,
        country: r.country,
        creator: r.creator_id ? { id: r.creator_id, handle: r.handle, name: r.name } : null,
        bps: r.bps,
        note: r.note,
        effectiveFrom: new Date(r.effective_from).toISOString(),
        supersededAt: r.superseded_at ? new Date(r.superseded_at).toISOString() : null,
        tips: r.tips,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  }

  /** Adds a rate. Rates are never edited or backdated, so past tips keep the rate they were charged. */
  async createFeePolicy(adminId: string, req: CreateFeePolicyRequest) {
    const now = new Date();
    const effectiveFrom = req.effectiveFrom ? new Date(req.effectiveFrom) : now;
    if (effectiveFrom.getTime() < now.getTime() - 60_000) {
      throw new AppError(422, "fee_backdated", "A new rate can start now or later, not in the past.");
    }
    let creatorId: string | null = null;
    if (req.creatorHandle) {
      const handle = req.creatorHandle.replace(/^@/, "").toLowerCase();
      const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.handle, handle));
      if (!u) throw notFound("Writer");
      creatorId = u.id;
    }
    const id = await this.db.transaction(async (tx) => {
      const [p] = await tx
        .insert(feePolicies)
        .values({ country: HOME_COUNTRY, creatorId, bps: req.bps, note: req.note, effectiveFrom, createdBy: adminId })
        .returning();
      await this.audit.record(
        { actorId: adminId, action: "fee_policy.created", targetType: "fee_policy", targetId: p.id, data: { bps: p.bps, creatorId, effectiveFrom } },
        tx,
      );
      return p.id;
    });
    return (await this.feePolicies()).data.find((p) => p.id === id)!;
  }

  private defaultBps() {
    return percentToBps(this.config.get("TIP_FEE_PERCENT"));
  }

  /* ------------------------------------------------------- reconciliation */

  /**
   * Checks the books: every transaction balances, no writer is overdrawn,
   * every paid tip is in the ledger exactly as charged, M-Pesa clearing
   * matches tips in minus payouts out, holds match what's pending, and
   * nothing is stuck. Comparing against Safaricom's own statement comes
   * once the production account (and its statement API) is set up.
   */
  async reconcile(triggeredBy: string | null = null): Promise<ReconciliationRunOut> {
    const startedAt = new Date();
    let checks: ReconciliationCheck[] = [];
    let status: ReconciliationRun["status"];
    try {
      checks = await this.runChecks();
      status = checks.every((c) => c.ok) ? "ok" : "issues";
    } catch (e) {
      this.logger.error(`Reconciliation failed: ${(e as Error).message}`);
      checks = [{ key: "error", label: "The check itself failed", ok: false, count: 1, detail: (e as Error).message.slice(0, 300) }];
      status = "failed";
    }
    if (status !== "ok") this.logger.warn(`Reconciliation found issues: ${checks.filter((c) => !c.ok).map((c) => c.key).join(", ")}`);
    const [run] = await this.db
      .insert(reconciliationRuns)
      .values({ status, checks, triggeredBy, startedAt, finishedAt: new Date() })
      .returning();
    return (await this.reconciliations(1, run.id)).data[0];
  }

  async reconciliations(limit = 14, id?: string): Promise<{ data: ReconciliationRunOut[] }> {
    const rows = await this.db
      .select({ r: reconciliationRuns, handle: users.handle })
      .from(reconciliationRuns)
      .leftJoin(users, eq(users.id, reconciliationRuns.triggeredBy))
      .where(id ? eq(reconciliationRuns.id, id) : undefined)
      .orderBy(desc(reconciliationRuns.startedAt))
      .limit(limit);
    return {
      data: rows.map(({ r, handle }) => ({
        id: r.id,
        status: r.status,
        checks: r.checks.map((c) => ({
          key: c.key,
          label: c.label,
          ok: c.ok,
          count: c.count,
          amountKes: c.amountCents == null ? null : kes(c.amountCents),
          detail: c.detail ?? null,
        })),
        triggeredBy: r.triggeredBy ? (handle ?? "admin") : null,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt.toISOString(),
      })),
    };
  }

  private async runChecks(): Promise<ReconciliationCheck[]> {
    const one = async <T extends Record<string, unknown>>(q: ReturnType<typeof sql>) => (await this.db.execute<T>(q)).rows[0];
    type N = { n: number; cents: string };
    const unbalanced = await one<N>(sql`
      select count(*)::int as n, coalesce(sum(abs(s)), 0)::text as cents
      from (select sum(amount_cents) as s from ledger_entries group by txn_id having sum(amount_cents) <> 0) x`);
    const overdrawn = await one<N>(sql`
      select count(*)::int as n, coalesce(sum(s), 0)::text as cents
      from (select sum(amount_cents) as s from ledger_entries where account like 'creator:%' group by account having sum(amount_cents) > 0) x`);
    const unposted = await one<N>(sql`
      select count(*)::int as n, coalesce(sum(amount_kes) * 100, 0)::text as cents from tips t
      where t.status = 'paid' and not exists (select 1 from ledger_entries l where l.tip_id = t.id and l.account = 'mpesa:clearing')`);
    const orphan = await one<N>(sql`
      select count(distinct t.id)::int as n, coalesce(sum(l.amount_cents), 0)::text as cents
      from ledger_entries l join tips t on t.id = l.tip_id
      where t.status <> 'paid' and l.account = 'mpesa:clearing'`);
    const split = await one<N>(sql`
      select count(*)::int as n, '0' as cents from tips t
      where t.status = 'paid' and (
        t.fee_cents is null or t.writer_cents is null or t.fee_cents + t.writer_cents <> t.amount_kes * 100
        or coalesce((select -sum(amount_cents) from ledger_entries l where l.tip_id = t.id and l.account = 'platform:fees'), 0) <> t.fee_cents
        or coalesce((select sum(amount_cents) from ledger_entries l where l.tip_id = t.id and l.account = 'mpesa:clearing'), 0) <> t.amount_kes * 100)`);
    const clearing = await one<{ actual: string; expected: string }>(sql`
      select
        (select coalesce(sum(amount_cents), 0) from ledger_entries where account = 'mpesa:clearing')::text as actual,
        ((select coalesce(sum(amount_kes), 0) from tips where status = 'paid') * 100
          - (select coalesce(sum(amount_kes), 0) from payouts where status <> 'failed') * 100)::text as expected`);
    const holds = await one<{ actual: string; expected: string }>(sql`
      select
        (select coalesce(-sum(amount_cents), 0) from ledger_entries where account like 'creator:%:pending')::text as actual,
        ((select coalesce(sum(writer_cents), 0) from tips where status = 'paid' and released_at is null)
          + (select coalesce(sum(amount_cents), 0) from creator_fund_allocations where released_at is null))::text as expected`);
    const stuckTips = await one<N>(sql`
      select count(*)::int as n, coalesce(sum(amount_kes) * 100, 0)::text as cents from tips
      where status = 'pending' and created_at < now() - interval '30 minutes'`);
    const stuckPayouts = await one<N>(sql`
      select count(*)::int as n, coalesce(sum(amount_kes) * 100, 0)::text as cents from payouts
      where (status = 'requested' and created_at < now() - interval '15 minutes')
         or (status = 'processing' and updated_at < now() - interval '2 hours')`);
    const overdue = await one<N>(sql`
      select count(*)::int as n, coalesce(sum(c), 0)::text as cents from (
        select writer_cents as c from tips where status = 'paid' and released_at is null and release_at < now() - interval '1 hour'
        union all
        select amount_cents from creator_fund_allocations where released_at is null and release_at < now() - interval '1 hour') x`);

    const diff = (r: { actual: string; expected: string }) => Number(r.actual) - Number(r.expected);
    const c = (key: string, label: string, r: N, detail?: string): ReconciliationCheck => ({
      key,
      label,
      ok: r.n === 0,
      count: r.n,
      amountCents: Number(r.cents),
      ...(r.n && detail ? { detail } : {}),
    });
    const clearingDiff = diff(clearing);
    const holdsDiff = diff(holds);
    return [
      c("ledger_balanced", "Every ledger transaction balances", unbalanced, "Transactions whose entries don't sum to zero."),
      c("no_overdrawn_writers", "No writer balance is overdrawn", overdrawn, "Writer accounts paid more than they earned."),
      c("paid_tips_posted", "Every paid tip is in the ledger", unposted, "Tips marked paid with no ledger entry."),
      c("ledger_tips_paid", "Ledger tips are all paid", orphan, "Ledger entries for tips that aren't paid."),
      c("tip_split", "Tips are split exactly as charged", split, "Fee or writer share doesn't match the tip or its rate."),
      {
        key: "clearing",
        label: "M-Pesa clearing = tips in − payouts out",
        ok: clearingDiff === 0,
        count: clearingDiff === 0 ? 0 : 1,
        amountCents: clearingDiff,
        ...(clearingDiff ? { detail: `Ledger ${kes(clearing.actual)} vs expected ${kes(clearing.expected)}.` } : {}),
      },
      {
        key: "holds",
        label: "Pending balances match earnings on hold",
        ok: holdsDiff === 0,
        count: holdsDiff === 0 ? 0 : 1,
        amountCents: holdsDiff,
        ...(holdsDiff ? { detail: `Ledger ${kes(holds.actual)} vs on hold ${kes(holds.expected)}.` } : {}),
      },
      c("stuck_tips", "No tip is stuck waiting on M-Pesa", stuckTips, "Pending for more than 30 minutes."),
      c("stuck_payouts", "No withdrawal is stuck", stuckPayouts, "Requested for 15+ minutes or processing for 2+ hours."),
      c("overdue_releases", "Holds are released on time", overdue, "Earnings past their release time still on hold."),
    ];
  }

  /* --------------------------------------------------------- creator fund */

  /** Who would get what: the pool split by qualified views in the period. */
  async previewCreatorFund(req: CreatorFundRequest): Promise<CreatorFundPreviewOut> {
    const rows = await this.qualifiedViews(req.periodStart, req.periodEnd);
    const poolCents = req.poolKes * 100;
    const shares = splitPool(poolCents, rows.map((r) => ({ id: r.creator_id, weight: r.views })));
    const total = rows.reduce((n, r) => n + r.views, 0);
    return {
      periodStart: req.periodStart,
      periodEnd: req.periodEnd,
      poolKes: req.poolKes,
      qualifiedViews: total,
      allocations: rows
        .filter((r) => shares.has(r.creator_id))
        .map((r) => ({
          creatorId: r.creator_id,
          handle: r.handle,
          name: r.name,
          views: r.views,
          sharePct: Math.round((r.views / total) * 10_000) / 100,
          amountKes: kes(shares.get(r.creator_id)!),
        })),
    };
  }

  /** Pays the creator fund for a period into writers' pending balances. Each period is paid once. */
  async postCreatorFund(adminId: string, req: CreatorFundRequest): Promise<CreatorFundRunOut> {
    const preview = await this.previewCreatorFund(req);
    if (!preview.allocations.length) throw new AppError(422, "no_qualified_views", "No qualified views in that period, so there's nothing to split.");
    const now = new Date();
    const releaseAt = new Date(now.getTime() + this.config.get("TIP_HOLD_HOURS") * 3_600_000);
    const runId = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('creator-fund'))`);
      const overlap = await tx.execute(sql`
        select 1 from creator_fund_runs where period_start <= ${req.periodEnd}::date and period_end >= ${req.periodStart}::date limit 1`);
      if (overlap.rows.length) throw new AppError(409, "fund_period_paid", "Part of that period has already been paid from the creator fund.");
      const allocated = preview.allocations.reduce((n, a) => n + Math.round(a.amountKes * 100), 0);
      const [run] = await tx
        .insert(creatorFundRuns)
        .values({
          periodStart: req.periodStart,
          periodEnd: req.periodEnd,
          poolCents: req.poolKes * 100,
          allocatedCents: allocated,
          qualifiedViews: preview.qualifiedViews,
          createdBy: adminId,
        })
        .returning();
      for (const a of preview.allocations) {
        const cents = Math.round(a.amountKes * 100);
        const [alloc] = await tx
          .insert(creatorFundAllocations)
          .values({ runId: run.id, creatorId: a.creatorId, views: a.views, amountCents: cents, releaseAt })
          .returning();
        await post(
          tx,
          `Creator fund ${req.periodStart}–${req.periodEnd}`,
          [
            { account: CREATOR_FUND, amountCents: cents },
            { account: creatorPendingAccount(a.creatorId), amountCents: -cents },
          ],
          { fundAllocationId: alloc.id },
        );
        await this.notifications.notify(
          {
            userId: a.creatorId,
            type: "automation",
            data: {
              title: `You've received KSh ${a.amountKes.toLocaleString("en-KE")} from the creator fund`,
              body: `For ${a.views.toLocaleString("en-KE")} ${a.views === 1 ? "view" : "views"} between ${req.periodStart} and ${req.periodEnd}.`,
              url: "/studio",
            },
            dedupeKey: `fund:${alloc.id}`,
          },
          tx,
        );
      }
      await this.audit.record(
        {
          actorId: adminId,
          action: "creator_fund.posted",
          targetType: "creator_fund_run",
          targetId: run.id,
          data: { periodStart: req.periodStart, periodEnd: req.periodEnd, poolKes: req.poolKes, creators: preview.allocations.length },
        },
        tx,
      );
      return run.id;
    });
    if (releaseAt <= now) await this.payments.releaseDue(now);
    return (await this.creatorFundRuns(runId)).data[0];
  }

  async creatorFundRuns(id?: string): Promise<{ data: CreatorFundRunOut[] }> {
    const rows = await this.db.execute<{
      id: string;
      period_start: string;
      period_end: string;
      pool_cents: string;
      allocated_cents: string;
      qualified_views: number;
      creators: number;
      released_cents: string;
      handle: string | null;
      created_at: Date;
    }>(sql`
      select r.id, r.period_start::text, r.period_end::text, r.pool_cents, r.allocated_cents, r.qualified_views, r.created_at, u.handle,
        (select count(*)::int from creator_fund_allocations a where a.run_id = r.id) as creators,
        (select coalesce(sum(amount_cents), 0) from creator_fund_allocations a where a.run_id = r.id and a.released_at is not null) as released_cents
      from creator_fund_runs r left join users u on u.id = r.created_by
      ${id ? sql`where r.id = ${id}` : sql``}
      order by r.period_start desc limit 24`);
    return {
      data: rows.rows.map((r) => ({
        id: r.id,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        poolKes: kes(r.pool_cents),
        allocatedKes: kes(r.allocated_cents),
        qualifiedViews: r.qualified_views,
        creators: r.creators,
        releasedKes: kes(r.released_cents),
        createdBy: r.handle,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  }

  /** Opens of a writer's jokes by other readers in the period (by the reader's own date), from writers in good standing. */
  private async qualifiedViews(from: string, to: string) {
    const res = await this.db.execute<{ creator_id: string; handle: string | null; name: string | null; views: number }>(sql`
      select j.creator_id, u.handle, u.name, count(*)::int as views
      from deliveries d
        join jokes j on j.id = d.joke_id
        join users u on u.id = j.creator_id
      where d.opened_at is not null
        and d.local_date between ${from}::date and ${to}::date
        and d.user_id <> j.creator_id
        and j.removed_at is null
        and u.suspended_at is null
      group by j.creator_id, u.handle, u.name
      order by views desc, u.handle`);
    return res.rows;
  }
}
