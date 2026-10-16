import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { and, desc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { decodeCursor, encodeCursor, isTimeCursor } from "../common/cursor";
import { AppConfig } from "../config/config.module";
import { InjectDb } from "../db/db.module";
import type { Db, Tx } from "../db/db.module";
import { notifications, pushSubscriptions, users } from "../db/schema";
import type { NotificationType } from "../db/schema";
import { describe } from "./copy";
import type { Activity, ActivityQuery, PushSubscriptionRequest } from "./schemas";

export const PUSH_QUEUE = "push";

export interface PushPayload {
  title: string;
  body?: string | null;
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
}

export interface PushJob {
  userId: string;
  payload: PushPayload;
}

/** What happened, who did it and to which joke. Push is sent when the person has a device subscribed. */
export interface NotifyInput {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  jokeId?: string | null;
  data?: Record<string, unknown>;
  /** Same key for the same user means it's only ever recorded once. */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectQueue(PUSH_QUEUE) private readonly push: Queue<PushJob>,
    private readonly config: AppConfig,
  ) {}

  get pushEnabled() {
    return Boolean(this.config.get("VAPID_PUBLIC_KEY"));
  }

  /** Records an Activity item and pushes it to the person's devices. */
  async notify(n: NotifyInput, tx: Tx = this.db) {
    const [row] = await tx
      .insert(notifications)
      .values({
        userId: n.userId,
        type: n.type,
        actorId: n.actorId ?? null,
        jokeId: n.jokeId ?? null,
        data: n.data ?? {},
        dedupeKey: n.dedupeKey ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) return;
    const actor = n.actorId
      ? (await tx.select({ name: users.name, handle: users.handle }).from(users).where(eq(users.id, n.actorId)))[0]
      : undefined;
    const copy = describe(n.type, row.data, actor?.name ?? actor?.handle ?? null, row.jokeId);
    await this.sendPush(n.userId, { ...copy, tag: row.id });
  }

  /** Push only, with no Activity item: e.g. "today's joke is here". */
  async sendPush(userId: string, payload: PushPayload) {
    if (!this.pushEnabled) return;
    await this.push.add("send", { userId, payload }, { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true, removeOnFail: 200 });
  }

  async sendPushBulk(jobs: PushJob[]) {
    if (!this.pushEnabled || !jobs.length) return;
    await this.push.addBulk(
      jobs.map((data) => ({ name: "send", data, opts: { attempts: 3, removeOnComplete: true, removeOnFail: 200 } })),
    );
  }

  async list(userId: string, q: ActivityQuery) {
    const after = decodeCursor(q.cursor, isTimeCursor);
    const rows = await this.db
      .select({ n: notifications, name: users.name, handle: users.handle, tone: users.tone })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.actorId))
      .where(
        and(
          eq(notifications.userId, userId),
          after
            ? or(
                lt(notifications.createdAt, new Date(after.t)),
                and(eq(notifications.createdAt, new Date(after.t)), lt(notifications.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      data: page.map(({ n, name, handle, tone }): Activity => {
        const copy = describe(n.type, n.data, name ?? handle, n.jokeId);
        return {
          id: n.id,
          type: n.type,
          ...copy,
          actor: handle && tone ? { name: name ?? handle, handle, tone } : null,
          createdAt: n.createdAt.toISOString(),
          read: n.readAt !== null,
        };
      }),
      nextCursor: rows.length > q.limit && last ? encodeCursor({ t: last.n.createdAt.toISOString(), id: last.n.id }) : null,
      unread: await this.unreadCount(userId),
    };
  }

  async unreadCount(userId: string) {
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return n;
  }

  /** Marks everything up to now as read. */
  async markAllRead(userId: string, now = new Date()) {
    await this.db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), lte(notifications.createdAt, now)));
  }

  async subscribe(userId: string, sub: PushSubscriptionRequest, userAgent?: string) {
    // A browser's endpoint belongs to whoever subscribed it last.
    await this.db
      .insert(pushSubscriptions)
      .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
      });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }
}
