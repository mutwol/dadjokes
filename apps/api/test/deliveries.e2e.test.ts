import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, latestDateNow, localDate, zonedInstant } from "../src/common/dates";
import { DeliveriesService } from "../src/deliveries/deliveries.service";
import { createTestApp, resetDb, signUp } from "./app";
import type { TestApp } from "./app";

const NBO = "Africa/Nairobi";

describe("daily delivery", () => {
  let t: TestApp;
  let svc: DeliveriesService;
  // The seed puts test jokes around today's date in Nairobi.
  const today = localDate(new Date(), NBO);
  const at = (hour: number, day = today) => zonedInstant(day, hour, NBO);

  beforeAll(async () => {
    t = await createTestApp();
    svc = t.app.get(DeliveriesService);
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.db));

  const reader = async (email: string, extra: Record<string, unknown> = {}) => {
    const r = await signUp(t, email);
    if (Object.keys(extra).length) await t.http.patch("/v1/me/preferences").set(r.auth).send(extra).expect(200);
    return r;
  };
  const rows = async (userId: string) =>
    (
      await t.db.execute<{ local_date: string; setup: string; region: string | null }>(
        sql`select d.local_date::text, j.setup, j.region from deliveries d join jokes j on j.id = d.joke_id where d.user_id = ${userId} order by 1`,
      )
    ).rows;

  it("delivers at the reader's hour, once, with local jokes for readers who want them", async () => {
    const plain = await reader("plain@example.com"); // 07:00, everywhere
    const local = await reader("local@example.com", { jokeOrigin: "local" }); // Kenya
    const early = await reader("early@example.com", { deliveryHour: 9 });

    // Seeded sample readers get theirs at 08:00 too; only look at this test's readers.
    const mine = async (now: Date) =>
      (await svc.deliverDue(now)).map((r) => r.userId).filter((id) => [plain, local, early].some((x) => x.userId === id));
    expect(await mine(at(6))).toHaveLength(0);
    expect((await mine(at(7))).sort()).toEqual([local.userId, plain.userId].sort());
    expect(await mine(at(8))).toHaveLength(0);

    expect(await rows(plain.userId)).toEqual([{ local_date: today, setup: "I only know 25 letters of the alphabet.", region: null }]);
    expect((await rows(local.userId))[0]).toMatchObject({ region: "Kenya" });
    expect(await rows(early.userId)).toEqual([]);
    expect(await mine(at(9))).toEqual([early.userId]);
  });

  it("skips writers who don't read, and days with no joke", async () => {
    await signUp(t, "writer@example.com", { roles: ["writer"] });
    const r = await reader("nojoke@example.com");
    await t.db.execute(sql`update jokes set status = 'in_review', deliver_on = null where deliver_on = ${today} and region is null`);
    expect((await svc.deliverDue(at(12))).filter((d) => d.userId === r.userId)).toHaveLength(0);
    expect(await rows(r.userId)).toEqual([]);
  });

  it("keeps the joke sealed until opened, then shows it; the streak counts opened days", async () => {
    const r = await reader("open@example.com", { deliveryHour: 0 });
    // Yesterday's joke, opened, gives a streak to build on.
    await svc.deliverDue(at(0, addDays(today, -1)));
    await svc.open(r.userId, addDays(today, -1), at(1, addDays(today, -1)));

    const before = await svc.today(r.userId, at(10));
    expect(before.current).toMatchObject({ date: today, state: "sealed", jokeId: null, creator: { handle: "wanjiru_puns" } });
    expect(before.streak).toBe(1);
    expect(before.week.find((d) => d.date === today)?.state).toBe("sealed");
    expect(before.nextDeliveryAt).toBe(at(0, addDays(today, 1)).toISOString());

    const joke = await svc.open(r.userId, today, at(10));
    expect(joke).toMatchObject({ setup: "I only know 25 letters of the alphabet.", stats: { views: 1 }, isMine: false });
    await svc.open(r.userId, today, at(11)); // opening again is fine

    const after = await svc.today(r.userId, at(11));
    expect(after.current).toMatchObject({ state: "opened", jokeId: joke.id });
    expect(after.streak).toBe(2);
  });

  it("lets an unopened joke expire after a day", async () => {
    const r = await reader("late@example.com", { deliveryHour: 0 });
    await svc.deliverDue(at(0, addDays(today, -2)));
    const t2 = await svc.today(r.userId, at(12));
    expect(t2.week.find((d) => d.date === addDays(today, -2))?.state ?? "missed").toBe("missed");
    await expect(svc.open(r.userId, addDays(today, -2), at(12))).rejects.toMatchObject({ status: 410, code: "joke_expired" });
    expect(t2.streak).toBe(0);
  });

  it("tells readers before their hour when the joke arrives", async () => {
    const r = await reader("wait@example.com", { deliveryHour: 20 });
    const res = await svc.today(r.userId, at(9));
    expect(res.current).toBeNull();
    expect(res.week.find((d) => d.date === today)?.state).toBe("upcoming");
    expect(res.nextDeliveryAt).toBe(at(20).toISOString());
  });

  it("serves Today, open and the joke over HTTP, and hides unopened jokes", async () => {
    const r = await reader("http@example.com", { deliveryHour: 0 });
    const other = await reader("other@example.com", { deliveryHour: 23 });
    const res = await t.http.get("/v1/me/today").set(r.auth).expect(200);
    const date = res.body.date as string;
    expect(res.body.current).toMatchObject({ state: "sealed", jokeId: null });

    const joke = (await t.http.post(`/v1/me/deliveries/${date}/open`).set(r.auth).expect(200)).body;
    await t.http.get(`/v1/jokes/${joke.id}`).set(r.auth).expect(200);
    await t.http.get(`/v1/jokes/${joke.id}`).set(other.auth).expect(404);
    await t.http.post(`/v1/me/deliveries/${addDays(date, -30)}/open`).set(r.auth).expect(404);
    await t.http.post(`/v1/me/deliveries/not-a-date/open`).set(r.auth).expect(422);
  });

  it("lets writers see their own jokes and reach in Studio", async () => {
    const r = await reader("fan@example.com", { deliveryHour: 0 });
    await svc.deliverDue(at(1));
    await svc.open(r.userId, today, at(2));
    const wanjiru = await signUp(t, "wanjiru-real@example.com", { roles: ["writer"] });
    // Hand today's joke to this test writer so we can sign in as its author.
    await t.db.execute(sql`update jokes set creator_id = ${wanjiru.userId} where deliver_on = ${today} and region is null`);
    const summary = await t.http.get("/v1/me/studio").set(wanjiru.auth).expect(200);
    expect(summary.body).toMatchObject({ picked: 1, reached: 1, opened: 1 });
    const [{ id }] = (await t.db.execute<{ id: string }>(sql`select id from jokes where deliver_on = ${today} and region is null`)).rows;
    expect((await t.http.get(`/v1/jokes/${id}`).set(wanjiru.auth).expect(200)).body.isMine).toBe(true);
  });

  it("marks scheduled jokes delivered once their day starts anywhere", async () => {
    const latest = latestDateNow();
    const future = (
      await t.db.execute<{ n: number }>(sql`select count(*)::int as n from jokes where status = 'scheduled' and deliver_on <= ${latest}`)
    ).rows[0].n;
    expect(await svc.markStartedDays()).toBe(future);
    const left = await t.db.execute<{ n: number }>(sql`select count(*)::int as n from jokes where status = 'scheduled' and deliver_on <= ${latest}`);
    expect(left.rows[0].n).toBe(0);
  });
});
