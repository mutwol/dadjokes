import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDb, signIn } from "./app";
import type { TestApp } from "./app";

describe("auth", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.db));

  it("signs up with an emailed code and returns a session plus refresh cookie", async () => {
    const res = await t.http.post("/v1/auth/email/start").send({ email: "  New@Example.com " }).expect(202);
    expect(res.body).toEqual({ expiresInSeconds: 600, resendAfterSeconds: 30 });

    const code = t.mail.codes.get("new@example.com");
    expect(code).toMatch(/^\d{6}$/);

    const verify = await t.http.post("/v1/auth/email/verify").send({ email: "new@example.com", code }).expect(200);
    expect(verify.body.isNew).toBe(true);
    expect(verify.body.accessToken).toBeTruthy();
    expect(verify.body.user).toMatchObject({ email: "new@example.com", roles: [], onboarded: false });
    const cookie = (verify.headers["set-cookie"] as unknown as string[])[0];
    expect(cookie).toMatch(/^dj_refresh=.+; Path=\/v1\/auth; Expires=.+; HttpOnly; SameSite=Lax/);
  });

  it("marks returning people as not new", async () => {
    await signIn(t, "back@example.com");
    // A new code can only be requested after the resend wait.
    await t.db.execute(sql`update email_codes set created_at = now() - interval '1 minute'`);
    const again = await signIn(t, "back@example.com");
    expect(again.isNew).toBe(false);
  });

  it("rejects wrong codes and locks after five tries", async () => {
    await t.http.post("/v1/auth/email/start").send({ email: "a@example.com" }).expect(202);
    const wrong = t.mail.codes.get("a@example.com") === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await t.http.post("/v1/auth/email/verify").send({ email: "a@example.com", code: wrong }).expect(400);
      expect(res.body.code).toBe("code_invalid");
      expect(res.headers["content-type"]).toContain("application/problem+json");
    }
    const locked = await t.http
      .post("/v1/auth/email/verify")
      .send({ email: "a@example.com", code: t.mail.codes.get("a@example.com") })
      .expect(429);
    expect(locked.body.code).toBe("code_locked");
  });

  it("makes people wait before asking for another code", async () => {
    await t.http.post("/v1/auth/email/start").send({ email: "b@example.com" }).expect(202);
    const res = await t.http.post("/v1/auth/email/start").send({ email: "b@example.com" }).expect(429);
    expect(res.body.code).toBe("resend_too_soon");
  });

  it("validates input as 422 with field errors", async () => {
    const res = await t.http.post("/v1/auth/email/verify").send({ email: "nope", code: "12" }).expect(422);
    expect(res.body.code).toBe("validation_failed");
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(["code", "email"]);
  });

  it("rotates refresh tokens and revokes the session when an old one is replayed", async () => {
    const { cookie } = await signIn(t, "c@example.com");
    const first = await t.http.post("/v1/auth/refresh").set("Cookie", cookie).expect(200);
    expect(first.body.accessToken).toBeTruthy();
    const rotated = (first.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    expect(rotated).not.toBe(cookie);

    // Replaying the first cookie looks like theft: the session is revoked...
    const replay = await t.http.post("/v1/auth/refresh").set("Cookie", cookie).expect(401);
    expect(replay.body.code).toBe("session_expired");
    // ...so even the newest cookie stops working.
    await t.http.post("/v1/auth/refresh").set("Cookie", rotated).expect(401);
  });

  it("signs out", async () => {
    const { cookie } = await signIn(t, "d@example.com");
    await t.http.post("/v1/auth/logout").set("Cookie", cookie).expect(204);
    await t.http.post("/v1/auth/refresh").set("Cookie", cookie).expect(401);
  });

  it("requires a valid access token on private routes", async () => {
    expect((await t.http.get("/v1/me").expect(401)).body.code).toBe("unauthenticated");
    expect((await t.http.get("/v1/me").set("Authorization", "Bearer nonsense").expect(401)).body.code).toBe(
      "token_invalid",
    );
  });
});
