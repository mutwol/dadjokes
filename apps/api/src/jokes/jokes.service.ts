import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { decodeCursor, encodeCursor, isTimeCursor } from "../common/cursor";
import { firstOpenDay } from "../common/dates";
import { InjectDb } from "../db/db.module";
import type { Db, Tx } from "../db/db.module";
import { jokes, jokeTopics } from "../db/schema";
import type { Joke } from "../db/schema";
import { assertTopicsExist } from "../db/topics";
import type { CreateJokeRequest, ListMyJokesQuery, Submission } from "./schemas";

/** At most this many of a writer's jokes can wait for review at once. */
export const MAX_IN_REVIEW = 5;

@Injectable()
export class JokesService {
  constructor(@InjectDb() private readonly db: Db) {}

  async submit(creatorId: string, req: CreateJokeRequest): Promise<Submission> {
    const topics = [...new Set(req.topics)];
    return this.db.transaction(async (tx) => {
      // Serialise one writer's submissions so the in-review limit can't be raced.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`submit:${creatorId}`}))`);
      await assertTopicsExist(tx, topics);

      const [{ waiting }] = await tx
        .select({ waiting: sql<number>`count(*)::int` })
        .from(jokes)
        .where(and(eq(jokes.creatorId, creatorId), eq(jokes.status, "in_review")));
      if (waiting >= MAX_IN_REVIEW) {
        throw new AppError(
          422,
          "too_many_in_review",
          `You have ${MAX_IN_REVIEW} jokes waiting for review. Send more once curators have decided on those.`,
        );
      }

      const [dupe] = await tx
        .select({ id: jokes.id })
        .from(jokes)
        .where(
          and(
            eq(jokes.creatorId, creatorId),
            inArray(jokes.status, ["in_review", "scheduled", "delivered"]),
            sql`lower(${jokes.setup}) = lower(${req.setup})`,
            sql`lower(${jokes.punchline}) = lower(${req.punchline})`,
          ),
        )
        .limit(1);
      if (dupe) throw new AppError(409, "duplicate_submission", "You've already sent this joke.");

      const [row] = await tx
        .insert(jokes)
        .values({
          creatorId,
          kind: "text",
          setup: req.setup,
          punchline: req.punchline,
          background: req.background,
          region: req.region,
        })
        .returning();
      if (topics.length) await tx.insert(jokeTopics).values(topics.map((topicSlug) => ({ jokeId: row.id, topicSlug })));
      return toSubmission(row, topics);
    });
  }

  async listMine(creatorId: string, q: ListMyJokesQuery) {
    const after = decodeCursor(q.cursor, isTimeCursor);
    const rows = await this.db
      .select()
      .from(jokes)
      .where(
        and(
          eq(jokes.creatorId, creatorId),
          q.status ? eq(jokes.status, q.status) : undefined,
          after
            ? or(
                lt(jokes.submittedAt, new Date(after.t)),
                and(eq(jokes.submittedAt, new Date(after.t)), lt(jokes.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(jokes.submittedAt), desc(jokes.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const topics = await this.topicsFor(page.map((r) => r.id));
    const last = page.at(-1);
    return {
      data: page.map((r) => toSubmission(r, topics.get(r.id) ?? [])),
      nextCursor:
        rows.length > q.limit && last ? encodeCursor({ t: last.submittedAt.toISOString(), id: last.id }) : null,
    };
  }

  async getMine(creatorId: string, id: string): Promise<Submission> {
    const row = await this.findMine(this.db, creatorId, id);
    return toSubmission(row, (await this.topicsFor([id])).get(id) ?? []);
  }

  /** Takes a joke out of review, or off the schedule if its day hasn't started anywhere yet. */
  async withdraw(creatorId: string, id: string): Promise<Submission> {
    return this.db.transaction(async (tx) => {
      const row = await this.findMine(tx, creatorId, id, true);
      if (row.status === "withdrawn") return toSubmission(row, (await this.topicsFor([id], tx)).get(id) ?? []);
      if (!canWithdraw(row)) {
        throw new AppError(
          409,
          "cannot_withdraw",
          row.status === "delivered" || row.status === "scheduled"
            ? "This joke is already going out, so it can't be withdrawn."
            : "This joke can't be withdrawn.",
        );
      }
      const [updated] = await tx
        .update(jokes)
        .set({ status: "withdrawn", deliverOn: null })
        .where(eq(jokes.id, id))
        .returning();
      return toSubmission(updated, (await this.topicsFor([id], tx)).get(id) ?? []);
    });
  }

  private async findMine(tx: Tx, creatorId: string, id: string, forUpdate = false): Promise<Joke> {
    const q = tx
      .select()
      .from(jokes)
      .where(and(eq(jokes.id, id), eq(jokes.creatorId, creatorId)));
    const [row] = forUpdate ? await q.for("update") : await q;
    if (!row) throw notFound("Joke");
    return row;
  }

  async topicsFor(ids: string[], tx: Tx = this.db): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!ids.length) return map;
    const rows = await tx
      .select({ jokeId: jokeTopics.jokeId, slug: jokeTopics.topicSlug })
      .from(jokeTopics)
      .where(inArray(jokeTopics.jokeId, ids));
    for (const r of rows) map.set(r.jokeId, [...(map.get(r.jokeId) ?? []), r.slug]);
    return map;
  }
}

export function canWithdraw(j: Pick<Joke, "status" | "deliverOn">, now = new Date()): boolean {
  if (j.status === "in_review") return true;
  return j.status === "scheduled" && j.deliverOn !== null && j.deliverOn >= firstOpenDay(now);
}

export function toSubmission(r: Joke, topics: string[]): Submission {
  return {
    id: r.id,
    kind: r.kind,
    setup: r.setup,
    punchline: r.punchline,
    imageUrl: r.imageUrl,
    imageAlt: r.imageAlt,
    caption: r.caption,
    background: r.background,
    region: r.region,
    topics: [...topics].sort(),
    status: r.status,
    deliverOn: r.deliverOn,
    submittedAt: r.submittedAt.toISOString(),
    declineReason: r.declineReason,
    declineNote: r.declineNote,
    canWithdraw: canWithdraw(r),
  };
}
