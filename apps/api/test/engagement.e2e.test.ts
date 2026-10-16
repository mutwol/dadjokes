import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EngagementService } from "../src/engagement/engagement.service";
import { createTestApp, resetDb, signUp } from "./app";
import type { TestApp } from "./app";

describe("reactions, comments, reports and live counts", () => {
  let t: TestApp;
  let alice: { Authorization: string };
  let bob: { Authorization: string };
  let jokeId: string;
  let date: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  /** A reader who has opened today's joke. */
  const openedReader = async (email: string) => {
    const { auth, userId } = await signUp(t, email);
    await t.http.patch("/v1/me/preferences").set(auth).send({ deliveryHour: 0 }).expect(200);
    const today = await t.http.get("/v1/me/today").set(auth).expect(200);
    date = today.body.date;
    const joke = await t.http.post(`/v1/me/deliveries/${date}/open`).set(auth).expect(200);
    jokeId = joke.body.id;
    return { auth, userId };
  };

  beforeEach(async () => {
    await resetDb(t.db);
    alice = (await openedReader("alice@example.com")).auth;
    bob = (await openedReader("bobby@example.com")).auth;
  });

  it("keeps one reaction per reader, which can change or be taken back", async () => {
    const a = await t.http.put(`/v1/jokes/${jokeId}/reaction`).set(alice).send({ kind: "laugh" }).expect(200);
    expect(a.body).toMatchObject({ reactions: { laugh: 1, groan: 0 }, myReaction: "laugh", views: 2 });
    await t.http.put(`/v1/jokes/${jokeId}/reaction`).set(bob).send({ kind: "groan" }).expect(200);
    const changed = await t.http.put(`/v1/jokes/${jokeId}/reaction`).set(alice).send({ kind: "groan" }).expect(200);
    expect(changed.body.reactions).toEqual({ laugh: 0, groan: 2, facepalm: 0, drum: 0 });
    const gone = await t.http.delete(`/v1/jokes/${jokeId}/reaction`).set(alice).expect(200);
    expect(gone.body).toMatchObject({ reactions: { groan: 1 }, myReaction: null });

    const joke = await t.http.get(`/v1/jokes/${jokeId}`).set(bob).expect(200);
    expect(joke.body).toMatchObject({ myReaction: "groan", stats: { reactions: { groan: 1 } } });
    await t.http.put(`/v1/jokes/${jokeId}/reaction`).set(alice).send({ kind: "meh" }).expect(422);
  });

  it("only lets people who opened the joke react, and not its writer", async () => {
    const stranger = (await signUp(t, "stranger@example.com")).auth;
    await t.http.put(`/v1/jokes/${jokeId}/reaction`).set(stranger).send({ kind: "laugh" }).expect(404);
    const writer = await signUp(t, "jokewriter@example.com", { roles: ["writer"] });
    await t.db.execute(sql`update jokes set creator_id = ${writer.userId} where id = ${jokeId}`);
    const own = await t.http.put(`/v1/jokes/${jokeId}/reaction`).set(writer.auth).send({ kind: "laugh" }).expect(422);
    expect(own.body.code).toBe("cannot_react_own");
  });

  it("lists comments newest first, and lets authors and curators delete them", async () => {
    for (const body of ["First!", "Groan.", "Ba-dum-tss"]) {
      await t.http.post(`/v1/jokes/${jokeId}/comments`).set(alice).send({ body }).expect(201);
    }
    const mine = await t.http.post(`/v1/jokes/${jokeId}/comments`).set(bob).send({ body: "  Bob was here  " }).expect(201);
    expect(mine.body).toMatchObject({ body: "Bob was here", isMine: true, canDelete: true, author: { handle: "bobby" } });

    const page = await t.http.get(`/v1/jokes/${jokeId}/comments?limit=3`).set(alice).expect(200);
    expect(page.body.data.map((c: { body: string }) => c.body)).toEqual(["Bob was here", "Ba-dum-tss", "Groan."]);
    expect(page.body.data[0]).toMatchObject({ isMine: false, canDelete: false });
    const rest = await t.http.get(`/v1/jokes/${jokeId}/comments?cursor=${page.body.nextCursor}`).set(alice).expect(200);
    expect(rest.body.data.map((c: { body: string }) => c.body)).toEqual(["First!"]);

    await t.http.delete(`/v1/comments/${mine.body.id}`).set(alice).expect(404);
    await t.http.delete(`/v1/comments/${mine.body.id}`).set(bob).expect(204);
    await t.http.delete(`/v1/comments/${mine.body.id}`).set(bob).expect(204);
    const curator = (await signUp(t, "mod@example.com", { staff: ["curator"] })).auth;
    await t.http.delete(`/v1/comments/${rest.body.data[0].id}`).set(curator).expect(204);
    expect((await t.http.get(`/v1/jokes/${jokeId}`).set(alice).expect(200)).body.stats.comments).toBe(2);

    await t.http.post(`/v1/jokes/${jokeId}/comments`).set(alice).send({ body: "   " }).expect(422);
    await t.http.post(`/v1/jokes/${jokeId}/comments`).set(alice).send({ body: "x".repeat(281) }).expect(422);
  });

  it("groups reports for curators, who can take a joke down", async () => {
    await t.http.post("/v1/reports").set(alice).send({ jokeId, reason: "copied", note: "Seen it on a mug" }).expect(204);
    await t.http.post("/v1/reports").set(alice).send({ jokeId, reason: "copied" }).expect(204);
    await t.http.post("/v1/reports").set(bob).send({ jokeId, reason: "offensive" }).expect(204);
    const c = await t.http.post(`/v1/jokes/${jokeId}/comments`).set(alice).send({ body: "Buy cheap watches" }).expect(201);
    await t.http.post("/v1/reports").set(bob).send({ commentId: c.body.id, reason: "spam" }).expect(204);
    await t.http.post("/v1/reports").set(bob).send({ jokeId, commentId: c.body.id, reason: "spam" }).expect(422);

    const curator = (await signUp(t, "mod@example.com", { staff: ["curator"] })).auth;
    const list = await t.http.get("/v1/curation/reports").set(curator).expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data[0]).toMatchObject({
      target: "joke",
      jokeId,
      reports: 2,
      reasons: { copied: 1, offensive: 1 },
      notes: ["Seen it on a mug"],
      authorHandle: "wanjiru_puns",
    });
    expect(list.body.data[1]).toMatchObject({ target: "comment", preview: "Buy cheap watches" });

    await t.http.post("/v1/curation/reports/resolve").set(curator).send({ commentId: c.body.id, action: "remove" }).expect(204);
    await t.http.post("/v1/curation/reports/resolve").set(curator).send({ jokeId, action: "remove" }).expect(204);
    expect((await t.http.get("/v1/curation/reports").set(curator).expect(200)).body.data).toEqual([]);

    // Taken down: readers lose it, its Today card goes, and it can't be reopened.
    await t.http.get(`/v1/jokes/${jokeId}`).set(alice).expect(404);
    const today = await t.http.get("/v1/me/today").set(alice).expect(200);
    expect(today.body.current).toBeNull();
    expect((await t.http.post(`/v1/me/deliveries/${date}/open`).set(alice).expect(410)).body.code).toBe("joke_removed");
    await t.http.get("/v1/curation/reports").set(alice).expect(403);
  });

  it("streams live counts to people watching a joke", async () => {
    const server = t.app.getHttpServer();
    if (!server.listening) await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/v1/jokes/${jokeId}/live`, { headers: alice, signal: ctrl.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const events: { reactions: { laugh: number }; comments: number }[] = [];
    let buf = "";
    const next = async () => {
      for (;;) {
        const m = buf.match(/event: stats\ndata: (.*)\n\n/);
        if (m) {
          buf = buf.slice(m.index! + m[0].length);
          events.push(JSON.parse(m[1]));
          return events.at(-1)!;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended");
        buf += new TextDecoder().decode(value);
      }
    };
    expect((await next()).reactions.laugh).toBe(0);
    await t.http.put(`/v1/jokes/${jokeId}/reaction`).set(bob).send({ kind: "laugh" }).expect(200);
    await t.http.post(`/v1/jokes/${jokeId}/comments`).set(bob).send({ body: "Live!" }).expect(201);
    // Changes close together arrive as one or two updates; wait for both to show.
    let latest = await next();
    while (latest.comments < 1) latest = await next();
    expect(latest).toMatchObject({ reactions: { laugh: 1 }, comments: 1 });
    ctrl.abort();

    const stranger = (await signUp(t, "stranger@example.com")).auth;
    const denied = await fetch(`http://127.0.0.1:${port}/v1/jokes/${jokeId}/live`, { headers: stranger });
    expect(denied.status).toBe(404);
  });

  it("records replays and shares, and rolls stats up for Studio", async () => {
    const res = await t.http
      .post("/v1/events")
      .set(alice)
      .send({ events: [{ jokeId, type: "replay" }, { jokeId, type: "share" }, { jokeId: "00000000-0000-4000-8000-000000000000", type: "share" }] })
      .expect(202);
    expect(res.body.accepted).toBe(2);
    await t.http.put(`/v1/jokes/${jokeId}/reaction`).set(bob).send({ kind: "drum" }).expect(200);

    await t.app.get(EngagementService).rollup();
    await t.app.get(EngagementService).rollup(); // safe to repeat
    const [row] = (
      await t.db.execute<{ opens: number; replays: number; shares: number; reactions: number }>(
        sql`select opens, replays, shares, reactions from joke_stats_daily where joke_id = ${jokeId}`,
      )
    ).rows;
    expect(row).toEqual({ opens: 2, replays: 1, shares: 1, reactions: 1 });

    const writer = await signUp(t, "stats-writer@example.com", { roles: ["writer"] });
    await t.db.execute(sql`update jokes set creator_id = ${writer.userId} where id = ${jokeId}`);
    const daily = await t.http.get("/v1/me/studio/daily").set(writer.auth).expect(200);
    expect(daily.body.data).toHaveLength(14);
    expect(daily.body.data.at(-1)).toMatchObject({ opens: 2, reactions: 1 });
    const mine = await t.http.get(`/v1/me/jokes/${jokeId}`).set(writer.auth).expect(200);
    expect(mine.body.stats).toEqual({ reached: 2, opened: 2, reactions: 1, comments: 0 });
  });
});
