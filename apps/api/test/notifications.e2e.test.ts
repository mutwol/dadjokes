import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import webpush from "web-push";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, firstOpenDay } from "../src/common/dates";
import { AppConfig } from "../src/config/config.module";
import { DB } from "../src/db/db.module";
import type { Db } from "../src/db/db.module";
import { PushProcessor } from "../src/notifications/push.processor";
import { createTestApp, resetDb, signUp } from "./app";
import type { TestApp } from "./app";

const vapid = webpush.generateVAPIDKeys();

describe("activity feed and push", () => {
  let t: TestApp;
  let writer: { auth: { Authorization: string }; userId: string };
  let fan: { auth: { Authorization: string }; userId: string };

  beforeAll(async () => {
    t = await createTestApp({ VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.db);
    writer = await signUp(t, "author@example.com", { roles: ["writer"], handle: "author_1" });
    fan = await signUp(t, "fanmail@example.com", { handle: "fan_1" });
  });

  const feed = async (auth: { Authorization: string }) => (await t.http.get("/v1/me/activity").set(auth).expect(200)).body;

  it("tells writers about new subscribers once, curation decisions and comments", async () => {
    await t.http.put(`/v1/me/subscriptions/${writer.userId}`).set(fan.auth).expect(204);
    await t.http.delete(`/v1/me/subscriptions/${writer.userId}`).set(fan.auth).expect(204);
    await t.http.put(`/v1/me/subscriptions/${writer.userId}`).set(fan.auth).expect(204);

    const curator = (await signUp(t, "boss@example.com", { staff: ["curator"] })).auth;
    const a = (await t.http.post("/v1/me/jokes").set(writer.auth).send({ kind: "text", setup: "Knock knock.", punchline: "Interrupting cow.", original: true }).expect(201)).body;
    const b = (await t.http.post("/v1/me/jokes").set(writer.auth).send({ kind: "text", setup: "A pun walks in.", punchline: "Ouch.", original: true }).expect(201)).body;
    const day = addDays(firstOpenDay(), 45);
    await t.http.post(`/v1/curation/jokes/${a.id}/schedule`).set(curator).send({ deliverOn: day }).expect(200);
    await t.http.post(`/v1/curation/jokes/${b.id}/decline`).set(curator).send({ reason: "unclear" }).expect(200);

    const res = await feed(writer.auth);
    expect(res.unread).toBe(3);
    expect(res.data.map((n: { title: string }) => n.title)).toEqual([
      "Not picked this time",
      "Your joke was picked!",
      "Cyrus Mutwol subscribed to you",
    ]);
    expect(res.data[1]).toMatchObject({ body: `“Knock knock.” goes out on ${day}.`, url: "/studio", read: false });
    expect(res.data[2].actor).toMatchObject({ handle: "fan_1" });

    await t.http.post("/v1/me/activity/read").set(writer.auth).expect(204);
    expect((await feed(writer.auth)).unread).toBe(0);
    expect((await feed(fan.auth)).data).toEqual([]);
  });

  it("notifies a writer of comments from others, not their own", async () => {
    await t.http.patch("/v1/me/preferences").set(fan.auth).send({ deliveryHour: 0 }).expect(200);
    const today = await t.http.get("/v1/me/today").set(fan.auth).expect(200);
    const joke = (await t.http.post(`/v1/me/deliveries/${today.body.date}/open`).set(fan.auth).expect(200)).body;
    await t.db.execute(sql`update jokes set creator_id = ${writer.userId} where id = ${joke.id}`);
    await t.http.post(`/v1/jokes/${joke.id}/comments`).set(fan.auth).send({ body: "This one got me." }).expect(201);
    await t.http.post(`/v1/jokes/${joke.id}/comments`).set(writer.auth).send({ body: "Thanks!" }).expect(201);
    const res = await feed(writer.auth);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ type: "comment", body: "This one got me.", url: `/joke/${joke.id}` });
  });

  it("sends encrypted Web Push and forgets browsers that have gone", async () => {
    expect((await t.http.get("/v1/push/config").expect(200)).body).toEqual({ enabled: true, publicKey: vapid.publicKey });

    // A stand-in push service over HTTPS (web-push only speaks HTTPS) with a throwaway certificate.
    // The first endpoint accepts; the second says the browser has gone.
    const dir = mkdtempSync(path.join(tmpdir(), "push-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=127.0.0.1", "-days", "1",
      "-keyout", `${dir}/key.pem`, "-out", `${dir}/cert.pem`], { stdio: "ignore" });
    const received: { path: string; headers: Record<string, unknown>; bytes: number }[] = [];
    const server = createServer({ key: readFileSync(`${dir}/key.pem`), cert: readFileSync(`${dir}/cert.pem`) }, (req, res) => {
      let bytes = 0;
      req.on("data", (c: Buffer) => (bytes += c.length));
      req.on("end", () => {
        received.push({ path: req.url ?? "", headers: req.headers, bytes });
        res.writeHead(req.url === "/gone" ? 410 : 201).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const browser = webpush.generateVAPIDKeys(); // any P-256 key works as the browser's key here
    const keys = { p256dh: browser.publicKey, auth: "c2VjcmV0c2VjcmV0MTIzNA" };
    await t.http.put("/v1/me/push-subscriptions").set(writer.auth).send({ endpoint: `${base}/ok`, keys }).expect(204);
    await t.http.put("/v1/me/push-subscriptions").set(writer.auth).send({ endpoint: `${base}/gone`, keys }).expect(204);
    await t.http.put("/v1/me/push-subscriptions").set(writer.auth).send({ endpoint: "not a url", keys }).expect(422);

    const processor = new PushProcessor(t.app.get<Db>(DB), t.app.get(AppConfig));
    const tls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // only to trust the throwaway certificate above
    const result = await processor
      .process({ data: { userId: writer.userId, payload: { title: "Hello", url: "/" } } } as never)
      .finally(() => {
        if (tls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = tls;
        server.close();
      });

    expect(result).toEqual({ sent: 1, removed: 1 });
    expect(received.map((r) => r.path).sort()).toEqual(["/gone", "/ok"]);
    const ok = received.find((r) => r.path === "/ok")!;
    expect(ok.headers["content-encoding"]).toBe("aes128gcm");
    expect(String(ok.headers.authorization)).toMatch(/^vapid t=/);
    expect(ok.bytes).toBeGreaterThan(0);
    const left = await t.db.execute<{ endpoint: string }>(sql`select endpoint from push_subscriptions`);
    expect(left.rows.map((r) => r.endpoint)).toEqual([`${base}/ok`]);

    await t.http.delete("/v1/me/push-subscriptions").set(writer.auth).send({ endpoint: `${base}/ok` }).expect(204);
    expect((await t.db.execute(sql`select 1 from push_subscriptions`)).rows).toHaveLength(0);
  });
});
