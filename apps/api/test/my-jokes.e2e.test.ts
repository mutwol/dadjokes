import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, firstOpenDay } from "../src/common/dates";
import { createTestApp, onboardingBody, resetDb, signIn } from "./app";
import type { TestApp } from "./app";

const joke = (overrides: Record<string, unknown> = {}) => ({
  kind: "text",
  setup: "Why did the bicycle fall over?",
  punchline: "It was two tired.",
  background: "green",
  topics: ["wordplay"],
  original: true,
  ...overrides,
});

describe("a writer's jokes", () => {
  let t: TestApp;
  let auth: { Authorization: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.db);
    const { token } = await signIn(t, "writer@example.com");
    auth = { Authorization: `Bearer ${token}` };
    await t.http.post("/v1/me/onboarding").set(auth).send(onboardingBody({ roles: ["writer"] })).expect(200);
  });

  it("submits a joke for review and lists it", async () => {
    const res = await t.http.post("/v1/me/jokes").set(auth).send(joke({ region: "Kenya" })).expect(201);
    expect(res.body).toMatchObject({
      kind: "text",
      setup: "Why did the bicycle fall over?",
      status: "in_review",
      region: "Kenya",
      topics: ["wordplay"],
      deliverOn: null,
      canWithdraw: true,
    });
    const list = await t.http.get("/v1/me/jokes").set(auth).expect(200);
    expect(list.body.data.map((j: { id: string }) => j.id)).toEqual([res.body.id]);
    await t.http.get(`/v1/me/jokes/${res.body.id}`).set(auth).expect(200);
  });

  it("validates the joke and the originality pledge", async () => {
    const bad = await t.http
      .post("/v1/me/jokes")
      .set(auth)
      .send(joke({ setup: "", original: false, topics: ["a", "b", "c", "d"] }))
      .expect(422);
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(["original", "setup", "topics"]);
    const topic = await t.http.post("/v1/me/jokes").set(auth).send(joke({ topics: ["knitting"] })).expect(422);
    expect(topic.body.code).toBe("unknown_topic");
  });

  it("refuses duplicates and more than 5 waiting for review", async () => {
    await t.http.post("/v1/me/jokes").set(auth).send(joke()).expect(201);
    const dupe = await t.http
      .post("/v1/me/jokes")
      .set(auth)
      .send(joke({ setup: "why did the BICYCLE fall over?" }))
      .expect(409);
    expect(dupe.body.code).toBe("duplicate_submission");

    for (let i = 0; i < 4; i++) {
      await t.http.post("/v1/me/jokes").set(auth).send(joke({ punchline: `Take ${i}` })).expect(201);
    }
    const sixth = await t.http.post("/v1/me/jokes").set(auth).send(joke({ punchline: "Take 9" })).expect(422);
    expect(sixth.body.code).toBe("too_many_in_review");
  });

  it("pages through jokes newest first", async () => {
    for (let i = 0; i < 3; i++) await t.http.post("/v1/me/jokes").set(auth).send(joke({ punchline: `P${i}` })).expect(201);
    const first = await t.http.get("/v1/me/jokes?limit=2").set(auth).expect(200);
    expect(first.body.data.map((j: { punchline: string }) => j.punchline)).toEqual(["P2", "P1"]);
    const second = await t.http.get(`/v1/me/jokes?limit=2&cursor=${first.body.nextCursor}`).set(auth).expect(200);
    expect(second.body.data.map((j: { punchline: string }) => j.punchline)).toEqual(["P0"]);
    expect(second.body.nextCursor).toBeNull();
    await t.http.get("/v1/me/jokes?cursor=nope").set(auth).expect(400);
  });

  it("withdraws from review and from the schedule, but not once the day has started", async () => {
    const a = (await t.http.post("/v1/me/jokes").set(auth).send(joke()).expect(201)).body;
    const w = await t.http.post(`/v1/me/jokes/${a.id}/withdraw`).set(auth).expect(200);
    expect(w.body).toMatchObject({ status: "withdrawn", canWithdraw: false });
    await t.http.post(`/v1/me/jokes/${a.id}/withdraw`).set(auth).expect(200);

    const b = (await t.http.post("/v1/me/jokes").set(auth).send(joke({ punchline: "Later" })).expect(201)).body;
    const open = firstOpenDay();
    await t.db.execute(sql`update jokes set status = 'scheduled', deliver_on = ${addDays(open, 30)} where id = ${b.id}`);
    expect((await t.http.post(`/v1/me/jokes/${b.id}/withdraw`).set(auth).expect(200)).body).toMatchObject({
      status: "withdrawn",
      deliverOn: null,
    });

    const c = (await t.http.post("/v1/me/jokes").set(auth).send(joke({ punchline: "Now" })).expect(201)).body;
    await t.db.execute(sql`update jokes set status = 'scheduled', deliver_on = ${addDays(open, -60)} where id = ${c.id}`);
    const late = await t.http.post(`/v1/me/jokes/${c.id}/withdraw`).set(auth).expect(409);
    expect(late.body.code).toBe("cannot_withdraw");
  });

  it("keeps jokes private to their writer and needs the writer role", async () => {
    const a = (await t.http.post("/v1/me/jokes").set(auth).send(joke()).expect(201)).body;
    const other = await signIn(t, "reader@example.com");
    const oauth = { Authorization: `Bearer ${other.token}` };
    await t.http.post("/v1/me/onboarding").set(oauth).send(onboardingBody({ handle: "reader_1" })).expect(200);
    const forbidden = await t.http.get("/v1/me/jokes").set(oauth).expect(403);
    expect(forbidden.body.code).toBe("role_required");
    await t.http.put("/v1/me/roles").set(oauth).send({ roles: ["reader", "writer"] }).expect(200);
    await t.http.get(`/v1/me/jokes/${a.id}`).set(oauth).expect(404);
    await t.http.post(`/v1/me/jokes/${a.id}/withdraw`).set(oauth).expect(404);
  });
});
