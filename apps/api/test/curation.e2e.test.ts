import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, firstOpenDay } from "../src/common/dates";
import { createTestApp, resetDb, signUp } from "./app";
import type { TestApp } from "./app";

const joke = (overrides: Record<string, unknown> = {}) => ({
  kind: "text",
  setup: "What do you call a dinosaur with an extensive vocabulary?",
  punchline: "A thesaurus.",
  topics: ["wordplay"],
  original: true,
  ...overrides,
});

describe("curation", () => {
  let t: TestApp;
  let curator: { Authorization: string };
  let writer: { Authorization: string };
  const open = firstOpenDay();
  // Clear of the seed's test jokes, which sit within a few days of today.
  const day = addDays(open, 40);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.db);
    curator = (await signUp(t, "curator@example.com", { staff: ["curator"] })).auth;
    writer = (await signUp(t, "writer@example.com", { roles: ["writer"] })).auth;
  });

  const submit = async (overrides = {}) =>
    (await t.http.post("/v1/me/jokes").set(writer).send(joke(overrides)).expect(201)).body as { id: string };

  it("shows the queue oldest first, with the writer and the waiting count", async () => {
    const a = await submit();
    await submit({ punchline: "A dino-saurus." });
    const res = await t.http.get("/v1/curation/queue?limit=1").set(curator).expect(200);
    // The seed's four in-review test jokes are older than these two.
    expect(res.body.waiting).toBe(6);
    let all = res.body.data;
    let cursor = res.body.nextCursor;
    while (cursor) {
      const next = await t.http.get(`/v1/curation/queue?limit=5&cursor=${cursor}`).set(curator).expect(200);
      all = [...all, ...next.body.data];
      cursor = next.body.nextCursor;
    }
    expect(all).toHaveLength(6);
    expect(all.at(-2).joke).toMatchObject({ id: a.id, creator: { handle: "writer" }, topics: ["wordplay"] });
  });

  it("flags possible copies, including the writer's own and seeded jokes", async () => {
    const copy = await submit({ setup: "I only know 25 letters of the alphabet!", punchline: "I don't know Y." });
    const res = await t.http.get("/v1/curation/queue?limit=50").set(curator).expect(200);
    const item = res.body.data.find((d: { joke: { id: string } }) => d.joke.id === copy.id);
    // The seeded original (delivered) and the seeded declined copy; not withdrawn ones.
    expect(item.possibleCopies.length).toBeGreaterThanOrEqual(1);
    expect(item.possibleCopies[0]).toMatchObject({ creatorHandle: "wanjiru_puns", sameWriter: false });
    expect(item.possibleCopies[0].similarity).toBeGreaterThan(0.8);
    const original = res.body.data.find((d: { joke: { setup: string } }) => d.joke.setup?.startsWith("What do you call a dino"));
    expect(original).toBeUndefined();
  });

  it("schedules a joke, refuses a taken or started day, and lets the writer see it", async () => {
    const a = await submit();
    const b = await submit({ punchline: "Dino-mite vocabulary." });
    const res = await t.http.post(`/v1/curation/jokes/${a.id}/schedule`).set(curator).send({ deliverOn: day }).expect(200);
    expect(res.body).toMatchObject({ status: "scheduled", deliverOn: day, canWithdraw: true });

    const taken = await t.http.post(`/v1/curation/jokes/${b.id}/schedule`).set(curator).send({ deliverOn: day }).expect(409);
    expect(taken.body.code).toBe("day_taken");
    const started = await t.http
      .post(`/v1/curation/jokes/${b.id}/schedule`)
      .set(curator)
      .send({ deliverOn: addDays(open, -1) })
      .expect(422);
    expect(started.body.code).toBe("day_closed");

    // Moving a scheduled joke to another free day works.
    await t.http.post(`/v1/curation/jokes/${a.id}/schedule`).set(curator).send({ deliverOn: addDays(day, 1) }).expect(200);
    await t.http.post(`/v1/curation/jokes/${b.id}/schedule`).set(curator).send({ deliverOn: day }).expect(200);

    const mine = await t.http.get(`/v1/me/jokes/${a.id}`).set(writer).expect(200);
    expect(mine.body).toMatchObject({ status: "scheduled", deliverOn: addDays(day, 1) });

    const cal = await t.http.get(`/v1/curation/calendar?from=${day}&days=2`).set(curator).expect(200);
    expect(cal.body.firstOpenDay).toBe(open);
    expect(cal.body.days.map((d: { picks: unknown[] }) => d.picks.length)).toEqual([1, 1]);
  });

  it("allows one regional joke alongside the everywhere joke on the same day", async () => {
    const a = await submit();
    const b = await submit({ punchline: "Local thesaurus.", region: "Kenya" });
    await t.http.post(`/v1/curation/jokes/${a.id}/schedule`).set(curator).send({ deliverOn: day }).expect(200);
    await t.http.post(`/v1/curation/jokes/${b.id}/schedule`).set(curator).send({ deliverOn: day }).expect(200);
  });

  it("declines with a reason the writer can read, and can reconsider later", async () => {
    const a = await submit();
    const res = await t.http
      .post(`/v1/curation/jokes/${a.id}/decline`)
      .set(curator)
      .send({ reason: "not_a_dad_joke", note: "Too clever by half." })
      .expect(200);
    expect(res.body).toMatchObject({ status: "declined", declineReason: "not_a_dad_joke", deliverOn: null });
    const mine = await t.http.get(`/v1/me/jokes/${a.id}`).set(writer).expect(200);
    expect(mine.body).toMatchObject({ declineReason: "not_a_dad_joke", declineNote: "Too clever by half." });

    await t.http.post(`/v1/curation/jokes/${a.id}/decline`).set(curator).send({ reason: "other" }).expect(409);
    const again = await t.http.post(`/v1/curation/jokes/${a.id}/schedule`).set(curator).send({ deliverOn: day }).expect(200);
    expect(again.body).toMatchObject({ status: "scheduled", declineReason: null });
  });

  it("can't touch delivered or withdrawn jokes, and is curators only", async () => {
    const a = await submit();
    await t.db.execute(sql`update jokes set status = 'delivered', deliver_on = ${addDays(open, -50)} where id = ${a.id}`);
    expect((await t.http.post(`/v1/curation/jokes/${a.id}/decline`).set(curator).send({ reason: "other" }).expect(409)).body.code).toBe(
      "not_declinable",
    );
    const b = await submit({ punchline: "Withdrawn one." });
    await t.http.post(`/v1/me/jokes/${b.id}/withdraw`).set(writer).expect(200);
    await t.http.post(`/v1/curation/jokes/${b.id}/schedule`).set(curator).send({ deliverOn: day }).expect(409);

    const denied = await t.http.get("/v1/curation/queue").set(writer).expect(403);
    expect(denied.body.code).toBe("role_required");
  });
});
