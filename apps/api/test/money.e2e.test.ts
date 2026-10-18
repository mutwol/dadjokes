import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppConfig } from "../src/config/config.module";
import { MpesaClient } from "../src/payments/mpesa.client";
import { PaymentsService } from "../src/payments/payments.service";
import { createTestApp, resetDb, signUp } from "./app";
import type { TestApp } from "./app";

/** M-Pesa runs in fake mode: prompts settle after 3s; 0000 numbers fail, 1111 cancel. */
describe("tips, the ledger and payouts", () => {
  let t: TestApp;
  let pay: PaymentsService;
  let reader: { Authorization: string };
  let writer: { auth: { Authorization: string }; userId: string };
  let jokeId: string;
  const later = () => new Date(Date.now() + 4000);
  /** Past the default 72-hour hold. */
  const afterHold = () => new Date(Date.now() + 73 * 3_600_000);
  const settle = async (id: string) => {
    expect(await pay.verifyTip(id, later())).toBe("paid");
    await pay.releaseDue(afterHold());
  };

  beforeAll(async () => {
    t = await createTestApp();
    pay = t.app.get(PaymentsService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.db);
    const r = await signUp(t, "tipper@example.com");
    reader = r.auth;
    await t.http.patch("/v1/me/preferences").set(reader).send({ deliveryHour: 0 }).expect(200);
    const today = await t.http.get("/v1/me/today").set(reader).expect(200);
    jokeId = (await t.http.post(`/v1/me/deliveries/${today.body.date}/open`).set(reader).expect(200)).body.id;
    writer = await signUp(t, "earner@example.com", { roles: ["writer"] });
    await t.db.execute(sql`update jokes set creator_id = ${writer.userId} where id = ${jokeId}`);
  });

  const tip = async (amountKes: number, phone = "0712 345 678", extra: { note?: string; anonymous?: boolean } = {}) =>
    (await t.http.post(`/v1/jokes/${jokeId}/tips`).set(reader).send({ amountKes, phone, ...extra }).expect(201)).body as {
      id: string;
      status: string;
    };
  const ledger = async () =>
    (
      await t.db.execute<{ account: string; total: string }>(
        sql`select account, sum(amount_cents)::text as total from ledger_entries group by account order by account`,
      )
    ).rows;

  it("charges with an STK push, settles once, splits the tip, and holds the writer's share", async () => {
    const created = await tip(100);
    expect(created).toMatchObject({ status: "pending" });
    expect(await pay.verifyTip(created.id)).toBe("pending");
    expect(await pay.verifyTip(created.id, later())).toBe("paid");
    expect(await pay.verifyTip(created.id, later())).toBe("paid"); // settling again changes nothing

    const status = await t.http.get(`/v1/tips/${created.id}`).set(reader).expect(200);
    expect(status.body).toMatchObject({ status: "paid", message: "Tip sent. Thank you!" });
    expect(await ledger()).toEqual([
      { account: `creator:${writer.userId}:pending`, total: "-9000" },
      { account: "mpesa:clearing", total: "10000" },
      { account: "platform:fees", total: "-1000" },
    ]);
    const held = await t.http.get("/v1/me/balance").set(writer.auth).expect(200);
    expect(held.body).toMatchObject({ availableKes: 0, pendingKes: 90, lifetimeTipsKes: 90, paidOutKes: 0, holdHours: 72 });
    expect(new Date(held.body.nextReleaseAt).getTime()).toBeGreaterThan(Date.now() + 71 * 3_600_000);
    const [row] = (
      await t.db.execute<{ fee_bps: number; fee_cents: string; writer_cents: string; fee_policy_id: string | null; provider: string }>(
        sql`select fee_bps, fee_cents::text, writer_cents::text, fee_policy_id, provider from tips where id = ${created.id}`,
      )
    ).rows;
    expect(row).toMatchObject({ fee_bps: 1000, fee_cents: "1000", writer_cents: "9000", provider: "mpesa_daraja" });
    expect(row.fee_policy_id).toBeTruthy();

    // Nothing is released early; after the hold it all moves to available, once.
    expect(await pay.releaseDue(new Date())).toBe(0);
    expect(await pay.releaseDue(afterHold())).toBe(1);
    expect(await pay.releaseDue(afterHold())).toBe(0);
    expect(await ledger()).toEqual([
      { account: `creator:${writer.userId}`, total: "-9000" },
      { account: `creator:${writer.userId}:pending`, total: "0" },
      { account: "mpesa:clearing", total: "10000" },
      { account: "platform:fees", total: "-1000" },
    ]);
    const balance = await t.http.get("/v1/me/balance").set(writer.auth).expect(200);
    expect(balance.body).toMatchObject({ availableKes: 90, pendingKes: 0, nextReleaseAt: null, lifetimeTipsKes: 90 });
    const activity = await t.http.get("/v1/me/activity").set(writer.auth).expect(200);
    expect(activity.body.data[0]).toMatchObject({ type: "tip_received", title: "You've received a KSh 100 tip from Cyrus Mutwol" });
  });

  it("records failed and cancelled payments without touching the ledger", async () => {
    const failed = await tip(50, "0711 110 000");
    const cancelled = await tip(50, "0711 111 111");
    expect(await pay.verifyTip(failed.id, later())).toBe("failed");
    expect(await pay.verifyTip(cancelled.id, later())).toBe("cancelled");
    expect((await t.http.get(`/v1/tips/${cancelled.id}`).set(reader).expect(200)).body.message).toBe(
      "You cancelled the payment on your phone.",
    );
    expect(await ledger()).toEqual([]);
  });

  it("validates tips and who can send them", async () => {
    await t.http.post(`/v1/jokes/${jokeId}/tips`).set(reader).send({ amountKes: 5, phone: "0712345678" }).expect(422);
    await t.http.post(`/v1/jokes/${jokeId}/tips`).set(reader).send({ amountKes: 20000, phone: "0712345678" }).expect(422);
    await t.http.post(`/v1/jokes/${jokeId}/tips`).set(reader).send({ amountKes: 50, phone: "12345" }).expect(422);
    const own = await t.http.post(`/v1/jokes/${jokeId}/tips`).set(writer.auth).send({ amountKes: 50, phone: "0712345678" }).expect(422);
    expect(own.body.code).toBe("cannot_tip_own");
    const stranger = (await signUp(t, "stranger@example.com")).auth;
    await t.http.post(`/v1/jokes/${jokeId}/tips`).set(stranger).send({ amountKes: 50, phone: "0712345678" }).expect(404);
    const created = await tip(50);
    await t.http.get(`/v1/tips/${created.id}`).set(stranger).expect(404);
  });

  it("accepts Safaricom's callback only on the secret path, and keeps the receipt", async () => {
    const created = await tip(100);
    const [{ checkout_request_id: id }] = (
      await t.db.execute<{ checkout_request_id: string }>(sql`select checkout_request_id from tips where id = ${created.id}`)
    ).rows;
    const body = {
      Body: {
        stkCallback: {
          MerchantRequestID: "m",
          CheckoutRequestID: id,
          ResultCode: 0,
          ResultDesc: "ok",
          CallbackMetadata: { Item: [{ Name: "Amount", Value: 100 }, { Name: "MpesaReceiptNumber", Value: "QKX12345" }] },
        },
      },
    };
    await t.http.post("/v1/payments/mpesa/stk/guess").send(body).expect(404);
    const token = t.app.get(MpesaClient).callbackToken();
    await t.http.post(`/v1/payments/mpesa/stk/${token}`).send(body).expect(200);
    await pay.verifyTip(created.id, later());
    const [row] = (await t.db.execute<{ status: string; receipt: string }>(sql`select status, receipt from tips where id = ${created.id}`)).rows;
    expect(row).toEqual({ status: "paid", receipt: "QKX12345" });
  });

  it("pays out to M-Pesa from the balance, and returns the money if it fails", async () => {
    const created = await tip(200);
    await settle(created.id); // writer gets 180

    expect((await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 150 }).expect(422)).body.code).toBe(
      "no_payout_method",
    );
    await t.http.put("/v1/me/payout-method").set(writer.auth).send({ method: "mpesa", phone: "0722 000 000" }).expect(200);
    expect((await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 50 }).expect(422)).body.code).toBe(
      "payout_too_small",
    );
    expect((await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 500 }).expect(422)).body.code).toBe(
      "insufficient_balance",
    );

    // 0000 numbers fail in fake mode: the money comes back.
    const failing = await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 150 }).expect(201);
    expect((await t.http.get("/v1/me/balance").set(writer.auth).expect(200)).body).toMatchObject({ availableKes: 30, pendingPayoutKes: 150 });
    await pay.sendPayout(failing.body.id);
    expect((await t.http.get("/v1/me/balance").set(writer.auth).expect(200)).body).toMatchObject({ availableKes: 180, paidOutKes: 0 });

    await t.http.put("/v1/me/payout-method").set(writer.auth).send({ method: "mpesa", phone: "0722 123 456" }).expect(200);
    const ok = await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 150 }).expect(201);
    await pay.sendPayout(ok.body.id);
    await pay.sendPayout(ok.body.id); // repeat is harmless
    expect((await t.http.get("/v1/me/balance").set(writer.auth).expect(200)).body).toMatchObject({
      availableKes: 30,
      paidOutKes: 150,
      payoutPhoneLast3: "456",
    });
    const list = await t.http.get("/v1/me/payouts").set(writer.auth).expect(200);
    expect(list.body.data.map((p: { status: string }) => p.status)).toEqual(["paid", "failed"]);
    const activity = await t.http.get("/v1/me/activity").set(writer.auth).expect(200);
    expect(activity.body.data.map((a: { type: string }) => a.type).slice(0, 2)).toEqual(["payout_paid", "payout_failed"]);
    // The books still balance overall.
    const [{ total }] = (await t.db.execute<{ total: string }>(sql`select sum(amount_cents)::text as total from ledger_entries`)).rows;
    expect(total).toBe("0");
  });

  it("can't overdraw with simultaneous withdrawals", async () => {
    const created = await tip(200);
    await settle(created.id);
    await t.http.put("/v1/me/payout-method").set(writer.auth).send({ method: "mpesa", phone: "0722 123 456" }).expect(200);
    const results = await Promise.all(
      [0, 1].map(() => t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 100 })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
  });

  it("refuses unbalanced or edited ledger entries at the database", async () => {
    await expect(
      t.db.execute(sql`insert into ledger_entries (txn_id, account, amount_cents, memo) values (gen_random_uuid(), 'x', 100, 'oops')`),
    ).rejects.toThrow();
    const created = await tip(100);
    await pay.verifyTip(created.id, later());
    await expect(t.db.execute(sql`update ledger_entries set amount_cents = 1`)).rejects.toThrow();
    await expect(t.db.execute(sql`delete from ledger_entries`)).rejects.toThrow();
  });

  it("only pays out what's past the hold", async () => {
    await t.http.put("/v1/me/payout-method").set(writer.auth).send({ method: "mpesa", phone: "0722 123 456" }).expect(200);
    const first = await tip(200);
    await pay.verifyTip(first.id, later());
    const blocked = await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 150 }).expect(422);
    expect(blocked.body.code).toBe("insufficient_balance");
    await pay.releaseDue(afterHold());
    const second = await tip(500);
    await pay.verifyTip(second.id, later());
    expect((await t.http.get("/v1/me/balance").set(writer.auth).expect(200)).body).toMatchObject({ availableKes: 180, pendingKes: 450 });
    await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 200 }).expect(422);
    await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 180 }).expect(201);
  });

  it("charges the rate in force when the tip is paid, and keeps it", async () => {
    const admin = await signUp(t, "boss@example.com", { staff: ["admin"] });
    const old = await tip(100);
    await pay.verifyTip(old.id, later());

    await t.http.post("/v1/admin/finance/fee-policies").set(writer.auth).send({ bps: 500 }).expect(403);
    await t.http.post("/v1/admin/finance/fee-policies").set(admin.auth).send({ bps: 9000 }).expect(422);
    await t.http
      .post("/v1/admin/finance/fee-policies")
      .set(admin.auth)
      .send({ bps: 500, effectiveFrom: new Date(Date.now() - 86_400_000).toISOString() })
      .expect(422);
    await t.http.post("/v1/admin/finance/fee-policies").set(admin.auth).send({ bps: 500, creatorHandle: "@nobody_here" }).expect(404);
    const own = await t.http
      .post("/v1/admin/finance/fee-policies")
      .set(admin.auth)
      .send({ bps: 500, creatorHandle: "@earner", note: "Launch partner" })
      .expect(201);
    expect(own.body).toMatchObject({ bps: 500, creator: { handle: "earner" }, note: "Launch partner", supersededAt: null });

    const fresh = await tip(100);
    await pay.verifyTip(fresh.id, later());
    const rows = (
      await t.db.execute<{ id: string; fee_bps: number; fee_cents: string }>(sql`select id, fee_bps, fee_cents::text from tips where status = 'paid'`)
    ).rows;
    expect(rows.find((r) => r.id === old.id)).toMatchObject({ fee_bps: 1000, fee_cents: "1000" });
    expect(rows.find((r) => r.id === fresh.id)).toMatchObject({ fee_bps: 500, fee_cents: "500" });

    const list = await t.http.get("/v1/admin/finance/fee-policies").set(admin.auth).expect(200);
    expect(list.body.data.map((p: { bps: number; tips: number }) => [p.bps, p.tips])).toEqual([
      [1000, 1],
      [500, 1],
    ]);
  });

  it("shows tips with their messages on the joke, like a Super Chat", async () => {
    const curator = await signUp(t, "mod@example.com", { staff: ["curator"] });
    const loud = await tip(220, "0712 345 678", { note: "  Nearly  spat out my chai 😂 " });
    const quiet = await tip(50, "0712 345 678", { note: "From a fan", anonymous: true });
    await t.http.post(`/v1/jokes/${jokeId}/tips`).set(reader).send({ amountKes: 50, phone: "0712345678", note: "x".repeat(141) }).expect(422);
    await pay.verifyTip(loud.id, later());
    await pay.verifyTip(quiet.id, later());

    const activity = await t.http.get("/v1/me/activity").set(writer.auth).expect(200);
    const [anon, named] = activity.body.data;
    expect(named).toMatchObject({ title: "You've received a KSh 220 tip from Cyrus Mutwol", body: expect.stringContaining("“Nearly spat out my chai 😂”") });
    expect(anon).toMatchObject({ title: "You've received a KSh 50 tip from someone", body: expect.stringContaining("“From a fan”") });

    const wall = await t.http.get(`/v1/jokes/${jokeId}/tips`).set(writer.auth).expect(200);
    expect(wall.body).toMatchObject({ count: 2, totalKes: 270, canModerate: true });
    expect(wall.body.data[1]).toMatchObject({ amountKes: 220, note: "Nearly spat out my chai 😂", from: { handle: "tipper" }, anonymous: false });
    expect(wall.body.data[0]).toMatchObject({ amountKes: 50, note: "From a fan", from: null, anonymous: true });
    // The tipper still sees their own name on an anonymous tip.
    const mine = await t.http.get(`/v1/jokes/${jokeId}/tips`).set(reader).expect(200);
    expect(mine.body.canModerate).toBe(false);
    expect(mine.body.data[0]).toMatchObject({ isMine: true, from: { handle: "tipper" } });

    // Readers can't hide messages; the writer and curators can.
    await t.http.put(`/v1/tips/${loud.id}/note-hidden`).set(reader).send({ hidden: true }).expect(404);
    await t.http.put(`/v1/tips/${loud.id}/note-hidden`).set(writer.auth).send({ hidden: true }).expect(204);
    const after = await t.http.get(`/v1/jokes/${jokeId}/tips`).set(reader).expect(200);
    expect(after.body.data[1]).toMatchObject({ amountKes: 220, note: null, noteHidden: true });
    await t.http.put(`/v1/tips/${quiet.id}/note-hidden`).set(curator.auth).send({ hidden: true }).expect(204);
    const [audit] = (await t.db.execute<{ action: string }>(sql`select action from audit_log where target_id = ${quiet.id}`)).rows;
    expect(audit.action).toBe("tip_note.hidden");
  });

  it("checks the books and spots what doesn't add up", async () => {
    const admin = await signUp(t, "boss@example.com", { staff: ["admin"] });
    await t.http.put("/v1/me/payout-method").set(writer.auth).send({ method: "mpesa", phone: "0722 123 456" }).expect(200);
    const a = await tip(300);
    await settle(a.id);
    const b = await tip(100);
    await pay.verifyTip(b.id, later());
    const p = await t.http.post("/v1/me/payouts").set(writer.auth).send({ amountKes: 200 }).expect(201);
    await pay.sendPayout(p.body.id);

    const ok = await t.http.post("/v1/admin/finance/reconciliations").set(admin.auth).expect(201);
    expect(ok.body.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
    expect(ok.body).toMatchObject({ status: "ok", triggeredBy: "boss" });

    // A tip marked paid behind the ledger's back.
    const c = await tip(50);
    await t.db.execute(sql`update tips set status = 'paid', paid_at = now(), writer_cents = 4500, fee_cents = 500 where id = ${c.id}`);
    const bad = await t.http.post("/v1/admin/finance/reconciliations").set(admin.auth).expect(201);
    expect(bad.body.status).toBe("issues");
    const failing = Object.fromEntries(bad.body.checks.filter((x: { ok: boolean }) => !x.ok).map((x: { key: string; count: number }) => [x.key, x.count]));
    expect(failing).toMatchObject({ paid_tips_posted: 1, tip_split: 1, clearing: 1, holds: 1 });
    const list = await t.http.get("/v1/admin/finance/reconciliations").set(admin.auth).expect(200);
    expect(list.body.data.map((r: { status: string }) => r.status)).toEqual(["issues", "ok"]);
  });

  it("splits the creator fund by qualified views, once per period", async () => {
    const admin = await signUp(t, "boss@example.com", { staff: ["admin"] });
    const [{ d }] = (await t.db.execute<{ d: string }>(sql`select local_date::text as d from deliveries where joke_id = ${jokeId} limit 1`)).rows;
    const body = { periodStart: d, periodEnd: d, poolKes: 1000 };
    const preview = await t.http.post("/v1/admin/finance/creator-fund/preview").set(admin.auth).send(body).expect(200);
    expect(preview.body).toMatchObject({ qualifiedViews: 1, allocations: [{ handle: "earner", views: 1, sharePct: 100, amountKes: 1000 }] });
    await t.http.post("/v1/admin/finance/creator-fund/preview").set(admin.auth).send({ ...body, periodEnd: "2000-01-01" }).expect(422);

    const run = await t.http.post("/v1/admin/finance/creator-fund").set(admin.auth).send(body).expect(201);
    expect(run.body).toMatchObject({ poolKes: 1000, allocatedKes: 1000, creators: 1, releasedKes: 0, createdBy: "boss" });
    expect((await t.http.post("/v1/admin/finance/creator-fund").set(admin.auth).send(body).expect(409)).body.code).toBe("fund_period_paid");
    expect((await t.http.get("/v1/me/balance").set(writer.auth).expect(200)).body).toMatchObject({ pendingKes: 1000, creatorFundKes: 1000, availableKes: 0 });
    const activity = await t.http.get("/v1/me/activity").set(writer.auth).expect(200);
    expect(activity.body.data[0].title).toBe("You've received KSh 1,000 from the creator fund");

    await pay.releaseDue(afterHold());
    expect((await t.http.get("/v1/me/balance").set(writer.auth).expect(200)).body).toMatchObject({ pendingKes: 0, availableKes: 1000 });
    const runs = await t.http.get("/v1/admin/finance/creator-fund").set(admin.auth).expect(200);
    expect(runs.body.data[0]).toMatchObject({ releasedKes: 1000 });
    const books = await t.http.post("/v1/admin/finance/reconciliations").set(admin.auth).expect(201);
    expect(books.body.status).toBe("ok");
  });

  it("lets the tipper answer a simulated M-Pesa prompt in test mode", async () => {
    const config = t.app.get(AppConfig);
    const real = config.get.bind(config);
    const spy = vi.spyOn(config, "get").mockImplementation(((k: string) => (k === "MPESA_FAKE_SETTLE" ? "prompt" : real(k as never))) as typeof config.get);
    try {
      const approved = await tip(220, "0712 345 678", { note: "Simulated!" });
      expect(approved).toMatchObject({ status: "pending", simulated: true, phoneLast3: "678" });
      // Nobody answered yet: it stays pending however long we wait (until it expires).
      expect(await pay.verifyTip(approved.id, later())).toBe("pending");

      const stranger = (await signUp(t, "stranger@example.com")).auth;
      await t.http.post(`/v1/tips/${approved.id}/simulate`).set(stranger).send({ answer: "approve" }).expect(404);
      await t.http.post(`/v1/tips/${approved.id}/simulate`).set(reader).send({ answer: "nope" }).expect(422);

      const paid = await t.http.post(`/v1/tips/${approved.id}/simulate`).set(reader).send({ answer: "approve" }).expect(200);
      expect(paid.body).toMatchObject({ status: "paid", message: "Tip sent. Thank you!" });
      const [row] = (await t.db.execute<{ receipt: string }>(sql`select receipt from tips where id = ${approved.id}`)).rows;
      expect(row.receipt).toMatch(/^SIM[0-9A-F]{7}$/);
      // Answering again changes nothing.
      expect((await t.http.post(`/v1/tips/${approved.id}/simulate`).set(reader).send({ answer: "cancel" }).expect(200)).body.status).toBe("paid");

      const cancelled = await tip(50);
      expect((await t.http.post(`/v1/tips/${cancelled.id}/simulate`).set(reader).send({ answer: "cancel" }).expect(200)).body).toMatchObject({
        status: "cancelled",
        message: "You cancelled the payment on your phone.",
      });
      const broke = await tip(50);
      expect((await t.http.post(`/v1/tips/${broke.id}/simulate`).set(reader).send({ answer: "insufficient_funds" }).expect(200)).body.status).toBe("failed");
      const wrongPin = await tip(50);
      expect((await t.http.post(`/v1/tips/${wrongPin.id}/simulate`).set(reader).send({ answer: "wrong_pin" }).expect(200)).body.status).toBe("failed");

      // Only the approved one reached the books, the writer and the tip wall.
      expect(await ledger()).toEqual([
        { account: `creator:${writer.userId}:pending`, total: "-19800" },
        { account: "mpesa:clearing", total: "22000" },
        { account: "platform:fees", total: "-2200" },
      ]);
      const wall = await t.http.get(`/v1/jokes/${jokeId}/tips`).set(reader).expect(200);
      expect(wall.body).toMatchObject({ count: 1, totalKes: 220, data: [{ note: "Simulated!" }] });
      const activity = await t.http.get("/v1/me/activity").set(writer.auth).expect(200);
      expect(activity.body.data[0].title).toBe("You've received a KSh 220 tip from Cyrus Mutwol");
    } finally {
      spy.mockRestore();
    }
  });
});
