import { Injectable } from "@nestjs/common";
import { AppError } from "../common/errors";
import { AppConfig } from "../config/config.module";
import { MpesaClient } from "./mpesa.client";
import type { StkStatus } from "./mpesa.client";

/**
 * Payment providers behind one interface, so the ledger, holds, fees and
 * notifications don't care who moved the money. Kenya starts on Safaricom
 * Daraja (M-Pesa STK push in, B2C out); another provider (e.g. Paystack for
 * cards or other countries) is a new adapter plus an entry in the registry.
 */
export type ProviderId = "mpesa_daraja";

export interface CollectRequest {
  phone: string;
  amountKes: number;
  reference: string;
  description: string;
}

export interface CollectStarted {
  /** The provider's id for this charge, used to ask how it went. */
  checkoutRequestId: string;
  merchantRequestId: string;
}

export type CollectStatus = StkStatus;

/** What a payment callback recorded on the charge. Only a simulated provider trusts it. */
export interface RecordedResult {
  resultCode: string | null;
  resultDesc: string | null;
  receipt: string | null;
}

export interface SendRequest {
  payoutId: string;
  phone: string;
  amountKes: number;
  remarks: string;
}

export interface SendStarted {
  conversationId: string;
  originatorConversationId: string;
}

/** A finished payout, for providers that answer straight away (and the fake one). */
export interface SendOutcome {
  ok: boolean;
  resultCode: string;
  resultDesc: string;
  receipt?: string;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  /** Asks the payer to pay (e.g. an M-Pesa PIN prompt). */
  collect(req: CollectRequest): Promise<CollectStarted>;
  /** How a charge is going. The only thing that settles a tip. */
  collectStatus(checkoutRequestId: string, now: number, recorded?: RecordedResult): Promise<CollectStatus>;
  /** True when no real money moves (Daraja fake mode), so the app can offer the simulated prompt. */
  readonly simulated: boolean;
  /** The tipper answers the prompt themselves (simulated providers only). */
  readonly promptsInApp: boolean;
  /** Sends money out to a writer. */
  send(req: SendRequest): Promise<SendStarted>;
  /** Set when the provider settles payouts immediately instead of with a callback. */
  immediateOutcome?(req: SendRequest): SendOutcome | null;
  /** Roughly how long until a status query can be answered, to schedule the first check. */
  readonly settleAfterMs: number;
}

/** Safaricom Daraja: STK push to collect, B2C to pay out. */
@Injectable()
export class DarajaProvider implements PaymentProvider {
  readonly id = "mpesa_daraja" as const;
  constructor(
    private readonly mpesa: MpesaClient,
    private readonly config: AppConfig,
  ) {}

  get simulated() {
    return this.mpesa.mode === "fake";
  }

  get promptsInApp() {
    return this.simulated && this.config.get("MPESA_FAKE_SETTLE") === "prompt";
  }

  get settleAfterMs() {
    // With the in-app prompt, the simulated callback settles the tip; this is only the backstop check.
    return this.promptsInApp ? 60_000 : this.simulated ? 3500 : 30_000;
  }

  collect(req: CollectRequest) {
    return this.mpesa.stkPush(req);
  }

  async collectStatus(checkoutRequestId: string, now: number, recorded?: RecordedResult): Promise<CollectStatus> {
    // Real Daraja: only the status query counts; a callback is never trusted on its own.
    if (!this.simulated) return this.mpesa.stkQuery(checkoutRequestId, now);
    // Simulated: the (simulated) callback is the customer's answer.
    if (recorded?.resultCode != null) {
      const code = recorded.resultCode;
      return {
        state: code === "0" ? "paid" : code === "1032" ? "cancelled" : "failed",
        resultCode: code,
        resultDesc: recorded.resultDesc ?? undefined,
        receipt: recorded.receipt ?? undefined,
      };
    }
    if (this.promptsInApp) return { state: "pending" };
    return this.mpesa.stkQuery(checkoutRequestId, now);
  }

  send(req: SendRequest) {
    return this.mpesa.b2c(req);
  }

  immediateOutcome(req: SendRequest) {
    return this.mpesa.mode === "fake" ? this.mpesa.fakeB2cOutcome(req.phone) : null;
  }
}

/** Picks a provider by country and method, or by the id stored on a tip or payout. */
@Injectable()
export class PaymentProviders {
  private readonly byId: Record<ProviderId, PaymentProvider>;
  /** country → method → provider. */
  private readonly routes: Record<string, Record<string, ProviderId>> = { KE: { mpesa: "mpesa_daraja" } };

  constructor(daraja: DarajaProvider) {
    this.byId = { mpesa_daraja: daraja };
  }

  get(id: string): PaymentProvider {
    const p = this.byId[id as ProviderId];
    if (!p) throw new Error(`Unknown payment provider ${id}`);
    return p;
  }

  for(country: string, method: "mpesa"): PaymentProvider {
    const id = this.routes[country]?.[method];
    if (!id) throw new AppError(422, "payments_unavailable", "Tipping isn't available in your country yet.");
    return this.byId[id];
  }
}
