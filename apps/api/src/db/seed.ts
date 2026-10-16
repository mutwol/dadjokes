import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { subscriptions, topics, userPreferences, userRoles, users } from "./schema";
import type { Tone } from "./schema";

/**
 * Development data: the topics used in onboarding and the writers from the
 * web app's mock data, with some sample readers so "most subscribed" has an order.
 * Safe to run more than once.
 */
const TOPICS = ["Wordplay", "Food", "School", "Work", "Animals", "Kids", "Science", "Sports"];

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
    for (const w of WRITERS) {
      const id = await upsertUser(db, { email: `${w.handle}@seed.daddyjokes.local`, ...w }, "writer");
      await db
        .insert(subscriptions)
        .values(readerIds.slice(0, w.readers).map((subscriberId) => ({ subscriberId, creatorId: id })))
        .onConflictDoNothing();
    }
    console.log(`Seeded ${TOPICS.length} topics, ${WRITERS.length} writers and ${readerIds.length} readers.`);
  } finally {
    await pool.end();
  }
}

async function upsertUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
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
  seed(url).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
