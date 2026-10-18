import { Injectable } from "@nestjs/common";
import { EventsService } from "../platform/events.service";
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { InjectDb } from "../db/db.module";
import { NotificationsService } from "../notifications/notifications.service";
import type { Db, Tx } from "../db/db.module";
import { subscriptions, userRoles, users } from "../db/schema";
import type { Creator, ListCreatorsQuery } from "./schemas";

/**
 * Opaque cursors so the paging strategy can change without breaking clients.
 * Today it is an offset; popular sorting would need a keyset on a counter column first.
 */
const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const { o } = JSON.parse(Buffer.from(cursor, "base64url").toString()) as { o: unknown };
    if (typeof o === "number" && Number.isInteger(o) && o >= 0) return o;
  } catch {
    // fall through
  }
  throw new AppError(400, "invalid_cursor", "That page link is no longer valid.");
}

@Injectable()
export class CreatorsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
  ) {}

  /** Writers who finished onboarding, with counts relative to the viewer. */
  private select(viewerId: string, where: SQL | undefined, tx: Tx = this.db) {
    const subscriberCount = sql<number>`(select count(*)::int from ${subscriptions} s where s.creator_id = ${users.id})`;
    const isSubscribed = sql<boolean>`exists (select 1 from ${subscriptions} s where s.creator_id = ${users.id} and s.subscriber_id = ${viewerId})`;
    return {
      subscriberCount,
      query: tx
        .select({
          id: users.id,
          name: users.name,
          handle: users.handle,
          country: users.country,
          bio: users.bio,
          tone: users.tone,
          subscriberCount,
          isSubscribed,
        })
        .from(users)
        .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, "writer")))
        .where(and(isNotNull(users.onboardedAt), isNotNull(users.handle), where)),
    };
  }

  async list(viewerId: string, q: ListCreatorsQuery) {
    const offset = decodeCursor(q.cursor);
    const { query, subscriberCount } = this.select(
      viewerId,
      and(ne(users.id, viewerId), q.country ? eq(users.country, q.country) : undefined),
    );
    const order =
      q.sort === "popular"
        ? [desc(subscriberCount), asc(users.createdAt), asc(users.id)]
        : [desc(users.createdAt), asc(users.id)];
    const rows = await query
      .orderBy(...order)
      .limit(q.limit + 1)
      .offset(offset);
    const hasMore = rows.length > q.limit;
    return {
      data: rows.slice(0, q.limit).map(toCreator),
      nextCursor: hasMore ? encodeCursor(offset + q.limit) : null,
    };
  }

  async getByHandle(viewerId: string, handle: string): Promise<Creator> {
    const [row] = await this.select(viewerId, eq(users.handle, handle.toLowerCase())).query.limit(1);
    if (!row) throw notFound("Writer");
    return toCreator(row);
  }

  async listSubscriptions(userId: string) {
    const { query } = this.select(
      userId,
      inArray(users.id, this.db.select({ id: subscriptions.creatorId }).from(subscriptions).where(eq(subscriptions.subscriberId, userId))),
    );
    return { data: (await query.orderBy(asc(users.name))).map(toCreator) };
  }

  async subscribe(userId: string, creatorId: string) {
    await this.subscribeMany(userId, [creatorId], this.db, { strict: true });
  }

  /**
   * Subscribes to several writers. Unknown ids and the person themself are
   * skipped, unless `strict` is set (single subscribe), where they are errors.
   */
  async subscribeMany(userId: string, creatorIds: string[], tx: Tx = this.db, opts = { strict: false }) {
    const ids = [...new Set(creatorIds)];
    if (opts.strict && ids.includes(userId)) {
      throw new AppError(422, "cannot_subscribe_self", "You can't subscribe to yourself.");
    }
    const valid = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, "writer")))
      .where(and(inArray(users.id, ids), ne(users.id, userId)));
    if (opts.strict && !valid.length) throw notFound("Writer");
    if (!valid.length) return;
    const added = await tx
      .insert(subscriptions)
      .values(valid.map((v) => ({ subscriberId: userId, creatorId: v.id })))
      .onConflictDoNothing()
      .returning({ creatorId: subscriptions.creatorId });
    // Once per subscriber, even if they unsubscribe and come back.
    for (const a of added) {
      await this.events.emit({ type: "subscription.created", userId, payload: { creatorId: a.creatorId } }, tx);
      await this.notifications.notify(
        { userId: a.creatorId, type: "new_subscriber", actorId: userId, dedupeKey: `subscriber:${userId}` },
        tx,
      );
    }
  }

  async unsubscribe(userId: string, creatorId: string) {
    await this.db
      .delete(subscriptions)
      .where(and(eq(subscriptions.subscriberId, userId), eq(subscriptions.creatorId, creatorId)));
  }
}

function toCreator(r: {
  id: string;
  name: string | null;
  handle: string | null;
  country: string | null;
  bio: string;
  tone: Creator["tone"];
  subscriberCount: number;
  isSubscribed: boolean;
}): Creator {
  return { ...r, name: r.name ?? r.handle ?? "", handle: r.handle ?? "" };
}
