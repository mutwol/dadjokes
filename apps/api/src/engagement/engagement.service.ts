import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { decodeCursor, encodeCursor, isTimeCursor } from "../common/cursor";
import { addDays } from "../common/dates";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { comments, jokeEvents, jokes, jokeStatsDaily, reactions, reports, userRoles, users } from "../db/schema";
import { DeliveriesService, zeroReactions } from "../deliveries/deliveries.service";
import type { ReactionKind } from "../deliveries/schemas";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../platform/audit.service";
import { EventsService } from "../platform/events.service";
import { RulesService } from "../rules/rules.service";
import { LiveService } from "./live.service";
import type {
  CommentOut,
  CommentsQuery,
  CreateReportRequest,
  EventsRequest,
  JokeStats,
  ResolveReportsRequest,
} from "./schemas";

@Injectable()
export class EngagementService implements OnModuleInit {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly deliveries: DeliveriesService,
    private readonly live: LiveService,
    private readonly notifications: NotificationsService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  /** Reactions and comments become part of every joke's stats. */
  onModuleInit() {
    this.deliveries.addStatsLoader(async (ids, viewerId) => {
      const [counts, mine, commentCounts] = await Promise.all([
        this.db
          .select({ jokeId: reactions.jokeId, kind: reactions.kind, n: sql<number>`count(*)::int` })
          .from(reactions)
          .where(inArray(reactions.jokeId, ids))
          .groupBy(reactions.jokeId, reactions.kind),
        this.db
          .select({ jokeId: reactions.jokeId, kind: reactions.kind })
          .from(reactions)
          .where(and(inArray(reactions.jokeId, ids), eq(reactions.userId, viewerId))),
        this.db
          .select({ jokeId: comments.jokeId, n: sql<number>`count(*)::int` })
          .from(comments)
          .where(and(inArray(comments.jokeId, ids), isNull(comments.deletedAt)))
          .groupBy(comments.jokeId),
      ]);
      return new Map(
        ids.map((id) => {
          const r = zeroReactions();
          for (const c of counts) if (c.jokeId === id) r[c.kind] = c.n;
          return [
            id,
            {
              stats: { views: 0, reactions: r, comments: commentCounts.find((c) => c.jokeId === id)?.n ?? 0 },
              myReaction: mine.find((m) => m.jokeId === id)?.kind ?? null,
            },
          ];
        }),
      );
    });
  }

  async stats(viewerId: string, jokeId: string): Promise<JokeStats> {
    const s = (await this.deliveries.statsFor([jokeId], viewerId)).get(jokeId)!;
    return { ...s.stats, myReaction: s.myReaction };
  }

  async react(viewerId: string, jokeId: string, kind: ReactionKind): Promise<JokeStats> {
    const { isMine } = await this.deliveries.access(viewerId, jokeId);
    if (isMine) throw new AppError(422, "cannot_react_own", "You can't react to your own joke.");
    await this.db
      .insert(reactions)
      .values({ userId: viewerId, jokeId, kind })
      .onConflictDoUpdate({ target: [reactions.userId, reactions.jokeId], set: { kind } });
    this.live.changed(jokeId);
    return this.stats(viewerId, jokeId);
  }

  async unreact(viewerId: string, jokeId: string): Promise<JokeStats> {
    await this.deliveries.access(viewerId, jokeId);
    await this.db.delete(reactions).where(and(eq(reactions.userId, viewerId), eq(reactions.jokeId, jokeId)));
    this.live.changed(jokeId);
    return this.stats(viewerId, jokeId);
  }

