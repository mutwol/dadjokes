import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, onboardingBody, resetDb, signIn } from "./app";
import type { TestApp } from "./app";

describe("creators and subscriptions", () => {
  let t: TestApp;
  let auth: { Authorization: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.db);
    const { token } = await signIn(t, "viewer@example.com");
    auth = { Authorization: `Bearer ${token}` };
    await t.http.post("/v1/me/onboarding").set(auth).send(onboardingBody()).expect(200);
  });

  it("lists writers by subscriber count, with cursor paging", async () => {
    const first = await t.http.get("/v1/creators?limit=2").set(auth).expect(200);
    expect(first.body.data.map((c: { handle: string }) => c.handle)).toEqual(["grillmaster_dan", "wanjiru_puns"]);
    expect(first.body.data[0]).toMatchObject({ subscriberCount: 31, isSubscribed: false, country: "United Kingdom" });
    expect(first.body.nextCursor).toBeTruthy();

    const second = await t.http.get(`/v1/creators?limit=2&cursor=${first.body.nextCursor}`).set(auth).expect(200);
    expect(second.body.data.map((c: { handle: string }) => c.handle)).toEqual(["amara_says_hi", "baba_otieno"]);

    const last = await t.http.get(`/v1/creators?limit=2&cursor=${second.body.nextCursor}`).set(auth).expect(200);
    expect(last.body.data).toHaveLength(1);
    expect(last.body.nextCursor).toBeNull();
  });

  it("filters by country and rejects bad cursors", async () => {
    const kenya = await t.http.get("/v1/creators?country=Kenya").set(auth).expect(200);
    expect(kenya.body.data.map((c: { handle: string }) => c.handle).sort()).toEqual(["baba_otieno", "wanjiru_puns"]);
    expect((await t.http.get("/v1/creators?cursor=garbage").set(auth).expect(400)).body.code).toBe("invalid_cursor");
    expect((await t.http.get("/v1/creators?limit=500").set(auth).expect(422)).body.code).toBe("validation_failed");
  });

  it("subscribes and unsubscribes, safely repeatable", async () => {
    const dan = (await t.http.get("/v1/creators/grillmaster_dan").set(auth).expect(200)).body;
    await t.http.put(`/v1/me/subscriptions/${dan.id}`).set(auth).expect(204);
    await t.http.put(`/v1/me/subscriptions/${dan.id}`).set(auth).expect(204);

    const after = (await t.http.get("/v1/creators/grillmaster_dan").set(auth).expect(200)).body;
    expect(after).toMatchObject({ subscriberCount: dan.subscriberCount + 1, isSubscribed: true });

    await t.http.delete(`/v1/me/subscriptions/${dan.id}`).set(auth).expect(204);
    await t.http.delete(`/v1/me/subscriptions/${dan.id}`).set(auth).expect(204);
    expect((await t.http.get("/v1/me/subscriptions").set(auth).expect(200)).body.data).toEqual([]);
  });

  it("refuses unknown writers, non-writers and yourself", async () => {
    await t.http.put("/v1/me/subscriptions/00000000-0000-4000-8000-000000000000").set(auth).expect(404);
    await t.http.put("/v1/me/subscriptions/not-a-uuid").set(auth).expect(400);
    const me = (await t.http.get("/v1/me").set(auth).expect(200)).body;
    await t.http.put("/v1/me/roles").set(auth).send({ roles: ["writer"] }).expect(200);
    const self = await t.http.put(`/v1/me/subscriptions/${me.id}`).set(auth).expect(422);
    expect(self.body.code).toBe("cannot_subscribe_self");
  });

  it("keeps the viewer out of their own writer list", async () => {
    await t.http.put("/v1/me/roles").set(auth).send({ roles: ["reader", "writer"] }).expect(200);
    const list = await t.http.get("/v1/creators?limit=50").set(auth).expect(200);
    expect(list.body.data.map((c: { handle: string }) => c.handle)).not.toContain("cyrus_m");
  });
});
