import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDb, signUp } from "./app";
import type { TestApp } from "./app";

// A real 1x1 PNG.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201e2234b6a0000000049454e44ae426082",
  "hex",
);

describe("image uploads (local storage)", () => {
  let t: TestApp;
  let writer: { Authorization: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.db);
    writer = (await signUp(t, "artist@example.com", { roles: ["writer"] })).auth;
  });

  const upload = async (body: Buffer, contentType = "image/png", auth = writer) => {
    const res = await t.http.post("/v1/me/uploads").set(auth).send({ contentType, size: body.length }).expect(201);
    const u = res.body as { key: string; url: string; headers: Record<string, string> };
    expect(u.url.startsWith("/v1/uploads/local?")).toBe(true);
    await t.http.put(u.url).set(u.headers).send(body).expect(204);
    return u;
  };

  it("uploads an image, submits it as a joke and serves it", async () => {
    const u = await upload(PNG);
    expect(u.key).toMatch(/^jokes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
    const joke = await t.http
      .post("/v1/me/jokes")
      .set(writer)
      .send({ kind: "image", imageKey: u.key, imageAlt: "A very small square", caption: "Pixel perfect", original: true })
      .expect(201);
    expect(joke.body).toMatchObject({ kind: "image", imageUrl: `/media/${u.key}`, imageAlt: "A very small square", setup: null });

    const media = await t.http.get(`/media/${u.key}`).expect(200);
    expect(media.headers["content-type"]).toBe("image/png");
    expect(media.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(media.body as Buffer, PNG)).toBe(0);
  });

  it("only accepts the exact type and size the URL was signed for", async () => {
    const res = await t.http.post("/v1/me/uploads").set(writer).send({ contentType: "image/png", size: PNG.length }).expect(201);
    await t.http.put(res.body.url).set("Content-Type", "image/gif").send(PNG).expect(400);
    await t.http.put(res.body.url).set(res.body.headers).send(Buffer.concat([PNG, PNG])).expect(400);
    await t.http.put(res.body.url.replace(/sig=[^&]+/, "sig=forged")).set(res.body.headers).send(PNG).expect(403);
    await t.http.put(res.body.url.replace(/size=\d+/, "size=999")).set(res.body.headers).send(PNG).expect(403);
  });

  it("refuses other people's uploads, missing files and files that aren't images", async () => {
    const other = (await signUp(t, "other@example.com", { roles: ["writer"] })).auth;
    const theirs = await upload(PNG, "image/png", other);
    const base = { kind: "image", imageAlt: "Something", original: true };
    const stolen = await t.http.post("/v1/me/jokes").set(writer).send({ ...base, imageKey: theirs.key }).expect(422);
    expect(stolen.body.code).toBe("invalid_image");

    const pending = await t.http.post("/v1/me/uploads").set(writer).send({ contentType: "image/png", size: 10 }).expect(201);
    await t.http.post("/v1/me/jokes").set(writer).send({ ...base, imageKey: pending.body.key }).expect(422);

    const fake = await upload(Buffer.from("<script>alert(1)</script>"), "image/png");
    const res = await t.http.post("/v1/me/jokes").set(writer).send({ ...base, imageKey: fake.key }).expect(422);
    expect(res.body.title).toBe("That file isn't a valid image.");
  });

  it("validates the request and is for writers only", async () => {
    await t.http.post("/v1/me/uploads").set(writer).send({ contentType: "image/svg+xml", size: 10 }).expect(422);
    await t.http.post("/v1/me/uploads").set(writer).send({ contentType: "image/png", size: 11 * 1024 * 1024 }).expect(422);
    const reader = (await signUp(t, "reader@example.com")).auth;
    await t.http.post("/v1/me/uploads").set(reader).send({ contentType: "image/png", size: 10 }).expect(403);
    await t.http.post("/v1/me/jokes").set(writer).send({ kind: "image", imageKey: "x", original: true }).expect(422);
  });
});
