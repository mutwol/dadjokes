import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, onboardingBody, resetDb, signIn } from "./app";
import type { TestApp } from "./app";

describe("me and onboarding", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.db));

  const writerId = async (token: string, handle: string) =>
    (await t.http.get(`/v1/creators/${handle}`).set("Authorization", `Bearer ${token}`).expect(200)).body.id as string;

  it("saves the whole onboarding in one call", async () => {
    const { token } = await signIn(t, "both@example.com");
    const dan = await writerId(token, "grillmaster_dan");

    const res = await t.http
      .post("/v1/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send(
        onboardingBody({
          roles: ["reader", "writer", "writer"],
          topics: ["wordplay", "food"],
          jokeOrigin: "local",
          bio: "Groan-maker",
          following: [dan],
          payout: { method: "mpesa", phone: "0712 345 678" },
        }),
      )
      .expect(200);

    expect(res.body).toMatchObject({
      name: "Cyrus Mutwol",
      handle: "cyrus_m",
      timezone: "Africa/Nairobi",
      roles: ["reader", "writer"],
      preferences: { deliveryHour: 7, jokeOrigin: "local", topics: expect.arrayContaining(["wordplay", "food"]) },
      payout: { method: "mpesa", phoneLast3: "678", verified: false },
      onboarded: true,
    });
    const subs = await t.http.get("/v1/me/subscriptions").set("Authorization", `Bearer ${token}`).expect(200);
    expect(subs.body.data.map((c: { handle: string }) => c.handle)).toEqual(["grillmaster_dan"]);
  });

  it("can only be completed once", async () => {
    const { token } = await signIn(t, "once@example.com");
    await t.http.post("/v1/me/onboarding").set("Authorization", `Bearer ${token}`).send(onboardingBody()).expect(200);
    const again = await t.http.post("/v1/me/onboarding").set("Authorization", `Bearer ${token}`).send(onboardingBody()).expect(409);
    expect(again.body.code).toBe("already_onboarded");
  });

  it("saves nothing when part of it fails", async () => {
    const { token } = await signIn(t, "atomic@example.com");
    const res = await t.http
      .post("/v1/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send(onboardingBody({ topics: ["wordplay", "astrophysics"] }))
      .expect(422);
    expect(res.body.code).toBe("unknown_topic");
    const me = await t.http.get("/v1/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(me.body).toMatchObject({ handle: null, roles: [], onboarded: false });
  });

  it("rejects taken and reserved handles", async () => {
    const { token } = await signIn(t, "handle@example.com");
    const taken = await t.http
      .post("/v1/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send(onboardingBody({ handle: "wanjiru_puns" }))
      .expect(409);
    expect(taken.body.code).toBe("handle_taken");

    const check = await t.http.get("/v1/handles/daddy/availability").set("Authorization", `Bearer ${token}`).expect(200);
    expect(check.body).toMatchObject({ available: false, reason: "reserved", suggestion: "daddy_jokes" });
    const free = await t.http.get("/v1/handles/cyrus_m/availability").set("Authorization", `Bearer ${token}`).expect(200);
    expect(free.body).toEqual({ handle: "cyrus_m", available: true });
  });

  it("only lets writers add a payout method", async () => {
    const { token } = await signIn(t, "reader@example.com");
    const res = await t.http
      .post("/v1/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send(onboardingBody({ roles: ["reader"], payout: { method: "mpesa", phone: "0712345678" } }))
      .expect(422);
    expect(res.body.code).toBe("payout_needs_writer");
  });

  it("switches roles, keeping at least one", async () => {
    const { token } = await signIn(t, "switch@example.com");
    const auth = { Authorization: `Bearer ${token}` };
    await t.http.post("/v1/me/onboarding").set(auth).send(onboardingBody({ roles: ["reader"] })).expect(200);

    const forbidden = await t.http.put("/v1/me/payout-method").set(auth).send({ method: "mpesa", phone: "0712345678" }).expect(403);
    expect(forbidden.body.code).toBe("role_required");

    const both = await t.http.put("/v1/me/roles").set(auth).send({ roles: ["reader", "writer"] }).expect(200);
    expect(both.body.roles).toEqual(["reader", "writer"]);
    // The role change applies immediately, without a new token.
    await t.http.put("/v1/me/payout-method").set(auth).send({ method: "mpesa", phone: "+254 712 345 678" }).expect(200);

    const empty = await t.http.put("/v1/me/roles").set(auth).send({ roles: [] }).expect(422);
    expect(empty.body.errors).toEqual([{ path: "roles", message: "Keep at least one on." }]);
  });

  it("validates Kenyan phone numbers", async () => {
    const { token } = await signIn(t, "phone@example.com");
    const auth = { Authorization: `Bearer ${token}` };
    await t.http.post("/v1/me/onboarding").set(auth).send(onboardingBody({ roles: ["writer"] })).expect(200);
    const bad = await t.http.put("/v1/me/payout-method").set(auth).send({ method: "mpesa", phone: "12345" }).expect(422);
    expect(bad.body.errors[0].path).toBe("phone");
  });

  it("updates profile and preferences separately", async () => {
    const { token } = await signIn(t, "prefs@example.com");
    const auth = { Authorization: `Bearer ${token}` };
    await t.http.post("/v1/me/onboarding").set(auth).send(onboardingBody()).expect(200);

    const prefs = await t.http.patch("/v1/me/preferences").set(auth).send({ deliveryHour: 20, topics: [] }).expect(200);
    expect(prefs.body.preferences).toEqual({ deliveryHour: 20, jokeOrigin: "everywhere", topics: [] });

    const profile = await t.http.patch("/v1/me").set(auth).send({ bio: "New bio", timezone: "Europe/London" }).expect(200);
    expect(profile.body).toMatchObject({ bio: "New bio", timezone: "Europe/London", handle: "cyrus_m" });

    await t.http.patch("/v1/me").set(auth).send({ timezone: "Mars/Olympus" }).expect(422);
  });
});

describe("handle race", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.db));

  it("returns handle_taken when the database catches a duplicate", async () => {
    const a = await signIn(t, "race-a@example.com");
    const b = await signIn(t, "race-b@example.com");
    const results = await Promise.all(
      [a, b].map((s) =>
        t.http.post("/v1/me/onboarding").set("Authorization", `Bearer ${s.token}`).send(onboardingBody({ handle: "same_name" })),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe("handle_taken");
  });
});
