import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, resetDb, signUp } from "./app";
import type { TestApp } from "./app";

/**
 * The S3 driver against a real S3-compatible server. Runs when TEST_S3_ENDPOINT
 * points at one with an empty bucket, e.g. MinIO or `moto_server`:
 *   TEST_S3_ENDPOINT=http://localhost:5055 TEST_S3_BUCKET=daddy-jokes-test pnpm test
 */
const endpoint = process.env.TEST_S3_ENDPOINT;
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201e2234b6a0000000049454e44ae426082",
  "hex",
);

describe.skipIf(!endpoint)("image uploads (S3 storage)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: endpoint,
      S3_BUCKET: process.env.TEST_S3_BUCKET ?? "daddy-jokes-test",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? "test",
      S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? "test",
      S3_FORCE_PATH_STYLE: true,
      MEDIA_BASE_URL: "https://media.example.com",
    });
    await resetDb(t.db);
  });
  afterAll(() => t.close());

  it("uploads straight to the bucket with a signed URL that pins type and size", async () => {
    const { auth } = await signUp(t, "s3writer@example.com", { roles: ["writer"] });
    const res = await t.http.post("/v1/me/uploads").set(auth).send({ contentType: "image/png", size: PNG.length }).expect(201);
    const { url, headers, key } = res.body as { url: string; headers: Record<string, string>; key: string };
    expect(url.startsWith(endpoint!)).toBe(true);
    // The signature covers type and size, so S3 and R2 refuse anything else. (moto doesn't
    // check signatures; the API also re-checks the stored file when the joke is submitted.)
    expect(new URL(url).searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
      expect.arrayContaining(["content-length", "content-type", "host"]),
    );
    const put = await fetch(url, { method: "PUT", headers, body: PNG });
    expect(put.status).toBe(200);

    const joke = await t.http
      .post("/v1/me/jokes")
      .set(auth)
      .send({ kind: "image", imageKey: key, imageAlt: "A tiny square", original: true })
      .expect(201);
    expect(joke.body.imageUrl).toBe(`https://media.example.com/${key}`);
  });
});
