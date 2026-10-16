import { Injectable } from "@nestjs/common";
import { and, asc, between, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { decodeCursor, encodeCursor, isTimeCursor } from "../common/cursor";
import { addDays, firstOpenDay } from "../common/dates";
import { InjectDb } from "../db/db.module";
import type { Db, Tx } from "../db/db.module";
import { jokes, jokeText, users } from "../db/schema";
import type { Joke } from "../db/schema";
import { JokesService, toSubmission } from "../jokes/jokes.service";
import type { CalendarQuery, CuratedJoke, DeclineRequest, QueueQuery, ScheduleRequest } from "./schemas";

/** Jokes at least this similar (trigram similarity, 0-1) are flagged as possible copies. */
const COPY_THRESHOLD = 0.5;

const creatorCols = {
  creatorName: users.name,
  creatorHandle: users.handle,
  creatorCountry: users.country,
  creatorTone: users.tone,
};

@Injectable()
export class CurationService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly jokes: JokesService,
  ) {}

  /** Jokes waiting for review, oldest first, each with possible copies. */
  async queue(q: QueueQuery) {
    const after = decodeCursor(q.cursor, isTimeCursor);
    const rows = await this.db
      .select({ joke: jokes, ...creatorCols })
      .from(jokes)
      .innerJoin(users, eq(users.id, jokes.creatorId))
      .where(
        and(
          eq(jokes.status, "in_review"),
          after
            ? or(
                gt(jokes.submittedAt, new Date(after.t)),
                and(eq(jokes.submittedAt, new Date(after.t)), gt(jokes.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(jokes.submittedAt), asc(jokes.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const [topics, [{ waiting }]] = await Promise.all([
      this.jokes.topicsFor(page.map((r) => r.joke.id)),
      this.db.select({ waiting: sql<number>`count(*)::int` }).from(jokes).where(eq(jokes.status, "in_review")),
    ]);
    const data = await Promise.all(
      page.map(async (r) => ({
        joke: toCurated(r, topics.get(r.joke.id) ?? []),
        possibleCopies: await this.possibleCopies(r.joke),
      })),
    );
    const last = page.at(-1);
    return {
      data,
      waiting,
      nextCursor:
        rows.length > q.limit && last ? encodeCursor({ t: last.joke.submittedAt.toISOString(), id: last.joke.id }) : null,
    };
  }

  /** Other jokes whose text is close to this one, most similar first. Withdrawn ones don't count. */
  async possibleCopies(j: Joke, tx: Tx = this.db) {
    if (j.kind !== "text") return [];
    const text = sql`lower(${j.setup ?? ""} || ' ' || ${j.punchline ?? ""})`;
    const similarity = sql<number>`similarity(${jokeText(jokes)}, ${text})`;
    const rows = await tx
      .select({
        id: jokes.id,
        setup: jokes.setup,
        punchline: jokes.punchline,
        status: jokes.status,
        deliverOn: jokes.deliverOn,
        creatorId: jokes.creatorId,
        creatorHandle: users.handle,
        similarity,
      })
      .from(jokes)
      .innerJoin(users, eq(users.id, jokes.creatorId))
      .where(
        and(
          ne(jokes.id, j.id),
          ne(jokes.status, "withdrawn"),
          // `%` uses the trigram index; the similarity filter then applies the stricter threshold.
          sql`${jokeText(jokes)} % ${text}`,
          sql`${similarity} >= ${COPY_THRESHOLD}`,
        ),
      )
      .orderBy(sql`${similarity} desc`)
      .limit(3);
    return rows.map(({ creatorId, creatorHandle, similarity: s, ...r }) => ({
      ...r,
      creatorHandle: creatorHandle ?? "",
      sameWriter: creatorId === j.creatorId,
      similarity: Math.round(Number(s) * 100) / 100,
    }));
  }

  async calendar(q: CalendarQuery) {
    const open = firstOpenDay();
    const from = q.from ?? open;
    const to = addDays(from, q.days - 1);
    const rows = await this.db
      .select({
        jokeId: jokes.id,
        deliverOn: jokes.deliverOn,
        region: jokes.region,
        setup: jokes.setup,
        caption: jokes.caption,
        creatorName: users.name,
        status: jokes.status,
      })
      .from(jokes)
      .innerJoin(users, eq(users.id, jokes.creatorId))
      .where(and(inArray(jokes.status, ["scheduled", "delivered"]), between(jokes.deliverOn, from, to)))
      .orderBy(asc(jokes.deliverOn), sql`${jokes.region} nulls first`);
    const days = Array.from({ length: q.days }, (_, i) => {
      const date = addDays(from, i);
      return {
        date,
        picks: rows
          .filter((r) => r.deliverOn === date)
          .map((r) => ({
            jokeId: r.jokeId,
            region: r.region,
            setup: r.setup ?? r.caption,
            creatorName: r.creatorName ?? "",
            status: r.status,
          })),
      };
    });
    return { firstOpenDay: open, days };
  }

  async schedule(curatorId: string, id: string, req: ScheduleRequest): Promise<CuratedJoke> {
    const open = firstOpenDay();
    if (req.deliverOn < open) {
      throw new AppError(422, "day_closed", `That day has already started for some readers. Pick ${open} or later.`, {
        errors: [{ path: "deliverOn", message: `Pick ${open} or later.` }],
      });
    }
    return this.db.transaction(async (tx) => {
      const j = await this.lock(tx, id);
      const movable = j.status === "scheduled" && j.deliverOn !== null && j.deliverOn >= open;
      if (!(j.status === "in_review" || j.status === "declined" || movable)) {
        throw new AppError(409, "not_schedulable", `This joke is ${j.status.replace("_", " ")}, so it can't be scheduled.`);
      }
      await tx
        .update(jokes)
        .set({
          status: "scheduled",
          deliverOn: req.deliverOn,
          reviewedBy: curatorId,
          reviewedAt: new Date(),
          declineReason: null,
          declineNote: null,
        })
        .where(eq(jokes.id, id));
      return this.get(id, tx);
    });
  }

  async decline(curatorId: string, id: string, req: DeclineRequest): Promise<CuratedJoke> {
    return this.db.transaction(async (tx) => {
      const j = await this.lock(tx, id);
      const unscheduling = j.status === "scheduled" && j.deliverOn !== null && j.deliverOn >= firstOpenDay();
      if (!(j.status === "in_review" || unscheduling)) {
        throw new AppError(409, "not_declinable", `This joke is ${j.status.replace("_", " ")}, so it can't be declined.`);
      }
      await tx
        .update(jokes)
        .set({
          status: "declined",
          deliverOn: null,
          reviewedBy: curatorId,
          reviewedAt: new Date(),
          declineReason: req.reason,
          declineNote: req.note || null,
        })
        .where(eq(jokes.id, id));
      return this.get(id, tx);
    });
  }

  async get(id: string, tx: Tx = this.db): Promise<CuratedJoke> {
    const [row] = await tx
      .select({ joke: jokes, ...creatorCols })
      .from(jokes)
      .innerJoin(users, eq(users.id, jokes.creatorId))
      .where(eq(jokes.id, id));
    if (!row) throw notFound("Joke");
    return toCurated(row, (await this.jokes.topicsFor([id], tx)).get(id) ?? []);
  }

  private async lock(tx: Tx, id: string): Promise<Joke> {
    const [j] = await tx.select().from(jokes).where(eq(jokes.id, id)).for("update");
    if (!j) throw notFound("Joke");
    return j;
  }
}

function toCurated(
  r: {
    joke: Joke;
    creatorName: string | null;
    creatorHandle: string | null;
    creatorCountry: string | null;
    creatorTone: CuratedJoke["creator"]["tone"];
  },
  topics: string[],
): CuratedJoke {
  return {
    ...toSubmission(r.joke, topics),
    reviewedAt: r.joke.reviewedAt?.toISOString() ?? null,
    creator: {
      id: r.joke.creatorId,
      name: r.creatorName ?? r.creatorHandle ?? "",
      handle: r.creatorHandle ?? "",
      country: r.creatorCountry,
      tone: r.creatorTone,
    },
  };
}
