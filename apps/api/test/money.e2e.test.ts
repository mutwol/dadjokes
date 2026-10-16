import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

  const tip = async (amountKes: number, phone = "0712 345 678") =>
    (await t.http.post(`/v1/jokes/${jokeId}/tips`).set(reader).send({ amountKes, phone }).expect(201)).body as {
      id: string;
      status: string;
    };
  const ledger = async () =>
    (
      await t.db.execute<{ account: string; total: string }>(
        sql`select account, sum(amount_cents)::text as total from ledger_entries group by account order by account`,
      )
    ).rows;

  it("charges with an STK push, settles once, and splits the tip in the ledger", async () => {
    const created = await tip(100);
    expect(created).toMatchObject({ status: "pending" });
    expect(await pay.verifyTip(created.id)).toBe("pending");
    expect(await pay.verifyTip(created.id, later())).toBe("paid");
    expect(await pay.verifyTip(created.id, later())).toBe("paid"); // settling again changes nothing

    const status = await t.http.get(`/v1/tips/${created.id}`).set(reader).expect(200);
    expect(status.body).toMatchObject({ status: "paid", message: "Tip sent. Thank you!" });
    expect(await ledger()).toEqual([
      { account: `creator:${writer.userId}`, total: "-9000" },
      { account: "mpesa:clearing", total: "10000" },
      { account: "platform:fees", total: "-1000" },
    ]);
    const balance = await t.http.get("/v1/me/balance").set(writer.auth).expect(200);
    expect(balance.body).toMatchObject({ availableKes: 90, lifetimeTipsKes: 90, paidOutKes: 0 });
    const activity = await t.http.get("/v1/me/activity").set(writer.auth).expect(200);
    expect(activity.body.data[0]).toMatchObject({ type: "tip_received", title: "Cyrus Mutwol tipped you KES 100" });
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
    await pay.verifyTip(created.id, later()); // writer gets 180

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
    await pay.verifyTip(created.id, later());
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
});
