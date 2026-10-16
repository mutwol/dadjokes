import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema";
import { jokes } from "../src/db/schema";
import { seed } from "../src/db/seed";
import { SEED_JOKES } from "../src/db/seed-jokes";

/** The seed and the jokes table's rules: one joke per day, test jokes that move with today. */
describe("jokes seed", () => {
  const url = process.env.DATABASE_URL!;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const rows = async () =>
    (
      await db.execute<{ id: string; setup: string; status: string; deliver_on: string | null; region: string | null }>(
        sql`select id, setup, status, deliver_on::text, region from jokes order by id`,
      )
    ).rows;
  const onDay = async (day: string, region: string | null = null) =>
    (await rows()).filter((r) => r.deliver_on === day && r.region === region);

  beforeAll(() => {
    pool = new Pool({ connectionString: url, max: 1 });
    db = drizzle(pool, { schema });
  });
  afterAll(() => pool.end());
  beforeEach(async () => {
    await db.execute(sql`truncate table users, topics, email_codes restart identity cascade`);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T05:00:00Z")); // 08:00 in Nairobi
  });
  afterEach(() => vi.useRealTimers());

  it("seeds every test joke, with today's joke delivered and later ones scheduled", async () => {
    await seed(url);
    const all = await rows();
    expect(all).toHaveLength(SEED_JOKES.length);

    const today = await onDay("2026-10-16");
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ setup: "I only know 25 letters of the alphabet.", status: "delivered" });
    expect(await onDay("2026-10-16", "Kenya")).toHaveLength(1);
    expect((await onDay("2026-10-17"))[0].status).toBe("scheduled");
    expect(all.filter((r) => r.status === "in_review")).toHaveLength(4);
  });

  it("moves the same rows along to a new today when run again", async () => {
    await seed(url);
    const before = (await rows()).map((r) => r.id);

    vi.setSystemTime(new Date("2026-10-20T05:00:00Z"));
    await seed(url);
    const after = await rows();
    expect(after.map((r) => r.id)).toEqual(before);
    expect((await onDay("2026-10-20"))[0]).toMatchObject({ setup: "I only know 25 letters of the alphabet.", status: "delivered" });
    expect(after.filter((r) => r.deliver_on && r.deliver_on < "2026-10-07")).toHaveLength(0);
  });

  it("leaves days taken by real jokes alone", async () => {
    await seed(url);
    const [writer] = (await db.execute<{ id: string }>(sql`select id from users where handle = 'amara_says_hi'`)).rows;
    await db.execute(sql`delete from jokes where deliver_on = '2026-10-17' and region is null`);
    await db.insert(jokes).values({
      creatorId: writer.id,
      setup: "A real joke",
      punchline: "Scheduled by a curator.",
      status: "scheduled",
      deliverOn: "2026-10-17",
    });

    await seed(url);
    const day = await onDay("2026-10-17");
    expect(day.map((r) => r.setup)).toEqual(["A real joke"]);
    expect((await rows()).find((r) => r.setup === "Why did the cookie go to the doctor?")?.status).toBe("in_review");
  });

  it("enforces one joke per day per region, and a day for every scheduled joke", async () => {
    await seed(url);
    const [writer] = (await db.execute<{ id: string }>(sql`select id from users where handle = 'amara_says_hi'`)).rows;
    const base = { creatorId: writer.id, setup: "Setup", punchline: "Punchline" };

    await expect(db.insert(jokes).values({ ...base, status: "scheduled", deliverOn: "2026-10-16" })).rejects.toMatchObject({
      cause: { constraint: "jokes_one_per_day_key" },
    });
    await expect(db.insert(jokes).values({ ...base, status: "scheduled", deliverOn: "2026-10-16", region: "Nigeria" })).resolves.toBeDefined();
    await expect(db.insert(jokes).values({ ...base, status: "scheduled" })).rejects.toMatchObject({
      cause: { constraint: "jokes_scheduled_has_day" },
    });
    await expect(db.insert(jokes).values({ creatorId: writer.id, setup: "No punchline" })).rejects.toMatchObject({
      cause: { constraint: "jokes_content" },
    });
  });
});
