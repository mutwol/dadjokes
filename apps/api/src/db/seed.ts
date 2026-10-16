import { createHash } from "node:crypto";
import { and, inArray, isNotNull, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { jokes, jokeTopics, subscriptions, topics, userPreferences, userRoles, users } from "./schema";
import type { JokeStatus, Tone } from "./schema";
import { addDays, localDate } from "../common/dates";
import { TOPICS } from "./migrate";
import { SEED_JOKES } from "./seed-jokes";

/**
 * Development data: the topics used in onboarding, the writers from the web
 * app's mock data with some sample readers so "most subscribed" has an order,
 * and test jokes around today (see seed-jokes.ts).
 * Safe to run more than once; each run moves the test jokes' days up to today.
 */

/** Today's date in the seeded readers' time zone. */
const SEED_TIMEZONE = "Africa/Nairobi";

export const CURATOR_EMAIL = "curator@daddyjokes.local";

const WRITERS: { name: string; handle: string; country: string; bio: string; tone: Tone; readers: number }[] = [
  { name: "Dan Whitfield", handle: "grillmaster_dan", country: "United Kingdom", bio: "Grill on, socks with sandals, jokes at the ready.", tone: "denim", readers: 31 },
  { name: "Wanjiru Kamau", handle: "wanjiru_puns", country: "Kenya", bio: "Mother of two, collector of terrible puns.", tone: "red", readers: 18 },
  { name: "Amara Obi", handle: "amara_says_hi", country: "Nigeria", bio: "Hi hungry, I'm Amara.", tone: "yellow", readers: 12 },
  { name: "Otieno Okoth", handle: "baba_otieno", country: "Kenya", bio: "My kids stopped laughing in 2019. I did not stop.", tone: "green", readers: 9 },
  { name: "María Torres", handle: "papa_jokes_mx", country: "Mexico", bio: "Dad jokes in two languages, groans in all of them.", tone: "navy", readers: 6 },
];

export async function seed(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const db = drizzle(pool, { schema });
  try {
    await db
      .insert(topics)
      .values(TOPICS.map((label, position) => ({ slug: label.toLowerCase(), label, position })))
      .onConflictDoNothing();

    const readerIds: string[] = [];
    for (let i = 1; i <= 31; i++) {
      readerIds.push(await upsertUser(db, { email: `reader${i}@seed.daddyjokes.local`, name: `Sample Reader ${i}`, handle: `sample_reader_${i}`, country: "Kenya", bio: "", tone: "navy" }, "reader"));
    }
    const writerIds = new Map<string, string>();
    for (const w of WRITERS) {
      const id = await upsertUser(db, { email: `${w.handle}@seed.daddyjokes.local`, ...w }, "writer");
      writerIds.set(w.handle, id);
      await db
        .insert(subscriptions)
        .values(readerIds.slice(0, w.readers).map((subscriberId) => ({ subscriberId, creatorId: id })))
        .onConflictDoNothing();
    }
    // A curator to review the queue with. Sign in as curator@daddyjokes.local; the code is in the API log.
    const curatorId = await upsertUser(
      db,
      { email: CURATOR_EMAIL, name: "Head Curator", handle: "head_curator", country: "Kenya", bio: "Picks the daily joke.", tone: "navy" },
      "reader",
    );
    await db.insert(userRoles).values({ userId: curatorId, role: "curator" }).onConflictDoNothing();

    const jokeCount = await seedJokes(db, writerIds);
    console.log(
      `Seeded ${TOPICS.length} topics, ${WRITERS.length} writers, ${readerIds.length} readers, a curator (${CURATOR_EMAIL}) and ${jokeCount} jokes.`,
    );
  } finally {
    await pool.end();
  }
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function seedJokes(db: Db, writerIds: Map<string, string>): Promise<number> {
  const today = localDate(new Date(), SEED_TIMEZONE);
  const rows = SEED_JOKES.map((j) => {
    const creatorId = writerIds.get(j.writer);
    if (!creatorId) throw new Error(`Seed joke "${j.key}" names unknown writer ${j.writer}`);
    const deliverOn = j.day === undefined ? null : addDays(today, j.day);
    const status: JokeStatus = deliverOn === null ? (j.status ?? "in_review") : deliverOn <= today ? "delivered" : "scheduled";
    return {
      id: seedId(`joke:${j.key}`),
      creatorId,
      kind: "text" as const,
      setup: j.setup,
      punchline: j.punchline,
      background: j.background,
      region: j.region ?? null,
      status,
      deliverOn,
      declineReason: status === "declined" ? ("possible_copy" as const) : null,
      submittedAt: new Date(`${addDays(deliverOn ?? today, deliverOn ? -7 : -1)}T09:00:00Z`),
      topics: j.topics,
    };
  });
  const ids = rows.map((r) => r.id);

  await db.transaction(async (tx) => {
    // Days already taken by jokes that aren't test jokes stay theirs.
    const taken = await tx
      .select({ deliverOn: jokes.deliverOn, region: jokes.region })
      .from(jokes)
      .where(and(isNotNull(jokes.deliverOn), notInArray(jokes.id, ids)));
    const takenDays = new Set(taken.map((t) => `${t.deliverOn}|${t.region ?? ""}`));

    // Free the test jokes' current days first, so moving them along can't collide with each other.
    await tx
      .update(jokes)
      .set({ deliverOn: null, status: "in_review", declineReason: null })
      .where(inArray(jokes.id, ids));

    for (const { topics: slugs, ...row } of rows) {
      if (row.deliverOn && takenDays.has(`${row.deliverOn}|${row.region ?? ""}`)) {
        row.deliverOn = null;
        row.status = "in_review";
        row.declineReason = null;
      }
      const { id: _id, ...changes } = row;
      await tx.insert(jokes).values(row).onConflictDoUpdate({ target: jokes.id, set: changes });
      await tx.delete(jokeTopics).where(inArray(jokeTopics.jokeId, [row.id]));
      await tx.insert(jokeTopics).values(slugs.map((topicSlug) => ({ jokeId: row.id, topicSlug })));
    }
  });
  return rows.length;
}

/** A stable UUID derived from a name, so seeded rows keep their ids across runs. */
function seedId(name: string): string {
  const h = createHash("sha1").update(`daddy-jokes-seed:${name}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function upsertUser(
  db: Db,
  u: { email: string; name: string; handle: string; country: string; bio: string; tone: Tone },
  role: "reader" | "writer",
): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ ...u, timezone: "Africa/Nairobi", onboardedAt: new Date() })
    .onConflictDoUpdate({ target: users.email, set: { name: u.name, bio: u.bio } })
    .returning({ id: users.id });
  await db.insert(userRoles).values({ userId: row.id, role }).onConflictDoNothing();
  await db.insert(userPreferences).values({ userId: row.id }).onConflictDoNothing();
  return row.id;
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
    throw new Error("Refusing to seed test data with NODE_ENV=production. Set ALLOW_SEED=true to override.");
  }
  seed(url).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
