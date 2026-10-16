import { Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { addDays, latestDateNow, localDate, localHour, zonedInstant } from "../common/dates";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { deliveries, jokes, subscriptions, tips, userPreferences, userRoles, users } from "../db/schema";
import type { Delivery } from "../db/schema";
import { JokesService } from "../jokes/jokes.service";
import { NotificationsService } from "../notifications/notifications.service";
import { StorageService } from "../storage/storage.service";
import type { DeliveryCard, ReaderJoke, ReactionKind, Today } from "./schemas";

/** How long a delivered joke can still be opened. */
export const OPEN_WINDOW_HOURS = 24;
/** Readers handled per delivery statement, so one run never holds a huge transaction. */
const BATCH = 5000;

export interface DeliveredRow {
  userId: string;
  jokeId: string;
}

/** Counts for a joke. Reactions and comments are filled in by the engagement module. */
export type JokeStatsLoader = (jokeIds: string[], viewerId: string) => Promise<Map<string, Pick<ReaderJoke, "stats" | "myReaction">>>;

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);
  private statsLoaders: JokeStatsLoader[] = [];

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly jokes: JokesService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Lets other modules add to a joke's stats (reactions, comments) without a circular import. */
  addStatsLoader(loader: JokeStatsLoader) {
    this.statsLoaders.push(loader);
  }

  /**
   * Delivers today's joke to every reader whose local delivery hour has come and
   * who hasn't had today's joke yet. Safe to run at any time and any number of
   * times: the (reader, local date) key makes each delivery happen once.
   * Readers who chose local jokes get their country's joke when there is one.
   */
  async deliverDue(now = new Date(), onlyUserId?: string): Promise<DeliveredRow[]> {
    const at = sql`${now.toISOString()}::timestamptz`;
    const all: DeliveredRow[] = [];
    for (;;) {
      const { rows } = await this.db.execute<{ user_id: string; joke_id: string }>(sql`
        with candidates as (
          select u.id as user_id, u.country, p.joke_origin,
                 (${at} at time zone u.timezone)::date as local_date
          from ${users} u
          join ${userRoles} r on r.user_id = u.id and r.role = 'reader'
          join ${userPreferences} p on p.user_id = u.id
          where u.onboarded_at is not null
            ${onlyUserId ? sql`and u.id = ${onlyUserId}` : sql``}
            and extract(hour from (${at} at time zone u.timezone)) >= p.delivery_hour
            and not exists (
              select 1 from ${deliveries} d
              where d.user_id = u.id and d.local_date = (${at} at time zone u.timezone)::date
            )
        ), picked as (
          select c.user_id, c.local_date, coalesce(
            case when c.joke_origin = 'local' then (
              select j.id from ${jokes} j
              where j.deliver_on = c.local_date and j.region = c.country and j.status in ('scheduled', 'delivered') and j.removed_at is null
            ) end,
            (
              select j.id from ${jokes} j
              where j.deliver_on = c.local_date and j.region is null and j.status in ('scheduled', 'delivered') and j.removed_at is null
            )
          ) as joke_id
          from candidates c
        ), batch as (
          -- Readers with no joke for their day are left out, so a full batch always means more to do.
          select * from picked where joke_id is not null limit ${BATCH}
        )
        insert into ${deliveries} (user_id, local_date, joke_id, delivered_at, expires_at)
        select user_id, local_date, joke_id, ${at}, ${at} + make_interval(hours => ${OPEN_WINDOW_HOURS})
        from batch
        on conflict do nothing
        returning user_id, joke_id
      `);
      all.push(...rows.map((r) => ({ userId: r.user_id, jokeId: r.joke_id })));
      if (rows.length < BATCH || onlyUserId) break;
    }
    return all;
  }

  /** Marks scheduled jokes as delivered once their day has started somewhere. */
  async markStartedDays(now = new Date()) {
    const started = await this.db
      .update(jokes)
      .set({ status: "delivered" })
      .where(and(eq(jokes.status, "scheduled"), lte(jokes.deliverOn, latestDateNow(now))))
      .returning({ id: jokes.id, creatorId: jokes.creatorId });
    for (const j of started) {
      await this.notifications.notify({ userId: j.creatorId, type: "joke_delivered", jokeId: j.id, dedupeKey: `delivered:${j.id}` });
    }
    return started.length;
  }

  /** One run of the background job. */
  async run(now = new Date()) {
    const started = await this.markStartedDays(now);
    const delivered = await this.deliverDue(now);
    await this.pushDelivered(delivered);
    if (started || delivered.length) {
      this.logger.log(`Delivered ${delivered.length} jokes; ${started} jokes went out for the first time`);
    }
    return delivered;
  }

  /** "Today's joke is here" on readers' devices. */
  private async pushDelivered(rows: DeliveredRow[]) {
    if (!rows.length || !this.notifications.pushEnabled) return;
    const names = await this.db
      .select({ id: jokes.id, name: users.name, handle: users.handle })
      .from(jokes)
      .innerJoin(users, eq(users.id, jokes.creatorId))
      .where(inArray(jokes.id, [...new Set(rows.map((r) => r.jokeId))]));
    await this.notifications.sendPushBulk(
      rows.map((r) => {
        const who = names.find((n) => n.id === r.jokeId);
        const first = (who?.name ?? who?.handle ?? "Someone").split(" ")[0];
        return {
          userId: r.userId,
          payload: { title: "Today's joke is here", body: `${first} picked it for you. Open it within a day.`, url: "/", tag: "daily-joke" },
        };
      }),
    );
  }

  async today(userId: string, now = new Date()): Promise<Today> {
    // Readers whose hour has come get their joke now rather than at the next job run.
    await this.deliverDue(now, userId);

    const [me] = await this.db
      .select({ timezone: users.timezone, deliveryHour: userPreferences.deliveryHour })
      .from(users)
      .innerJoin(userPreferences, eq(userPreferences.userId, users.id))
      .where(eq(users.id, userId));
    if (!me) throw notFound("Account");
    const today = localDate(now, me.timezone);
    const hourNow = localHour(now, me.timezone);
    const nextDeliveryAt = zonedInstant(hourNow < me.deliveryHour ? today : addDays(today, 1), me.deliveryHour, me.timezone);

    // Monday to Sunday of the reader's current week.
    const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    const monday = addDays(today, -dow);
    const recent = await this.cards(userId, addDays(today, -60), addDays(monday, 6), now);
    const byDate = new Map(recent.map((c) => [c.date, c]));

    const week = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      const card = byDate.get(date);
      if (card) {
        return {
          date,
          state: card.state,
          creator: { name: card.creator.name, tone: card.creator.tone },
          jokeId: card.jokeId,
        };
      }
      const upcoming = date > today || (date === today && hourNow < me.deliveryHour);
      return { date, state: upcoming ? ("upcoming" as const) : ("none" as const), creator: null, jokeId: null };
    });

    const current =
      byDate.get(today) ??
      recent.find((c) => c.date === addDays(today, -1) && c.state === "sealed") ??
      null;

    return {
      date: today,
      timezone: me.timezone,
      deliveryHour: me.deliveryHour,
      nextDeliveryAt: nextDeliveryAt.toISOString(),
      current,
      week,
      streak: streakOf(recent, today),
    };
  }

  /** Opens a delivered joke. Opening again is fine; an expired, unopened one is gone. */
  async open(userId: string, date: string, now = new Date()): Promise<ReaderJoke> {
    const [d] = await this.db
      .select()
      .from(deliveries)
      .where(and(eq(deliveries.userId, userId), eq(deliveries.localDate, date)));
    if (!d) throw notFound("Joke for that day");
    const [{ removedAt }] = await this.db.select({ removedAt: jokes.removedAt }).from(jokes).where(eq(jokes.id, d.jokeId));
    if (removedAt) throw new AppError(410, "joke_removed", "This joke was taken down.");
    if (!d.openedAt) {
      if (d.expiresAt <= now) {
        throw new AppError(410, "joke_expired", "This joke has gone. Unopened jokes disappear after a day.");
      }
      // Only the first open sets the time, even if two requests race.
      await this.db
        .update(deliveries)
        .set({ openedAt: now })
        .where(and(eq(deliveries.userId, userId), eq(deliveries.localDate, date), sql`${deliveries.openedAt} is null`));
    }
    return this.getJoke(userId, d.jokeId, { skipAccessCheck: true });
  }

  /**
   * Who may see a joke: readers once they've opened it, its writer, and
   * curators. Taken-down jokes are hidden from readers. Anything else is a 404,
   * so ids don't reveal what exists.
   */
  async access(viewerId: string, id: string, opts = { skipOpenedCheck: false }) {
    const [row] = await this.db
      .select({
        joke: jokes,
        name: users.name,
        handle: users.handle,
        country: users.country,
        tone: users.tone,
        bio: users.bio,
        subscriberCount: sql<number>`(select count(*)::int from ${subscriptions} s where s.creator_id = ${jokes.creatorId})`,
        isSubscribed: sql<boolean>`exists (select 1 from ${subscriptions} s where s.creator_id = ${jokes.creatorId} and s.subscriber_id = ${viewerId})`,
        opened: sql<boolean>`exists (select 1 from ${deliveries} d where d.joke_id = ${jokes.id} and d.user_id = ${viewerId} and d.opened_at is not null)`,
        staff: sql<boolean>`exists (select 1 from ${userRoles} r where r.user_id = ${viewerId} and r.role in ('curator', 'admin'))`,
      })
      .from(jokes)
      .innerJoin(users, eq(users.id, jokes.creatorId))
      .where(eq(jokes.id, id));
    const isMine = row?.joke.creatorId === viewerId;
    const privileged = isMine || Boolean(row?.staff);
    if (!row || !(privileged || ((opts.skipOpenedCheck || row.opened) && !row.joke.removedAt))) throw notFound("Joke");
    return { ...row, isMine };
  }

  /** A joke as the reader sees it, with stats. */
  async getJoke(viewerId: string, id: string, opts = { skipAccessCheck: false }): Promise<ReaderJoke> {
    const row = await this.access(viewerId, id, { skipOpenedCheck: opts.skipAccessCheck });
    const isMine = row.isMine;
    const [topics, stats] = await Promise.all([this.jokes.topicsFor([id]), this.statsFor([id], viewerId)]);
    const j = row.joke;
    return {
      id: j.id,
      kind: j.kind,
      setup: j.setup,
      punchline: j.punchline,
      imageUrl: j.imageKey ? this.storage.publicUrl(j.imageKey) : null,
      imageAlt: j.imageAlt,
      caption: j.caption,
      background: j.background,
      region: j.region,
      topics: (topics.get(id) ?? []).sort(),
      deliverOn: j.deliverOn,
      creator: {
        id: j.creatorId,
        name: row.name ?? row.handle ?? "",
        handle: row.handle ?? "",
        country: row.country,
        tone: row.tone,
        bio: row.bio,
        subscriberCount: row.subscriberCount,
        isSubscribed: row.isSubscribed,
      },
      ...stats.get(id)!,
      isMine,
    };
  }

  /** Views (readers who opened it) plus whatever the registered loaders add. */
  async statsFor(ids: string[], viewerId: string) {
    const views = await this.db
      .select({ jokeId: deliveries.jokeId, n: sql<number>`count(*)::int` })
      .from(deliveries)
      .where(and(inArray(deliveries.jokeId, ids), isNotNull(deliveries.openedAt)))
      .groupBy(deliveries.jokeId);
    const out = new Map<string, Pick<ReaderJoke, "stats" | "myReaction">>(
      ids.map((id) => [
        id,
        {
          stats: { views: views.find((v) => v.jokeId === id)?.n ?? 0, reactions: zeroReactions(), comments: 0 },
          myReaction: null,
        },
      ]),
    );
    for (const load of this.statsLoaders) {
      for (const [id, extra] of await load(ids, viewerId)) {
        const cur = out.get(id)!;
        out.set(id, {
          stats: { ...extra.stats, views: cur.stats.views },
          myReaction: extra.myReaction,
        });
      }
    }
    return out;
  }

  async studioSummary(creatorId: string) {
    const [counts] = await this.db
      .select({
        sent: sql<number>`count(*) filter (where ${jokes.status} <> 'withdrawn')::int`,
        picked: sql<number>`count(*) filter (where ${jokes.status} in ('scheduled', 'delivered'))::int`,
        inReview: sql<number>`count(*) filter (where ${jokes.status} = 'in_review')::int`,
      })
      .from(jokes)
      .where(eq(jokes.creatorId, creatorId));
    const [reach] = await this.db
      .select({
        reached: sql<number>`count(*)::int`,
        opened: sql<number>`count(${deliveries.openedAt})::int`,
      })
      .from(deliveries)
      .innerJoin(jokes, eq(jokes.id, deliveries.jokeId))
      .where(and(eq(jokes.creatorId, creatorId), ne(deliveries.userId, creatorId)));
    const [paid] = await this.db
      .select({ kes: sql<number>`coalesce(sum(${tips.amountKes}), 0)::int` })
      .from(tips)
      .where(and(eq(tips.creatorId, creatorId), eq(tips.status, "paid")));
    return { ...counts, ...reach, tipsKes: paid.kes };
  }

  private async cards(userId: string, from: string, to: string, now: Date): Promise<DeliveryCard[]> {
    const rows = await this.db
      .select({ d: deliveries, kind: jokes.kind, background: jokes.background, name: users.name, handle: users.handle, tone: users.tone })
      .from(deliveries)
      .innerJoin(jokes, eq(jokes.id, deliveries.jokeId))
      .innerJoin(users, eq(users.id, jokes.creatorId))
      .where(
        and(
          eq(deliveries.userId, userId),
          gte(deliveries.localDate, from),
          lte(deliveries.localDate, to),
          isNull(jokes.removedAt),
        ),
      )
      .orderBy(desc(deliveries.localDate));
    return rows.map((r) => toCard(r.d, r, now));
  }
}

function toCard(
  d: Delivery,
  j: { kind: "text" | "image"; background: DeliveryCard["background"]; name: string | null; handle: string | null; tone: DeliveryCard["background"] },
  now: Date,
): DeliveryCard {
  const state = d.openedAt ? "opened" : d.expiresAt > now ? "sealed" : "missed";
  return {
    date: d.localDate,
    state,
    deliveredAt: d.deliveredAt.toISOString(),
    expiresAt: d.expiresAt.toISOString(),
    kind: j.kind,
    background: j.background,
    creator: { name: j.name ?? j.handle ?? "", handle: j.handle ?? "", tone: j.tone },
    jokeId: state === "opened" ? d.jokeId : null,
  };
}

/**
 * Consecutive opened days, newest first. A joke that can still be opened
 * doesn't break the streak; days with no joke delivered are skipped.
 */
function streakOf(cards: DeliveryCard[], today: string): number {
  let streak = 0;
  for (const c of cards) {
    if (c.date > today) continue;
    if (c.state === "opened") streak++;
    else if (c.state === "sealed") continue;
    else break;
  }
  return streak;
}

export function zeroReactions(): Record<ReactionKind, number> {
  return { laugh: 0, groan: 0, facepalm: 0, drum: 0 };
}
