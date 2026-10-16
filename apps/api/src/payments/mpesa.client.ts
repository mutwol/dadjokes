import { createHash, createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { AppError } from "../common/errors";
import { AppConfig } from "../config/config.module";

export type StkState = "pending" | "paid" | "failed" | "cancelled";

export interface StkStatus {
  state: StkState;
  resultCode?: string;
  resultDesc?: string;
  /** Only the fake client knows it here; Daraja sends it in the callback. */
  receipt?: string;
}

/** How long the fake "customer" takes to answer the prompt on their phone. */
export const FAKE_SETTLE_MS = 3000;

/**
 * Safaricom Daraja: STK push for tips (the customer confirms on their phone)
 * and B2C for payouts. In "fake" mode no network is used: outcomes are worked
 * out from the request itself, so the API and the worker agree without shared
 * state. Phones ending 0000 fail, 1111 cancel, anything else pays.
 */
@Injectable()
export class MpesaClient {
  private readonly logger = new Logger(MpesaClient.name);
  private token?: { value: string; expires: number };

  constructor(private readonly config: AppConfig) {}

  get mode() {
    return this.config.get("MPESA_MODE");
  }

  /** Secret path segment for Safaricom's callbacks, so they can't easily be forged. */
  callbackToken() {
    return createHmac("sha256", this.config.get("JWT_SECRET")).update("mpesa-callback").digest("base64url").slice(0, 32);
  }

  async stkPush(req: { phone: string; amountKes: number; reference: string; description: string }) {
    if (this.mode === "fake") {
      return { merchantRequestId: `fake-m-${Date.now()}`, checkoutRequestId: `ws_CO_FAKE_${Date.now()}_${req.phone}` };
    }
    const { timestamp, password } = this.password();
    const res = await this.call<{ MerchantRequestID: string; CheckoutRequestID: string; ResponseCode: string; ResponseDescription: string }>(
      "/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: this.config.get("MPESA_SHORTCODE"),
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: req.amountKes,
        PartyA: req.phone,
        PartyB: this.config.get("MPESA_SHORTCODE"),
        PhoneNumber: req.phone,
        CallBackURL: `${this.base()}/v1/payments/mpesa/stk/${this.callbackToken()}`,
        AccountReference: req.reference.slice(0, 12),
        TransactionDesc: req.description.slice(0, 13),
      },
    );
    if (res.ResponseCode !== "0") throw new AppError(502, "mpesa_rejected", "M-Pesa didn't accept the request. Try again.");
    return { merchantRequestId: res.MerchantRequestID, checkoutRequestId: res.CheckoutRequestID };
  }

  async stkQuery(checkoutRequestId: string, now = Date.now()): Promise<StkStatus> {
    if (this.mode === "fake") {
      const [, , , at, phone] = checkoutRequestId.split("_");
      if (now - Number(at) < FAKE_SETTLE_MS) return { state: "pending" };
      if (phone?.endsWith("0000")) return { state: "failed", resultCode: "1", resultDesc: "The balance is insufficient for the transaction." };
      if (phone?.endsWith("1111")) return { state: "cancelled", resultCode: "1032", resultDesc: "Request cancelled by user." };
      return {
        state: "paid",
        resultCode: "0",
        resultDesc: "The service request is processed successfully.",
        receipt: `FAKE${createHash("sha1").update(checkoutRequestId).digest("hex").slice(0, 6).toUpperCase()}`,
      };
    }
    const { timestamp, password } = this.password();
    try {
      const res = await this.call<{ ResultCode: string; ResultDesc: string }>("/mpesa/stkpushquery/v1/query", {
        BusinessShortCode: this.config.get("MPESA_SHORTCODE"),
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      });
      return { state: stkState(res.ResultCode), resultCode: res.ResultCode, resultDesc: res.ResultDesc };
    } catch (e) {
      // Daraja answers 500 "The transaction is being processed" while the customer hasn't responded.
      if (e instanceof DarajaError && /being processed/i.test(e.body)) return { state: "pending" };
      throw e;
    }
  }

  async b2c(req: { payoutId: string; phone: string; amountKes: number; remarks: string }) {
    if (this.mode === "fake") return { conversationId: `fake-c-${req.payoutId}`, originatorConversationId: req.payoutId };
    const token = this.callbackToken();
    const res = await this.call<{ ConversationID: string; OriginatorConversationID: string; ResponseCode: string }>(
      "/mpesa/b2c/v3/paymentrequest",
      {
        OriginatorConversationID: req.payoutId,
        InitiatorName: this.config.get("MPESA_B2C_INITIATOR"),
        SecurityCredential: this.config.get("MPESA_B2C_SECURITY_CREDENTIAL"),
        CommandID: "BusinessPayment",
        Amount: req.amountKes,
        PartyA: this.config.get("MPESA_B2C_SHORTCODE"),
        PartyB: req.phone,
        Remarks: req.remarks.slice(0, 100),
        QueueTimeOutURL: `${this.base()}/v1/payments/mpesa/b2c/timeout/${token}`,
        ResultURL: `${this.base()}/v1/payments/mpesa/b2c/result/${token}`,
        Occasion: "Daddy Jokes tips",
      },
    );
    if (res.ResponseCode !== "0") throw new AppError(502, "mpesa_rejected", "M-Pesa didn't accept the payout.");
    return { conversationId: res.ConversationID, originatorConversationId: res.OriginatorConversationID };
  }

  /** Fake mode: how a payout to this phone turns out. */
  fakeB2cOutcome(phone: string) {
    return phone.endsWith("0000")
      ? { ok: false, resultCode: "2001", resultDesc: "The initiator information is invalid." }
      : { ok: true, resultCode: "0", resultDesc: "The service request is processed successfully.", receipt: `FAKEB2C${Date.now().toString(36).toUpperCase()}` };
  }

  private base() {
    return this.config.get("MPESA_CALLBACK_BASE_URL")!.replace(/\/$/, "");
  }

  private apiBase() {
    return this.mode === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  }

  /** STK password: base64(shortcode + passkey + timestamp), timestamp in Kenyan time. */
  private password() {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    const timestamp = `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
    const password = Buffer.from(`${this.config.get("MPESA_SHORTCODE")}${this.config.get("MPESA_PASSKEY")}${timestamp}`).toString("base64");
    return { timestamp, password };
  }

  private async accessToken() {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.config.get("MPESA_CONSUMER_KEY")}:${this.config.get("MPESA_CONSUMER_SECRET")}`).toString("base64");
    const res = await fetch(`${this.apiBase()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new DarajaError(res.status, await res.text());
    const body = (await res.json()) as { access_token: string; expires_in: string };
    this.token = { value: body.access_token, expires: Date.now() + Number(body.expires_in) * 1000 };
    return this.token.value;
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.apiBase()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Daraja ${path} ${res.status}: ${text.slice(0, 300)}`);
      throw new DarajaError(res.status, text);
    }
    return JSON.parse(text) as T;
  }
}

export class DarajaError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Daraja ${status}`);
  }
}

/** STK result codes: 0 paid; 1032 cancelled by the customer; anything else failed. */
export function stkState(code: string | number): StkState {
  const c = String(code);
  return c === "0" ? "paid" : c === "1032" ? "cancelled" : "failed";
}
