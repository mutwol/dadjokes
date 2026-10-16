import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { decodeCursor, encodeCursor, isTimeCursor } from "../common/cursor";
import { firstOpenDay } from "../common/dates";
import { InjectDb } from "../db/db.module";
import type { Db, Tx } from "../db/db.module";
import { comments, deliveries, jokes, jokeTopics, reactions } from "../db/schema";
import type { Joke } from "../db/schema";
import { assertTopicsExist } from "../db/topics";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, looksLike } from "../storage/images";
import type { ImageType } from "../storage/images";
import { StorageService } from "../storage/storage.service";
import type { CreateJokeRequest, ListMyJokesQuery, Submission } from "./schemas";

/** At most this many of a writer's jokes can wait for review at once. */
export const MAX_IN_REVIEW = 5;

@Injectable()
export class JokesService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly storage: StorageService,
  ) {}

  async submit(creatorId: string, req: CreateJokeRequest): Promise<Submission> {
    const topics = [...new Set(req.topics)];
    if (req.kind === "image") await this.checkImage(creatorId, req.imageKey);
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
            req.kind === "text"
              ? and(sql`lower(${jokes.setup}) = lower(${req.setup})`, sql`lower(${jokes.punchline}) = lower(${req.punchline})`)
              : eq(jokes.imageKey, req.imageKey),
          ),
        )
        .limit(1);
      if (dupe) throw new AppError(409, "duplicate_submission", "You've already sent this joke.");

      const content =
        req.kind === "text"
          ? { kind: "text" as const, setup: req.setup, punchline: req.punchline, background: req.background }
          : { kind: "image" as const, imageKey: req.imageKey, imageAlt: req.imageAlt, caption: req.caption || null };
      const [row] = await tx
        .insert(jokes)
        .values({ creatorId, region: req.region, ...content })
        .returning();
      if (topics.length) await tx.insert(jokeTopics).values(topics.map((topicSlug) => ({ jokeId: row.id, topicSlug })));
      return this.toSubmission(row, topics);
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
    const [topics, stats] = await Promise.all([this.topicsFor(page.map((r) => r.id)), this.statsFor(page)]);
    const last = page.at(-1);
    return {
      data: page.map((r) => ({ ...this.toSubmission(r, topics.get(r.id) ?? []), stats: stats.get(r.id) ?? null })),
      nextCursor:
        rows.length > q.limit && last ? encodeCursor({ t: last.submittedAt.toISOString(), id: last.id }) : null,
    };
  }

  async getMine(creatorId: string, id: string): Promise<Submission> {
    const row = await this.findMine(this.db, creatorId, id);
    const [topics, stats] = await Promise.all([this.topicsFor([id]), this.statsFor([row])]);
    return { ...this.toSubmission(row, topics.get(id) ?? []), stats: stats.get(id) ?? null };
  }

  /** Takes a joke out of review, or off the schedule if its day hasn't started anywhere yet. */
  async withdraw(creatorId: string, id: string): Promise<Submission> {
    return this.db.transaction(async (tx) => {
      const row = await this.findMine(tx, creatorId, id, true);
      if (row.status === "withdrawn") return this.toSubmission(row, (await this.topicsFor([id], tx)).get(id) ?? []);
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
      return this.toSubmission(updated, (await this.topicsFor([id], tx)).get(id) ?? []);
    });
  }

  toSubmission(r: Joke, topics: string[]): Submission {
    return toSubmission(r, topics, (key) => this.storage.publicUrl(key));
  }

  /** Reach and engagement for jokes that have gone out (excluding the writer's own views). */
  private async statsFor(rows: Joke[]) {
    const ids = rows.filter((r) => r.status === "delivered").map((r) => r.id);
    const out = new Map<string, NonNullable<Submission["stats"]>>();
    if (!ids.length) return out;
    const [reach, reacts, talk] = await Promise.all([
      this.db
        .select({ id: deliveries.jokeId, reached: sql<number>`count(*)::int`, opened: sql<number>`count(${deliveries.openedAt})::int` })
        .from(deliveries)
        .where(inArray(deliveries.jokeId, ids))
        .groupBy(deliveries.jokeId),
      this.db
        .select({ id: reactions.jokeId, n: sql<number>`count(*)::int` })
        .from(reactions)
        .where(inArray(reactions.jokeId, ids))
        .groupBy(reactions.jokeId),
      this.db
        .select({ id: comments.jokeId, n: sql<number>`count(*) filter (where ${comments.deletedAt} is null)::int` })
        .from(comments)
        .where(inArray(comments.jokeId, ids))
        .groupBy(comments.jokeId),
    ]);
    for (const id of ids) {
      const r = reach.find((x) => x.id === id);
      out.set(id, {
        reached: r?.reached ?? 0,
        opened: r?.opened ?? 0,
        reactions: reacts.find((x) => x.id === id)?.n ?? 0,
        comments: talk.find((x) => x.id === id)?.n ?? 0,
      });
    }
    return out;
  }

  /** The image must be this writer's own upload, finished, and really an image of the declared type. */
  private async checkImage(creatorId: string, key: string) {
    const invalid = (title: string) =>
      new AppError(422, "invalid_image", title, { errors: [{ path: "imageKey", message: title }] });
    if (!key.startsWith(`jokes/${creatorId}/`)) throw invalid("Upload the image first.");
    const obj = await this.storage.head(key);
    if (!obj) throw invalid("The image hasn't finished uploading. Try again.");
    const type = obj.contentType as ImageType;
    if (!(type in IMAGE_TYPES) || obj.size > MAX_IMAGE_BYTES) throw invalid("Use a PNG, JPG, GIF or WebP up to 10 MB.");
    if (!looksLike(type, await this.storage.readStart(key, 16))) throw invalid("That file isn't a valid image.");
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

export function toSubmission(r: Joke, topics: string[], mediaUrl: (key: string) => string): Submission {
  return {
    id: r.id,
    kind: r.kind,
    setup: r.setup,
    punchline: r.punchline,
    imageUrl: r.imageKey ? mediaUrl(r.imageKey) : null,
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
    removed: r.removedAt !== null,
    stats: null,
  };
}
