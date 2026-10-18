import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { addDays } from "../common/dates";
import { streaksQuery } from "../common/streaks";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { auditLog, sessions, userRoles, users, userTags } from "../db/schema";
import type { Role } from "../db/schema";
import { AuditService } from "../platform/audit.service";
import type { AdminUsersQuery, AuditQuery } from "./schemas";

const kes = (cents: number | string | null) => Number(cents ?? 0) / 100;

/**
 * Read models for the admin console. Everything is computed from the source
 * tables and the ledger at request time; the heavy per-day data comes from
 * joke_stats_daily, which the worker keeps up to date.
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------- overview */

  async overview() {
    const today = new Date().toISOString().slice(0, 10);
    const from = addDays(today, -29);
    const [counts] = (
      await this.db.execute<Record<string, number | string>>(sql`
        select
          (select count(*) from users where onboarded_at is not null)::int as total,
          (select count(*) from users where onboarded_at is not null and created_at > now() - interval '7 days')::int as new7d,
          (select count(distinct user_id) from user_roles where role = 'reader')::int as readers,
          (select count(distinct user_id) from user_roles where role = 'writer')::int as writers,
          (select count(*) from users where suspended_at is not null)::int as suspended,
          (select count(*) from deliveries where delivered_at > now() - interval '24 hours')::int as delivered,
          (select count(*) from deliveries where opened_at > now() - interval '24 hours')::int as opened,
          (select coalesce(avg(case when opened_at is not null then 1.0 else 0 end), 0) from deliveries
             where local_date > current_date - 8 and (opened_at is not null or expires_at < now())) as open_rate,
          (select count(*) from jokes where status = 'in_review')::int as in_review,
          (select count(*) from jokes where status = 'scheduled' and deliver_on > current_date)::int as scheduled_ahead,
          (select count(*) from generate_series(current_date, current_date + 6, interval '1 day') g(d)
             where not exists (select 1 from jokes j where j.deliver_on = g.d::date and j.region is null))::int as days_without_pick,
          (select count(*) from reports where resolved_at is null)::int as open_reports,
          ((select count(*) from jokes where hidden_at is not null and removed_at is null) +
           (select count(*) from comments where hidden_at is not null and deleted_at is null))::int as hidden,
          (select count(*) from appeals where status = 'open')::int as open_appeals,
          (select coalesce(sum(amount_kes), 0) from tips where status = 'paid' and paid_at > now() - interval '24 hours')::int as tips24,
          (select coalesce(sum(amount_kes), 0) from tips where status = 'paid' and paid_at > now() - interval '30 days')::int as tips30,
          (select coalesce(-sum(amount_cents), 0) from ledger_entries where account = 'platform:fees' and created_at > now() - interval '30 days') as fees30,
          (select coalesce(-sum(amount_cents), 0) from ledger_entries where account like 'creator:%') as owed
      `)
    ).rows;
    const streaks = await this.db.execute<{ active: number; longest: number }>(sql`
      select count(*) filter (where streak >= 3)::int as active, coalesce(max(streak), 0)::int as longest
      from (${streaksQuery()}) s`);
    const series = await this.db.execute<{ date: string; signups: number; opens: number; tips: number }>(sql`
      select g.d::date::text as date,
        (select count(*) from users u where u.onboarded_at::date = g.d::date)::int as signups,
        (select count(*) from deliveries d where d.opened_at::date = g.d::date)::int as opens,
        (select coalesce(sum(amount_kes), 0) from tips t where t.status = 'paid' and t.paid_at::date = g.d::date)::int as tips
      from generate_series(${from}::date, ${today}::date, interval '1 day') g(d)
      order by 1`);
    const n = (k: string) => Number(counts[k] ?? 0);
    return {
      people: { total: n("total"), new7d: n("new7d"), readers: n("readers"), writers: n("writers"), suspended: n("suspended") },
      today: { delivered: n("delivered"), opened: n("opened"), openRate7d: Math.round(n("open_rate") * 1000) / 1000 },
      streaks: { active3plus: streaks.rows[0]?.active ?? 0, longest: streaks.rows[0]?.longest ?? 0 },
      queue: { inReview: n("in_review"), scheduledAhead: n("scheduled_ahead"), daysWithoutPick: n("days_without_pick") },
      moderation: { openReports: n("open_reports"), hidden: n("hidden"), openAppeals: n("open_appeals") },
      money: { tips24hKes: n("tips24"), tips30dKes: n("tips30"), fees30dKes: kes(n("fees30")), owedToWritersKes: kes(n("owed")) },
      series: series.rows.map((r) => ({ date: r.date, signups: r.signups, opens: r.opens, tipsKes: r.tips })),
    };
  }

  /* -------------------------------------------------------------- finance */

  async finance(days: number) {
    const today = new Date().toISOString().slice(0, 10);
    const from = addDays(today, -(days - 1));
    const since = sql`${from}::date`;
    const [t] = (
      await this.db.execute<Record<string, number | string>>(sql`
        select
          (select coalesce(sum(amount_cents), 0) from ledger_entries where account = 'mpesa:clearing' and tip_id is not null and created_at >= ${since}) as tips,
          (select count(*) from tips where status = 'paid' and paid_at >= ${since})::int as tip_count,
          (select count(*) from tips where status in ('failed', 'expired', 'cancelled') and created_at >= ${since})::int as tips_failed,
          (select coalesce(-sum(amount_cents), 0) from ledger_entries where account = 'platform:fees' and created_at >= ${since}) as fees,
          (select coalesce(-sum(amount_cents), 0) from ledger_entries where account like 'creator:%' and tip_id is not null and created_at >= ${since}) as writer,
          (select coalesce(sum(amount_kes), 0) from payouts where status = 'paid' and completed_at >= ${since})::int as paid,
          (select coalesce(sum(amount_kes), 0) from payouts where status in ('requested', 'processing'))::int as pending,
          (select count(*) from payouts where status = 'failed' and created_at >= ${since})::int as failed,
          (select coalesce(-sum(amount_cents), 0) from ledger_entries where account like 'creator:%') as owed,
          (select coalesce(sum(amount_cents), 0) from ledger_entries where account = 'mpesa:clearing') as clearing
      `)
    ).rows;
    const series = await this.db.execute<{ date: string; tips: string; fees: string; payouts: number }>(sql`
      select g.d::date::text as date,
        (select coalesce(sum(amount_cents), 0) from ledger_entries l where l.account = 'mpesa:clearing' and l.tip_id is not null and l.created_at::date = g.d::date) as tips,
        (select coalesce(-sum(amount_cents), 0) from ledger_entries l where l.account = 'platform:fees' and l.created_at::date = g.d::date) as fees,
        (select coalesce(sum(amount_kes), 0) from payouts p where p.status = 'paid' and p.completed_at::date = g.d::date)::int as payouts
      from generate_series(${from}::date, ${today}::date, interval '1 day') g(d)
      order by 1`);
    const top = await this.db.execute<{ id: string; handle: string | null; name: string | null; tips: string; n: number; balance: string }>(sql`
      select u.id, u.handle, u.name, coalesce(sum(t.amount_kes), 0) as tips, count(t.id)::int as n,
        (select coalesce(-sum(amount_cents), 0) from ledger_entries l where l.account = 'creator:' || u.id::text) as balance
      from tips t join users u on u.id = t.creator_id
      where t.status = 'paid' and t.paid_at >= ${since}
      group by u.id order by 4 desc limit 10`);
    const payouts = await this.db.execute<{
      id: string;
      handle: string | null;
      amount_kes: number;
      status: "requested" | "processing" | "paid" | "failed";
      result_desc: string | null;
      created_at: string;
      completed_at: string | null;
    }>(sql`
      select p.id, u.handle, p.amount_kes, p.status, p.result_desc, p.created_at, p.completed_at
      from payouts p join users u on u.id = p.user_id
      order by p.created_at desc limit 30`);
    const n = (k: string) => Number(t[k] ?? 0);
    return {
      days,
      totals: {
        tipsKes: kes(n("tips")),
        tipCount: n("tip_count"),
        feesKes: kes(n("fees")),
        writerEarningsKes: kes(n("writer")),
        payoutsPaidKes: n("paid"),
        payoutsPendingKes: n("pending"),
        payoutsFailed: n("failed"),
        tipsFailed: n("tips_failed"),
        owedToWritersKes: kes(n("owed")),
        clearingKes: kes(n("clearing")),
      },
      series: series.rows.map((r) => ({ date: r.date, tipsKes: kes(r.tips), feesKes: kes(r.fees), payoutsKes: r.payouts })),
      topWriters: top.rows.map((r) => ({ id: r.id, handle: r.handle ?? "", name: r.name ?? r.handle ?? "", tipsKes: Number(r.tips), tips: r.n, balanceKes: kes(r.balance) })),
      payouts: payouts.rows.map((p) => ({
        id: p.id,
        handle: p.handle ?? "",
        amountKes: p.amount_kes,
        status: p.status,
        resultDesc: p.result_desc,
        createdAt: new Date(p.created_at).toISOString(),
        completedAt: p.completed_at ? new Date(p.completed_at).toISOString() : null,
      })),
    };
  }

  /** The ledger as CSV, one row per entry, for accounting. */
  async ledgerCsv(days: number) {
    const from = addDays(new Date().toISOString().slice(0, 10), -(days - 1));
    const { rows } = await this.db.execute<{ created_at: string; txn_id: string; account: string; amount_cents: string; memo: string; tip_id: string | null; payout_id: string | null }>(sql`
      select created_at, txn_id, account, amount_cents, memo, tip_id, payout_id
      from ledger_entries where created_at >= ${from}::date order by created_at, txn_id`);
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["created_at", "txn_id", "account", "amount_kes", "memo", "tip_id", "payout_id"].join(",")];
    for (const r of rows) {
      lines.push([new Date(r.created_at).toISOString(), r.txn_id, r.account, (Number(r.amount_cents) / 100).toFixed(2), r.memo, r.tip_id, r.payout_id].map(esc).join(","));
    }
    return `${lines.join("\n")}\n`;
  }

  /* ----------------------------------------------------------- engagement */

  async engagement(days: number) {
    const today = new Date().toISOString().slice(0, 10);
    const from = addDays(today, -(days - 1));
    const daily = await this.db.execute<{ date: string; delivered: number; opened: number; reactions: number; comments: number }>(sql`
      select g.d::date::text as date,
        (select count(*) from deliveries d where d.delivered_at::date = g.d::date)::int as delivered,
        (select count(*) from deliveries d where d.opened_at::date = g.d::date)::int as opened,
        (select coalesce(sum(reactions), 0) from joke_stats_daily s where s.day = g.d::date)::int as reactions,
        (select coalesce(sum(comments), 0) from joke_stats_daily s where s.day = g.d::date)::int as comments
      from generate_series(${from}::date, ${today}::date, interval '1 day') g(d)
      order by 1`);
    const readerStreaks = sql`(${streaksQuery()})`;
    const buckets = await this.db.execute<{ label: string; readers: number }>(sql`
      with s as (
        select r.user_id, coalesce(st.streak, 0) as streak
        from (select distinct user_id from user_roles where role = 'reader') r
        left join ${readerStreaks} st on st.user_id = r.user_id
      )
      select b.label, count(s.user_id)::int as readers
      from (values (0, 'None', 0, 0), (1, '1-2 days', 1, 2), (2, '3-6 days', 3, 6), (3, '1-2 weeks', 7, 13), (4, '2-4 weeks', 14, 29), (5, '30+ days', 30, 100000))
        as b(pos, label, lo, hi)
      left join s on s.streak between b.lo and b.hi
      group by b.pos, b.label order by b.pos`);
    const topStreaks = await this.db.execute<{ id: string; handle: string | null; name: string | null; streak: number }>(sql`
      select u.id, u.handle, u.name, st.streak from ${readerStreaks} st join users u on u.id = st.user_id
      where st.streak > 0 order by st.streak desc limit 10`);
    const topJokes = await this.db.execute<{
      id: string;
      preview: string;
      handle: string | null;
      deliver_on: string | null;
      opens: number;
      reactions: number;
      comments: number;
      shares: number;
    }>(sql`
      select j.id, coalesce(j.setup, j.caption, j.image_alt, '') as preview, u.handle, j.deliver_on::text,
        sum(s.opens)::int as opens, sum(s.reactions)::int as reactions, sum(s.comments)::int as comments, sum(s.shares)::int as shares
      from joke_stats_daily s join jokes j on j.id = s.joke_id join users u on u.id = j.creator_id
      where s.day >= ${from}::date
      group by j.id, u.handle order by opens desc, reactions desc limit 10`);
    const reactions = await this.db.execute<{ kind: string; n: number }>(sql`
      select kind::text, count(*)::int as n from reactions where created_at >= ${from}::date group by kind`);
    const messages = await this.db.execute<{ channel: string; n: number }>(sql`
      select channel, count(*)::int as n from automation_messages where sent_at >= ${from}::date group by channel`);
    return {
      days,
      daily: daily.rows,
      streakBuckets: buckets.rows,
      topStreaks: topStreaks.rows.map((r) => ({ id: r.id, handle: r.handle ?? "", name: r.name ?? r.handle ?? "", streak: r.streak })),
      topJokes: topJokes.rows.map((r) => ({
        id: r.id,
        preview: r.preview,
        handle: r.handle ?? "",
        deliverOn: r.deliver_on,
        opens: r.opens,
        reactions: r.reactions,
        comments: r.comments,
        shares: r.shares,
      })),
      reactions: Object.fromEntries(reactions.rows.map((r) => [r.kind, r.n])),
      automation: {
        messages: messages.rows.reduce((n, r) => n + r.n, 0),
        byChannel: Object.fromEntries(messages.rows.map((r) => [r.channel, r.n])),
      },
    };
  }

  /* ---------------------------------------------------------------- people */

  async users(q: AdminUsersQuery) {
    const where: SQL[] = [];
    if (q.q) {
      const like = `%${q.q.toLowerCase().replace(/[%_]/g, "\\$&")}%`;
      where.push(sql`(lower(coalesce(u.name, '')) like ${like} or coalesce(u.handle, '') like ${like} or u.email like ${like})`);
    }
    if (q.role) where.push(sql`exists (select 1 from user_roles r where r.user_id = u.id and r.role = ${q.role})`);
    if (q.tag) where.push(sql`exists (select 1 from user_tags t where t.user_id = u.id and t.tag = ${q.tag})`);
    if (q.status === "suspended") where.push(sql`u.suspended_at is not null`);
    if (q.status === "active") where.push(sql`u.suspended_at is null and u.onboarded_at is not null`);
    if (q.status === "onboarding") where.push(sql`u.onboarded_at is null`);
    const filter = where.length ? sql.join(where, sql` and `) : sql`true`;
    const [{ total }] = (await this.db.execute<{ total: number }>(sql`select count(*)::int as total from users u where ${filter}`)).rows;
    const { rows } = await this.db.execute<UserRow>(sql`
      select ${USER_COLUMNS} from users u where ${filter}
      order by ${userOrder(q.sort)} limit ${q.size} offset ${(q.page - 1) * q.size}`);
    const streaks = await this.streaksFor(rows.map((r) => r.id));
    return { data: rows.map((r) => toUserRow(r, streaks.get(r.id) ?? 0)), total, page: q.page, size: q.size };
  }

  private async streaksFor(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const { rows } = await this.db.execute<{ user_id: string; streak: number }>(
      streaksQuery(sql`d.user_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`),
    );
    return new Map(rows.map((r) => [r.user_id, r.streak]));
  }

  async user(id: string) {
    const { rows } = await this.db.execute<
      UserRow & {
        bio: string;
        timezone: string;
        delivery_hour: number | null;
        suspended_reason: string | null;
        suspended_at: string | null;
        stats: Record<string, number | string>;
      }
    >(sql`
      select ${USER_COLUMNS}, u.bio, u.timezone, u.suspended_reason, u.suspended_at,
        (select delivery_hour from user_preferences p where p.user_id = u.id) as delivery_hour,
        json_build_object(
          'opens', (select count(*) from deliveries where user_id = u.id and opened_at is not null),
          'missed7d', (select count(*) from deliveries where user_id = u.id and opened_at is null and expires_at < now() and local_date > current_date - 7),
          'subscriptions', (select count(*) from subscriptions where subscriber_id = u.id),
          'subscribers', (select count(*) from subscriptions where creator_id = u.id),
          'tipsSent', (select count(*) from tips where tipper_id = u.id and status = 'paid'),
          'tipsSentKes', (select coalesce(sum(amount_kes), 0) from tips where tipper_id = u.id and status = 'paid'),
          'tipsReceivedKes', (select coalesce(sum(amount_kes), 0) from tips where creator_id = u.id and status = 'paid'),
          'balanceCents', (select coalesce(-sum(amount_cents), 0) from ledger_entries where account = 'creator:' || u.id::text),
          'jokesSubmitted', (select count(*) from jokes where creator_id = u.id),
          'jokesDelivered', (select count(*) from jokes where creator_id = u.id and status = 'delivered'),
          'jokesRemoved', (select count(*) from jokes where creator_id = u.id and removed_at is not null),
          'reportsAgainst', (select count(*) from reports r left join comments c on c.id = r.comment_id left join jokes j on j.id = r.joke_id
                              where coalesce(c.user_id, j.creator_id) = u.id),
          'reportsFiled', (select count(*) from reports where reporter_id = u.id)
        ) as stats
      from users u where u.id = ${id}`);
    const u = rows[0];
    if (!u) throw notFound("Person");
    const [messages, runs, audit, streaks] = await Promise.all([
      this.db.execute<{ channel: string; title: string; name: string | null; sent_at: string }>(sql`
        select m.channel, m.title, w.name, m.sent_at from automation_messages m left join workflows w on w.id = m.workflow_id
        where m.user_id = ${id} order by m.sent_at desc limit 15`),
      this.db.execute<{ id: string; name: string; status: string; started_at: string }>(sql`
        select r.id, w.name, r.status::text, r.started_at from workflow_runs r join workflows w on w.id = r.workflow_id
        where r.user_id = ${id} order by r.started_at desc limit 15`),
      this.db.execute<{ action: string; handle: string | null; data: Record<string, unknown>; created_at: string }>(sql`
        select a.action, au.handle, a.data, a.created_at from audit_log a left join users au on au.id = a.actor_id
        where a.target_type = 'user' and a.target_id = ${id} order by a.created_at desc limit 20`),
      this.streaksFor([id]),
    ]);
    const s = (k: string) => Number(u.stats[k] ?? 0);
    return {
      ...toUserRow(u, streaks.get(id) ?? 0),
      bio: u.bio,
      timezone: u.timezone,
      deliveryHour: u.delivery_hour,
      suspendedReason: u.suspended_reason,
      suspendedAt: u.suspended_at ? new Date(u.suspended_at).toISOString() : null,
      stats: {
        opens: s("opens"),
        missed7d: s("missed7d"),
        subscriptions: s("subscriptions"),
        subscribers: s("subscribers"),
        tipsSent: s("tipsSent"),
        tipsSentKes: s("tipsSentKes"),
        tipsReceivedKes: s("tipsReceivedKes"),
        balanceKes: kes(s("balanceCents")),
        jokesSubmitted: s("jokesSubmitted"),
        jokesDelivered: s("jokesDelivered"),
        jokesRemoved: s("jokesRemoved"),
        reportsAgainst: s("reportsAgainst"),
        reportsFiled: s("reportsFiled"),
      },
      messages: messages.rows.map((m) => ({ channel: m.channel, title: m.title, workflowName: m.name, sentAt: new Date(m.sent_at).toISOString() })),
      runs: runs.rows.map((r) => ({ id: r.id, workflowName: r.name, status: r.status, startedAt: new Date(r.started_at).toISOString() })),
      audit: audit.rows.map((a) => ({ action: a.action, actor: a.handle, data: a.data, createdAt: new Date(a.created_at).toISOString() })),
    };
  }

  async setRoles(actorId: string, id: string, roles: Role[]) {
    const unique = [...new Set(roles)];
    if (actorId === id && !unique.includes("admin")) throw new AppError(422, "cannot_demote_self", "You can't remove your own admin role.");
    await this.db.transaction(async (tx) => {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!u) throw notFound("Person");
      const before = (await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, id))).map((r) => r.role);
      await tx.delete(userRoles).where(eq(userRoles.userId, id));
      await tx.insert(userRoles).values(unique.map((role) => ({ userId: id, role })));
      await this.audit.record({ actorId, action: "user.roles_changed", targetType: "user", targetId: id, data: { before, after: unique } }, tx);
    });
    return this.user(id);
  }

  async setSuspended(actorId: string, id: string, reason: string | null) {
    if (actorId === id) throw new AppError(422, "cannot_suspend_self", "You can't suspend yourself.");
    await this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(users)
        .set(reason ? { suspendedAt: new Date(), suspendedReason: reason } : { suspendedAt: null, suspendedReason: null })
        .where(eq(users.id, id))
        .returning({ id: users.id });
      if (!u) throw notFound("Person");
      // Signing them out everywhere: their refresh tokens stop working.
      if (reason) await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
      await this.audit.record({ actorId, action: reason ? "user.suspended" : "user.unsuspended", targetType: "user", targetId: id, data: { reason } }, tx);
    });
    return this.user(id);
  }

  async tag(actorId: string, id: string, tag: string, on: boolean) {
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(tag)) throw new AppError(422, "bad_tag", "Tags are lowercase letters, numbers, - and _.");
    await this.db.transaction(async (tx) => {
      if (on) await tx.insert(userTags).values({ userId: id, tag }).onConflictDoNothing();
      else await tx.delete(userTags).where(and(eq(userTags.userId, id), eq(userTags.tag, tag)));
      await this.audit.record({ actorId, action: on ? "user.tagged" : "user.untagged", targetType: "user", targetId: id, data: { tag } }, tx);
    });
    return this.user(id);
  }

  async tags() {
    const rows = await this.db
      .select({ tag: userTags.tag, people: sql<number>`count(*)::int` })
      .from(userTags)
      .groupBy(userTags.tag)
      .orderBy(desc(sql`count(*)`));
    return { data: rows };
  }

  /* ----------------------------------------------------------------- audit */

  async auditLog(q: AuditQuery) {
    const where: SQL[] = [];
    if (q.action) where.push(sql`${auditLog.action} like ${`${q.action.replace(/[%_]/g, "\\$&")}%`}`);
    if (q.targetType) where.push(eq(auditLog.targetType, q.targetType));
    if (q.before) where.push(lt(auditLog.createdAt, new Date(q.before)));
    const rows = await this.db
      .select({ a: auditLog, handle: users.handle })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    return {
      data: page.map(({ a, handle }) => ({
        id: a.id,
        actor: a.actorId ? { id: a.actorId, handle: handle ?? "" } : null,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        data: a.data,
        createdAt: a.createdAt.toISOString(),
      })),
      nextBefore: rows.length > q.limit ? page.at(-1)!.a.createdAt.toISOString() : null,
    };
  }

  /* --------------------------------------------------------------- landing */

  async landing() {
    const sample = await this.db.execute<{ setup: string; punchline: string; background: "red" | "navy" | "yellow" | "green" | "denim"; writer: string }>(sql`
      select j.setup, j.punchline, j.background::text as background, coalesce(u.name, u.handle, '') as writer
      from jokes j join users u on u.id = j.creator_id
      left join lateral (select count(*) as n from reactions r where r.joke_id = j.id) r on true
      where j.kind = 'text' and j.status = 'delivered' and j.removed_at is null and j.hidden_at is null
        and j.region is null and j.deliver_on < current_date
      order by (j.deliver_on > current_date - 30) desc, r.n desc, j.deliver_on desc
      limit 1`);
    const [stats] = (
      await this.db.execute<{ readers: number; writers: number; jokes: number; reactions: number }>(sql`
        select
          (select count(distinct user_id) from user_roles where role = 'reader')::int as readers,
          (select count(distinct user_id) from user_roles where role = 'writer')::int as writers,
          (select count(*) from jokes where status = 'delivered' and removed_at is null)::int as jokes,
          (select count(*) from reactions)::int as reactions`)
    ).rows;
    const writers = await this.db.execute<{ name: string | null; handle: string; tone: "red" | "navy" | "yellow" | "green" | "denim"; subs: number }>(sql`
      select u.name, u.handle, u.tone::text as tone, (select count(*)::int from subscriptions s where s.creator_id = u.id) as subs
      from users u join user_roles r on r.user_id = u.id and r.role = 'writer'
      where u.onboarded_at is not null and u.handle is not null and u.suspended_at is null
      order by subs desc, u.created_at limit 6`);
    return {
      sample: sample.rows[0] ?? null,
      stats: { readers: stats.readers, writers: stats.writers, jokesDelivered: stats.jokes, reactions: stats.reactions },
      writers: writers.rows.map((w) => ({ name: w.name ?? w.handle, handle: w.handle, tone: w.tone, subscribers: w.subs })),
    };
  }
}

