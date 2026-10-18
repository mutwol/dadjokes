import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AppError, notFound } from "../common/errors";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { appeals, jokes, users } from "../db/schema";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../platform/audit.service";
import type { AppealOut, ResolveAppealRequest } from "./schemas";

const resolver = alias(users, "resolver");

@Injectable()
export class AppealsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** A writer appeals a takedown. One open appeal per joke. */
  async create(userId: string, jokeId: string, message: string) {
    const [j] = await this.db.select().from(jokes).where(eq(jokes.id, jokeId));
    if (!j || j.creatorId !== userId) throw notFound("Joke");
    if (!j.removedAt) throw new AppError(422, "not_removed", "Only jokes that were taken down can be appealed.");
    const [row] = await this.db.insert(appeals).values({ jokeId, userId, message }).onConflictDoNothing().returning({ id: appeals.id });
    if (!row) throw new AppError(409, "appeal_open", "You've already appealed this one. The curators will get back to you.");
    return this.one(row.id);
  }

  mine(userId: string) {
    return this.list(eq(appeals.userId, userId));
  }

  forCurators(status?: "open" | "upheld" | "overturned") {
    return this.list(status ? eq(appeals.status, status) : undefined);
  }

  /** Uphold keeps the joke down; overturn puts it back. The writer hears either way. */
  async resolve(curatorId: string, id: string, req: ResolveAppealRequest) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const [a] = await tx
        .update(appeals)
        .set({
          status: req.decision === "overturn" ? "overturned" : "upheld",
          resolvedBy: curatorId,
          resolvedAt: now,
          resolutionNote: req.note || null,
        })
        .where(and(eq(appeals.id, id), eq(appeals.status, "open")))
        .returning();
      if (!a) throw new AppError(409, "appeal_closed", "This appeal was already decided.");
      if (req.decision === "overturn") {
        await tx.update(jokes).set({ removedAt: null, removedBy: null, hiddenAt: null }).where(eq(jokes.id, a.jokeId));
      }
      const [j] = await tx.select({ setup: jokes.setup, caption: jokes.caption }).from(jokes).where(eq(jokes.id, a.jokeId));
      await this.audit.record(
        { actorId: curatorId, action: `appeal.${a.status}`, targetType: "joke", targetId: a.jokeId, data: { appealId: a.id, note: a.resolutionNote } },
        tx,
      );
      await this.notifications.notify(
        {
          userId: a.userId,
          type: "appeal_resolved",
          jokeId: a.jokeId,
          data: { decision: a.status, note: a.resolutionNote, setup: j?.setup ?? j?.caption },
          dedupeKey: `appeal:${a.id}`,
        },
        tx,
      );
    });
    return this.one(id);
  }

  private async one(id: string) {
    const [a] = (await this.list(eq(appeals.id, id))).data;
    if (!a) throw notFound("Appeal");
    return a;
  }

  private async list(where?: SQL) {
    const rows = await this.db
      .select({
        a: appeals,
        handle: users.handle,
        resolverHandle: resolver.handle,
        preview: sql<string>`coalesce(${jokes.setup} || ' ' || coalesce(${jokes.punchline}, ''), ${jokes.caption}, ${jokes.imageAlt}, '')`,
      })
      .from(appeals)
      .innerJoin(jokes, eq(jokes.id, appeals.jokeId))
      .innerJoin(users, eq(users.id, appeals.userId))
      .leftJoin(resolver, eq(resolver.id, appeals.resolvedBy))
      .where(where)
      .orderBy(desc(appeals.createdAt))
      .limit(100);
    return {
      data: rows.map(
        (r): AppealOut => ({
          id: r.a.id,
          jokeId: r.a.jokeId,
          preview: r.preview,
          authorHandle: r.handle ?? "",
          message: r.a.message,
          status: r.a.status,
          resolutionNote: r.a.resolutionNote,
          resolvedBy: r.resolverHandle,
          createdAt: r.a.createdAt.toISOString(),
          resolvedAt: r.a.resolvedAt?.toISOString() ?? null,
        }),
      ),
    };
  }
}