  async listComments(viewerId: string, jokeId: string, q: CommentsQuery) {
    const { staff, admin } = await this.deliveries.access(viewerId, jokeId);
    const after = decodeCursor(q.cursor, isTimeCursor);
    const rows = await this.db
      .select({ c: comments, name: users.name, handle: users.handle, tone: users.tone })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .where(
        and(
          eq(comments.jokeId, jokeId),
          isNull(comments.deletedAt),
          staff ? undefined : or(isNull(comments.hiddenAt), eq(comments.userId, viewerId)),
          after
            ? or(
                lt(comments.createdAt, new Date(after.t)),
                and(eq(comments.createdAt, new Date(after.t)), lt(comments.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      data: page.map((r) => toComment(r, viewerId, { staff, admin })),
      nextCursor: rows.length > q.limit && last ? encodeCursor({ t: last.c.createdAt.toISOString(), id: last.c.id }) : null,
    };
  }

  async addComment(viewerId: string, jokeId: string, body: string): Promise<CommentOut> {
    const { joke } = await this.deliveries.access(viewerId, jokeId);
    const [c] = await this.db.insert(comments).values({ jokeId, userId: viewerId, body }).returning();
    const [me] = await this.db
      .select({ name: users.name, handle: users.handle, tone: users.tone })
      .from(users)
      .where(eq(users.id, viewerId));
    this.live.changed(jokeId);
    if (joke.creatorId !== viewerId) {
      await this.notifications.notify({
        userId: joke.creatorId,
        type: "comment",
        actorId: viewerId,
        jokeId,
        data: { excerpt: body.length > 100 ? `${body.slice(0, 99)}…` : body },
      });
    }
    return toComment({ c, ...me }, viewerId, { staff: false, admin: false });
  }

  /** Authors can delete their own comments; curators any. Repeating is fine. */
  async deleteComment(viewerId: string, commentId: string) {
    const [row] = await this.db
      .select({
        c: comments,
        admin: sql<boolean>`exists (select 1 from ${userRoles} r where r.user_id = ${viewerId} and r.role = 'admin')`,
      })
      .from(comments)
      .where(eq(comments.id, commentId));
    if (!row || (row.c.userId !== viewerId && !row.admin)) throw notFound("Comment");
    if (row.c.deletedAt) return;
    await this.db.update(comments).set({ deletedAt: new Date(), deletedBy: viewerId }).where(eq(comments.id, commentId));
    this.live.changed(row.c.jokeId);
  }

  /**
   * Curators (and admins) can hide a comment from readers, or show it again.
   * Its reports stay open: taking it down or dismissing them is for admins.
   */
  async setCommentHidden(staffId: string, commentId: string, hidden: boolean) {
    const [c] = await this.db.select().from(comments).where(eq(comments.id, commentId));
    if (!c || c.deletedAt) throw notFound("Comment");
    if (Boolean(c.hiddenAt) === hidden) return;
    await this.db.transaction(async (tx) => {
      await tx.update(comments).set({ hiddenAt: hidden ? new Date() : null }).where(eq(comments.id, commentId));
      await this.audit.record(
        { actorId: staffId, action: hidden ? "comment.hidden" : "comment.unhidden", targetType: "comment", targetId: commentId, data: { jokeId: c.jokeId } },
        tx,
      );
    });
    this.live.changed(c.jokeId);
  }

  /**
   * Files a report. Reporting the same thing twice is fine and changes nothing.
   * After a new report, the moderation.auto_hide rule set decides whether to
   * hide the joke or comment from readers until a curator looks at it.
   */
  async report(viewerId: string, req: CreateReportRequest) {
    let jokeId = req.jokeId;
    if (req.commentId) {
      const [c] = await this.db.select({ jokeId: comments.jokeId }).from(comments).where(eq(comments.id, req.commentId));
      if (!c) throw notFound("Comment");
      jokeId = c.jokeId;
    }
    await this.deliveries.access(viewerId, jokeId!);
    const [created] = await this.db
      .insert(reports)
      .values({
        reporterId: viewerId,
        jokeId: req.commentId ? null : jokeId,
        commentId: req.commentId ?? null,
        reason: req.reason,
        note: req.note || null,
      })
      .onConflictDoNothing()
      .returning({ id: reports.id });
    if (!created) return { alreadyReported: true, hidden: await this.isHidden(req) };
    const hidden = await this.decideAutoHide(req, jokeId!);
    return { alreadyReported: false, hidden };
  }

  private async isHidden(req: { jokeId?: string; commentId?: string }) {
    if (req.commentId) {
      const [c] = await this.db.select({ h: comments.hiddenAt }).from(comments).where(eq(comments.id, req.commentId));
      return Boolean(c?.h);
    }
    const [j] = await this.db.select({ h: jokes.hiddenAt }).from(jokes).where(eq(jokes.id, req.jokeId!));
    return Boolean(j?.h);
  }

  /** Builds the facts about the reported thing, asks the rule set, and hides it if told to. */
  private async decideAutoHide(req: CreateReportRequest, jokeId: string): Promise<boolean> {
    const target = req.commentId ? "comment" : "joke";
    const targetFilter = req.commentId ? sql`r.comment_id = ${req.commentId}` : sql`r.joke_id = ${jokeId}`;
    const { rows } = await this.db.execute<{ reason: string; n: number; reporters: number }>(sql`
      select r.reason, count(*)::int as n, count(distinct r.reporter_id)::int as reporters
      from ${reports} r where r.resolved_at is null and ${targetFilter}
      group by r.reason
    `);
    const reasons: Record<string, number> = { copied: 0, offensive: 0, spam: 0, other: 0 };
    for (const r of rows) reasons[r.reason] = r.n;
    const total = rows.reduce((n, r) => n + r.n, 0);
    const [{ distinct }] = (
      await this.db.execute<{ distinct: number }>(sql`
        select count(distinct r.reporter_id)::int as distinct from ${reports} r where r.resolved_at is null and ${targetFilter}`)
    ).rows;

    const author = req.commentId
      ? (await this.db.select({ id: comments.userId, at: comments.createdAt, hidden: comments.hiddenAt }).from(comments).where(eq(comments.id, req.commentId)))[0]
      : (await this.db.select({ id: jokes.creatorId, at: jokes.reviewedAt, hidden: jokes.hiddenAt }).from(jokes).where(eq(jokes.id, jokeId)))[0];
    if (!author) return false;
    const [{ removed }] = (
      await this.db.execute<{ removed: number }>(sql`
        select (
          (select count(*) from ${jokes} where creator_id = ${author.id} and removed_at > now() - interval '90 days') +
          (select count(*) from ${comments} where user_id = ${author.id} and deleted_by is not null and deleted_by <> user_id and deleted_at > now() - interval '90 days')
        )::int as removed`)
    ).rows;

    const facts = {
      target,
      reports: total,
      distinctReporters: distinct,
      reasons,
      authorRemovedLast90d: removed,
      ageHours: author.at ? Math.floor((Date.now() - author.at.getTime()) / 3_600_000) : 0,
    };
    const decision = await this.rules.evaluateLive("moderation.auto_hide", facts);
    // If the rule set is missing or archived, fall back to "three different people".
    const hide = decision ? decision.outputs.hide === true : distinct >= 3;
    const notifyStaff = decision ? decision.outputs.notifyStaff === true : hide;

    let hiddenNow = false;
    if (hide && !author.hidden) {
      const now = new Date();
      hiddenNow = await this.db.transaction(async (tx) => {
        const changed = req.commentId
          ? await tx.update(comments).set({ hiddenAt: now }).where(and(eq(comments.id, req.commentId), isNull(comments.hiddenAt))).returning({ id: comments.id })
          : await tx.update(jokes).set({ hiddenAt: now }).where(and(eq(jokes.id, jokeId), isNull(jokes.hiddenAt))).returning({ id: jokes.id });
        if (!changed.length) return false;
        await this.audit.record(
          {
            actorId: null,
            action: "content.auto_hidden",
            targetType: target,
            targetId: req.commentId ?? jokeId,
            data: { facts, ruleSetVersion: decision?.version ?? null, matched: decision?.matched ?? [] },
          },
          tx,
        );
        return true;
      });
      if (hiddenNow) this.live.changed(jokeId);
    }

    if (hiddenNow && notifyStaff) await this.alertStaff(target, jokeId);
    await this.events.emit({
      type: "report.created",
      userId: author.id,
      payload: { target, jokeId, commentId: req.commentId ?? null, reason: req.reason, reports: total, hidden: hide || Boolean(author.hidden) },
    });
    return hide || Boolean(author.hidden);
  }

  private async alertStaff(target: "joke" | "comment", jokeId: string) {
    const staff = await this.db
      .selectDistinct({ id: userRoles.userId })
      .from(userRoles)
      .where(inArray(userRoles.role, ["curator", "admin"]));
    for (const s of staff) {
      await this.notifications.notify({
        userId: s.id,
        type: "automation",
        jokeId,
        data: {
          title: `A reported ${target} was hidden`,
          body: "Enough people reported it that it's hidden until someone reviews it.",
          url: "/curate?tab=reports",
        },
        dedupeKey: `hidden:${target}:${jokeId}:${new Date().toISOString().slice(0, 13)}`,
      });
    }
  }

  /** Records replays and shares, dropping any for jokes the viewer can't see. */
  async recordEvents(viewerId: string, req: EventsRequest, now = new Date()) {
    const ids = [...new Set(req.events.map((e) => e.jokeId))];
    const visible = new Set<string>();
    for (const id of ids) {
      try {
        await this.deliveries.access(viewerId, id);
        visible.add(id);
      } catch {
        // Not visible to this viewer: ignore it.
      }
    }
    const oldest = now.getTime() - 24 * 3_600_000;
    const rows = req.events
      .filter((e) => visible.has(e.jokeId))
      .map((e) => {
        const t = e.at ? Date.parse(e.at) : now.getTime();
        return { jokeId: e.jokeId, userId: viewerId, type: e.type, occurredAt: new Date(Math.min(now.getTime(), Math.max(oldest, t))) };
      });
    if (rows.length) await this.db.insert(jokeEvents).values(rows);
    return rows.length;
  }

  /**
   * Rebuilds per-day totals (UTC days) for recent days from the source tables.
   * Recomputing rather than incrementing makes it safe to run any number of times.
   */
  async rollup(now = new Date(), days = 2) {
    const fromDay = addDays(now.toISOString().slice(0, 10), -days);
    const from = sql`${fromDay}::date`;
    await this.db.execute(sql`
      insert into ${jokeStatsDaily} (joke_id, day, opens, replays, shares, reactions, comments)
      select joke_id, day, sum(opens), sum(replays), sum(shares), sum(reactions), sum(comments)
      from (
        select joke_id, (opened_at at time zone 'UTC')::date as day, count(*) as opens, 0 as replays, 0 as shares, 0 as reactions, 0 as comments
          from deliveries where opened_at >= ${from} group by 1, 2
        union all
        select joke_id, (occurred_at at time zone 'UTC')::date, 0, count(*) filter (where type = 'replay'), count(*) filter (where type = 'share'), 0, 0
          from joke_events where occurred_at >= ${from} group by 1, 2
        union all
        select joke_id, (created_at at time zone 'UTC')::date, 0, 0, 0, count(*), 0
          from reactions where created_at >= ${from} group by 1, 2
        union all
        select joke_id, (created_at at time zone 'UTC')::date, 0, 0, 0, 0, count(*)
          from comments where created_at >= ${from} and deleted_at is null group by 1, 2
      ) x
      group by joke_id, day
      on conflict (joke_id, day) do update set
        opens = excluded.opens, replays = excluded.replays, shares = excluded.shares,
        reactions = excluded.reactions, comments = excluded.comments
    `);
  }

  /** The last 14 UTC days for a writer's jokes, oldest first, for Studio's chart. */
  async writerDaily(creatorId: string, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    const from = addDays(today, -13);
    const rows = await this.db
      .select({
        day: jokeStatsDaily.day,
        opens: sql<number>`sum(${jokeStatsDaily.opens})::int`,
        reactions: sql<number>`sum(${jokeStatsDaily.reactions})::int`,
        comments: sql<number>`sum(${jokeStatsDaily.comments})::int`,
      })
      .from(jokeStatsDaily)
      .innerJoin(jokes, eq(jokes.id, jokeStatsDaily.jokeId))
      .where(and(eq(jokes.creatorId, creatorId), sql`${jokeStatsDaily.day} >= ${from}`))
      .groupBy(jokeStatsDaily.day);
    return Array.from({ length: 14 }, (_, i) => {
      const date = addDays(from, i);
      const r = rows.find((x) => x.day === date);
      return { date, opens: r?.opens ?? 0, reactions: r?.reactions ?? 0, comments: r?.comments ?? 0 };
    });
  }

  /**
   * Reports, one entry per reported joke or comment. Open ones come most
   * reported first; resolved ones (the last 30 days) newest first.
   */
  async listReports(status: "open" | "resolved" = "open") {
    const open = status === "open";
    const rows = await this.db.execute<{
      joke_id: string;
      comment_id: string | null;
      preview: string;
      author_handle: string;
      reports: number;
      reasons: Record<string, number>;
      notes: string[];
      first_reported_at: string;
      hidden: boolean;
      resolution: string | null;
      resolved_at: string | null;
      resolved_by: string | null;
    }>(sql`
      with picked as (
        select r.*, coalesce(r.joke_id, c.joke_id) as target_joke
        from ${reports} r left join ${comments} c on c.id = r.comment_id
        where ${open ? sql`r.resolved_at is null` : sql`r.resolved_at > now() - interval '30 days'`}
      ), grouped as (
        select target_joke, comment_id, count(*)::int as reports, min(created_at) as first_reported_at,
               coalesce(array_agg(note) filter (where note is not null), '{}') as notes,
               max(resolved_at) as resolved_at,
               (array_agg(resolution order by resolved_at desc nulls last))[1]::text as resolution,
               (array_agg(resolved_by order by resolved_at desc nulls last))[1] as resolved_by_id
        from picked group by target_joke, comment_id
      ), reasons as (
        select target_joke, comment_id, jsonb_object_agg(reason, n) as reasons
        from (select target_joke, comment_id, reason, count(*)::int as n from picked group by 1, 2, 3) x
        group by 1, 2
      )
      select g.target_joke as joke_id, g.comment_id,
             coalesce(c.body, j.setup || ' ' || coalesce(j.punchline, ''), j.caption, j.image_alt, '') as preview,
             coalesce(cu.handle, ju.handle, '') as author_handle,
             g.reports, rs.reasons, g.notes, g.first_reported_at,
             (case when g.comment_id is null then j.hidden_at is not null else c.hidden_at is not null end) as hidden,
             g.resolution, g.resolved_at, rb.handle as resolved_by
      from grouped g
      join reasons rs on rs.target_joke = g.target_joke and rs.comment_id is not distinct from g.comment_id
      join ${jokes} j on j.id = g.target_joke
      join ${users} ju on ju.id = j.creator_id
      left join ${comments} c on c.id = g.comment_id
      left join ${users} cu on cu.id = c.user_id
      left join ${users} rb on rb.id = g.resolved_by_id
      order by ${open ? sql`hidden desc, g.reports desc, g.first_reported_at asc` : sql`g.resolved_at desc`}
      limit 100
    `);
    return {
      data: rows.rows.map((r) => ({
        target: r.comment_id ? ("comment" as const) : ("joke" as const),
        jokeId: r.joke_id,
        commentId: r.comment_id,
        preview: r.preview,
        authorHandle: r.author_handle,
        reports: r.reports,
        reasons: r.reasons,
        notes: r.notes,
        firstReportedAt: new Date(r.first_reported_at).toISOString(),
        hidden: r.hidden,
        resolution: (r.resolution as "dismissed" | "removed" | null) ?? null,
        resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
        resolvedBy: r.resolved_by,
      })),
    };
  }

  /** Kept for callers of the old name. */
  openReports() {
    return this.listReports("open");
  }

  /**
   * Closes every open report about one joke or comment. "remove" takes it down;
   * "dismiss" leaves it up and un-hides it if it was hidden automatically.
   * Reporters hear the outcome, and the decision goes in the audit log.
   */
  async resolve(curatorId: string, req: ResolveReportsRequest) {
    const now = new Date();
    const remove = req.action === "remove";
    let jokeIdForLive: string | null = null;
    await this.db.transaction(async (tx) => {
      if (req.commentId) {
        const [c] = await tx.select({ jokeId: comments.jokeId }).from(comments).where(eq(comments.id, req.commentId));
        if (!c) throw notFound("Comment");
        jokeIdForLive = c.jokeId;
        if (remove) {
          await tx
            .update(comments)
            .set({ deletedAt: now, deletedBy: curatorId })
            .where(and(eq(comments.id, req.commentId), isNull(comments.deletedAt)));
        } else {
          await tx.update(comments).set({ hiddenAt: null }).where(eq(comments.id, req.commentId));
        }
      } else {
        const [j] = await tx.select().from(jokes).where(eq(jokes.id, req.jokeId!));
        if (!j) throw notFound("Joke");
        jokeIdForLive = j.id;
        if (remove) {
          const taken = await tx
            .update(jokes)
            .set({ removedAt: now, removedBy: curatorId })
            .where(and(eq(jokes.id, req.jokeId!), isNull(jokes.removedAt)))
            .returning({ id: jokes.id });
          if (taken.length) {
            await this.notifications.notify(
              { userId: j.creatorId, type: "joke_removed", jokeId: j.id, data: { setup: j.setup ?? j.caption } },
              tx,
            );
          }
          this.logger.log(`Joke ${req.jokeId} taken down by ${curatorId}`);
        } else {
          await tx.update(jokes).set({ hiddenAt: null }).where(eq(jokes.id, req.jokeId!));
        }
      }
      const closed = await tx
        .update(reports)
        .set({ resolvedAt: now, resolvedBy: curatorId, resolution: remove ? "removed" : "dismissed" })
        .where(
          and(
            isNull(reports.resolvedAt),
            req.commentId ? eq(reports.commentId, req.commentId) : eq(reports.jokeId, req.jokeId!),
          ),
        )
        .returning({ id: reports.id, reporterId: reports.reporterId });
      await this.audit.record(
        {
          actorId: curatorId,
          action: remove ? "report.removed" : "report.dismissed",
          targetType: req.commentId ? "comment" : "joke",
          targetId: req.commentId ?? req.jokeId!,
          data: { reports: closed.length, note: req.note ?? null },
        },
        tx,
      );
      for (const r of closed) {
        await this.notifications.notify(
          {
            userId: r.reporterId,
            type: "report_resolved",
            jokeId: jokeIdForLive,
            data: { target: req.commentId ? "comment" : "joke", action: remove ? "removed" : "dismissed" },
            dedupeKey: `report:${r.id}`,
          },
          tx,
        );
      }
    });
    if (jokeIdForLive) this.live.changed(jokeIdForLive);
  }
}

function toComment(
  r: { c: typeof comments.$inferSelect; name: string | null; handle: string | null; tone: CommentOut["author"]["tone"] },
  viewerId: string,
  viewer: { staff: boolean; admin: boolean },
): CommentOut {
  return {
    id: r.c.id,
    body: r.c.body,
    createdAt: r.c.createdAt.toISOString(),
    author: { id: r.c.userId, name: r.name ?? r.handle ?? "", handle: r.handle ?? "", tone: r.tone },
    isMine: r.c.userId === viewerId,
    canDelete: r.c.userId === viewerId || viewer.admin,
    canHide: viewer.staff,
    hidden: r.c.hiddenAt !== null,
  };
}
