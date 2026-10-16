import { z } from "zod";
import { named } from "../common/zod";
import { KenyanMobile } from "../users/schemas";

export const CreateTipRequest = named(
  "CreateTipRequest",
  z.object({
    amountKes: z.number().int().min(10, "Tips start at KES 10.").max(10000, "Tips go up to KES 10,000."),
    phone: KenyanMobile.describe("The M-Pesa number to charge. It gets a prompt to enter the PIN."),
  }),
);
export type CreateTipRequest = z.infer<typeof CreateTipRequest>;

export const TipSchema = named(
  "Tip",
  z.object({
    id: z.uuid(),
    jokeId: z.uuid(),
    amountKes: z.number().int(),
    status: z.enum(["pending", "paid", "failed", "cancelled", "expired"]),
    message: z.string().describe("What to tell the tipper about the current status."),
    createdAt: z.iso.datetime(),
  }),
);
export type TipOut = z.infer<typeof TipSchema>;

export const BalanceSchema = named(
  "Balance",
  z.object({
    availableKes: z.number().describe("Can be withdrawn now."),
    lifetimeTipsKes: z.number().describe("Everything tipped to you, after the platform fee."),
    paidOutKes: z.number(),
    pendingPayoutKes: z.number(),
    minimumPayoutKes: z.number().int(),
    payoutPhoneLast3: z.string().nullable(),
  }),
);

export const CreatePayoutRequest = named(
  "CreatePayoutRequest",
  z.object({ amountKes: z.number().int().min(1) }),
);
export type CreatePayoutRequest = z.infer<typeof CreatePayoutRequest>;

export const PayoutSchema = named(
  "PayoutTransfer",
  z.object({
    id: z.uuid(),
    amountKes: z.number().int(),
    phoneLast3: z.string(),
    status: z.enum(["requested", "processing", "paid", "failed"]),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  }),
  "Money sent from your balance to your M-Pesa.",
);
export type PayoutOut = z.infer<typeof PayoutSchema>;

export const PayoutListSchema = named("PayoutList", z.object({ data: z.array(PayoutSchema) }));