type UserRow = {
  id: string;
  name: string | null;
  handle: string | null;
  email: string;
  country: string | null;
  tone: "red" | "navy" | "yellow" | "green" | "denim";
  roles: Role[] | null;
  tags: string[] | null;
  last_open: string | null;
  onboarded_at: string | null;
  suspended_at: string | null;
  created_at: string;
};

const USER_COLUMNS = sql.raw(`u.id, u.name, u.handle, u.email, u.country, u.tone::text as tone, u.onboarded_at, u.suspended_at, u.created_at,
  (select array_agg(role::text order by role) from user_roles where user_id = u.id) as roles,
  (select array_agg(tag order by tag) from user_tags where user_id = u.id) as tags,
  (select max(opened_at) from deliveries where user_id = u.id) as last_open`);

/** Whitelisted sort columns for the people list; ties break on id so pages never overlap. */
const USER_SORT: Record<string, string> = {
  name: "lower(coalesce(u.name, u.handle, u.email))",
  createdAt: "u.created_at",
  lastOpenAt: "last_open",
};

function userOrder(sort: string | undefined) {
  const key = sort?.replace(/^-/, "") ?? "createdAt";
  const desc = sort ? sort.startsWith("-") : true;
  const column = USER_SORT[key] ?? USER_SORT.createdAt;
  return sql.raw(`${column} ${desc ? "desc" : "asc"} nulls last, u.id`);
}

function toUserRow(r: UserRow, streak: number) {
  return {
    id: r.id,
    name: r.name ?? r.handle ?? r.email,
    handle: r.handle,
    email: r.email,
    country: r.country,
    tone: r.tone,
    roles: r.roles ?? [],
    tags: r.tags ?? [],
    streak,
    lastOpenAt: r.last_open ? new Date(r.last_open).toISOString() : null,
    onboarded: Boolean(r.onboarded_at),
    suspended: Boolean(r.suspended_at),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

